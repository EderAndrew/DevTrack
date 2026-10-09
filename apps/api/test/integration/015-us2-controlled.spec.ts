import type { Answer, SaveAnswersResult, StudentIntegrity } from "@repo/contracts";
import { RecordIntegrityEventsResultSchema, SaveAnswersResultSchema, StudentIntegritySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  type CreateActivityOptions,
  type CreatedActivity,
  createActivity,
  createClassWithStudents,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { getOwnIntegrity, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 015/US2 — the student answers a work in the controlled mode (015/FR-009–FR-014, research F4, F7):
 * every exit, return, page-leave attempt, connection drop and blocked clipboard gesture is a fact
 * stamped with the server clock (the browser's time kept only for an event sent from the offline
 * buffer), recorded once per event id, only for the student's own open attempt of a CONTROLLED work;
 * the server refuses a save whose text grows faster than typing allows, without losing the stored
 * answer. Nothing blocks, submits or grades the attempt; NORMAL works keep the 012 behaviour.
 */

const START = "2026-10-01T12:00:00.000Z";
type ApiClient = ReturnType<typeof api>;

describe("015/US2 aluno responde em modo controlado", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ApiClient;
  let otherClient: ApiClient;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** Multiple choice (correct: first), open answer and code with a starter, CONTROLLED unless overridden. */
  const work = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 40, alternatives: ["Certa", "Errada 1", "Errada 2"], correctIndex: 0 },
        { type: "OPEN_ANSWER", valueCents: 30 },
        { type: "CODE", valueCents: 30, starterCode: "s".repeat(600) },
      ],
      ...options,
    });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const choice = (alternativeId: string | null): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const code = (source: string): Answer => ({ kind: "CODE", source });
  const chars = (count: number, letter = "x") => letter.repeat(count);

  const started = async (activity: CreatedActivity) => {
    const res = await startAttempt(client, activity.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.activity.id, studentUserId: student.id } })).id;
  };
  const record = async (activity: CreatedActivity, events: ReturnType<typeof integrityEvent>[], expected = 200) => {
    const res = await recordEvents(client, activity.activity.id, events);
    expect(res.status, JSON.stringify(res.body)).toBe(expected);
    return res;
  };
  const save = async (activity: CreatedActivity, answers: { questionId: string; answer: Answer; baseRevision: number }[]) => {
    const res = await saveAnswers(client, activity.activity.id, answers);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return SaveAnswersResultSchema.parse(res.body) satisfies SaveAnswersResult;
  };
  const own = async (activity: CreatedActivity) => {
    const res = await getOwnIntegrity(client, activity.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return StudentIntegritySchema.parse(res.body) satisfies StudentIntegrity;
  };
  const stored = (attemptId: string) => t.prisma.attemptIntegrityEvent.findMany({ where: { attemptId }, orderBy: { recordedAt: "asc" } });
  const audits = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const attemptStatus = async (attemptId: string) => (await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status;

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    client = api(t, { cookie: await loginAs(t, student) });
    otherClient = api(t, { cookie: await loginAs(t, created.students[1]!) });
  });

  describe("015/FR-010 eventos gravados como fatos com o horário do servidor", () => {
    it("015/US2-3 trocar de aba grava a saída e o retorno com o horário do servidor, auditados", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      const left = integrityEvent("SCREEN_LEFT", { clientOccurredAt: "2020-01-01T00:00:00.000Z" });
      const res = await record(activity, [left]);
      expect(RecordIntegrityEventsResultSchema.parse(res.body)).toEqual({ recorded: [{ eventId: left.eventId, recordedAt: START }] });
      clock.advance(MINUTE);
      const back = integrityEvent("SCREEN_RETURNED");
      expect((await record(activity, [back])).body).toEqual({ recorded: [{ eventId: back.eventId, recordedAt: at(0).toISOString() }] });

      const rows = await stored(attemptId);
      expect(rows.map((row) => [row.type, row.recordedAt.toISOString(), row.clientOccurredAt, row.buffered, row.clientEventId])).toEqual([
        ["SCREEN_LEFT", START, null, false, left.eventId],
        ["SCREEN_RETURNED", at(0).toISOString(), null, false, back.eventId],
      ]);
      const recorded = await audits("attempt_integrity.recorded");
      expect(recorded.map((row) => [row.actorType, row.actorUserId, row.targetType, row.targetId, row.metadata])).toEqual([
        ["USER", student.id, "ACTIVITY_ATTEMPT", attemptId, { eventType: "SCREEN_LEFT", buffered: false }],
        ["USER", student.id, "ACTIVITY_ATTEMPT", attemptId, { eventType: "SCREEN_RETURNED", buffered: false }],
      ]);
      expect((await own(activity)).totals).toMatchObject({ screenExits: 1, timeAwaySeconds: 60 });
    });

    it("015/US2-4 sair e voltar à tela cheia é registrado; responder continua possível fora dela", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      await record(activity, [integrityEvent("FULLSCREEN_EXITED")]);
      const saved = await save(activity, [{ questionId: activity.questionIds[1]!, answer: text("Fora da tela cheia"), baseRevision: 0 }]);
      expect(saved.results[0]).toMatchObject({ outcome: "SAVED", revision: 1 });
      clock.advance(30_000);
      await record(activity, [integrityEvent("FULLSCREEN_ENTERED")]);
      expect((await stored(attemptId)).map((row) => row.type)).toEqual(["FULLSCREEN_EXITED", "FULLSCREEN_ENTERED"]);
      expect((await own(activity)).totals).toMatchObject({ fullscreenExits: 1, screenExits: 0 });
    });

    it("015/US2-5 a tentativa de sair da página é registrada e as respostas salvas permanecem", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      await save(activity, [{ questionId: activity.questionIds[1]!, answer: text("Guardada"), baseRevision: 0 }]);
      await record(activity, [integrityEvent("PAGE_LEAVE_ATTEMPTED")]);
      expect((await stored(attemptId)).map((row) => row.type)).toEqual(["PAGE_LEAVE_ATTEMPTED"]);
      expect(await t.prisma.activityAnswer.findFirstOrThrow({ where: { attemptId } })).toMatchObject({ text: "Guardada", revision: 1 });
      expect(await attemptStatus(attemptId)).toBe("IN_PROGRESS");
    });

    it("015/US2-8 eventos sem conexão guardam o horário do navegador; reenviar o mesmo evento devolve o mesmo horário sem duplicar", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      clock.advance(5 * MINUTE);
      const lost = integrityEvent("CONNECTION_LOST", { buffered: true, clientOccurredAt: at(-4 * MINUTE).toISOString() });
      const left = integrityEvent("SCREEN_LEFT", { buffered: true, clientOccurredAt: at(-3 * MINUTE).toISOString() });
      const back = integrityEvent("SCREEN_RETURNED", { buffered: true, clientOccurredAt: at(-2 * MINUTE).toISOString() });
      const restored = integrityEvent("CONNECTION_RESTORED");
      const first = await record(activity, [lost, left, back, restored]);
      const sentAt = at(0).toISOString();
      expect(first.body.recorded).toEqual([lost, left, back, restored].map((event) => ({ eventId: event.eventId, recordedAt: sentAt })));

      clock.advance(MINUTE);
      const again = await record(activity, [left, restored]);
      expect(again.body.recorded).toEqual([
        { eventId: left.eventId, recordedAt: sentAt },
        { eventId: restored.eventId, recordedAt: sentAt },
      ]);
      const rows = await stored(attemptId);
      expect(rows).toHaveLength(4);
      expect(rows.find((row) => row.clientEventId === left.eventId)).toMatchObject({ buffered: true, clientOccurredAt: new Date(left.clientOccurredAt) });
      expect(rows.find((row) => row.clientEventId === restored.eventId)).toMatchObject({ buffered: false, clientOccurredAt: null });
      expect(await audits("attempt_integrity.recorded")).toHaveLength(4);

      const integrity = await own(activity);
      expect(integrity.events.map((event) => [event.type, event.buffered])).toEqual([
        ["CONNECTION_LOST", true],
        ["SCREEN_LEFT", true],
        ["SCREEN_RETURNED", true],
        ["CONNECTION_RESTORED", false],
      ]);
      expect(integrity.totals).toMatchObject({ disconnections: 1, offlineSeconds: 4 * 60, screenExits: 1, timeAwaySeconds: 60 });
    });

    it("tela cheia e detecção indisponíveis são registradas como fatos", async () => {
      const activity = await work();
      await started(activity);
      await record(activity, [integrityEvent("FULLSCREEN_UNAVAILABLE"), integrityEvent("DETECTION_UNAVAILABLE")]);
      expect((await own(activity)).totals).toMatchObject({ fullscreenUnavailable: true, detectionUnavailable: true });
    });

    it("eventos só da tentativa aberta: sem iniciar → 409 NOT_STARTED; entregue → 409 ATTEMPT_ALREADY_SUBMITTED; encerrada → 409 ACTIVITY_CLOSED", async () => {
      const activity = await work();
      expect((await record(activity, [integrityEvent("SCREEN_LEFT")], 409)).body.code).toBe("NOT_STARTED");
      const attemptId = await started(activity);
      expect((await submitAttempt(client, activity.activity.id)).status).toBe(200);
      expect((await record(activity, [integrityEvent("SCREEN_LEFT")], 409)).body.code).toBe("ATTEMPT_ALREADY_SUBMITTED");
      expect(await stored(attemptId)).toEqual([]);

      const closed = await work();
      const closedAttempt = await started(closed);
      await t.prisma.classActivity.update({ where: { id: closed.activity.id }, data: { status: "CLOSED", closedAt: clock.now() } });
      expect((await record(closed, [integrityEvent("SCREEN_LEFT")], 409)).body.code).toBe("ACTIVITY_CLOSED");
      expect(await stored(closedAttempt)).toEqual([]);
    });

    it("eventos só do próprio aluno: atividade de outra turma → 404 com student_access.denied; outro aluno não vê os eventos", async () => {
      const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
      const otherClass = (await createClassWithStudents(t, otherTeacher.id, { students: 0 })).schoolClass;
      const foreign = await createActivity(t, otherClass, { publishAt: at(-DAY), deadline: at(DAY), executionMode: "CONTROLLED" });
      expect((await record(foreign, [integrityEvent("SCREEN_LEFT")], 404)).body.code).toBe("NOT_FOUND");
      expect((await audits("student_access.denied")).map((row) => row.metadata)).toEqual([
        { route: "/me/activities/:activityId/attempt/events", reason: "NOT_ENROLLED" },
      ]);
      expect((await getOwnIntegrity(client, foreign.activity.id)).status).toBe(404);

      const activity = await work();
      await started(activity);
      await record(activity, [integrityEvent("SCREEN_LEFT")]);
      expect((await getOwnIntegrity(otherClient, activity.activity.id)).status).toBe(404);
      expect((await recordEvents(otherClient, activity.activity.id, [integrityEvent("SCREEN_LEFT")])).body.code).toBe("NOT_STARTED");
    });

    it("015/US2-9 015/FR-014 trabalho NORMAL → 409 NOT_CONTROLLED, nada gravado, e uma colagem grande salva como na 012", async () => {
      const activity = await work({ executionMode: "NORMAL" });
      const attemptId = await started(activity);
      expect((await record(activity, [integrityEvent("SCREEN_LEFT")], 409)).body.code).toBe("NOT_CONTROLLED");
      const saved = await save(activity, [{ questionId: activity.questionIds[1]!, answer: text(chars(5_000)), baseRevision: 0 }]);
      expect(saved.results[0]).toMatchObject({ outcome: "SAVED" });
      expect(await t.prisma.attemptIntegrityEvent.count()).toBe(0);
      expect(await attemptStatus(attemptId)).toBe("IN_PROGRESS");
    });
  });

  describe("015/US2-10 015/US2-11 copiar e colar bloqueados registrados com a questão", () => {
    it("015/US2-10 colar e soltar bloqueados ficam com a questão, sem conteúdo", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      await record(activity, [
        integrityEvent("PASTE_BLOCKED", { questionId: activity.questionIds[1]! }),
        integrityEvent("DROP_BLOCKED", { questionId: activity.questionIds[2]! }),
      ]);
      expect((await stored(attemptId)).map((row) => [row.type, row.questionId])).toEqual([
        ["PASTE_BLOCKED", activity.questionIds[1]],
        ["DROP_BLOCKED", activity.questionIds[2]],
      ]);
      const integrity = await own(activity);
      expect(integrity.events.map((event) => event.questionPosition)).toEqual([1, 2]);
      expect(integrity.totals.clipboardBlocks).toBe(2);
    });

    it("015/US2-11 copiar e recortar bloqueados são registrados; questão de outra atividade → 422 UNKNOWN_QUESTION", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      await record(activity, [integrityEvent("COPY_BLOCKED", { questionId: activity.questionIds[0]! }), integrityEvent("CUT_BLOCKED")]);
      expect((await stored(attemptId)).map((row) => row.type)).toEqual(["COPY_BLOCKED", "CUT_BLOCKED"]);
      const other = await work();
      const res = await record(activity, [integrityEvent("PASTE_BLOCKED", { questionId: other.questionIds[0]! })], 422);
      expect(res.body.code).toBe("UNKNOWN_QUESTION");
      expect(await stored(attemptId)).toHaveLength(2);
    });

    it("o navegador não manda TYPING_LIMIT_EXCEEDED, horário do servidor nem questão num evento de tela (400)", async () => {
      const activity = await work();
      await started(activity);
      const typing = { ...integrityEvent("SCREEN_LEFT"), type: "TYPING_LIMIT_EXCEEDED" };
      expect((await recordEvents(client, activity.activity.id, [typing as never])).status).toBe(400);
      expect((await recordEvents(client, activity.activity.id, [{ ...integrityEvent("SCREEN_LEFT"), recordedAt: START } as never])).status).toBe(400);
      const withQuestion = integrityEvent("SCREEN_LEFT", { questionId: activity.questionIds[0]! });
      expect((await recordEvents(client, activity.activity.id, [withQuestion])).status).toBe(400);
    });
  });

  describe("015/FR-013c limite de digitação no salvamento e na entrega", () => {
    it("salvamento acima do limite → TYPING_LIMIT_EXCEEDED só naquela resposta; as outras salvam; evento registrado", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      const [mc, open, codeQuestion] = activity.questionIds as [string, string, string];
      const saved = await save(activity, [
        { questionId: mc, answer: choice(activity.alternativeIds[0]![1]!), baseRevision: 0 },
        { questionId: open, answer: text(chars(401)), baseRevision: 0 },
        { questionId: codeQuestion, answer: code(chars(600, "s") + chars(400)), baseRevision: 0 },
      ]);
      expect(saved.results).toEqual([
        { questionId: mc, outcome: "SAVED", revision: 1 },
        { questionId: open, outcome: "TYPING_LIMIT_EXCEEDED", revision: 0 },
        { questionId: codeQuestion, outcome: "SAVED", revision: 1 },
      ]);
      expect(await t.prisma.activityAnswer.count({ where: { attemptId, questionId: open } })).toBe(0);
      expect((await stored(attemptId)).map((row) => [row.type, row.questionId, row.recordedAt.toISOString(), row.buffered])).toEqual([
        ["TYPING_LIMIT_EXCEEDED", open, START, false],
      ]);
      expect((await audits("attempt_integrity.recorded")).map((row) => [row.actorType, row.targetId, row.metadata])).toEqual([
        ["SYSTEM", attemptId, { eventType: "TYPING_LIMIT_EXCEEDED", buffered: false }],
      ]);
    });

    it("a resposta salva fica como estava e o tempo desde o último salvamento libera mais digitação", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      const open = activity.questionIds[1]!;
      await save(activity, [{ questionId: open, answer: text(chars(300)), baseRevision: 0 }]);
      clock.advance(10_000);
      const refused = await save(activity, [{ questionId: open, answer: text(chars(300 + 551)), baseRevision: 1 }]);
      expect(refused.results).toEqual([{ questionId: open, outcome: "TYPING_LIMIT_EXCEEDED", revision: 1 }]);
      expect(await t.prisma.activityAnswer.findFirstOrThrow({ where: { attemptId, questionId: open } })).toMatchObject({ text: chars(300), revision: 1 });
      const accepted = await save(activity, [{ questionId: open, answer: text(chars(300 + 550)), baseRevision: 1 }]);
      expect(accepted.results).toEqual([{ questionId: open, outcome: "SAVED", revision: 2 }]);
      const shrunk = await save(activity, [{ questionId: open, answer: text("curta"), baseRevision: 2 }]);
      expect(shrunk.results[0]).toMatchObject({ outcome: "SAVED", revision: 3 });
    });

    it("a primeira resposta conta desde o início da tentativa", async () => {
      const activity = await work();
      await started(activity);
      clock.advance(20 * MINUTE);
      const saved = await save(activity, [{ questionId: activity.questionIds[1]!, answer: text(chars(5_000)), baseRevision: 0 }]);
      expect(saved.results[0]).toMatchObject({ outcome: "SAVED" });
    });

    it("entrega com resposta pendente acima do limite → 422 TYPING_LIMIT_EXCEEDED, nada entregue, evento registrado", async () => {
      const activity = await work();
      const attemptId = await started(activity);
      const open = activity.questionIds[1]!;
      const res = await submitAttempt(client, activity.activity.id, [{ questionId: open, answer: text(chars(2_000)), baseRevision: 0 }]);
      expect(res.status).toBe(422);
      expect(res.body.code).toBe("TYPING_LIMIT_EXCEEDED");
      expect(await attemptStatus(attemptId)).toBe("IN_PROGRESS");
      expect(await t.prisma.activitySubmission.count()).toBe(0);
      expect(await t.prisma.activityAnswer.count({ where: { attemptId } })).toBe(0);
      expect((await stored(attemptId)).map((row) => [row.type, row.questionId])).toEqual([["TYPING_LIMIT_EXCEEDED", open]]);

      const ok = await submitAttempt(client, activity.activity.id, [{ questionId: open, answer: text("Digitada"), baseRevision: 0 }]);
      expect(ok.status).toBe(200);
      expect(await attemptStatus(attemptId)).toBe("SUBMITTED");
    });

    it("múltipla escolha nunca é checada; trabalho NORMAL nunca é checado", async () => {
      const activity = await work({ questions: [{ type: "MULTIPLE_CHOICE" }] });
      await started(activity);
      const saved = await save(activity, [{ questionId: activity.questionIds[0]!, answer: choice(activity.alternativeIds[0]![0]!), baseRevision: 0 }]);
      expect(saved.results[0]).toMatchObject({ outcome: "SAVED" });

      const normal = await work({ executionMode: "NORMAL" });
      await started(normal);
      const res = await submitAttempt(client, normal.activity.id, [{ questionId: normal.questionIds[1]!, answer: text(chars(9_000)), baseRevision: 0 }]);
      expect(res.status).toBe(200);
      expect(await t.prisma.attemptIntegrityEvent.count()).toBe(0);
    });
  });

  it("015/US2-6 015/FR-010 015/SC-005 várias saídas e bloqueios: nada bloqueia, entrega sozinho nem muda a nota", async () => {
    const activity = await work({ questions: [{ type: "MULTIPLE_CHOICE", valueCents: 100, alternatives: ["Certa", "Errada", "Outra"], correctIndex: 0 }] });
    const attemptId = await started(activity);
    for (let round = 0; round < 5; round += 1) {
      clock.advance(MINUTE);
      await record(activity, [
        integrityEvent("SCREEN_LEFT"),
        integrityEvent("FULLSCREEN_EXITED"),
        integrityEvent("PAGE_LEAVE_ATTEMPTED"),
        integrityEvent("PASTE_BLOCKED", { questionId: activity.questionIds[0]! }),
        integrityEvent("SCREEN_RETURNED"),
      ]);
    }
    expect(await attemptStatus(attemptId)).toBe("IN_PROGRESS");
    expect(await t.prisma.activitySubmission.count()).toBe(0);
    const res = await submitAttempt(client, activity.activity.id, [
      { questionId: activity.questionIds[0]!, answer: choice(activity.alternativeIds[0]![0]!), baseRevision: 0 },
    ]);
    expect(res.status).toBe(200);
    const submission = await t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId } });
    expect(submission.grade?.toFixed(2)).toBe("1.00");
    expect(submission.late).toBe(false);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId } })).toBe(25);
  });

  it("015/FR-014 prazo e regra de atraso da 012 valem no modo controlado", async () => {
    const activity = await work({ deadline: at(HOUR), latePolicy: "REJECT" });
    await started(activity);
    clock.advance(2 * HOUR);
    const res = await submitAttempt(client, activity.activity.id, []);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DEADLINE_PASSED");
    expect((await record(activity, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
  });
});
