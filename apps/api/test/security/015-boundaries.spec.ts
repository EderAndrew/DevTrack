import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp } from "../helpers/work-help";

const START = "2026-10-01T12:00:00.000Z";
const VALIDATION = { statusCode: 400, code: "VALIDATION_ERROR", message: expect.any(String) };

/**
 * 015 contracts/http-api.md: bodies are strict and server-controlled fields are refused (400) on the
 * student routes; batches of 1–50 events (0 and 51 → 400); a question of 1–500 characters (0 and
 * 501 → 400); the browser never sends `TYPING_LIMIT_EXCEEDED`; the help allowance is 0 or 3. A refused
 * body writes nothing.
 */
describe("015 fronteiras dos corpos de eventos e de pedidos de ajuda", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let schoolClass: SchoolClass;
  let activity: CreatedActivity;
  let client: ReturnType<typeof api>;
  let teacherClient: ReturnType<typeof api>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const events = (count: number) => Array.from({ length: count }, (_, index) => integrityEvent(index % 2 === 0 ? "SCREEN_LEFT" : "SCREEN_RETURNED"));
  const helpPath = () => `/api/me/activities/${activity.activity.id}/attempt/help`;
  const helpBody = (overrides: Record<string, unknown> = {}) => ({
    questionId: activity.questionIds[0]!,
    question: "Por onde começo?",
    idempotencyKey: randomUUID(),
    ...overrides,
  });
  const nothingWritten = async () => {
    expect(await t.prisma.attemptIntegrityEvent.count()).toBe(0);
    expect(await t.prisma.workHelpRequest.count()).toBe(0);
    expect(await t.prisma.aiExecution.count()).toBe(0);
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({
      clock,
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100, attemptEventsPerMinute: 1000 } },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    schoolClass = await createClass(t, teacher.id);
    activity = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
    const student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
  });

  it("lote de 0 e de 51 eventos → 400; 1 e 50 → 200", async () => {
    const id = activity.activity.id;
    for (const count of [0, 51]) expect((await recordEvents(client, id, events(count))).body, `${count}`).toEqual(VALIDATION);
    await nothingWritten();
    expect((await recordEvents(client, id, events(1))).status).toBe(200);
    expect((await recordEvents(client, id, events(50))).status).toBe(200);
    expect(await t.prisma.attemptIntegrityEvent.count()).toBe(51);
  });

  it("campos do servidor, tipo desconhecido, TYPING_LIMIT_EXCEEDED e formatos inválidos no evento → 400, nada gravado", async () => {
    const base = integrityEvent("SCREEN_LEFT");
    const invalid: Record<string, unknown>[] = [
      { ...base, recordedAt: new Date().toISOString() },
      { ...base, studentUserId: randomUUID() },
      { ...base, attemptId: randomUUID() },
      { ...base, seconds: 30 },
      { ...base, type: "TYPING_LIMIT_EXCEEDED" },
      { ...base, type: "FRAUD_DETECTED" },
      { ...base, eventId: "não-é-uuid" },
      { ...base, questionId: "não-é-uuid" },
      { ...base, clientOccurredAt: "ontem" },
      { ...base, buffered: "sim" },
      { type: "SCREEN_LEFT", clientOccurredAt: base.clientOccurredAt, buffered: false },
    ];
    for (const event of invalid) {
      const res = await client.post(`/api/me/activities/${activity.activity.id}/attempt/events`, { events: [event] });
      expect([res.status, res.body], JSON.stringify(event)).toEqual([400, VALIDATION]);
    }
    expect((await client.post(`/api/me/activities/${activity.activity.id}/attempt/events`, { events: [base], extra: 1 })).body).toEqual(VALIDATION);
    await nothingWritten();
  });

  it("pergunta de 0 e de 501 caracteres → 400; 1 e 500 → aceitas", async () => {
    for (const question of ["", "a".repeat(501)]) {
      expect((await client.post(helpPath(), helpBody({ question }))).body, `${question.length}`).toEqual(VALIDATION);
    }
    await nothingWritten();
    expect((await client.post(helpPath(), helpBody({ question: "?" }))).status).toBe(202);
    // One pending at a time: the 500-character question is checked for its size before the rule.
    const longest = await client.post(helpPath(), helpBody({ question: "b".repeat(500) }));
    expect([longest.status, longest.body.code]).toEqual([409, "HELP_PENDING"]);
  });

  it("campos do servidor e formatos inválidos no pedido de ajuda → 400, nada gravado", async () => {
    const invalid: Record<string, unknown>[] = [
      helpBody({ status: "DELIVERED" }),
      helpBody({ used: 0 }),
      helpBody({ allowance: 3 }),
      helpBody({ message: "Orientação pronta" }),
      helpBody({ reasonCode: "AI_TIMEOUT" }),
      helpBody({ studentUserId: randomUUID() }),
      helpBody({ attemptId: randomUUID() }),
      helpBody({ recordedAt: new Date().toISOString() }),
      helpBody({ questionId: "não-é-uuid" }),
      helpBody({ idempotencyKey: "chave" }),
      { question: "Sem questão", idempotencyKey: randomUUID() },
      { questionId: activity.questionIds[0]!, question: "Sem chave" },
    ];
    for (const body of invalid) {
      const res = await client.post(helpPath(), body);
      expect([res.status, res.body], JSON.stringify(body)).toEqual([400, VALIDATION]);
    }
    await nothingWritten();
  });

  it("a quantidade de ajudas é 0 ou 3 e o modo, NORMAL ou CONTROLLED, na edição do professor", async () => {
    const path = `/api/classes/${schoolClass.id}/activities/${activity.activity.id}`;
    for (const body of [{ aiHelpAllowance: 1 }, { aiHelpAllowance: 4 }, { aiHelpAllowance: "3" }, { executionMode: "EXAM" }, { executionMode: null }]) {
      expect((await teacherClient.patch(path, { version: 1, ...body })).body, JSON.stringify(body)).toEqual(VALIDATION);
    }
    expect(await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.activity.id }, select: { executionMode: true, aiHelpAllowance: true } })).toEqual({
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
    });
  });
});
