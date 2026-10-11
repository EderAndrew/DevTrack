import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { MailOutbox } from "../../src/platform/mail/outbox/mail-outbox";
import { inFlightDeadline } from "../../src/platform/mail/outbox/delivery-schedule";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 017/FR-005: each delivery leaves at most once per attempt, with two workers at once, the first
 * attempt racing the worker, a late result of an older attempt, and a restart mid-send.
 */
describe("017/FR-005 cada tentativa sai no máximo uma vez", () => {
  const clock = new FixedClock(new Date());
  let t: TestApp;
  let worker: MailDeliveryWorker;
  let outbox: MailOutbox;

  beforeAll(async () => {
    t = await createTestApp({ clock });
    worker = t.get(MailDeliveryWorker);
    outbox = t.get(MailOutbox);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    t.mailer.clear();
    t.mailer.setFailing(false);
  });

  /** A user and a scheduled PASSWORD_RESET delivery of theirs, no attempt made. */
  async function scheduled(): Promise<{ user: TestUser; deliveryId: string }> {
    const user = await createUser(t, { email: uniqueEmail("concorrencia") });
    const deliveryId = await t.prisma.runInTransaction((tx) => outbox.schedule(tx, "PASSWORD_RESET", user.id, clock.now()));
    return { user, deliveryId };
  }
  const mail = (email: string) => ({ to: email, template: "password-reset" as const, params: { name: "Pessoa", link: "http://localhost:3000/redefinir-senha?token=x" } });

  it("017/FR-005 dois (ou quatro) runOnce simultâneos nunca enviam a mesma tentativa", async () => {
    const users = [];
    for (let i = 0; i < 20; i += 1) users.push((await scheduled()).user);
    clock.advance(2 * MINUTE);
    const cycles = await Promise.all([1, 2, 3, 4].map(() => worker.runOnce(clock.now())));
    expect(cycles.reduce((sum, n) => sum + n, 0)).toBe(20);
    for (const user of users) expect(t.mailer.messagesFor(user.email)).toHaveLength(1);
    expect(new Set(t.mailer.outbox.map((sent) => sent.messageId)).size).toBe(20);
  });

  it("017/FR-005 a primeira tentativa concorrendo com o worker sai uma vez", async () => {
    for (let round = 0; round < 10; round += 1) {
      const { user, deliveryId } = await scheduled();
      outbox.attemptNow(deliveryId, mail(user.email));
      await Promise.all([worker.runOnce(new Date(clock.now().getTime() + 2 * MINUTE)), t.flushMail()]);
      await t.flushMail();
      expect(t.mailer.messagesFor(user.email), `rodada ${round}`).toHaveLength(1);
      expect(await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).toMatchObject({ status: "SENT" });
    }
  });

  it("017/FR-005 um resultado atrasado de uma tentativa antiga não sobrescreve a atual", async () => {
    const { user, deliveryId } = await scheduled();
    t.mailer.setFailing(true);
    clock.advance(2 * MINUTE);
    await worker.runOnce(clock.now());
    clock.advance(2 * MINUTE);
    await worker.runOnce(clock.now());
    const current = await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
    expect(current).toMatchObject({ status: "PENDING", attempts: 2 });

    // Attempt 1 answers only now: sent, or refused for good — neither touches attempt 2's row.
    t.mailer.setFailing(false);
    const late = { deliveryId, kind: "PASSWORD_RESET" as const, attempt: 1, messageId: outbox.messageIdOf(deliveryId, 1), mail: mail(user.email) };
    expect((await outbox.deliver(late)).outcome).toBe("STALE");
    t.mailer.failNext(1, "permanent");
    expect((await outbox.deliver(late)).outcome).toBe("STALE");
    expect(await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).toMatchObject({
      status: "PENDING",
      attempts: 2,
      messageId: current.messageId,
      undeliveredReason: null,
    });
    expect(await t.prisma.auditEvent.count({ where: { type: "mail_delivery.undelivered" } })).toBe(0);
  });

  it("017/FR-005 uma tentativa em voo que passa do prazo (reinício) volta à fila sem duplicar", async () => {
    const { user, deliveryId } = await scheduled();
    // The API claimed attempt 1 and died before sending: the row is PENDING, due at the in-flight deadline.
    const claimedAt = clock.now();
    await t.prisma.mailDelivery.update({
      where: { id: deliveryId },
      data: { attempts: 1, nextAttemptAt: inFlightDeadline(1, claimedAt), messageId: outbox.messageIdOf(deliveryId, 1) },
    });
    expect(await worker.runOnce(new Date(claimedAt.getTime() + 30_000))).toBe(0);
    expect(await worker.runOnce(new Date(claimedAt.getTime() + MINUTE))).toBe(1);
    expect(await worker.runOnce(new Date(claimedAt.getTime() + 2 * MINUTE))).toBe(0);
    expect(t.mailer.messagesFor(user.email)).toHaveLength(1);
    expect(t.mailer.outbox[0]!.messageId).toBe(outbox.messageIdOf(deliveryId, 2));
    expect(await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: deliveryId } })).toMatchObject({ status: "SENT", attempts: 2 });
  });

  it("017/FR-005 dois pedidos seguidos do mesmo tipo e assunto: o primeiro fica SUPERSEDED e só o link do segundo chega", async () => {
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const client = api(t, { cookie: await loginAs(t, manager) });
    const email = uniqueEmail("prof-reenvio");
    t.mailer.setFailing(true);
    const created = await client.post("/api/teacher-invitations", { email, displayName: "Prof" });
    await t.flushMail();
    t.mailer.setFailing(false);
    expect((await client.post(`/api/teacher-invitations/${created.body.id}/resend`)).status).toBe(200);
    await t.flushMail();

    clock.advance(10 * MINUTE);
    await worker.runOnce(clock.now());
    const rows = await t.prisma.mailDelivery.findMany({ where: { invitationId: created.body.id }, orderBy: { createdAt: "asc" } });
    expect(rows.map((row) => row.status)).toEqual(["SUPERSEDED", "SENT"]);
    expect(t.mailer.messagesFor(email)).toHaveLength(1);
    expect(t.mailer.messagesFor(email)[0]!.messageId).toBe(outbox.messageIdOf(rows[1]!.id, 1));
    const oldToken = t.mailer.failed.at(-1)!.text.match(/token=([\w-]+)/)![1]!;
    expect((await api(t).post("/api/invitations/preview", { token: oldToken })).status).toBe(400);
  });
});
