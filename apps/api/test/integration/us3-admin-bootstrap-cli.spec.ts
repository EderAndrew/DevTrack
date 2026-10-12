import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseAdminBootstrapArgs, runAdminBootstrapCli } from "../../src/cli/admin-bootstrap.command";
import { FailingMailer, InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { API_ROOT } from "../helpers/env";
import { createUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

function captureIo() {
  const out: string[] = [];
  const err: string[] = [];
  return { io: { out: (line: string) => out.push(line), err: (line: string) => err.push(line) }, out, err };
}

describe("CLI admin:bootstrap (contracts/cli-admin-bootstrap.md)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  const cli = async (argv: string[], mailer = new InMemoryMailer(), env: NodeJS.ProcessEnv = process.env) => {
    const { io, out, err } = captureIo();
    const code = await runAdminBootstrapCli(argv, env, io, { mailer });
    return { code, out, err, mailer };
  };

  describe("parser", () => {
    it.each([
      [["--email", "Pessoa@Example.test"], { email: "pessoa@example.test", printLink: false }],
      [["--email=pessoa@example.test", "--print-link"], { email: "pessoa@example.test", printLink: true }],
      [["--", "--print-link", "--email", "pessoa@example.test"], { email: "pessoa@example.test", printLink: true }],
    ])("aceita %j", (argv, expected) => {
      expect(parseAdminBootstrapArgs(argv)).toEqual(expected);
    });

    it.each([
      [[]],
      [["--email"]],
      [["--email", "nao-e-email"]],
      [["--email", "a@example.test", "--password", "x"]],
      [["--email", "a@example.test", "--role", "ADMIN"]],
      [["--email", "a@example.test", "--name", "Fulano"]],
      [["--email", "a@example.test", "solto"]],
    ])("recusa %j", (argv) => {
      expect(parseAdminBootstrapArgs(argv)).toHaveProperty("error");
    });
  });

  it("argumento inválido → exit 1, uso e nada gravado", async () => {
    const { code, err } = await cli(["--email", "a@example.test", "--password", "segredo"]);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/Uso: pnpm admin:bootstrap --email <email> \[--print-link\]/);
    expect(await t.prisma.adminBootstrap.count()).toBe(0);
  });

  it("e-mail novo → exit 0, link enviado e não impresso", async () => {
    const email = uniqueEmail("cli");
    const { code, out, mailer } = await cli(["--email", email]);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(new RegExp(`^Link de ativação enviado para ${email} \\(válido até \\d{2}/\\d{2}/\\d{4}, \\d{2}:\\d{2}\\)$`));
    const token = mailer.lastTokenFor(email, "admin-activation")!;
    expect(token).toBeDefined();
    expect(out.join("\n")).not.toContain(token);
  });

  it("--print-link imprime o link", async () => {
    const email = uniqueEmail("cli");
    const { code, out, mailer } = await cli(["--email", email, "--print-link"]);
    expect(code).toBe(0);
    expect(out).toContain(`Link de ativação: ${mailer.lastLinkFor(email, "admin-activation")}`);
  });

  it("User verificado → ADMIN concedido", async () => {
    const user = await createUser(t);
    const { code, out } = await cli(["--email", user.email]);
    expect(code).toBe(0);
    expect(out).toEqual([`ADMIN concedido a ${user.email}`]);
  });

  it("pendente anterior → avisa o cancelamento", async () => {
    await cli(["--email", uniqueEmail("primeiro")]);
    const { code, out } = await cli(["--email", uniqueEmail("segundo")]);
    expect(code).toBe(0);
    expect(out[0]).toBe("Bootstrap pendente anterior cancelado");
  });

  it("ADMIN ativo → exit 2", async () => {
    await createUser(t, { roles: ["ADMIN"] });
    const { code, out, err } = await cli(["--email", uniqueEmail("tarde")]);
    expect(code).toBe(2);
    expect([...out, ...err]).toContain("Bootstrap administrativo já realizado");
  });

  it("017/US1-1 falha no envio → exit 3, bootstrap PENDING e o e-mail fica para a API tentar de novo", async () => {
    const { io, err } = captureIo();
    const email = uniqueEmail("smtp");
    const code = await runAdminBootstrapCli(["--email", email], process.env, io, {
      mailer: new FailingMailer(),
    });
    expect(code).toBe(3);
    expect(err.join("\n")).toMatch(/não foi possível enviar/i);
    expect(err.join("\n")).toMatch(/o e-mail será tentado de novo pela API/);
    const bootstrap = await t.prisma.adminBootstrap.findFirstOrThrow();
    expect(bootstrap.status).toBe("PENDING");
    expect(await t.prisma.mailDelivery.findFirstOrThrow({ where: { adminBootstrapId: bootstrap.id } })).toMatchObject({
      kind: "ADMIN_ACTIVATION",
      status: "PENDING",
      attempts: 1,
    });

    // The API's worker sends it with a fresh link, which activates the account.
    expect(await t.get(MailDeliveryWorker).runOnce(new Date(Date.now() + 2 * 60_000))).toBe(1);
    const token = t.mailer.lastTokenFor(email, "admin-activation")!;
    expect((await api(t).post("/api/admin-activation/preview", { token })).status).toBe(200);
  });

  it("017/US1-6 com --print-link e o envio falhando: exit 3, envio DISCARDED e o link impresso continua valendo", async () => {
    const { io, out, err } = captureIo();
    const code = await runAdminBootstrapCli(["--email", uniqueEmail("impresso"), "--print-link"], process.env, io, {
      mailer: new FailingMailer(),
    });
    expect(code).toBe(3);
    expect(err.join("\n")).toMatch(/e-mail não enviado; use o link impresso/);
    const bootstrap = await t.prisma.adminBootstrap.findFirstOrThrow();
    expect(await t.prisma.mailDelivery.findFirstOrThrow({ where: { adminBootstrapId: bootstrap.id } })).toMatchObject({
      status: "DISCARDED",
      discardReason: "NOT_NEEDED",
    });
    const printed = out.join("\n").match(/token=([\w-]+)/)![1]!;

    // No retry rotates the printed link.
    expect(await t.get(MailDeliveryWorker).runOnce(new Date(Date.now() + 8 * 3_600_000))).toBe(0);
    expect((await api(t).post("/api/admin-activation/preview", { token: printed })).status).toBe(200);
  });

  it("configuração inválida → exit 1 com mensagem genérica", async () => {
    const { DATABASE_URL: _omit, ...env } = process.env;
    const { code, err } = await cli(["--email", uniqueEmail("x")], new InMemoryMailer(), env);
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/DATABASE_URL/);
    expect(err.join("\n")).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("script admin:bootstrap aponta para o CLI compilado", () => {
    const pkg = JSON.parse(readFileSync(join(API_ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["admin:bootstrap"]).toContain("dist/cli/admin-bootstrap.js");
  });
});
