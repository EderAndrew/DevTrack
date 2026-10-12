import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../../..");
const GUIDE = "docs/deploy/email.md";

/** The variables of the 017 configuration contract, from the first column of its table. */
function contractVariables(): string[] {
  const contract = readFileSync(join(ROOT, "specs/017-production-email/contracts/configuration.md"), "utf8");
  return [...contract.matchAll(/^\| `([A-Z][A-Z0-9_]+)` \|/gm)].map((match) => match[1]!);
}

/** The text of one `##`/`###` section, up to the next heading of the same or a higher level. */
function section(guide: string, heading: RegExp): string {
  const lines = guide.split("\n");
  const start = lines.findIndex((line) => /^#{2,3} /.test(line) && heading.test(line));
  if (start < 0) return "";
  const level = /^#+/.exec(lines[start]!)![0].length;
  const end = lines.findIndex((line, i) => i > start && new RegExp(`^#{1,${level}} `).test(line));
  return lines.slice(start, end < 0 ? undefined : end).join("\n");
}

/**
 * 017/US4-1 (research N15, quickstart "Production" and "Switching to SES"): the deploy guide
 * takes the operator from a Resend account to authenticated e-mail, and to SES later, only with
 * configuration and DNS. SC-008 (authenticated mail out of spam) and the real SC-006 are checked
 * by the operator through this guide; the test covers the procedure.
 */
describe("017/US4-1 017/FR-027 017/SC-008 guia de implantação de e-mail", () => {
  let guide = "";
  beforeAll(() => {
    expect(existsSync(join(ROOT, GUIDE)), GUIDE).toBe(true);
    guide = readFileSync(join(ROOT, GUIDE), "utf8");
  });

  it("017/FR-027 existe e é linkado pelo README", () => {
    expect(readFileSync(join(ROOT, "README.md"), "utf8")).toContain(`](${GUIDE})`);
    expect(guide).toMatch(/^# /);
  });

  it("017/FR-027 cita todas as variáveis de contracts/configuration.md", () => {
    const variables = contractVariables();
    expect(variables.length).toBeGreaterThanOrEqual(12);
    expect(variables.filter((variable) => !guide.includes(`\`${variable}\``))).toEqual([]);
  });

  it("017/US4-1 017/FR-027 Resend: conta, domínio, SPF, DKIM, DMARC e return-path, credenciais SMTP", () => {
    const resend = section(guide, /Resend/i);
    expect(resend).not.toBe("");
    for (const term of [/conta/i, /domínio/i, /SPF/, /DKIM/, /DMARC/, /p=none/, /quarantine/, /return-path/i, /smtps:\/\/resend:/, /smtp\.resend\.com:465/, /MAIL_FROM/]) {
      expect(resend, String(term)).toMatch(term);
    }
  });

  it("017/US4-1 017/FR-027 aviso do Resend: o webhook, os 5 eventos, o segredo, e rastreamento desligado", () => {
    expect(guide).toContain("/api/mail/notices/resend");
    for (const event of ["email.delivered", "email.bounced", "email.complained", "email.failed", "email.delivery_delayed"]) {
      expect(guide, event).toContain(`\`${event}\``);
    }
    expect(guide).toMatch(/whsec_/);
    expect(guide).toMatch(/rastreamento[^\n]*(desligad|deslig)/i);
    expect(guide).toMatch(/abertura/i);
    expect(guide).toMatch(/clique/i);
  });

  it("017/SC-008 017/FR-027 verificação do primeiro envio: spf=pass, dkim=pass, dmarc=pass, e o caminho do envio até \"entregue\"", () => {
    const check = section(guide, /verifica/i);
    for (const term of ["spf=pass", "dkim=pass", "dmarc=pass", "bounced@resend.dev", "DELIVERED", "UNDELIVERED"]) {
      expect(check, term).toContain(term);
    }
    expect(check).toMatch(/spam/i);
  });

  it("017/FR-027 limites do provedor e da fila", () => {
    const limits = section(guide, /limite/i);
    for (const term of [/MAIL_SENDS_PER_MINUTE/, /RATE_LIMIT_MAIL_NOTICES_PER_MINUTE/, /por segundo|por dia|por mês/i]) {
      expect(limits, String(term)).toMatch(term);
    }
  });

  it("017/US4-1 017/FR-027 troca para o SES: identidade, DKIM, MAIL FROM, saída do sandbox, credenciais SMTP, configuration set sem rastreio, SNS com cabeçalhos originais", () => {
    const ses = section(guide, /SES/);
    for (const term of [
      /identidade/i,
      /sa-east-1/,
      /DKIM/,
      /MAIL FROM/,
      /sandbox/i,
      /credenciais SMTP/i,
      /email-smtp\.sa-east-1\.amazonaws\.com/,
      /configuration set/i,
      /rastreamento|rastreio/i,
      /SNS/,
      /cabeçalhos originais/i,
      /\/api\/mail\/notices\/ses/,
      /MAIL_NOTICE_PROVIDER=ses/,
      /MAIL_SES_TOPIC_ARN/,
      /nova versão/i,
    ]) {
      expect(ses, String(term)).toMatch(term);
    }
  });

  it("017/FR-028 nota da LGPD: o provedor como operador, o que formalizar, onde ficam os dados e por quanto tempo", () => {
    const lgpd = section(guide, /LGPD/);
    for (const term of [/operador/i, /contrato|DPA/i, /endereços?/i, /nomes?/i, /local|região|país/i, /reten|guard/i, /MAIL_RECORDS_RETENTION_DAYS/]) {
      expect(lgpd, String(term)).toMatch(term);
    }
  });

  it("017/FR-026 o guia não traz credencial de verdade", () => {
    expect(guide).not.toMatch(/\bre_[A-Za-z0-9]{16,}/);
    expect(guide).not.toMatch(/whsec_[A-Za-z0-9+/]{20,}/);
    expect(guide).not.toMatch(/AKIA[A-Z0-9]{16}/);
  });
});
