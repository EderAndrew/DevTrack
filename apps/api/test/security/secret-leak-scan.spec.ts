import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { type JourneySecret, runFullJourney } from "../helpers/journey";
import { captureLogs } from "../helpers/log-capture";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const SENSITIVE_KEY = /password|token|cookie|authorization|secret/i;
const REDACTED = "[REDACTED]";
const serialize = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

/** Paths of log fields named like a secret whose value is not the redaction marker. */
function unredactedSensitiveFields(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((item, i) => unredactedSensitiveFields(item, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const here = path ? `${path}.${key}` : key;
    if (SENSITIVE_KEY.test(key) && typeof child === "string" && child !== REDACTED) return [here];
    return unredactedSensitiveFields(child, here);
  });
}

/** Failure messages name the secret kind and where it leaked — never the value. */
function leaks(secrets: JourneySecret[], sources: Record<string, string>): string[] {
  return secrets.flatMap(({ kind, value }) =>
    Object.entries(sources)
      .filter(([, text]) => text.includes(value))
      .map(([where]) => `${kind} em ${where}`),
  );
}

describe("SC-005 — varredura de segredos em logs e auditoria (FR-071, FR-072, critério 24)", () => {
  let t: TestApp;
  const logs = captureLogs();
  let secrets: JourneySecret[];

  beforeAll(async () => {
    t = await createTestApp({ logs, overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
    await resetDb(t.prisma);
    ({ secrets } = await runFullJourney(t));
  });
  afterAll(() => t.close());

  it("a jornada gerou os segredos esperados", () => {
    const kinds = new Set(secrets.map((s) => s.kind));
    for (const kind of ["cookie de sessão", "token de verificação", "token de convite", "token de recuperação", "senha do ADMIN"]) {
      expect(kinds.has(kind), kind).toBe(true);
    }
    expect(logs.lines().length).toBeGreaterThan(0);
  });

  it("nenhuma senha, token, hash de token, cookie ou APP_HMAC_SECRET nos logs, na auditoria ou nos registros de acesso", async () => {
    const sources = {
      logs: logs.text(),
      audit_events: serialize(await t.prisma.auditEvent.findMany()),
      access_records: serialize(await t.prisma.accessRecord.findMany()),
    };
    expect(leaks(secrets, sources)).toEqual([]);
  });

  it("o detector acusa um vazamento plantado (sem expor o valor)", () => {
    const planted = { kind: "token plantado", value: "tok-plantado-123" };
    expect(leaks([planted], { logs: `{"msg":"x","t":"${planted.value}"}` })).toEqual(["token plantado em logs"]);
    expect(unredactedSensitiveFields({ req: { headers: { cookie: "abc", authorization: REDACTED } } })).toEqual([
      "req.headers.cookie",
    ]);
  });

  it("campos de log com nome de segredo estão sempre redigidos", () => {
    expect(logs.lines().flatMap((line) => unredactedSensitiveFields(line))).toEqual([]);
  });
});
