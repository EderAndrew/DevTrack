import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CertificateFetcher } from "../../src/platform/mail/notices/certificate-fetcher";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createClass, createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import {
  createSnsSigner,
  postNotice,
  resendSecretOf,
  SNS_CERT_URL,
  type SignedNotice,
  signedResendNotice,
  signedSnsNotice,
  snsSubscriptionConfirmation,
  TEST_TOPIC_ARN,
  TestCertificateFetcher,
} from "../helpers/mail-notices";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const REJECTED = { statusCode: 401, code: "NOTICE_REJECTED", message: "Aviso recusado." };

/**
 * 017/US2-5, FR-011, SC-004: a notice without a valid signature changes nothing, and the database
 * of the deliveries is not even read; a repeated notice has one effect; refusals go to the log
 * `mail.notice_rejected`, never to the audit trail (research N12).
 */
describe("017/SC-004 avisos do provedor: autenticação e repetição", () => {
  const clock = new FixedClock(new Date());
  const logs = new LogCapture();
  let t: TestApp;
  let secret: Buffer;

  beforeAll(async () => {
    t = await createTestApp({ clock, logs });
    secret = resendSecretOf(t.config);
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    t.mailer.clear();
    logs.clear();
    vi.restoreAllMocks();
  });

  /** A class invitation sent, and the Message-ID of its attempt. */
  async function sentInvitation(app: TestApp = t) {
    const teacher = await createUser(app, { roles: ["TEACHER"] });
    const schoolClass = await createClass(app, teacher.id);
    const res = await api(app, { cookie: await loginAs(app, teacher) }).post(`/api/classes/${schoolClass.id}/invitations`, { email: uniqueEmail("aluno") });
    expect(res.status).toBe(201);
    await app.flushMail();
    return app.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId: res.body.id } });
  }

  const bounce = (messageId: string | null, extra: Partial<Parameters<typeof signedResendNotice>[0]> = {}) =>
    signedResendNotice({ type: "email.bounced", messageId, secret, at: clock.now(), ...extra });

  /** Posts and checks the refusal changed nothing and read no delivery. */
  async function expectRejected(app: TestApp, provider: string, notice: SignedNotice) {
    const transactions = vi.spyOn(app.prisma, "runInTransaction");
    const reads = vi.spyOn(app.prisma.mailDelivery, "findFirst");
    const before = await app.prisma.mailDelivery.findMany({ orderBy: { id: "asc" } });
    transactions.mockClear();
    reads.mockClear();
    const res = await postNotice(app, provider, notice);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(REJECTED);
    expect(transactions).not.toHaveBeenCalled();
    expect(reads).not.toHaveBeenCalled();
    expect(await app.prisma.mailDelivery.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await app.prisma.mailNotice.count()).toBe(0);
    transactions.mockRestore();
    reads.mockRestore();
  }

  describe("017/US2-5 017/FR-011 Resend", () => {
    it("017/US2-5 sem cabeçalhos, assinatura errada, corpo alterado e segredo de outro ambiente → 401 sem efeito", async () => {
      const { messageId } = await sentInvitation();
      const good = bounce(messageId);

      const noHeaders = { headers: { "content-type": "application/json" }, body: good.body };
      await expectRejected(t, "resend", noHeaders);
      await expectRejected(t, "resend", { ...good, headers: { ...good.headers, "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" } });
      await expectRejected(t, "resend", { ...good, body: good.body.replace("Permanent", "Transient") });
      await expectRejected(t, "resend", bounce(messageId, { secret: Buffer.from("segredo-de-outro-ambiente-017") }));
      expect((await t.prisma.mailDelivery.findFirstOrThrow()).status).toBe("SENT");
    });

    it("017/FR-011 timestamp fora de ±5 min → 401", async () => {
      const { messageId } = await sentInvitation();
      for (const offset of [-6 * MINUTE, 6 * MINUTE]) {
        await expectRejected(t, "resend", bounce(messageId, { signedAt: new Date(clock.now().getTime() + offset) }));
      }
    });

    it("017/FR-011 várias assinaturas no cabeçalho: uma válida passa", async () => {
      const { messageId } = await sentInvitation();
      const notice = bounce(messageId);
      notice.headers["svix-signature"] = `v1,b3V0cmE= v2,x ${notice.headers["svix-signature"]} v1,bWFpcw==`;
      expect((await postNotice(t, "resend", notice)).status).toBe(200);
      expect((await t.prisma.mailDelivery.findFirstOrThrow()).status).toBe("UNDELIVERED");
    });

    it("017/FR-011 JSON malformado com assinatura válida → 401 (FORMAT)", async () => {
      await expectRejected(t, "resend", bounce(null, { rawBody: "{\"type\": " }));
      expect(logs.lines().filter((line) => line.msg === "mail.notice_rejected").map((line) => line.reason)).toEqual(["FORMAT"]);
    });

    it("017/FR-011 as recusas vão para o log mail.notice_rejected com provider e reason, nunca para a auditoria", async () => {
      const { messageId } = await sentInvitation();
      const auditBefore = await t.prisma.auditEvent.count();
      await postNotice(t, "resend", bounce(messageId, { secret: Buffer.from("segredo-errado-0000000000") }));
      await postNotice(t, "resend", bounce(messageId, { signedAt: new Date(clock.now().getTime() - 10 * MINUTE) }));
      const rejected = logs.lines().filter((line) => line.msg === "mail.notice_rejected");
      expect(rejected.map((line) => [line.provider, line.reason])).toEqual([
        ["resend", "SIGNATURE"],
        ["resend", "TIMESTAMP"],
      ]);
      expect(await t.prisma.auditEvent.count()).toBe(auditBefore);
      expect(logs.text()).not.toContain(messageId!);
    });
  });

  describe("017/FR-011 rota, tamanho e limite", () => {
    it("017/FR-011 :provider que não é o configurado → 404", async () => {
      for (const provider of ["ses", "sendgrid", "none"]) {
        const res = await postNotice(t, provider, bounce(null));
        expect(res.status, provider).toBe(404);
        expect(res.body.code).toBe("NOT_FOUND");
      }
    });

    it("017/FR-011 corpo > 256 KB → 413; sem Origin e com text/plain passa pela barreira de CSRF", async () => {
      const big = bounce(null, { rawBody: JSON.stringify({ type: "email.sent", created_at: clock.now().toISOString(), pad: "x".repeat(256 * 1024) }) });
      const tooLarge = await postNotice(t, "resend", big);
      expect([tooLarge.status, tooLarge.body]).toEqual([413, { statusCode: 413, code: "NOTICE_TOO_LARGE", message: "Aviso grande demais." }]);
      const asText = bounce(null);
      asText.headers["content-type"] = "text/plain; charset=UTF-8";
      expect((await postNotice(t, "resend", asText)).status).toBe(200);
      const form = bounce(null);
      form.headers["content-type"] = "application/x-www-form-urlencoded";
      expect((await postNotice(t, "resend", form)).body.code).toBe("ORIGIN_NOT_ALLOWED");
    });

    it("017/FR-011 um aviso válido com Origin de fora e cookie de sessão não ganha sessão nem ator humano", async () => {
      const delivery = await sentInvitation();
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const notice = bounce(delivery.messageId);
      const req = request(t.baseUrl).post("/api/mail/notices/resend").set("Origin", "https://evil.example").set("Cookie", await loginAs(t, admin));
      for (const [name, value] of Object.entries(notice.headers)) req.set(name, value);
      expect((await req.send(notice.body)).status).toBe(200);
      const [event] = await t.prisma.auditEvent.findMany({ where: { type: "mail_delivery.undelivered" } });
      expect(event).toMatchObject({ actorType: "SYSTEM", actorUserId: null });
    });

    it("017/FR-011 limite por IP → 429", async () => {
      const base = testConfig();
      const limited = await createTestApp({ clock, logs, config: { rateLimit: { ...base.rateLimit, mailNoticesPerMinute: 3 } } });
      try {
        const statuses = [];
        for (let i = 0; i < 5; i++) statuses.push((await postNotice(limited, "resend", bounce(null))).status);
        expect(statuses).toEqual([200, 200, 200, 429, 429]);
      } finally {
        await limited.close();
      }
    });
  });

  it("017/SC-004 017/FR-012 100 avisos repetidos em paralelo → uma linha em mail_notices e um efeito", async () => {
    const { messageId } = await sentInvitation();
    const notice = bounce(messageId, { id: "msg_paralelo" });
    const responses = await Promise.all(Array.from({ length: 100 }, () => postNotice(t, "resend", notice)));
    expect(responses.map((res) => res.status)).toEqual(Array(100).fill(200));
    expect(await t.prisma.mailNotice.count()).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "mail_delivery.undelivered" } })).toBe(1);
  });

  describe("017/US2-5 017/FR-011 SES (SNS)", () => {
    const signer = createSnsSigner();
    const intruder = createSnsSigner();
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

    it("017/US2-5 SignatureVersion 1, certificado de outro host, certificado que não assina e outro tópico → 401", async () => {
      const { messageId } = await sentInvitation(ses);
      const at = clock.now();
      await expectRejected(ses, "ses", signedSnsNotice({ type: "Bounce", messageId, at, signer, signatureVersion: "1" }));
      for (const certUrl of ["https://sns.evil.com/cert.pem", "https://sns.sa-east-1.amazonaws.com.evil.com/cert.pem", "http://sns.sa-east-1.amazonaws.com/cert.pem"]) {
        fetcher.serve(certUrl, signer);
        await expectRejected(ses, "ses", signedSnsNotice({ type: "Bounce", messageId, at, signer, certUrl }));
      }
      expect(fetcher.fetched.filter((url) => url !== SNS_CERT_URL)).toEqual([]);
      await expectRejected(ses, "ses", signedSnsNotice({ type: "Bounce", messageId, at, signer, signWith: intruder }));
      await expectRejected(ses, "ses", signedSnsNotice({ type: "Bounce", messageId, at, signer, topicArn: "arn:aws:sns:sa-east-1:123456789012:outro" }));
    });

    it("017/FR-011 confirmação de outro tópico ou com SubscribeURL de fora → 401, sem buscar o SubscribeURL", async () => {
      await expectRejected(ses, "ses", snsSubscriptionConfirmation({ signer, topicArn: "arn:aws:sns:sa-east-1:123456789012:outro" }));
      await expectRejected(ses, "ses", snsSubscriptionConfirmation({ signer, subscribeUrl: "https://evil.example/confirm" }));
      await expectRejected(ses, "ses", snsSubscriptionConfirmation({ signer: intruder }));
      expect(fetcher.confirmed).toEqual([]);
    });
  });
});
