import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMailNoticeCli } from "../../src/cli/mail-notice.command";
import type { MailKind } from "../../src/generated/prisma/client";
import { InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import type { MailMessage, MailSendResult } from "../../src/platform/mail/mailer";
import { CertificateFetcher } from "../../src/platform/mail/notices/certificate-fetcher";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createClass, createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import {
  createSnsSigner,
  postNotice,
  type ResendEventType,
  resendSecretOf,
  SNS_CERT_URL,
  signedResendNotice,
  signedSnsNotice,
  snsSubscriptionConfirmation,
  TEST_TOPIC_ARN,
  TestCertificateFetcher,
} from "../helpers/mail-notices";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/** An InMemoryMailer whose sends can be held open: the provider's notice then beats the SMTP result. */
class GatedMailer extends InMemoryMailer {
  private gate: Promise<void> | null = null;
  private open: (() => void) | null = null;
  /** Resolves once a held send has started. */
  started: Promise<void> = Promise.resolve();
  private markStarted: (() => void) | null = null;

  hold(): void {
    this.gate = new Promise((resolve) => (this.open = resolve));
    this.started = new Promise((resolve) => (this.markStarted = resolve));
  }

  release(): void {
    this.open?.();
    this.gate = null;
  }

  override async send(message: MailMessage): Promise<MailSendResult> {
    if (this.gate) {
      this.markStarted?.();
      await this.gate;
    }
    return super.send(message);
  }
}

/**
 * 017/US2 (contracts/http-api.md, mail-delivery.md step 5, research N5–N7): the provider's signed
 * notices reach `POST /mail/notices/:provider`, are stored once and move the delivery; the inviter
 * reads "Não entregue" in the invitation lists. The worker's timer is off and the clock is fixed.
 */
describe("017/US2 quem convidou vê que o convite não foi entregue", () => {
  const clock = new FixedClock(new Date());
  const logs = new LogCapture();
  const mailer = new GatedMailer();
  let t: TestApp;
  let secret: Buffer;
  let admin: TestUser;
  let manager: TestUser;
  let teacher: TestUser;

  beforeAll(async () => {
    t = await createTestApp({ clock, logs, mailer });
    secret = resendSecretOf(t.config);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    mailer.release();
    mailer.clear();
    mailer.setFailing(false);
    logs.clear();
    admin = await createUser(t, { roles: ["ADMIN"] });
    manager = await createUser(t, { roles: ["MANAGER"] });
    teacher = await createUser(t, { roles: ["TEACHER"] });
  });

  const resend = (type: ResendEventType, messageId: string | null, options: { at?: Date; id?: string; bounceType?: "Permanent" | "Transient" } = {}) =>
    postNotice(t, "resend", signedResendNotice({ type, messageId, secret, at: options.at ?? clock.now(), signedAt: clock.now(), id: options.id, bounceType: options.bounceType }));

  const deliveryOf = (kind: MailKind) => t.prisma.mailDelivery.findFirstOrThrow({ where: { kind }, orderBy: { createdAt: "desc" } });
  const auditOf = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { occurredAt: "asc" } });

  /** A student invited to a new class of the teacher, its first attempt sent. */
  async function inviteStudent(email = uniqueEmail("aluno")) {
    const schoolClass = await createClass(t, teacher.id);
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const res = await client.post(`/api/classes/${schoolClass.id}/invitations`, { email });
    expect(res.status).toBe(201);
    await t.flushMail();
    const delivery = await deliveryOf("CLASS_INVITATION");
    /** The teacher's list row of this invitation, filtered by its current status. */
    const view = async () => {
      const { status } = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: res.body.id }, select: { status: true } });
      const list = await client.get(`/api/classes/${schoolClass.id}/invitations?status=${status}`);
      expect(list.status).toBe(200);
      return (list.body.items as { id: string }[]).find((item) => item.id === res.body.id) as Record<string, unknown>;
    };
    return { schoolClass, client, invitationId: res.body.id as string, email, delivery, messageId: delivery.messageId!, view };
  }

  it("017/US2-1 017/SC-003 o endereço não existe: o professor vê \"Não entregue\" (BOUNCED) na primeira leitura", async () => {
    const invite = await inviteStudent();
    expect(await invite.view()).toMatchObject({ status: "PENDING", delivery: "SENT", deliveryIssue: null });
    const res = await resend("email.bounced", invite.messageId);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
    expect(await invite.view()).toMatchObject({ status: "PENDING", delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
    expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });
    expect((await auditOf("mail_delivery.undelivered")).map((event) => ({ actor: event.actorType, target: event.targetId, metadata: event.metadata }))).toEqual([
      { actor: "SYSTEM", target: invite.delivery.id, metadata: { kind: "CLASS_INVITATION", reason: "BOUNCED", source: "NOTICE" } },
    ]);
  });

  it("017/US2-2 017/FR-015 marcado como spam: o gestor vê o convite de professor \"Não entregue\" (COMPLAINED)", async () => {
    const res = await api(t, { cookie: await loginAs(t, manager) }).post("/api/teacher-invitations", { email: uniqueEmail("prof"), displayName: "Prof" });
    expect(res.status).toBe(201);
    await t.flushMail();
    const delivery = await deliveryOf("INVITATION_TEACHER");
    expect((await resend("email.complained", delivery.messageId)).status).toBe(200);
    for (const viewer of [manager, admin]) {
      const list = await api(t, { cookie: await loginAs(t, viewer) }).get("/api/teacher-invitations");
      expect(list.body.items.find((item: { id: string }) => item.id === res.body.id)).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "COMPLAINED" });
    }
  });

  it("017/FR-015 ADMIN vê o convite de gestor \"Não entregue\"; o professor não vê convites de outro professor", async () => {
    const res = await api(t, { cookie: await loginAs(t, admin) }).post("/api/manager-invitations", { email: uniqueEmail("gestor"), displayName: "Gestor" });
    await t.flushMail();
    expect((await resend("email.bounced", (await deliveryOf("INVITATION_MANAGER")).messageId)).status).toBe(200);
    const list = await api(t, { cookie: await loginAs(t, admin) }).get("/api/manager-invitations");
    expect(list.body.items.find((item: { id: string }) => item.id === res.body.id)).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });

    const invite = await inviteStudent();
    await resend("email.bounced", invite.messageId);
    const other = await createUser(t, { roles: ["TEACHER"] });
    expect((await api(t, { cookie: await loginAs(t, other) }).get(`/api/classes/${invite.schoolClass.id}/invitations`)).status).toBe(404);
    expect((await api(t, { cookie: await loginAs(t, manager) }).get("/api/manager-invitations")).status).toBe(403);
  });

  it("017/US2-3 cancelar o convite \"Não entregue\" e convidar outro endereço segue o fluxo normal", async () => {
    const invite = await inviteStudent();
    await resend("email.bounced", invite.messageId);
    expect((await invite.client.post(`/api/classes/${invite.schoolClass.id}/invitations/${invite.invitationId}/cancel`)).status).toBe(200);
    const corrected = await invite.client.post(`/api/classes/${invite.schoolClass.id}/invitations`, { email: uniqueEmail("aluno-certo") });
    expect(corrected.status).toBe(201);
    expect(corrected.body).toMatchObject({ status: "PENDING", deliveryIssue: null });
    await t.flushMail();
    const pending = await invite.client.get(`/api/classes/${invite.schoolClass.id}/invitations?status=PENDING`);
    expect(pending.body.items).toEqual([expect.objectContaining({ id: corrected.body.id, status: "PENDING", delivery: "SENT", deliveryIssue: null })]);
    expect(await invite.view()).toMatchObject({ status: "CANCELLED" });
  });

  it("017/US2-4 a visão traz o campo que pede a confirmação do reenvio; reenviar ao mesmo endereço volta a \"Enviado\"", async () => {
    const invite = await inviteStudent();
    await resend("email.bounced", invite.messageId);
    expect(await invite.view()).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
    const resent = await invite.client.post(`/api/classes/${invite.schoolClass.id}/invitations/${invite.invitationId}/resend`);
    expect(resent.status).toBe(200);
    await t.flushMail();
    expect(await invite.view()).toMatchObject({ delivery: "SENT", deliveryIssue: null });
  });

  it("017/US2-6 017/FR-012 o mesmo aviso duas vezes: um registro e um efeito", async () => {
    const invite = await inviteStudent();
    for (let i = 0; i < 2; i++) expect((await resend("email.bounced", invite.messageId, { id: "msg_repetido" })).status).toBe(200);
    expect(await t.prisma.mailNotice.count()).toBe(1);
    expect(await auditOf("mail_delivery.undelivered")).toHaveLength(1);
    expect(await invite.view()).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
  });

  it("017/US2-7 aviso de um e-mail desconhecido: aceito, sem efeito, não guardado, só no log", async () => {
    await inviteStudent();
    for (const messageId of ["<a1b2c3d4-0000-4000-8000-000000000000.1@devtrack.test>", "<abc@gmail.com>", null]) {
      expect((await resend("email.bounced", messageId)).status).toBe(200);
    }
    expect(await t.prisma.mailNotice.count()).toBe(0);
    expect((await deliveryOf("CLASS_INVITATION")).status).toBe("SENT");
    const unmatched = logs.lines().filter((line) => line.msg === "mail.notice_unmatched");
    expect(unmatched).toHaveLength(3);
    expect(unmatched[0]).toMatchObject({ provider: "RESEND", kind: "BOUNCED" });
  });

  it("017/US2-8 017/FR-018 e-mail de conta que voltou: só no registro; as respostas públicas não mudam", async () => {
    const user = await createUser(t, { email: uniqueEmail("conta") });
    const before = await api(t).post("/api/auth/password-reset/request", { email: user.email });
    await t.flushMail();
    const delivery = await deliveryOf("PASSWORD_RESET");
    expect((await resend("email.bounced", delivery.messageId)).status).toBe(200);
    expect(await deliveryOf("PASSWORD_RESET")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });

    const after = await api(t).post("/api/auth/password-reset/request", { email: user.email });
    const unknown = await api(t).post("/api/auth/password-reset/request", { email: uniqueEmail("ninguem") });
    expect([after.status, after.body]).toEqual([before.status, before.body]);
    expect([unknown.status, unknown.body]).toEqual([before.status, before.body]);
    const me = await api(t, { cookie: await loginAs(t, user) }).get("/api/me");
    expect(JSON.stringify(me.body)).not.toMatch(/deliver|UNDELIVERED|BOUNCED/i);
  });

  it("017/FR-018 a confirmação de e-mail que voltou também não muda a resposta pública", async () => {
    const user = await createUser(t, { verified: false, email: uniqueEmail("nao-verificada") });
    const before = await api(t).post("/api/auth/verify-email/resend", { email: user.email });
    await t.flushMail();
    await resend("email.complained", (await deliveryOf("VERIFY_EMAIL")).messageId);
    const after = await api(t).post("/api/auth/verify-email/resend", { email: user.email });
    expect([after.status, after.body]).toEqual([before.status, before.body]);
  });

  it("017/US2-9 017/FR-017 spam depois do aceite: o convite continua aceito; o aviso fica no registro do envio", async () => {
    const invite = await inviteStudent();
    await resend("email.delivered", invite.messageId);
    await t.prisma.classInvitation.update({ where: { id: invite.invitationId }, data: { status: "ACCEPTED", acceptedAt: new Date() } });
    const accepted = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invite.invitationId } });
    clock.advance(2 * DAY);
    expect((await resend("email.complained", invite.messageId)).status).toBe(200);
    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invite.invitationId } })).toEqual(accepted);
    expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "COMPLAINED" });
    expect(await invite.view()).toMatchObject({ status: "ACCEPTED" });
  });

  it("017/FR-017 um aviso nunca muda o convite: estado, validade e contagem de envios iguais", async () => {
    const invite = await inviteStudent();
    const before = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invite.invitationId } });
    await resend("email.bounced", invite.messageId);
    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invite.invitationId } })).toEqual(before);
  });

  it("017/FR-010 entregue: o envio fica DELIVERED e o convite segue sem aviso", async () => {
    const invite = await inviteStudent();
    const at = new Date(clock.now().getTime() - MINUTE);
    expect((await resend("email.delivered", invite.messageId, { at })).status).toBe(200);
    expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "DELIVERED", deliveredAt: at });
    expect(await invite.view()).toMatchObject({ delivery: "SENT", deliveryIssue: null });
  });

  it("017/FR-013 voltou temporariamente: fica só no registro", async () => {
    const invite = await inviteStudent();
    await resend("email.bounced", invite.messageId, { bounceType: "Transient" });
    await resend("email.delivery_delayed", invite.messageId);
    expect(await t.prisma.mailNotice.findMany({ select: { kind: true } })).toEqual([{ kind: "TEMPORARY" }, { kind: "TEMPORARY" }]);
    expect((await deliveryOf("CLASS_INVITATION")).status).toBe("SENT");
    expect(await auditOf("mail_delivery.undelivered")).toHaveLength(0);
  });

  it("017/FR-013 eventos que não usamos (aberto, clicado, enviado) não são guardados", async () => {
    const invite = await inviteStudent();
    for (const type of ["email.opened", "email.clicked", "email.sent"] as const) expect((await resend(type, invite.messageId)).status).toBe(200);
    expect(await t.prisma.mailNotice.count()).toBe(0);
    expect((await deliveryOf("CLASS_INVITATION")).status).toBe("SENT");
  });

  it("017/FR-013 o provedor recusou a mensagem já aceita: fica no registro (só uma recusa antes do resultado muda o envio)", async () => {
    const invite = await inviteStudent();
    await resend("email.failed", invite.messageId);
    expect(await t.prisma.mailNotice.findMany({ select: { kind: true } })).toEqual([{ kind: "REJECTED" }]);
    expect((await deliveryOf("CLASS_INVITATION")).status).toBe("SENT");
  });

  describe("casos de borda", () => {
    it("fora de ordem: voltou antes do entregue → não entregue, e o entregue depois não desfaz", async () => {
      const invite = await inviteStudent();
      await resend("email.bounced", invite.messageId);
      await resend("email.delivered", invite.messageId);
      expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });
      expect(await t.prisma.mailNotice.count()).toBe(2);
    });

    it("fora de ordem: voltou emitido antes do entregue, mas recebido depois → não entregue", async () => {
      const invite = await inviteStudent();
      const now = clock.now().getTime();
      await resend("email.delivered", invite.messageId, { at: new Date(now - MINUTE) });
      await resend("email.bounced", invite.messageId, { at: new Date(now - 2 * MINUTE) });
      expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });
    });

    it("voltou emitido depois de um entregue: fica só no registro", async () => {
      const invite = await inviteStudent();
      const now = clock.now().getTime();
      await resend("email.delivered", invite.messageId, { at: new Date(now - 2 * MINUTE) });
      await resend("email.bounced", invite.messageId, { at: new Date(now - MINUTE) });
      expect((await deliveryOf("CLASS_INVITATION")).status).toBe("DELIVERED");
    });

    it("o aviso chega antes do resultado do SMTP: aplicado, e o SENT depois é ignorado", async () => {
      for (const [type, status] of [
        ["email.delivered", "DELIVERED"],
        ["email.bounced", "UNDELIVERED"],
      ] as const) {
        mailer.hold();
        const schoolClass = await createClass(t, teacher.id);
        const client = api(t, { cookie: await loginAs(t, teacher) });
        expect((await client.post(`/api/classes/${schoolClass.id}/invitations`, { email: uniqueEmail("em-voo") })).status).toBe(201);
        await mailer.started;
        const inFlight = await t.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitation: { classId: schoolClass.id } } });
        expect(inFlight).toMatchObject({ status: "PENDING", attempts: 1 });
        expect((await resend(type, inFlight.messageId)).status).toBe(200);
        mailer.release();
        await t.flushMail();
        const after = await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: inFlight.id } });
        expect(after.status).toBe(status);
        expect(after.sentAt).not.toBeNull();
        expect(after.nextAttemptAt).toBeNull();
      }
    });

    it("o aviso de uma tentativa que não é a atual nunca move um envio PENDING", async () => {
      mailer.setFailing(true);
      const invite = await inviteStudent();
      clock.advance(2 * MINUTE);
      await t.get(MailDeliveryWorker).runOnce(clock.now());
      const pending = await deliveryOf("CLASS_INVITATION");
      expect(pending).toMatchObject({ status: "PENDING", attempts: 2 });
      expect((await resend("email.delivered", invite.messageId)).status).toBe(200);
      expect(await t.prisma.mailNotice.count()).toBe(1);
      expect((await deliveryOf("CLASS_INVITATION")).status).toBe("PENDING");
    });

    it("vários avisos para o mesmo envio: o primeiro motivo fica, todos são guardados", async () => {
      const invite = await inviteStudent();
      await resend("email.bounced", invite.messageId);
      await resend("email.complained", invite.messageId);
      expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });
      expect(await t.prisma.mailNotice.count()).toBe(2);
      expect(await auditOf("mail_delivery.undelivered")).toHaveLength(1);
    });

    it("envio substituído e tentativa antiga: a situação do convite segue o envio mais recente", async () => {
      const invite = await inviteStudent();
      expect((await invite.client.post(`/api/classes/${invite.schoolClass.id}/invitations/${invite.invitationId}/resend`)).status).toBe(200);
      await t.flushMail();
      expect(await t.prisma.mailDelivery.count()).toBe(2);
      await resend("email.bounced", invite.messageId);
      expect((await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id: invite.delivery.id } })).status).toBe("UNDELIVERED");
      expect(await invite.view()).toMatchObject({ delivery: "SENT", deliveryIssue: null });

      // A superseded delivery is final: its notice stays on record only.
      const id = crypto.randomUUID();
      const messageId = `<${id}.1@${invite.messageId.split("@")[1]}`;
      await t.prisma.mailDelivery.create({
        data: { id, kind: "CLASS_INVITATION", classInvitationId: invite.invitationId, status: "SUPERSEDED", attempts: 1, messageId, createdAt: new Date(Date.now() - DAY) },
      });
      expect((await resend("email.bounced", messageId)).status).toBe(200);
      expect((await t.prisma.mailDelivery.findUniqueOrThrow({ where: { id } })).status).toBe("SUPERSEDED");
      expect(await t.prisma.mailNotice.count({ where: { deliveryId: id } })).toBe(1);
    });

    it("aviso de dias depois é aceito e aplicado", async () => {
      const invite = await inviteStudent();
      const sentAt = clock.now();
      clock.advance(5 * DAY);
      expect((await resend("email.complained", invite.messageId, { at: new Date(sentAt.getTime() + 4 * DAY) })).status).toBe(200);
      expect((await deliveryOf("CLASS_INVITATION")).undeliveredReason).toBe("COMPLAINED");
    });
  });

  describe("017/FR-014 o mesmo cenário pelo SES", () => {
    const signer = createSnsSigner();
    const fetcher = new TestCertificateFetcher().serve(SNS_CERT_URL, signer);
    let ses: TestApp;

    beforeAll(async () => {
      const base = testConfig();
      ses = await createTestApp({
        clock,
        logs,
        config: { mail: { ...base.mail, notices: { provider: "ses", topicArn: TEST_TOPIC_ARN } } },
        overrides: [{ provide: CertificateFetcher, useValue: fetcher }],
      });
    });
    afterAll(() => ses.close());

    it("017/FR-014 017/US2-1 voltou (Permanent) pelo SES → o professor vê \"Não entregue\"", async () => {
      const schoolClass = await createClass(ses, teacher.id);
      const client = api(ses, { cookie: await loginAs(ses, teacher) });
      const invited = await client.post(`/api/classes/${schoolClass.id}/invitations`, { email: uniqueEmail("aluno-ses") });
      await ses.flushMail();
      const delivery = await ses.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId: invited.body.id } });
      const notice = signedSnsNotice({ type: "Bounce", messageId: delivery.messageId, at: clock.now(), signer });
      for (let i = 0; i < 2; i++) expect((await postNotice(ses, "ses", notice)).status).toBe(200);
      const list = await client.get(`/api/classes/${schoolClass.id}/invitations`);
      expect(list.body.items.find((item: { id: string }) => item.id === invited.body.id)).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
      expect(await ses.prisma.mailNotice.findMany({ select: { provider: true, kind: true } })).toEqual([{ provider: "SES", kind: "BOUNCED" }]);
    });

    it("017/FR-014 entregue e spam pelo SES; a confirmação da assinatura do tópico responde 200", async () => {
      const invite = await inviteStudent();
      expect((await postNotice(ses, "ses", signedSnsNotice({ type: "Delivery", messageId: invite.messageId, at: clock.now(), signer }))).status).toBe(200);
      expect((await deliveryOf("CLASS_INVITATION")).status).toBe("DELIVERED");
      expect((await postNotice(ses, "ses", signedSnsNotice({ type: "Complaint", messageId: invite.messageId, at: clock.now(), signer }))).status).toBe(200);
      expect(await deliveryOf("CLASS_INVITATION")).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "COMPLAINED" });
      expect((await postNotice(ses, "ses", snsSubscriptionConfirmation({ signer }))).status).toBe(200);
      expect(fetcher.confirmed).toHaveLength(1);
    });

    it("017/FR-014 com o SES configurado, a rota do Resend não existe", async () => {
      const invite = await inviteStudent();
      expect((await postNotice(ses, "resend", signedResendNotice({ type: "email.bounced", messageId: invite.messageId, secret, at: clock.now() }))).status).toBe(404);
    });
  });

  describe("017/FR-010 CLI de desenvolvimento mail:notice (quickstart passo 3)", () => {
    const io = () => {
      const lines: string[] = [];
      return { lines, io: { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) } };
    };

    it("posta um aviso assinado para o envio: \"Não entregue\"; com --bad-signature → 401", async () => {
      const invite = await inviteStudent();
      const ok = io();
      expect(await runMailNoticeCli(["--kind", "bounced", "--delivery", invite.delivery.id, "--api", t.baseUrl], process.env, ok.io)).toBe(0);
      expect(ok.lines).toEqual(["aviso bounced: HTTP 200"]);
      expect(await invite.view()).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
      const bad = io();
      expect(await runMailNoticeCli(["--kind", "delivered", "--delivery", invite.delivery.id, "--api", t.baseUrl, "--bad-signature"], process.env, bad.io)).toBe(1);
      expect(bad.lines).toEqual(["aviso delivered: HTTP 401"]);
    });

    it("não roda em produção nem com argumentos inválidos", async () => {
      const prod = io();
      expect(await runMailNoticeCli(["--kind", "bounced", "--delivery", crypto.randomUUID()], { ...process.env, NODE_ENV: "production" }, prod.io)).toBe(1);
      expect(prod.lines.join("\n")).toMatch(/NODE_ENV=production/);
      for (const argv of [[], ["--kind", "opened", "--delivery", crypto.randomUUID()], ["--kind", "bounced", "--delivery", "x"]]) {
        expect(await runMailNoticeCli(argv, process.env, io().io)).toBe(1);
      }
    });
  });
});
