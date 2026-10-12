import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/config.schema";
import { MailSendError } from "./mailer";
import { classifySmtpError } from "./smtp-errors";
import { SmtpMailer } from "./smtp.mailer";
import { closedPort, type Script, smtpServer } from "../../../test/helpers/smtp-server";

const mailerFor = (url: string, env: Record<string, string> = {}) =>
  new SmtpMailer(loadConfig({ ...process.env, SMTP_URL: url, MAIL_SEND_TIMEOUT_SECONDS: "1", MAIL_REPLY_TO: "contato@devtrack.test", ...env }));

const message = {
  to: "aluno@example.test",
  template: "verify-email" as const,
  params: { name: "Aluna", link: "http://localhost:3000/verificar-email?token=x" },
  messageId: "<00000000-0000-4000-8000-000000000001.2@devtrack.test>",
};

describe("017/FR-024 SmtpMailer: SMTP padrão com Message-ID próprio e erros classificados (research N5, N8)", () => {
  const opened: Array<{ close: () => Promise<void> }> = [];
  const mailers: SmtpMailer[] = [];
  afterEach(async () => {
    for (const mailer of mailers.splice(0)) mailer.onModuleDestroy();
    for (const server of opened.splice(0)) await server.close();
  });

  const send = async (script: Script, env: Record<string, string> = {}, credentials = "") => {
    const server = await smtpServer(script);
    opened.push(server);
    const mailer = mailerFor(`smtp://${credentials}127.0.0.1:${server.port}`, env);
    mailers.push(mailer);
    return { server, result: mailer.send(message) };
  };
  const failure = async (result: Promise<unknown>) => {
    const error = await result.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(MailSendError);
    return error as MailSendError;
  };

  it("017/FR-024 envia com o nosso Message-ID e o Reply-To de MAIL_REPLY_TO", async () => {
    const { server, result } = await send({});
    await expect(result).resolves.toBe("SENT");
    expect(server.received.data).toContain(`Message-ID: ${message.messageId}`);
    expect(server.received.data).toMatch(/^Reply-To: contato@devtrack\.test$/m);
    expect(server.received.commands).toContain("RCPT TO:<aluno@example.test>");
  });

  it("017/FR-004 5xx no RCPT TO (o endereço não existe) é permanente, sem o texto do servidor", async () => {
    const { result } = await send({ rcptTo: "550 5.1.1 aluno@example.test: usuário desconhecido" });
    const error = await failure(result);
    expect([error.code, error.permanent]).toEqual(["EENVELOPE", true]);
    expect(error.message).not.toContain("aluno@example.test");
    expect(error.message).not.toContain("desconhecido");
  });

  it("017/FR-004 5xx depois do DATA (mensagem recusada) é permanente", async () => {
    const error = await failure((await send({ data: "554 5.7.1 mensagem recusada" })).result);
    expect([error.code, error.permanent]).toEqual(["SMTP_5XX", true]);
  });

  it("017/FR-004 4xx (caixa cheia, tente depois) é temporário", async () => {
    const error = await failure((await send({ rcptTo: "452 4.2.2 caixa cheia" })).result);
    expect([error.code, error.permanent]).toEqual(["SMTP_4XX", false]);
  });

  it("017/FR-004 5xx no MAIL FROM (o nosso remetente) é temporário: é configuração, não o e-mail", async () => {
    const error = await failure((await send({ mailFrom: "550 5.7.1 remetente não autorizado" })).result);
    expect([error.code, error.permanent]).toEqual(["SMTP_5XX", false]);
  });

  it("017/FR-004 credencial errada (535) é EAUTH temporário", async () => {
    const error = await failure((await send({ auth: "535 5.7.8 credenciais inválidas" }, {}, "usuario:senha-errada@")).result);
    expect([error.code, error.permanent]).toEqual(["EAUTH", false]);
  });

  it("017/FR-004 servidor que não responde estoura MAIL_SEND_TIMEOUT_SECONDS e é temporário", async () => {
    const started = Date.now();
    const error = await failure((await send({ greeting: null })).result);
    expect([error.code, error.permanent]).toEqual(["ETIMEDOUT", false]);
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("017/FR-004 conexão recusada é temporária", async () => {
    const mailer = mailerFor(`smtp://127.0.0.1:${await closedPort()}`);
    mailers.push(mailer);
    const error = await failure(mailer.send(message));
    expect([error.code, error.permanent]).toEqual(["ECONNECTION", false]);
  });
});

describe("017/FR-004 classifySmtpError (research N8)", () => {
  it.each([
    [{ code: "EENVELOPE", responseCode: 550, command: "RCPT TO" }, "EENVELOPE", true],
    [{ code: "EENVELOPE", command: "API" }, "EENVELOPE", true],
    [{ code: "EMESSAGE", responseCode: 552, command: "DATA" }, "SMTP_5XX", true],
    [{ code: "EENVELOPE", responseCode: 553, command: "MAIL FROM" }, "SMTP_5XX", false],
    [{ code: "EENVELOPE", responseCode: 450, command: "RCPT TO" }, "SMTP_4XX", false],
    [{ code: "EAUTH", responseCode: 535, command: "AUTH PLAIN" }, "EAUTH", false],
    [{ code: "ETIMEDOUT", command: "CONN" }, "ETIMEDOUT", false],
    [{ code: "ESOCKET", command: "CONN" }, "ECONNECTION", false],
    [{ code: "ECONNECTION" }, "ECONNECTION", false],
    [new Error("algo inesperado"), "ECONNECTION", false],
    ["texto", "ECONNECTION", false],
  ])("%j → %s (permanente: %s)", (input, code, permanent) => {
    const error = classifySmtpError(input);
    expect([error.code, error.permanent]).toEqual([code, permanent]);
  });
});
