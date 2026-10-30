import { randomUUID } from "node:crypto";
import type { Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreatedActivity, createActivity, createClassWithStudents, saveAnswers, startAttempt } from "../helpers/activities";
import { declareExit, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const STATEMENT = "MARCADOR-ENUNCIADO-016-PAUSA";
const ALTERNATIVE = "MARCADOR-ALTERNATIVA-016-PAUSA";
const ANSWER = "MARCADOR-RESPOSTA-016-PAUSA";
const SOURCE = "System.out.println(\"MARCADOR-CODIGO-016-PAUSA\");";
const MARKERS = ["MARCADOR-ENUNCIADO-016-PAUSA", "MARCADOR-ALTERNATIVA-016-PAUSA", "MARCADOR-RESPOSTA-016-PAUSA", "MARCADOR-CODIGO-016-PAUSA"];

/**
 * 016/SC-003 — with the attempt paused, 0 statements or answers leave the server and 0 saves,
 * submissions, events or helps are accepted, from any session of the student (research M6). Every
 * student route is called from two sessions and its body scanned for the statement, alternative and
 * answer markers; then the four tables are written straight through Prisma and each defense trigger
 * refuses. After the return, every answer saved before the pause is intact.
 */
describe("016/SC-003 escrita e leitura com a tentativa pausada", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let sessions: ReturnType<typeof api>[];
  let schoolClass: SchoolClass;
  let created: CreatedActivity;
  let attemptId: string;
  let pauseId: string;

  const activityPath = () => `/api/me/activities/${created.activity.id}`;
  const answers = (): { questionId: string; answer: Answer; baseRevision: number }[] => [
    { questionId: created.questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: created.alternativeIds[0]![0]! }, baseRevision: 0 },
    { questionId: created.questionIds[1]!, answer: { kind: "TEXT", text: ANSWER }, baseRevision: 0 },
    { questionId: created.questionIds[2]!, answer: { kind: "CODE", source: SOURCE }, baseRevision: 0 },
  ];

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const made = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = made.schoolClass;
    student = made.students[0]!;
    sessions = [api(t, { cookie: await loginAs(t, student) }), api(t, { cookie: await loginAs(t, student) })];
    created = await createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      publishAt: new Date(clock.now().getTime() - DAY),
      deadline: new Date(clock.now().getTime() + 7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 40, statement: STATEMENT, alternatives: [ALTERNATIVE, "Outra", "Mais uma"] },
        { type: "OPEN_ANSWER", valueCents: 30, statement: STATEMENT, expectedAnswer: "Esperada." },
        { type: "CODE", valueCents: 30, statement: STATEMENT, expectedSolution: "return 1;" },
      ],
    });
    expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
    expect((await startAttempt(sessions[0]!, created.activity.id)).status).toBe(200);
    expect((await saveAnswers(sessions[0]!, created.activity.id, answers())).status).toBe(200);
    const paused = await declareExit(sessions[0]!, created.activity.id, { reason: "BATHROOM" });
    expect(paused.status, JSON.stringify(paused.body)).toBe(201);
    pauseId = paused.body.id;
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: created.activity.id } })).id;
  });

  it("016/SC-003 016/FR-013 nenhuma rota do aluno, em nenhuma sessão, devolve enunciado, alternativa ou resposta; nenhuma escrita é aceita", async () => {
    const before = await t.prisma.activityAnswer.findMany({ where: { attemptId }, orderBy: { questionId: "asc" } });
    for (const client of sessions) {
      const reads = {
        dashboard: await client.get("/api/me/dashboard"),
        list: await client.get("/api/me/activities"),
        detail: await client.get(activityPath()),
        pause: await client.get(`${activityPath()}/attempt/pause`),
        integrity: await client.get(`${activityPath()}/attempt/integrity`),
        help: await client.get(`${activityPath()}/attempt/help`),
      };
      for (const [route, res] of Object.entries(reads)) {
        expect(res.status, `${route} ${JSON.stringify(res.body)}`).toBe(200);
        for (const marker of MARKERS) expect(JSON.stringify(res.body), route).not.toContain(marker);
      }
      const writes = [
        // A repeated start answers the activity: the same paused view.
        { route: "start", res: await client.post(`${activityPath()}/attempt`, {}), status: 200 },
        { route: "pause", res: await client.post(`${activityPath()}/attempt/pause`, { reason: "WATER" }), status: 200 },
        {
          route: "save",
          res: await client.put(`${activityPath()}/attempt/answers`, { answers: answers().map((item) => ({ ...item, baseRevision: 1 })) }),
          status: 409,
        },
        { route: "submit", res: await client.post(`${activityPath()}/attempt/submit`, { answers: [] }), status: 409 },
        { route: "events", res: await client.post(`${activityPath()}/attempt/events`, { events: [integrityEvent("SCREEN_LEFT")] }), status: 409 },
        {
          route: "help",
          res: await client.post(`${activityPath()}/attempt/help`, { idempotencyKey: randomUUID(), questionId: created.questionIds[1]!, question: "Por onde começo?" }),
          status: 409,
        },
      ];
      for (const { route, res, status } of writes) {
        expect(res.status, `${route} ${JSON.stringify(res.body)}`).toBe(status);
        if (status === 409) expect(res.body.code, route).toBe("ATTEMPT_PAUSED");
        for (const marker of MARKERS) expect(JSON.stringify(res.body), route).not.toContain(marker);
      }
    }
    expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(0);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId } })).toBe(0);
    expect(await t.prisma.workHelpRequest.count({ where: { attemptId } })).toBe(0);
    expect(await t.prisma.attemptPause.count({ where: { attemptId } })).toBe(1);

    // After the return, 100% of the answers saved before the pause are intact.
    expect((await releasePause(teacherClient, schoolClass.id, created.activity.id, pauseId)).status).toBe(200);
    const after = await t.prisma.activityAnswer.findMany({ where: { attemptId }, orderBy: { questionId: "asc" } });
    expect(after).toEqual(before);
    const view = await sessions[1]!.get(activityPath());
    const byQuestion = <T extends { questionId: string }>(items: T[]) => [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
    expect(byQuestion(view.body.attempt.answers as { questionId: string; answer: Answer }[]).map((item) => item.answer)).toEqual(
      byQuestion(answers()).map((item) => item.answer),
    );
  });

  it("016/SC-003 escrita direta pelo Prisma nas 4 tabelas é recusada pelos gatilhos com a pausa aberta", async () => {
    const now = clock.now();
    await expect(
      t.prisma.activityAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: created.questionIds[1]! } },
        data: { text: "alterada", revision: { increment: 1 }, savedAt: now },
      }),
    ).rejects.toThrow(/is paused/);
    await expect(
      t.prisma.activitySubmission.create({
        data: { attemptId, activityId: created.activity.id, studentUserId: student.id, submittedByUserId: student.id, submittedAt: now, late: false, blankCount: 0, grade: "0.00", gradePartial: true },
      }),
    ).rejects.toThrow(/is paused/);
    await expect(
      t.prisma.attemptIntegrityEvent.create({
        data: { attemptId, activityId: created.activity.id, studentUserId: student.id, clientEventId: randomUUID(), type: "SCREEN_LEFT", recordedAt: now },
      }),
    ).rejects.toThrow(/is paused/);
    await expect(
      t.prisma.workHelpRequest.create({
        data: {
          attemptId,
          activityId: created.activity.id,
          studentUserId: student.id,
          questionId: created.questionIds[1]!,
          idempotencyKey: randomUUID(),
          question: "Como começo?",
          requestedAt: now,
        },
      }),
    ).rejects.toThrow(/is paused/);
  });
});
