import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { DeliveryStatus, MailKind, Prisma, UndeliveredReason } from "../../src/generated/prisma/client";
import { createClass, createClassInvitation, createUser, uniqueEmail } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 017 data-model.md, research N2, N7: the database refuses, by itself, what the outbox and the
 * provider notices forbid — rows written by Prisma, without the API in the way (constitution V).
 */
describe("017/FR-001 017/FR-012 regras do envio de e-mail e dos avisos garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  /** One subject of each kind. */
  let subjects: Record<MailKind, Omit<Prisma.MailDeliveryUncheckedCreateInput, "status">>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const schoolClass = await createClass(t, teacher.id);
    const { invitation: classInvitation } = await createClassInvitation(t, schoolClass.id, uniqueEmail("aluno-017"));
    const role = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    const invitation = await t.prisma.invitation.create({
      data: {
        email: uniqueEmail("prof-017"),
        displayName: "Professora",
        roleId: role.id,
        invitedById: admin.id,
        tokenHash: randomUUID(),
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSentAt: new Date(),
      },
    });
    const bootstrap = await t.prisma.adminBootstrap.create({
      data: { email: uniqueEmail("admin-017"), status: "PENDING", operatorHost: "host", operatorUser: "op" },
    });
    subjects = {
      CLASS_INVITATION: { kind: "CLASS_INVITATION", classInvitationId: classInvitation.id },
      INVITATION_TEACHER: { kind: "INVITATION_TEACHER", invitationId: invitation.id },
      INVITATION_MANAGER: { kind: "INVITATION_MANAGER", invitationId: invitation.id },
      VERIFY_EMAIL: { kind: "VERIFY_EMAIL", userId: teacher.id },
      PASSWORD_RESET: { kind: "PASSWORD_RESET", userId: teacher.id },
      ADMIN_ACTIVATION: { kind: "ADMIN_ACTIVATION", adminBootstrapId: bootstrap.id },
    };
  });

  const pending = { status: "PENDING", attempts: 0, nextAttemptAt: new Date() } as const;
  const create = (fields: Partial<Prisma.MailDeliveryUncheckedCreateInput> = {}) =>
    t.prisma.mailDelivery.create({ data: { ...subjects.CLASS_INVITATION, ...pending, ...fields } });
  const update = (id: string, data: Prisma.MailDeliveryUncheckedUpdateInput) => t.prisma.mailDelivery.update({ where: { id }, data });

  /** The columns each status needs to satisfy the CHECKs, so only the trigger decides. */
  const columnsOf = (status: DeliveryStatus, reason: UndeliveredReason = "BOUNCED"): Prisma.MailDeliveryUncheckedUpdateInput => {
    const now = new Date();
    switch (status) {
      case "PENDING":
        return { status, nextAttemptAt: now };
      case "SENT":
        return { status, nextAttemptAt: null, sentAt: now };
      case "DELIVERED":
        return { status, nextAttemptAt: null, sentAt: now, deliveredAt: now };
      case "UNDELIVERED":
        return { status, nextAttemptAt: null, undeliveredAt: now, undeliveredReason: reason };
      case "DISCARDED":
        return { status, nextAttemptAt: null, discardReason: "EXPIRED" };
      default:
        return { status, nextAttemptAt: null };
    }
  };
  /** A delivery already at `status` (inserted directly: the trigger only watches updates). */
  const at = (status: DeliveryStatus, reason?: UndeliveredReason) =>
    create(columnsOf(status, reason) as Partial<Prisma.MailDeliveryUncheckedCreateInput>);

  describe("mail_deliveries: assunto, colunas e CHECKs", () => {
    it("017/FR-001 cada tipo aceita exatamente o seu assunto", async () => {
      for (const subject of Object.values(subjects)) {
        await expect(t.prisma.mailDelivery.create({ data: { ...subject, ...pending } }), subject.kind).resolves.toBeDefined();
      }
    });

    it("017/FR-001 nenhum assunto, dois assuntos ou o assunto de outro tipo são recusados", async () => {
      const { classInvitationId } = subjects.CLASS_INVITATION;
      const { userId } = subjects.VERIFY_EMAIL;
      const { invitationId } = subjects.INVITATION_TEACHER;
      await expect(t.prisma.mailDelivery.create({ data: { kind: "CLASS_INVITATION", ...pending } })).rejects.toThrow();
      await expect(create({ userId })).rejects.toThrow();
      await expect(t.prisma.mailDelivery.create({ data: { kind: "CLASS_INVITATION", userId, ...pending } })).rejects.toThrow();
      await expect(t.prisma.mailDelivery.create({ data: { kind: "VERIFY_EMAIL", invitationId, ...pending } })).rejects.toThrow();
      await expect(t.prisma.mailDelivery.create({ data: { kind: "ADMIN_ACTIVATION", classInvitationId, ...pending } })).rejects.toThrow();
    });

    it("017/FR-001 o tipo e o assunto de um envio nunca mudam", async () => {
      const delivery = await t.prisma.mailDelivery.create({ data: { ...subjects.VERIFY_EMAIL, ...pending } });
      await expect(update(delivery.id, { kind: "PASSWORD_RESET" })).rejects.toThrow();
      const other = await createUser(t);
      await expect(update(delivery.id, { userId: other.id })).rejects.toThrow();
    });

    it("017/FR-003 attempts vai de 0 a 7", async () => {
      await expect(create({ attempts: 7 })).resolves.toBeDefined();
      await expect(create({ attempts: -1 })).rejects.toThrow();
      await expect(create({ attempts: 8 })).rejects.toThrow();
    });

    it("017/FR-003 next_attempt_at existe exatamente quando o envio está PENDING", async () => {
      await expect(create({ nextAttemptAt: null })).rejects.toThrow();
      await expect(create({ ...columnsOf("SENT"), nextAttemptAt: new Date() } as Prisma.MailDeliveryUncheckedCreateInput)).rejects.toThrow();
    });

    it("017/FR-009 last_error_code é um código, nunca uma mensagem", async () => {
      await expect(create({ lastErrorCode: "ECONNREFUSED" })).resolves.toBeDefined();
      await expect(create({ lastErrorCode: "SMTP_5XX" })).resolves.toBeDefined();
      for (const code of ["connection refused", "550 5.1.1 aluno@example.test", "1ABC", "", `E${"X".repeat(64)}`]) {
        await expect(create({ lastErrorCode: code }), code).rejects.toThrow();
      }
    });

    it("017/FR-013 undelivered_at e undelivered_reason vêm juntos e só em UNDELIVERED", async () => {
      const now = new Date();
      await expect(at("UNDELIVERED", "REJECTED")).resolves.toBeDefined();
      await expect(create({ ...columnsOf("UNDELIVERED"), undeliveredReason: null } as Prisma.MailDeliveryUncheckedCreateInput)).rejects.toThrow();
      await expect(create({ ...columnsOf("UNDELIVERED"), undeliveredAt: null } as Prisma.MailDeliveryUncheckedCreateInput)).rejects.toThrow();
      await expect(create({ undeliveredAt: now, undeliveredReason: "BOUNCED" })).rejects.toThrow();
      await expect(create({ ...columnsOf("SENT"), undeliveredReason: "BOUNCED" } as Prisma.MailDeliveryUncheckedCreateInput)).rejects.toThrow();
    });

    it("017/FR-006 discard_reason existe exatamente quando o envio é DISCARDED", async () => {
      await expect(at("DISCARDED")).resolves.toBeDefined();
      await expect(create({ ...columnsOf("DISCARDED"), discardReason: null } as Prisma.MailDeliveryUncheckedCreateInput)).rejects.toThrow();
      await expect(create({ discardReason: "EXPIRED" })).rejects.toThrow();
    });

    it("017/FR-010 message_id é único", async () => {
      await create({ messageId: "<a.1@devtrack.test>" });
      await expect(create({ messageId: "<a.1@devtrack.test>" })).rejects.toThrow();
    });
  });

  describe("mail_deliveries_transition: as transições de data-model.md", () => {
    const ALLOWED: Array<[DeliveryStatus, DeliveryStatus, UndeliveredReason?]> = [
      ["PENDING", "PENDING"],
      ["PENDING", "SENT"],
      ["PENDING", "DELIVERED"],
      ["PENDING", "UNDELIVERED", "BOUNCED"],
      ["PENDING", "UNDELIVERED", "COMPLAINED"],
      ["PENDING", "UNDELIVERED", "REJECTED"],
      ["PENDING", "FAILED"],
      ["PENDING", "DISCARDED"],
      ["PENDING", "SUPERSEDED"],
      ["SENT", "DELIVERED"],
      ["SENT", "UNDELIVERED", "BOUNCED"],
      ["SENT", "UNDELIVERED", "COMPLAINED"],
      ["DELIVERED", "UNDELIVERED", "COMPLAINED"],
      ["DELIVERED", "UNDELIVERED", "BOUNCED"],
    ];
    const REFUSED: Array<[DeliveryStatus, DeliveryStatus, UndeliveredReason?]> = [
      ["SENT", "PENDING"],
      ["SENT", "FAILED"],
      ["SENT", "DISCARDED"],
      ["SENT", "SUPERSEDED"],
      ["SENT", "UNDELIVERED", "REJECTED"],
      ["DELIVERED", "PENDING"],
      ["DELIVERED", "SENT"],
      ["DELIVERED", "FAILED"],
      ["DELIVERED", "UNDELIVERED", "REJECTED"],
      ...(["UNDELIVERED", "FAILED", "DISCARDED", "SUPERSEDED"] as const).flatMap((from) =>
        (["PENDING", "SENT", "DELIVERED", "FAILED", "DISCARDED", "SUPERSEDED"] as const)
          .filter((to) => to !== from)
          .map((to): [DeliveryStatus, DeliveryStatus] => [from, to]),
      ),
      ...(["FAILED", "DISCARDED", "SUPERSEDED"] as const).map((from): [DeliveryStatus, DeliveryStatus, UndeliveredReason] => [from, "UNDELIVERED", "BOUNCED"]),
    ];

    it.each(ALLOWED)("017/FR-013 %s → %s (%s) é aceita", async (from, to, reason) => {
      const delivery = await at(from);
      await expect(update(delivery.id, columnsOf(to, reason))).resolves.toMatchObject({ status: to });
    });

    it.each(REFUSED)("017/FR-013 %s → %s (%s) é recusada com INVALID_STATE_TRANSITION", async (from, to, reason) => {
      const delivery = await at(from);
      await expect(update(delivery.id, columnsOf(to, reason))).rejects.toThrow(/INVALID_STATE_TRANSITION/);
    });

    it("017/FR-013 um envio final não muda: UNDELIVERED com outro motivo, nova tentativa ou outro Message-ID são recusados", async () => {
      const undelivered = await at("UNDELIVERED", "BOUNCED");
      await expect(update(undelivered.id, { undeliveredReason: "COMPLAINED" })).rejects.toThrow(/INVALID_STATE_TRANSITION/);
      await expect(update(undelivered.id, { messageId: "<x.2@devtrack.test>" })).rejects.toThrow(/INVALID_STATE_TRANSITION/);
      const failed = await at("FAILED");
      await expect(update(failed.id, { attempts: 7, lastErrorCode: "EAUTH" })).rejects.toThrow(/INVALID_STATE_TRANSITION/);
    });
  });

  describe("mail_notices: idempotente e só de acréscimo", () => {
    const notice = (deliveryId: string | null, fields: Partial<Prisma.MailNoticeUncheckedCreateInput> = {}) =>
      t.prisma.mailNotice.create({
        data: {
          provider: "RESEND",
          noticeId: `msg_${randomUUID()}`,
          kind: "DELIVERED",
          deliveryId,
          attempt: 1,
          occurredAt: new Date(),
          receivedAt: new Date(),
          ...fields,
        },
      });

    it("017/FR-012 o mesmo aviso do mesmo provedor só entra uma vez; outro provedor com o mesmo id entra", async () => {
      const delivery = await at("SENT");
      await notice(delivery.id, { noticeId: "msg_1" });
      await expect(notice(delivery.id, { noticeId: "msg_1" })).rejects.toThrow();
      await expect(notice(delivery.id, { noticeId: "msg_1", provider: "SES" })).resolves.toBeDefined();
    });

    it("017/FR-012 notice_id tem até 200 caracteres", async () => {
      const delivery = await at("SENT");
      await expect(notice(delivery.id, { noticeId: "n".repeat(200) })).resolves.toBeDefined();
      await expect(notice(delivery.id, { noticeId: "n".repeat(201) })).rejects.toThrow();
    });

    it("017/FR-012 UPDATE é recusado e DELETE só com devtrack.mail_purge", async () => {
      const delivery = await at("SENT");
      const row = await notice(delivery.id);
      await expect(t.prisma.mailNotice.update({ where: { id: row.id }, data: { kind: "BOUNCED" } })).rejects.toThrow();
      await expect(t.prisma.mailNotice.delete({ where: { id: row.id } })).rejects.toThrow();
      await t.prisma.$transaction([
        t.prisma.$executeRawUnsafe("SET LOCAL devtrack.mail_purge = 'on'"),
        t.prisma.mailNotice.delete({ where: { id: row.id } }),
      ]);
      expect(await t.prisma.mailNotice.count()).toBe(0);
    });

    it("017/FR-012 apagar o envio pela retenção deixa o aviso sem envio (ON DELETE SET NULL)", async () => {
      const delivery = await at("DELIVERED");
      const row = await notice(delivery.id);
      await expect(t.prisma.mailDelivery.delete({ where: { id: delivery.id } })).rejects.toThrow();
      await t.prisma.$transaction([
        t.prisma.$executeRawUnsafe("SET LOCAL devtrack.mail_purge = 'on'"),
        t.prisma.mailDelivery.delete({ where: { id: delivery.id } }),
      ]);
      expect(await t.prisma.mailNotice.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ deliveryId: null, kind: "DELIVERED" });
    });
  });
});
