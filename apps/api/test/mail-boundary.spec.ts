import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 017/FR-024, plan Structure Decision: the outbox, the notices and the `Mailer` live in
 * `platform/mail`, which never imports a domain module (each module registers its `MailSubject`),
 * and the transport is standard SMTP: no provider package anywhere, and `nodemailer` only in
 * `smtp.mailer.ts`, so changing provider is changing variables. Every e-mail goes through the
 * outbox: only `platform/mail/outbox` calls `Mailer.send` (T019), and no other code holds a `Mailer`.
 */

const MAIL_DIR = "src/platform/mail";
const SMTP_MAILER = "src/platform/mail/smtp.mailer.ts";
const OUTBOX_DIR = "src/platform/mail/outbox/";
/**
 * The audit trail is a global, cross-cutting module: the outbox and the notices record their events
 * there. The notice controller declares itself `@Public()` (route metadata only, as `platform/health`).
 */
const ALLOWED_MODULES = ["src/modules/audit/", "src/modules/access-control/decorators"];
/** Provider SDKs and their signature libraries (research N1, N7: we verify notices ourselves). */
const PROVIDER_PACKAGE = /^(resend|svix|@aws-sdk\/.*|aws-sdk|@sendgrid\/.*|mailgun.*|postmark|nodemailer-.*-transport)$/;

function sources(dir: string): string[] {
  const absolute = join(API_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(API_ROOT, path)).isDirectory()) return sources(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

const production = (dir: string) => sources(dir).filter((file) => !/\.(spec|test)\.ts$/.test(file));

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function imports(file: string): string[] {
  return [...readFileSync(join(API_ROOT, file), "utf8").matchAll(IMPORT_SPECIFIER)].map(([, specifier]) => specifier!);
}

/** The package an import names (`@scope/name` or `name`), or null for a relative import. */
const packageOf = (specifier: string) =>
  specifier.startsWith(".") ? null : specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]!;

describe("017/FR-024 fronteira do e-mail: platform/mail sem domínio e sem provedor", () => {
  const files = production(MAIL_DIR);

  it("platform/mail tem código para conferir", () => {
    expect(files).toContain(SMTP_MAILER);
    expect(files).toContain("src/platform/mail/outbox/mail-subject.ts");
  });

  it("017/FR-024 platform/mail não importa nenhum módulo de domínio", () => {
    const offenders = files.flatMap((file) =>
      imports(file)
        .filter((specifier) => specifier.startsWith("."))
        .map((specifier) => relative(API_ROOT, resolve(join(API_ROOT, dirname(file)), specifier)))
        .filter((target) => target.startsWith("src/modules") && !ALLOWED_MODULES.some((allowed) => target.startsWith(allowed)))
        .map((target) => `${file} → ${target}`),
    );
    expect(offenders).toEqual([]);
  });

  it("017/FR-024 nenhum código da API importa a biblioteca de um provedor", () => {
    const offenders = production("src").flatMap((file) =>
      imports(file)
        .map(packageOf)
        .filter((name): name is string => name !== null && PROVIDER_PACKAGE.test(name))
        .map((name) => `${file} → ${name}`),
    );
    expect(offenders).toEqual([]);
  });

  it("017/FR-024 nenhum provedor entre as dependências da API", () => {
    const manifest = JSON.parse(readFileSync(join(API_ROOT, "package.json"), "utf8")) as Record<string, Record<string, string> | undefined>;
    const names = ["dependencies", "devDependencies", "optionalDependencies"].flatMap((field) => Object.keys(manifest[field] ?? {}));
    expect(names.filter((name) => PROVIDER_PACKAGE.test(name))).toEqual([]);
  });

  it("017/FR-024 nodemailer só em smtp.mailer.ts", () => {
    const users = production("src").filter((file) => imports(file).some((specifier) => packageOf(specifier) === "nodemailer"));
    expect(users).toEqual([SMTP_MAILER]);
  });

  it("017/FR-001 só a fila envia: Mailer.send apenas em platform/mail/outbox", () => {
    const callers = production("src").filter((file) => /\bmailer\.send\(/i.test(readFileSync(join(API_ROOT, file), "utf8")));
    expect(callers.filter((file) => !file.startsWith(OUTBOX_DIR))).toEqual([]);
  });

  it("017/FR-001 fora de platform/mail ninguém recebe um Mailer (só o tipo, para trocar o transporte no CLI)", () => {
    const holders = production("src").filter((file) => {
      if (file.startsWith(MAIL_DIR)) return false;
      const text = readFileSync(join(API_ROOT, file), "utf8");
      return /^import\s+\{[^}]*\bMailer\b[^}]*\}\s+from\s+["'][^"']*platform\/mail\/mailer["']/m.test(text);
    });
    expect(holders).toEqual([]);
  });

  it("a heurística reconhece pacotes de provedor e ignora os demais", () => {
    expect(["resend", "svix", "@aws-sdk/client-sesv2", "@sendgrid/mail"].every((name) => PROVIDER_PACKAGE.test(name))).toBe(true);
    expect(["nodemailer", "@nestjs/common", "zod", "pg"].some((name) => PROVIDER_PACKAGE.test(name))).toBe(false);
    expect(packageOf("@aws-sdk/client-sesv2/dist")).toBe("@aws-sdk/client-sesv2");
    expect(packageOf("./mailer")).toBeNull();
  });
});
