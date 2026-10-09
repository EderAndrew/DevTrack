import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { drain, resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

const START = "2026-10-01T12:00:00.000Z";
const EVENTS_PER_MINUTE = 5;
const HELPS_PER_HOUR = 2;
const AGENT_PER_HOUR = 3;
const RATE_LIMITED = { statusCode: 429, code: "RATE_LIMITED", message: expect.any(String) };

/**
 * 015 contracts/configuration.md: integrity events per student and minute (each event of a batch
 * counts), help requests per student and hour (any outcome) and the `work-helper` agent's own hourly
 * limit, all students together (research F12). Over a limit → 429 RATE_LIMITED with `Retry-After`,
 * nothing is written, and another student's counters are untouched.
 */
describe("015 limites de eventos, de pedidos de ajuda e do agente", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let schoolClass: SchoolClass;
  let activity: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const student = async () => {
    const user = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, user.id);
    const client = api(t, { cookie: await loginAs(t, user) });
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
    return { user, client };
  };
  const ask = (client: ReturnType<typeof api>, question = "Por onde começo?") => requestHelp(client, activity.activity.id, { questionId: activity.questionIds[0]!, question });
  const deliver = async (requestId: string) => {
    scriptHelp(t.provider, requestId, validGuidance());
    await drain(t);
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({
      clock,
      config: {
        rateLimit: {
          ...testConfig().rateLimit,
          aiExecutionsPerMinute: 100,
          attemptEventsPerMinute: EVENTS_PER_MINUTE,
          workHelpPerHour: HELPS_PER_HOUR,
          workHelpAgentPerHour: AGENT_PER_HOUR,
        },
      },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    activity = await createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
  });

  it("eventos: cada evento do lote conta; acima do limite → 429 com Retry-After e nada gravado; outro aluno segue", async () => {
    const first = await student();
    const id = activity.activity.id;
    expect((await recordEvents(first.client, id, [integrityEvent("SCREEN_LEFT"), integrityEvent("SCREEN_RETURNED"), integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    expect((await recordEvents(first.client, id, [integrityEvent("SCREEN_RETURNED"), integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    const over = await recordEvents(first.client, id, [integrityEvent("SCREEN_RETURNED")]);
    expect([over.status, over.body]).toEqual([429, RATE_LIMITED]);
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { studentUserId: first.user.id } })).toBe(5);
    const other = await student();
    expect((await recordEvents(other.client, id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
  });

  it("pedidos de ajuda por aluno e hora: o terceiro → 429, sem pedido nem execução, auditado ai_execution.rate_limited", async () => {
    const first = await student();
    for (let i = 0; i < HELPS_PER_HOUR; i += 1) {
      const res = await ask(first.client, `Pergunta ${i}`);
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      await deliver(res.body.id);
    }
    const over = await ask(first.client, "Mais uma?");
    expect([over.status, over.body]).toEqual([429, RATE_LIMITED]);
    expect(Number(over.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.workHelpRequest.count({ where: { studentUserId: first.user.id } })).toBe(HELPS_PER_HOUR);
    expect(await t.prisma.aiExecution.count()).toBe(HELPS_PER_HOUR);
    const audited = await t.prisma.auditEvent.findMany({ where: { type: "ai_execution.rate_limited", actorUserId: first.user.id } });
    expect(audited.map((event) => event.metadata)).toEqual([{ scope: "work-help" }]);
    // A refused request counts too: it is the student's attempt, whatever its outcome.
    expect((await ask(first.client, "E agora?")).status).toBe(429);
    const other = await student();
    expect((await ask(other.client)).status).toBe(202);
  });

  it("limite próprio do agente, todos os alunos juntos: acima dele → 429 e nada gravado", async () => {
    for (let i = 0; i < AGENT_PER_HOUR; i += 1) {
      const { client } = await student();
      const res = await ask(client);
      expect(res.status, JSON.stringify(res.body)).toBe(202);
      await deliver(res.body.id);
    }
    const late = await student();
    const over = await ask(late.client);
    expect(over.status).toBe(429);
    expect(await t.prisma.workHelpRequest.count({ where: { studentUserId: late.user.id } })).toBe(0);
    expect(await t.prisma.aiExecution.count()).toBe(AGENT_PER_HOUR);
  });
});
