import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { completeAttempt, createActivity, gradeAttempt, startAttempt, submitAttempt } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const START = "2026-11-16T12:00:00.000Z";
const FEEDBACK = "FEEDBACK-DO-PROFESSOR-026";
/** A grade or feedback anywhere (012/SC-004; the `totalGrade` of the activity is public). */
const RESULT = new RegExp(`"grade"|"result":\\{|${FEEDBACK}|generalFeedback`);
/** A grade, deadline or late rule in an EXERCISE item (013). */
const EXERCISE_GRADE = /"grade"|"gradePartial"|"generalFeedback"|"late":true|REJECT|ACCEPT_LATE|ACCEPT_WITH_FLAG/;
const ROUTES = ["/api/me/activities", "/api/me/dashboard"] as const;

/**
 * 026/US3 (research D2, D3; spec FR-009, FR-010, SC-004): the `classId` of the student's reads is untrusted input. A
 * class of another student, a class of the student's own ended enrollment and an id that exists nowhere all answer the
 * same `404` on the list and the dashboard, with no activity and no audit event; with the student's own class every rule
 * of what a student sees still holds (016 attendance, 012 grades only after the release, 013 points never a grade).
 */
describe("026/US3 só as matérias do próprio aluno", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let teacherClient: ReturnType<typeof api>;
  let own: SchoolClass;
  let ended: SchoolClass;
  let others: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (schoolClass: SchoolClass, title: string, extra: Parameters<typeof createActivity>[2] = {}) =>
    createActivity(t, schoolClass, { title, publishAt: at(-DAY), deadline: at(7 * DAY), ...extra });
  const endEnrollment = (classId: string) =>
    t.prisma.enrollment.updateMany({
      where: { cohort: { classes: { some: { id: classId } } }, studentUserId: student.id },
      data: { status: "REMOVED", removedAt: clock.now(), removedById: teacher.id },
    });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    student = await createUser(t, { roles: ["STUDENT"], name: "Aluno A" });
    const other = await createUser(t, { roles: ["STUDENT"], name: "Aluno B" });
    own = await createClass(t, teacher.id, { name: "Turma própria" });
    ended = await createClass(t, teacher.id, { name: "Turma encerrada" });
    others = await createClass(t, teacher.id, { name: "Turma do outro" });
    await createEnrollment(t, own.id, student.id);
    await createEnrollment(t, ended.id, student.id);
    await createEnrollment(t, others.id, other.id);
    await work(own, "Trabalho próprio");
    await work(ended, "Trabalho da matrícula encerrada");
    await work(others, "Trabalho do outro aluno");
    await endEnrollment(ended.id);
    client = api(t, { cookie: await loginAs(t, student) });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
  });

  it("026/US3-2 026/SC-004 turma do outro aluno, matrícula encerrada e id inexistente → o mesmo 404, sem atividade nem evento de auditoria", async () => {
    const audits = await t.prisma.auditEvent.count();
    for (const route of ROUTES) {
      const bodies = [];
      for (const classId of [others.id, ended.id, randomUUID()]) {
        const res = await client.get(`${route}?classId=${classId}`);
        expect({ route, status: res.status, body: res.body }).toEqual({ route, status: 404, body: NOT_FOUND });
        expect(JSON.stringify(res.body)).not.toMatch(/Trabalho|Turma/);
        bodies.push(res.body);
      }
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
    }
    expect(await t.prisma.auditEvent.count()).toBe(audits);

    // The student's own class still answers, with only its activity.
    const list = await client.get(`/api/me/activities?classId=${own.id}`);
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { title: string }) => item.title)).toEqual(["Trabalho próprio"]);
  });

  it("026/US3-5 com a turma do aluno, um trabalho PRESENT_ONLY sem a presença dele continua fora da lista e dos contadores", async () => {
    const gated = await work(own, "Trabalho com chamada", { releaseMode: "PRESENT_ONLY" });
    const before = (await client.get(`/api/me/dashboard?classId=${own.id}`)).body.counts;
    const list = await client.get(`/api/me/activities?classId=${own.id}`);
    const dashboard = await client.get(`/api/me/dashboard?classId=${own.id}`);
    for (const res of [list, dashboard]) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toContain(gated.activity.id);
      expect(JSON.stringify(res.body)).not.toContain("Trabalho com chamada");
    }
    expect(dashboard.body.counts).toEqual({ pending: 1, inProgress: 0, overdue: 0, completed: 0 });
    expect(before).toEqual(dashboard.body.counts);

    // Once marked present, the same class shows it (016 unchanged).
    expect((await markPresent(teacherClient, own.id, gated.activity.id, [student.id])).status).toBe(200);
    const after = await client.get(`/api/me/activities?classId=${own.id}`);
    expect(after.body.items.map((item: { id: string }) => item.id)).toContain(gated.activity.id);
  });

  it("026/FR-010 com a turma do aluno, nenhuma nota antes da liberação e nenhum ponto de exercício como nota", async () => {
    const graded = await work(own, "Trabalho corrigido", { questions: [{ type: "OPEN_ANSWER", valueCents: 100 }] });
    expect((await startAttempt(client, graded.activity.id)).status).toBe(200);
    const submitted = await submitAttempt(client, graded.activity.id, [
      { questionId: graded.questionIds[0]!, answer: { kind: "TEXT", text: "Minha resposta" }, baseRevision: 0 },
    ]);
    expect(submitted.status).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: graded.activity.id } });
    const grading = await gradeAttempt(teacherClient, own.id, graded.activity.id, attempt.id, {
      version: 1,
      decisions: [{ questionId: graded.questionIds[0]!, grade: "0.80", feedback: FEEDBACK }],
      generalFeedback: FEEDBACK,
    });
    expect(grading.status).toBe(200);

    const exercise = await createActivity(t, own, {
      type: "EXERCISE",
      title: "Exercício pontuado",
      publishAt: at(-DAY),
      questions: [{ type: "MULTIPLE_CHOICE", difficulty: "BASIC", correctIndex: 0 }],
    });
    expect((await startAttempt(client, exercise.activity.id)).status).toBe(200);
    const concluded = await completeAttempt(client, exercise.activity.id, 1, [
      { questionId: exercise.questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: exercise.alternativeIds[0]![0]! }, baseRevision: 0 },
    ]);
    expect(concluded.status).toBe(200);

    const reads = [
      await client.get(`/api/me/activities?classId=${own.id}`),
      // 029/FR-007 (SC-005): still ACTIVE, so read back from "Minhas atividades" (the 028 amendment had moved it to the Histórico).
      await client.get(`/api/me/activities?classId=${own.id}&status=COMPLETED`),
      await client.get(`/api/me/dashboard?classId=${own.id}`),
    ];
    for (const res of reads) {
      expect(res.status).toBe(200);
      expect(JSON.stringify(res.body)).not.toMatch(RESULT);
    }
    const exerciseItem = reads[0]!.body.items.find((item: { id: string }) => item.id === exercise.activity.id);
    expect(exerciseItem).toBeDefined();
    expect(JSON.stringify(exerciseItem)).not.toMatch(EXERCISE_GRADE);
  });

  it("026/US3-6 a matrícula encerrada enquanto o aluno está na tela → o próximo pedido com a turma responde 404", async () => {
    for (const route of ROUTES) expect((await client.get(`${route}?classId=${own.id}`)).status).toBe(200);
    await endEnrollment(own.id);
    for (const route of ROUTES) {
      const res = await client.get(`${route}?classId=${own.id}`);
      expect({ route, status: res.status, body: res.body }).toEqual({ route, status: 404, body: NOT_FOUND });
    }
  });
});
