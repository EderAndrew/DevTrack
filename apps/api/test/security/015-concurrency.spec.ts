import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { drain, resetAiDb, type AiTestApp } from "../helpers/ai";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, getHelp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

const START = "2026-10-01T12:00:00.000Z";
const PARALLEL = 10;

/**
 * 015 concurrency (plan "Performance Goals", research F11): 10 simultaneous help requests leave at
 * most one pending, and rounds of them never deliver more than 3 (015/SC-001); the same events sent
 * 10 times at once are stored and audited once; the teacher's change of mode racing the first start
 * either wins (the attempt starts in the new mode) or is refused with 409 ACTIVITY_ALREADY_STARTED.
 */
describe("015 concorrência de ajudas, eventos e troca de modo", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let client: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (options: { executionMode?: "NORMAL" | "CONTROLLED"; aiHelpAllowance?: 0 | 3 } = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: options.executionMode ?? "CONTROLLED",
      aiHelpAllowance: options.aiHelpAllowance ?? 3,
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({
      clock,
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 1000, workHelpPerHour: 1000, attemptEventsPerMinute: 1000 } },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = await createClass(t, teacher.id);
    student = await createUser(t, { roles: ["STUDENT"] });
    await createEnrollment(t, schoolClass.id, student.id);
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("015/SC-001 10 pedidos simultâneos: um aceito, os outros 409 HELP_PENDING; em rodadas, nunca mais de 3 entregues", async () => {
    const activity = await work();
    const id = activity.activity.id;
    expect((await startAttempt(client, id)).status).toBe(200);
    for (let round = 0; round < 5; round += 1) {
      const responses = await Promise.all(
        Array.from({ length: PARALLEL }, (_, index) => requestHelp(client, id, { questionId: activity.questionIds[0]!, question: `Rodada ${round}, pedido ${index}` })),
      );
      const accepted = responses.filter((res) => res.status === 202);
      const refused = responses.filter((res) => res.status === 409).map((res) => res.body.code);
      if (round < 3) {
        expect(accepted).toHaveLength(1);
        expect(refused).toEqual(Array(PARALLEL - 1).fill("HELP_PENDING"));
        scriptHelp(t.provider, accepted[0]!.body.id, validGuidance());
        await drain(t);
      } else {
        expect(accepted).toHaveLength(0);
        expect(refused).toEqual(Array(PARALLEL).fill("HELP_EXHAUSTED"));
      }
    }
    expect((await getHelp(client, id)).body).toMatchObject({ allowance: 3, used: 3, pending: false });
    expect(await t.prisma.workHelpRequest.count({ where: { status: "DELIVERED" } })).toBe(3);
    expect(await t.prisma.workHelpRequest.count()).toBe(3);
    expect(await t.prisma.aiExecution.count()).toBe(3);
    expect(await t.prisma.auditEvent.count({ where: { type: "work_help.requested" } })).toBe(3);
  });

  it("015/SC-001 10 pedidos simultâneos com a mesma chave: um pedido, uma execução; os outros devolvem o mesmo", async () => {
    const activity = await work();
    const id = activity.activity.id;
    await startAttempt(client, id);
    const body = { questionId: activity.questionIds[0]!, question: "Como começo?", idempotencyKey: randomUUID() };
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => requestHelp(client, id, body)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 202]);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.workHelpRequest.count()).toBe(1);
    expect(await t.prisma.aiExecution.count()).toBe(1);
  });

  it("os mesmos eventos enviados 10 vezes ao mesmo tempo: gravados e auditados uma vez, com o mesmo horário", async () => {
    const activity = await work();
    const id = activity.activity.id;
    await startAttempt(client, id);
    const events = [integrityEvent("SCREEN_LEFT"), integrityEvent("SCREEN_RETURNED")];
    const responses = await Promise.all(Array.from({ length: PARALLEL }, () => recordEvents(client, id, events)));
    expect(responses.map((res) => res.status)).toEqual(Array(PARALLEL).fill(200));
    const times = new Set(responses.map((res) => JSON.stringify(res.body.recorded)));
    expect(times.size).toBe(1);
    expect(await t.prisma.attemptIntegrityEvent.count()).toBe(2);
    expect(await t.prisma.auditEvent.count({ where: { type: "attempt_integrity.recorded" } })).toBe(2);
  });

  it("troca de modo × primeiro início: ou a troca vence e a tentativa nasce no modo novo, ou é recusada com 409", async () => {
    for (let round = 0; round < 5; round += 1) {
      const activity = await work({ executionMode: "NORMAL", aiHelpAllowance: 0 });
      const id = activity.activity.id;
      const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
      const [patched, started] = await Promise.all([
        teacherClient.patch(`/api/classes/${schoolClass.id}/activities/${id}`, { version: 1, executionMode: "CONTROLLED", aiHelpAllowance: 3 }),
        startAttempt(client, id),
      ]);
      expect(started.status).toBe(200);
      const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id }, select: { executionMode: true, aiHelpAllowance: true } });
      if (patched.status === 200) {
        expect(stored).toEqual({ executionMode: "CONTROLLED", aiHelpAllowance: 3 });
        expect(started.body.executionMode).toBe("CONTROLLED");
      } else {
        expect([patched.status, patched.body.code]).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
        expect(stored).toEqual({ executionMode: "NORMAL", aiHelpAllowance: 0 });
        expect(started.body.executionMode).toBe("NORMAL");
      }
      // Whatever won, the mode the student answers in is the one stored from then on.
      const view = await client.get(`/api/me/activities/${id}`);
      expect(view.body.executionMode).toBe(stored.executionMode);
    }
  });
});
