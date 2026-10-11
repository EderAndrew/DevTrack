import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../config/config.schema";
import { MailSendError } from "./mailer";
import { classifySmtpError } from "./smtp-errors";
import { SmtpMailer } from "./smtp.mailer";

/** The reply of each step of a scripted SMTP server; `null` never answers (a hanging server). */
interface Script {
  greeting?: string | null;
  auth?: string;
  mailFrom?: string;
  rcptTo?: string;
  data?: string;
}

interface Received {
  commands: string[];
  data: string;
}

/** A plain-text SMTP server on 127.0.0.1 that answers by `script` and records what it got. */
async function smtpServer(script: Script): Promise<{ port: number; received: Received; close: () => Promise<void> }> {
  const received: Received = { commands: [], data: "" };
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let inData = false;
    let buffer = "";
    const reply = (line: string) => socket.write(`${line}\r\n`);
    if (script.greeting !== null) reply(script.greeting ?? "220 teste ESMTP");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            reply(script.data ?? "250 2.0.0 aceito");
          } else received.data += `${line}\n`;
          continue;
        }
        received.commands.push(line);
        const verb = line.slice(0, 4).toUpperCase();
        if (verb === "EHLO") reply(script.auth ? "250-teste\r\n250 AUTH PLAIN" : "250 teste");
        else if (verb === "HELO") reply("250 teste");
        else if (verb === "AUTH") reply(script.auth ?? "235 2.7.0 ok");
        else if (verb === "MAIL") reply(script.mailFrom ?? "250 2.1.0 ok");
        else if (verb === "RCPT") reply(script.rcptTo ?? "250 2.1.5 ok");
        else if (verb === "DATA") {
          inData = true;
          reply("354 envie");
        } else if (verb === "QUIT") {
          reply("221 tchau");
          socket.end();
        } else reply("502 5.5.2 não implementado");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    port,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

/** An unused local port (a server opened and closed): connecting to it is refused. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

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
