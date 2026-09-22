import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { parseAdminBootstrapArgs, runAdminBootstrapCli } from "../../src/cli/admin-bootstrap.command";
import { FailingMailer, InMemoryMailer } from "../../src/platform/mail/in-memory.mailer";
import { API_ROOT } from "../helpers/env";
import { createUser, uniqueEmail } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

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

  it("falha no envio → exit 3 e bootstrap continua PENDING", async () => {
    const { io, err } = captureIo();
    const code = await runAdminBootstrapCli(["--email", uniqueEmail("smtp")], process.env, io, {
      mailer: new FailingMailer(),
    });
    expect(code).toBe(3);
    expect(err.join("\n")).toMatch(/não foi possível enviar/i);
    expect((await t.prisma.adminBootstrap.findFirstOrThrow()).status).toBe("PENDING");
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
