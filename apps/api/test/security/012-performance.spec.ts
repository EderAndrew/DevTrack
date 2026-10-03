import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const CLASSES = 10;
const ACTIVITIES_PER_CLASS = 50;
const ROSTER = 60;
const LIMIT_MS = 1000;
const SAVES = 100;
const SAVE_P95_MS = 300;

/**
 * 012 plan "Performance Goals": a student in 10 classes × 50 activities (with attempts and
 * submissions) gets the dashboard and the list within 1 s; the teacher's detail of an activity
 * with 60 students within 1 s; a save of 10 answers with p95 < 300 ms over 100 calls. The data is
 * bulk-inserted in one transaction (the deferred triggers check each snapshot at commit); each
 * read is warmed once, then the slowest of three calls is measured end to end through HTTP.
 */
describe("012 desempenho do portal do aluno e do detalhe do professor", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let studentClient: ReturnType<typeof api>;
  let teacherClient: ReturnType<typeof api>;
  let rosterClass: SchoolClass;
  let rosterActivity: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, activitySavesPerMinute: 10_000 } } });
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"] });

    const classes: SchoolClass[] = [];
    for (let i = 0; i < CLASSES; i++) {
      const schoolClass = await createClass(t, teacher.id, { name: `Turma ${i + 1}` });
      await createEnrollment(t, schoolClass.id, student.id);
      classes.push(schoolClass);
    }
    await t.prisma.runInTransaction(async (tx) => {
      const activities = classes.flatMap((schoolClass, c) =>
        Array.from({ length: ACTIVITIES_PER_CLASS }, (_, i) => ({
          id: crypto.randomUUID(),
          classId: schoolClass.id,
          teacherId: teacher.id,
          type: "EXERCISE" as const,
          title: `Atividade ${c + 1}.${i + 1}`,
          instructions: "Leia com atenção.",
          totalGrade: "1.00",
          questionCount: 1,
          publishAt: at(-20 * DAY),
          deadline: at((i - 10) * DAY),
          latePolicy: i % 2 === 0 ? ("REJECT" as const) : ("ACCEPT_MARKED" as const),
          idempotencyKey: crypto.randomUUID(),
        })),
      );
      await tx.classActivity.createMany({ data: activities });
      const questions = activities.map((activity) => ({
        id: crypto.randomUUID(),
        activityId: activity.id,
        position: 0,
        type: "OPEN_ANSWER" as const,
        gradingStrategy: "AI_REVIEW" as const,
        value: "1.00",
        statement: "Enunciado",
        expectedAnswer: "Resposta",
      }));
      await tx.classActivityQuestion.createMany({ data: questions });
      // A third untouched, a third in progress with an answer, a third submitted.
      const attempts = activities.flatMap((activity, i) =>
        i % 3 === 0 ? [] : [{ id: crypto.randomUUID(), activityId: activity.id, studentUserId: student.id, startedAt: at(-DAY), status: "IN_PROGRESS" as const, index: i }],
      );
      await tx.activityAttempt.createMany({ data: attempts.map(({ index: _index, ...attempt }) => attempt) });
      await tx.activityAnswer.createMany({
        data: attempts.map((attempt) => ({
          attemptId: attempt.id,
          activityId: attempt.activityId,
          questionId: questions[attempt.index]!.id,
          questionType: "OPEN_ANSWER" as const,
          text: "Minha resposta",
          savedAt: at(-DAY),
        })),
      });
      const submitted = attempts.filter((attempt) => attempt.index % 3 === 2);
      await tx.activityAttempt.updateMany({ where: { id: { in: submitted.map((attempt) => attempt.id) } }, data: { status: "SUBMITTED" } });
      await tx.activitySubmission.createMany({
        data: submitted.map((attempt) => ({
          attemptId: attempt.id,
          activityId: attempt.activityId,
          studentUserId: student.id,
          submittedAt: at(-DAY),
          late: false,
          blankCount: 0,
          grade: "0.00",
          gradePartial: true,
        })),
      });
    });

    rosterClass = await createClass(t, teacher.id, { name: "Turma grande" });
    rosterActivity = await createActivity(t, rosterClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: Array.from({ length: 10 }, () => ({ type: "OPEN_ANSWER" as const, valueCents: 10 })),
    });
    for (let i = 0; i < ROSTER; i++) {
      const enrolled = i === 0 ? student : await createUser(t, { roles: ["STUDENT"], name: `Aluno ${String(i).padStart(2, "0")}` });
      await createEnrollment(t, rosterClass.id, enrolled.id);
      if (i % 2 === 1) {
        await t.prisma.activityAttempt.create({ data: { activityId: rosterActivity.activity.id, studentUserId: enrolled.id, startedAt: at(-DAY) } });
      }
    }
    studentClient = api(t, { cookie: await loginAs(t, student) });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
  }, 300_000);
  afterAll(() => t.close());

  const slowest = async (call: () => Promise<{ status: number }>) => {
    expect((await call()).status).toBe(200);
    let worst = 0;
    for (let i = 0; i < 3; i += 1) {
      const start = performance.now();
      const res = await call();
      worst = Math.max(worst, performance.now() - start);
      expect(res.status).toBe(200);
    }
    return worst;
  };

  it.each([
    ["painel", () => studentClient.get("/api/me/dashboard")],
    ["lista", () => studentClient.get("/api/me/activities")],
    ["lista filtrada (concluídas)", () => studentClient.get("/api/me/activities?status=COMPLETED&pageSize=50")],
    ["lista das turmas do professor", () => teacherClient.get(`/api/classes/${rosterClass.id}/activities`)],
  ] as const)("%s ≤ 1 s com 10 turmas × 50 atividades", async (_name, call) => {
    expect(await slowest(call)).toBeLessThanOrEqual(LIMIT_MS);
  });

  it("detalhe da atividade com 60 alunos ≤ 1 s", async () => {
    const path = `/api/classes/${rosterClass.id}/activities/${rosterActivity.activity.id}`;
    expect(await slowest(() => teacherClient.get(path))).toBeLessThanOrEqual(LIMIT_MS);
    expect((await teacherClient.get(path)).body.roster).toHaveLength(ROSTER);
  });

  it("salvar 10 respostas: p95 < 300 ms em 100 chamadas", async () => {
    const id = rosterActivity.activity.id;
    expect((await startAttempt(studentClient, id)).status).toBe(200);
    const durations: number[] = [];
    for (let call = 0; call < SAVES; call++) {
      const answers = rosterActivity.questionIds.map((questionId, index) => ({
        questionId,
        answer: { kind: "TEXT" as const, text: `Resposta ${index + 1}, versão ${call + 1}` },
        baseRevision: call,
      }));
      const start = performance.now();
      const res = await studentClient.put(`/api/me/activities/${id}/attempt/answers`, { answers });
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(p95).toBeLessThan(SAVE_P95_MS);
  });
});
