import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InvalidConfigError, loadConfig } from "../../src/platform/config/config.schema";
import { CertificateFetcher } from "../../src/platform/mail/notices/certificate-fetcher";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { SmtpMailer } from "../../src/platform/mail/smtp.mailer";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createClass, createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import {
  createSnsSigner,
  postNotice,
  resendSecretOf,
  SNS_CERT_URL,
  signedResendNotice,
  signedSnsNotice,
  TEST_TOPIC_ARN,
  TestCertificateFetcher,
} from "../helpers/mail-notices";
import { smtpServer } from "../helpers/smtp-server";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const PASSWORD = "MARCADOR-SENHA-SMTP-017";
const SECRET = "whsec_ZGV2dHJhY2stdGVzdC1tYWlsLW5vdGljZS1zZWNyZXQ=";

/** A production environment that passes the guard: Resend over SMTPS, a real sender, Resend notices. */
const production = (env: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
  const base: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "production",
    SMTP_URL: `smtps://resend:${PASSWORD}@smtp.resend.com:465`,
    MAIL_FROM: "DevTrack <nao-responda@devtrack.app>",
    MAIL_NOTICE_PROVIDER: "resend",
    MAIL_NOTICE_SECRET: SECRET,
    // 019: production also requires the Code Runner kill switch to be set (its own guard, platform.spec.ts).
    CODE_RUNNER_ENABLED: "false",
  };
  delete base.MAIL_MESSAGE_ID_DOMAIN;
  return { ...base, ...env };
};

const failure = (env: NodeJS.ProcessEnv): InvalidConfigError => {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidConfigError);
    return error as InvalidConfigError;
  }
  throw new Error("the configuration was accepted");
};

/**
 * 017/US4 (contracts/configuration.md, research N10): production refuses a development mail
 * setup, and switching provider is only configuration — a new SMTP_URL and notice provider over
 * the same database keep every delivery where it was and send the pending ones.
 */
describe("017/US4 operador coloca o envio em produção e troca de provedor só pela configuração", () => {
  describe("017/US4-2 017/FR-025 guarda de produção", () => {
    it("017/US4-2 aceita smtps:// na 465 e smtp:// na 587 com requireTLS=true, pelo Resend e pelo SES", () => {
      expect(loadConfig(production()).smtpUrl).toContain("smtp.resend.com");
      const ses = loadConfig(
        production({
          SMTP_URL: `smtp://AKIAEXEMPLO:${PASSWORD}@email-smtp.sa-east-1.amazonaws.com:587?requireTLS=true`,
          MAIL_NOTICE_PROVIDER: "ses",
          MAIL_SES_TOPIC_ARN: TEST_TOPIC_ARN,
        }),
      );
      expect(ses.mail.notices).toEqual({ provider: "ses", topicArn: TEST_TOPIC_ARN });
      // A public address is not a local server.
      expect(loadConfig(production({ SMTP_URL: "smtps://u:p@203.0.113.10:465" })).nodeEnv).toBe("production");
      expect(loadConfig(production({ SMTP_URL: "smtps://u:p@172.32.0.1:465" })).nodeEnv).toBe("production");
    });

    it("017/US4-2 017/FR-025 recusa SMTP sem conexão segura", () => {
      for (const url of [
        `smtp://resend:${PASSWORD}@smtp.resend.com:587`,
        `smtp://resend:${PASSWORD}@smtp.resend.com:25?requireTLS=true`,
        `smtp://resend:${PASSWORD}@smtp.resend.com:587?requireTLS=false`,
        `smtps://resend:${PASSWORD}@smtp.resend.com:465?secure=false`,
        `smtp://resend:${PASSWORD}@smtp.resend.com:587?requireTLS=true&ignoreTLS=true`,
      ]) {
        const error = failure(production({ SMTP_URL: url }));
        expect(error.variables, url).toEqual(["SMTP_URL"]);
        expect(error.message).not.toContain(PASSWORD);
        expect(error.message).not.toContain("smtp.resend.com");
      }
    });

    it("017/FR-025 017/FR-026 recusa opções que imprimem a conversa SMTP (com a credencial) no log", () => {
      for (const option of ["logger=true", "debug=true"]) {
        const error = failure(production({ SMTP_URL: `smtps://resend:${PASSWORD}@smtp.resend.com:465?${option}` }));
        expect(error.variables, option).toEqual(["SMTP_URL"]);
      }
    });

    it("017/US4-2 017/FR-025 recusa servidor local, endereço privado e o Mailpit", () => {
      for (const host of [
        "localhost",
        "LocalHost",
        "smtp.localhost",
        "127.0.0.1",
        "127.10.0.1",
        "0.0.0.0",
        "10.0.0.5",
        "172.16.0.1",
        "172.31.255.254",
        "192.168.1.10",
        "169.254.10.10",
        "[::1]",
        "[::ffff:127.0.0.1]",
        "[fd12:3456::1]",
        "[fe80::1]",
        "mailpit",
        "Mailpit",
      ]) {
        const error = failure(production({ SMTP_URL: `smtps://usuario:${PASSWORD}@${host}:465` }));
        expect(error.variables, host).toEqual(["SMTP_URL"]);
        expect(error.message).not.toContain(PASSWORD);
        expect(error.message).not.toContain(host);
      }
    });

    it("017/US4-2 017/FR-025 recusa MAIL_FROM sem domínio e MAIL_NOTICE_PROVIDER=none (ou ausente)", () => {
      for (const from of ["DevTrack <nao-responda>", "DevTrack <nao-responda@localhost>", "nao-responda"]) {
        const error = failure(production({ MAIL_FROM: from, MAIL_MESSAGE_ID_DOMAIN: "devtrack.app" }));
        expect(error.variables, from).toEqual(["MAIL_FROM"]);
      }
      expect(failure(production({ MAIL_NOTICE_PROVIDER: "none" })).variables).toEqual(["MAIL_NOTICE_PROVIDER"]);
      const unset = production();
      delete unset.MAIL_NOTICE_PROVIDER;
      expect(failure(unset).variables).toEqual(["MAIL_NOTICE_PROVIDER"]);
    });

    it("017/US4-2 017/FR-025 a mensagem nomeia todas as variáveis recusadas e nenhum valor", () => {
      const error = failure(
        production({ SMTP_URL: `smtp://usuario:${PASSWORD}@mailpit:1025`, MAIL_FROM: "DevTrack <x>", MAIL_MESSAGE_ID_DOMAIN: "devtrack.app", MAIL_NOTICE_PROVIDER: "none" }),
      );
      expect(error.variables).toEqual(["MAIL_FROM", "MAIL_NOTICE_PROVIDER", "SMTP_URL"]);
      expect(error.message).toContain("SMTP_URL");
      for (const value of [PASSWORD, "usuario", "mailpit", "1025", "DevTrack <x>"]) expect(error.message).not.toContain(value);
    });

    it("017/FR-025 fora de produção a configuração de desenvolvimento segue valendo (Mailpit, sem aviso)", () => {
      for (const nodeEnv of ["development", "test"]) {
        const config = loadConfig({ ...production(), NODE_ENV: nodeEnv, SMTP_URL: "smtp://localhost:1025", MAIL_NOTICE_PROVIDER: "none" });
        expect(config.smtpUrl).toBe("smtp://localhost:1025");
      }
    });
  });

  it("017/FR-029 testes e E2E apontam para o Mailpit, fora de produção, com o segredo de aviso de teste", () => {
    for (const file of [join(__dirname, "../../.env.test.example"), join(__dirname, "../../../web/e2e/.env.e2e")]) {
      const env = parseEnv(readFileSync(file, "utf8"));
      expect(env.NODE_ENV, file).not.toBe("production");
      expect(env.SMTP_URL, file).toBe("smtp://localhost:1025");
      expect(env.MAIL_NOTICE_PROVIDER, file).toBe("resend");
      // The same values would never pass the production guard.
      expect(failure({ ...process.env, ...env, NODE_ENV: "production" }).variables, file).toContain("SMTP_URL");
    }
  });

  describe("017/US4-3 017/US4-4 017/SC-006 troca do Resend para o SES sem nova versão", () => {
    const clock = new FixedClock(new Date());
    const logs = new LogCapture();
    const signer = createSnsSigner();
    let resend: TestApp | null = null;
    let ses: TestApp;
    let sesServer: Awaited<ReturnType<typeof smtpServer>>;
    let sesMailer: SmtpMailer;
    let classId: string;
    let teacherCookie: string;
    const ids = { sent: "", undelivered: "", pending: "" };

    beforeAll(async () => {
      resend = await createTestApp({ clock, logs });
      await resetDb(resend.prisma);
      const teacher = await createUser(resend, { roles: ["TEACHER"] });
      classId = (await createClass(resend, teacher.id)).id;
      teacherCookie = await loginAs(resend, teacher);
      const client = api(resend, { cookie: teacherCookie });
      const invite = async () => {
        const res = await client.post(`/api/classes/${classId}/invitations`, { email: uniqueEmail("aluno-troca") });
        expect(res.status).toBe(201);
        await resend!.flushMail();
        return res.body.id as string;
      };
      ids.sent = await invite();
      ids.undelivered = await invite();
      resend.mailer.failNext(1);
      ids.pending = await invite();
      const bounced = await resend.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId: ids.undelivered } });
      const notice = signedResendNotice({ type: "email.bounced", messageId: bounced.messageId, at: clock.now(), secret: resendSecretOf(resend.config) });
      expect((await postNotice(resend, "resend", notice)).status).toBe(200);
      await resend.close();
      resend = null;

      // The same version, recreated with the SES SMTP endpoint and SES notices.
      sesServer = await smtpServer({});
      const config = testConfig();
      const sesConfig = { smtpUrl: `smtp://127.0.0.1:${sesServer.port}`, mail: { ...config.mail, notices: { provider: "ses" as const, topicArn: TEST_TOPIC_ARN } } };
      sesMailer = new SmtpMailer(testConfig(sesConfig));
      ses = await createTestApp({
        clock,
        logs,
        config: sesConfig,
        mailer: sesMailer,
        overrides: [{ provide: CertificateFetcher, useValue: new TestCertificateFetcher().serve(SNS_CERT_URL, signer) }],
      });
    });
    afterAll(async () => {
      await resend?.close();
      await ses?.close();
      sesMailer?.onModuleDestroy();
      await sesServer?.close();
    });

    const deliveryOf = (classInvitationId: string) =>
      ses.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId }, orderBy: { createdAt: "desc" } });

    it("017/US4-3 017/SC-006 os envios pendentes saem pelo novo servidor; os antigos não mudam", async () => {
      const before = {
        sent: await deliveryOf(ids.sent),
        undelivered: await deliveryOf(ids.undelivered),
        pending: await deliveryOf(ids.pending),
      };
      expect(before.sent.status).toBe("SENT");
      expect(before.undelivered).toMatchObject({ status: "UNDELIVERED", undeliveredReason: "BOUNCED" });
      expect(before.pending).toMatchObject({ status: "PENDING", attempts: 1 });

      clock.advance(2 * MINUTE);
      await ses.get(MailDeliveryWorker).runOnce(clock.now());

      const pending = await deliveryOf(ids.pending);
      expect(pending).toMatchObject({ status: "SENT", attempts: 2 });
      expect(sesServer.received.data).toContain(pending.messageId!);
      expect(await deliveryOf(ids.sent)).toEqual(before.sent);
      expect(await deliveryOf(ids.undelivered)).toEqual(before.undelivered);
    });

    it("017/US4-4 017/SC-006 aceita os avisos do SES, recusa os do Resend (404) e mantém a situação dos convites", async () => {
      const pending = await deliveryOf(ids.pending);
      const resendNotice = signedResendNotice({ type: "email.delivered", messageId: pending.messageId, at: clock.now(), secret: resendSecretOf(testConfig()) });
      const notices = await ses.prisma.mailNotice.count();
      expect((await postNotice(ses, "resend", resendNotice)).status).toBe(404);
      expect(await ses.prisma.mailNotice.count()).toBe(notices);

      const delivered = signedSnsNotice({ type: "Delivery", messageId: pending.messageId, at: clock.now(), signer });
      expect((await postNotice(ses, "ses", delivered)).status).toBe(200);
      expect((await deliveryOf(ids.pending)).status).toBe("DELIVERED");

      const list = await api(ses, { cookie: teacherCookie }).get(`/api/classes/${classId}/invitations`);
      const byId = new Map((list.body.items as Array<{ id: string; delivery: string; deliveryIssue: string | null }>).map((item) => [item.id, item]));
      expect(byId.get(ids.sent)).toMatchObject({ delivery: "SENT", deliveryIssue: null });
      expect(byId.get(ids.undelivered)).toMatchObject({ delivery: "UNDELIVERED", deliveryIssue: "BOUNCED" });
      // The inviter's view has no "delivered": a delivered e-mail reads as sent (contracts/http-api.md).
      expect(byId.get(ids.pending)).toMatchObject({ delivery: "SENT", deliveryIssue: null });
    });
  });
});
