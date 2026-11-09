import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { nudgeScene, sendNudge } from "../helpers/exam-nudges";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/**
 * 025/SC-004 (research N5): the send takes the attempt `FOR UPDATE`, the same lock as the 018 events batch, so
 * simultaneous sends make one warning and a send never lands after the hold the 4th occurrence opens.
 */
describe("025/SC-004 concorrência do envio do aviso", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, mobileWritesPerMinute: 1000 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
  });

  it("025/SC-004 10 envios simultâneos: um aviso, um evento, os demais 200 com o mesmo id", async () => {
    const scene = await nudgeScene(t, clock);
    const results = await Promise.all(Array.from({ length: 10 }, () => sendNudge(t, scene)));
    expect(results.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 201]);
    expect(new Set(results.map((res) => res.body.nudge.id)).size).toBe(1);
    expect(await t.prisma.examNudge.count({ where: { attemptId: scene.attemptId } })).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "exam_nudge.sent" } })).toBe(1);
  });

  it("025/SC-004 envio simultâneo ao lote da 4ª ocorrência: o aviso entra antes da retenção ou é recusado, nunca depois", async () => {
    const outcomes = new Set<string>();
    for (let round = 0; round < 6; round += 1) {
      const scene = await nudgeScene(t, clock, { occurrences: 3 });
      const [send, batch] = await Promise.all([sendNudge(t, scene), recordEvents(scene.studentClient, scene.activityId, [integrityEvent("SCREEN_LEFT")])]);
      expect(batch.status, JSON.stringify(batch.body)).toBe(200);
      expect(batch.body.exam).toEqual({ occurrenceCount: 4, held: true });
      const nudges = await t.prisma.examNudge.findMany({ where: { attemptId: scene.attemptId } });
      expect(await t.prisma.examAttemptHold.count({ where: { attemptId: scene.attemptId, resolution: null } })).toBe(1);
      if (send.status === 201) {
        // Inserted first, under the attempt's lock: the hold came after it and the warning stays pending (not shown).
        expect(nudges).toEqual([expect.objectContaining({ id: send.body.nudge.id, dismissedAt: null })]);
      } else {
        expect([send.status, send.body.code]).toEqual([409, "EXAM_NUDGE_NOT_ALLOWED"]);
        expect(nudges).toEqual([]);
      }
      outcomes.add(String(send.status));
      clock.advance(10_000);
    }
    expect([...outcomes].every((status) => status === "201" || status === "409")).toBe(true);
  });
});
