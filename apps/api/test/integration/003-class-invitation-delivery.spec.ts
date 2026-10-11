import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ClassInvitationDeliveryWorker } from "../../src/modules/class-invitations/delivery.worker";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createClass, createUser, loginAs } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const EMAIL = "aluno@example.test";

/**
 * Class invitation delivery with retries (003/US2-6, 003/SC-007, contracts/mail-delivery.md).
 * The worker's interval is off in tests (`mailRetryIntervalSeconds = 0`); `runOnce(now)` is
 * called with the clock moved forward.
 */
describe("003/US2-6 003/SC-007 entrega do convite com novas tentativas", () => {
  const logs = new LogCapture();
  let t: TestApp;
  let worker: ClassInvitationDeliveryWorker;

  beforeAll(async () => {
    t = await createTestApp({ logs });
    worker = t.get(ClassInvitationDeliveryWorker);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    t.mailer.setFailing(false);
    logs.clear();
  });

  /** Invites EMAIL to a new class; returns the invitation id after the first attempt ran. */
  async function invite(): Promise<string> {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const schoolClass = await createClass(t, teacher.id, { name: "Redes" });
    const res = await api(t, { cookie: await loginAs(t, teacher) }).post(`/api/classes/${schoolClass.id}/invitations`, {
      email: EMAIL,
    });
    expect(res.status).toBe(201);
    await t.flushMail();
    return res.body.id as string;
  }
  const deliveriesOf = (invitationId: string) =>
    t.prisma.mailDelivery.findMany({ where: { classInvitationId: invitationId }, orderBy: { createdAt: "asc" } });
  const invitationRow = (id: string) => t.prisma.classInvitation.findUniqueOrThrow({ where: { id } });
  const later = (ms: number) => new Date(Date.now() + ms);
  const logLines = (msg: string) => logs.lines().filter((line) => line.msg === msg);

  it("mailer fora: convite 201, entrega PENDING com attempts = 1; de volta, runOnce() entrega com link novo", async () => {
    t.mailer.setFailing(true);
    const id = await invite();

    const [pending] = await deliveriesOf(id);
    expect(pending).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "ECONNREFUSED", sentAt: null });
    expect(pending!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now() + 50_000);
    expect(t.mailer.outbox).toHaveLength(0);
    expect(logLines("class_invitation.delivery_failed")).toMatchObject([
      { invitationId: id, deliveryId: pending!.id, attempt: 1, errorName: "ECONNREFUSED" },
    ]);

    const before = await invitationRow(id);
    const failedToken = t.mailer.failed.at(-1)!.text.match(/token=([\w-]+)/)![1]!;
    expect(before.tokenHash).toBe(hashToken(failedToken));

    // Not due yet: nothing happens.
    await worker.runOnce(new Date());
    expect((await deliveriesOf(id))[0]).toMatchObject({ status: "PENDING", attempts: 1 });

    t.mailer.setFailing(false);
    await worker.runOnce(later(2 * MINUTE));

    expect(await deliveriesOf(id)).toMatchObject([{ status: "SENT", attempts: 2, nextAttemptAt: null }]);
    const newToken = t.mailer.lastTokenFor(EMAIL, "class-invitation")!;
    const after = await invitationRow(id);
    expect(after.tokenHash).toBe(hashToken(newToken));
    expect(after.tokenHash).not.toBe(hashToken(failedToken));
    // 003/FR-015: automatic retries do not renew the validity nor count as a send.
    expect(after.expiresAt).toEqual(before.expiresAt);
    expect(after.sendCount).toBe(before.sendCount);
    expect(after.lastSentAt).toEqual(before.lastSentAt);
  });

  it("convite cancelado antes da nova tentativa: entrega SUPERSEDED e nada é enviado", async () => {
    t.mailer.setFailing(true);
    const id = await invite();
    const invitation = await invitationRow(id);
    await t.prisma.classInvitation.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: invitation.invitedById, cancelReason: "TEACHER" },
    });
    const hash = invitation.tokenHash;

    t.mailer.setFailing(false);
    await worker.runOnce(later(2 * MINUTE));
    expect(await deliveriesOf(id)).toMatchObject([{ status: "SUPERSEDED", nextAttemptAt: null }]);
    expect(t.mailer.outbox).toHaveLength(0);
    expect((await invitationRow(id)).tokenHash).toBe(hash);
  });

  it("convite vencido antes da nova tentativa: SUPERSEDED, sem envio", async () => {
    t.mailer.setFailing(true);
    const id = await invite();
    t.mailer.setFailing(false);
    await worker.runOnce(later(8 * 24 * HOUR));
    expect(await deliveriesOf(id)).toMatchObject([{ status: "SUPERSEDED" }]);
    expect(t.mailer.outbox).toHaveLength(0);
  });

  it("duas execuções simultâneas de runOnce() enviam uma vez só", async () => {
    t.mailer.setFailing(true);
    const id = await invite();
    t.mailer.setFailing(false);

    const now = later(2 * MINUTE);
    await Promise.all([worker.runOnce(now), worker.runOnce(now)]);
    expect(t.mailer.messagesFor(EMAIL)).toHaveLength(1);
    expect(await deliveriesOf(id)).toMatchObject([{ status: "SENT", attempts: 2 }]);
  });

  it("1ª tentativa perdida (reinício da API): o worker assume depois de 1 min e conta como falha", async () => {
    const id = await invite();
    t.mailer.clear();
    // What schedule() leaves when the API dies before the after-commit attempt: the invitation's
    // latest delivery PENDING with no attempt (017: a SENT delivery can no longer go back to PENDING).
    const lost = await t.prisma.mailDelivery.create({
      data: { kind: "CLASS_INVITATION", classInvitationId: id, status: "PENDING", attempts: 0, nextAttemptAt: new Date(Date.now() + MINUTE) },
    });

    await worker.runOnce(new Date());
    expect(t.mailer.outbox).toHaveLength(0);
    await worker.runOnce(later(2 * MINUTE));
    expect((await deliveriesOf(id)).find((row) => row.id === lost.id)).toMatchObject({ status: "SENT", attempts: 1 });
    expect(t.mailer.messagesFor(EMAIL)).toHaveLength(1);
  });

  it("003/FR-062 7 falhas → FAILED, sem nova tentativa, com log delivery_exhausted", async () => {
    t.mailer.setFailing(true);
    const id = await invite();

    let clock = Date.now();
    for (let attempt = 2; attempt <= 7; attempt += 1) {
      clock += 7 * HOUR;
      await worker.runOnce(new Date(clock));
      expect((await deliveriesOf(id))[0]!.attempts).toBe(attempt);
    }
    expect(await deliveriesOf(id)).toMatchObject([{ status: "FAILED", attempts: 7, nextAttemptAt: null }]);
    expect(logLines("class_invitation.delivery_failed")).toHaveLength(6);
    expect(logLines("class_invitation.delivery_exhausted")).toMatchObject([{ invitationId: id, attempt: 7 }]);

    t.mailer.setFailing(false);
    await worker.runOnce(new Date(clock + 24 * HOUR));
    expect(t.mailer.outbox).toHaveLength(0);
    expect((await invitationRow(id)).status).toBe("PENDING");
  });

  it("003/FR-016 nenhuma linha de entrega, log ou auditoria contém token, hash ou link", async () => {
    t.mailer.failNext(1);
    const id = await invite();
    await worker.runOnce(later(2 * MINUTE));

    const tokens = [...t.mailer.failed, ...t.mailer.outbox].map((mail) => mail.text.match(/token=([\w-]+)/)![1]!);
    expect(tokens).toHaveLength(2);
    const secrets = [...tokens, ...tokens.map(hashToken), "convite-turma"];

    const deliveries = JSON.stringify(await deliveriesOf(id));
    const audit = JSON.stringify(await t.prisma.auditEvent.findMany(), (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    );
    const logText = logs.text();
    for (const secret of secrets) {
      expect(deliveries).not.toContain(secret);
      expect(audit).not.toContain(secret);
      expect(logText).not.toContain(secret);
    }
  });
});
