import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, type CreatedActivity, retryAttempt, startAttempt } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const BIG_CLASS = 200;
const RANKING_MS = 300;
const CLASSES = 10;
const CLASSMATES = 30;
const DASHBOARD_MS = 1000;
const CONCLUSIONS = 100;
const COMPLETE_P95_MS = 500;

/**
 * 013 plan "Performance Goals": the ranking of a 200-student class < 300 ms (teacher and student);
 * the dashboard of a student in 10 classes, rankings included, < 1 s; a conclusion of 10 exercises with
 * p95 < 500 ms over 100 calls. Students (with their student profile), enrollments, concluded attempts and their results are
 * bulk-inserted in one transaction per class; each read is warmed once, then the slowest of three
 * calls is measured end to end through HTTP.
 */
describe("013 desempenho do ranking, do painel e da conclusão", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let studentClient: ReturnType<typeof api>;
  let teacherClient: ReturnType<typeof api>;
  let bigClass: SchoolClass;
  let practice: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  /**
   * `count` students enrolled in the class, each with attempt 1 of a three-question EXERCISE activity
   * concluded: student i gets the first `i % 4` questions right (15, 30 and 60 points), so the ranking has
   * ties and zeros.
   */
  async function populate(schoolClass: SchoolClass, count: number, prefix: string) {
    const activity = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", difficulty: "BASIC" },
        { type: "MULTIPLE_CHOICE", difficulty: "INTERMEDIATE" },
        { type: "MULTIPLE_CHOICE", difficulty: "ADVANCED" },
      ],
    });
    const questions = await t.prisma.classActivityQuestion.findMany({ where: { activityId: activity.activity.id }, orderBy: { position: "asc" } });
    const passwordHash = (await t.prisma.user.findUniqueOrThrow({ where: { id: teacher.id } })).passwordHash;
    await t.prisma.runInTransaction(async (tx) => {
      const users = Array.from({ length: count }, (_, i) => ({
        id: crypto.randomUUID(),
        email: `aluno-${i}-${crypto.randomUUID()}@example.test`,
        name: `${prefix} ${String(i).padStart(3, "0")}`,
        passwordHash,
        emailVerifiedAt: at(-DAY),
      }));
      await tx.user.createMany({ data: users });
      await tx.studentProfile.createMany({ data: users.map((user) => ({ userId: user.id, displayName: user.name })) });
      await tx.enrollment.createMany({ data: users.map((user) => ({ classId: schoolClass.id, studentUserId: user.id, status: "ACTIVE" as const, enrolledAt: at(-DAY) })) });
      const attempts = users.map((user) => ({
        id: crypto.randomUUID(),
        activityId: activity.activity.id,
        studentUserId: user.id,
        number: 1,
        startedAt: at(-DAY),
        status: "SUBMITTED" as const,
        completedAt: at(-DAY),
      }));
      await tx.activityAttempt.createMany({ data: attempts });
      await tx.exerciseQuestionResult.createMany({
        data: attempts.flatMap((attempt, i) =>
          questions.map((question, q) => {
            const correct = q < i % 4;
            return {
              attemptId: attempt.id,
              questionId: question.id,
              activityId: activity.activity.id,
              questionPoints: question.points!,
              classId: schoolClass.id,
              studentUserId: attempt.studentUserId,
              sourceExerciseId: question.sourceExerciseId!,
              scoring: true,
              result: correct ? ("CORRECT" as const) : ("WRONG" as const),
              points: correct ? question.points! : 0,
              nature: "RULE_RESULT" as const,
            };
          }),
        ),
      });
    });
  }

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, exerciseAttemptsPerHour: 10_000 } } });
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluna Medida" });

    bigClass = await createClass(t, teacher.id, { name: "Turma de 200" });
    await populate(bigClass, BIG_CLASS - 1, "Aluno");
    await createEnrollment(t, bigClass.id, student.id);
    for (let i = 1; i < CLASSES; i++) {
      const schoolClass = await createClass(t, teacher.id, { name: `Turma ${i}` });
      await populate(schoolClass, CLASSMATES, `Colega ${i}`);
      await createEnrollment(t, schoolClass.id, student.id);
    }
    practice = await createActivity(t, bigClass, {
      type: "EXERCISE",
      publishAt: at(-DAY),
      questions: Array.from({ length: 10 }, () => ({ type: "MULTIPLE_CHOICE" as const, difficulty: "BASIC" as const })),
    });
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
    ["do professor", () => teacherClient.get(`/api/classes/${bigClass.id}/ranking`)],
    ["do aluno", () => studentClient.get(`/api/me/classes/${bigClass.id}/ranking`)],
  ] as const)("ranking %s de uma turma de 200 alunos < 300 ms", async (_name, call) => {
    expect(await slowest(call)).toBeLessThan(RANKING_MS);
    const body = (await call()) as { body: { rows: { points: number }[] } };
    expect(body.body.rows).toHaveLength(BIG_CLASS);
    expect(body.body.rows[0]!.points).toBe(105);
  });

  it("painel com 10 turmas, rankings incluídos, < 1 s", async () => {
    expect(await slowest(() => studentClient.get("/api/me/dashboard"))).toBeLessThan(DASHBOARD_MS);
    const board = await studentClient.get("/api/me/dashboard");
    expect(board.body.rankings).toHaveLength(CLASSES);
  });

  it("concluir 10 exercícios: p95 < 500 ms em 100 chamadas", async () => {
    const id = practice.activity.id;
    expect((await startAttempt(studentClient, id)).status).toBe(200);
    const answers = practice.questionIds.map((questionId, index) => ({
      questionId,
      answer: { kind: "ALTERNATIVE" as const, alternativeId: practice.correctAlternativeIds[index]! },
      baseRevision: 0,
    }));
    const durations: number[] = [];
    for (let number = 1; number <= CONCLUSIONS; number++) {
      if (number > 1) expect((await retryAttempt(studentClient, id, number - 1)).status).toBe(200);
      const start = performance.now();
      const res = await completeAttempt(studentClient, id, number, answers);
      durations.push(performance.now() - start);
      expect(res.status).toBe(200);
    }
    const sorted = [...durations].sort((a, b) => a - b);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(p95).toBeLessThan(COMPLETE_P95_MS);
    // Only attempt 1 scored.
    expect((await studentClient.get(`/api/me/activities/${id}`)).body.points.earned).toBe(150);
  });
});
