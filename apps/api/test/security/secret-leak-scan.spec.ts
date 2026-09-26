import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { type JourneySecret, runFullJourney } from "../helpers/journey";
import { captureLogs } from "../helpers/log-capture";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp } from "../helpers/curriculum-ai";
import { createUser, loginAs } from "../helpers/factories";
import { api } from "../helpers/test-app";

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
  let t: AiTestApp;
  const logs = captureLogs();
  let secrets: JourneySecret[];
  let content: JourneySecret[];

  beforeAll(async () => {
    t = await createCurriculumAiApp({ logs, overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
    await resetAiDb(t);
    ({ secrets, content } = await runFullJourney(t));
  });
  afterAll(() => t.close());

  it("a jornada gerou os segredos esperados", () => {
    const kinds = new Set(secrets.map((s) => s.kind));
    for (const kind of [
      "cookie de sessão",
      "token de verificação",
      "token de convite",
      "token de recuperação",
      "senha do ADMIN",
      "token de convite de turma",
      "hash de token de convite de turma",
      "senha do aluno convidado",
      "credencial do provedor de IA",
    ]) {
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

  it("003/SC-006 nenhum hash de senha nos logs, na auditoria ou nos e-mails; e-mails sem senhas nem hashes de token", async () => {
    const users = await t.prisma.user.findMany({ select: { passwordHash: true } });
    const passwordHashes = users.flatMap(({ passwordHash }, i) =>
      passwordHash ? [{ kind: `hash de senha #${i}`, value: passwordHash }] : [],
    );
    expect(passwordHashes.length).toBeGreaterThan(0);
    // A token travels in its own e-mail link by design; passwords and hashes never do.
    const notInMail = [...passwordHashes, ...secrets.filter(({ kind }) => /senha|hash/.test(kind))];
    const mails = serialize([...t.mailer.outbox, ...t.mailer.failed]);
    expect(t.mailer.outbox.some((mail) => mail.template === "class-invitation")).toBe(true);
    expect(
      leaks(passwordHashes, {
        logs: logs.text(),
        audit_events: serialize(await t.prisma.auditEvent.findMany()),
        access_records: serialize(await t.prisma.accessRecord.findMany()),
      }),
    ).toEqual([]);
    expect(leaks(notInMail, { "e-mails": mails })).toEqual([]);
  });

  it("003/SC-006 003/FR-016 tokens brutos de convite de turma não são gravados (só o hash)", async () => {
    const raw = secrets.filter(({ kind }) => kind.startsWith("token de convite de turma"));
    expect(raw.length).toBeGreaterThan(0);
    const sources = {
      class_invitations: serialize(await t.prisma.classInvitation.findMany()),
      class_invitation_deliveries: serialize(await t.prisma.classInvitationDelivery.findMany()),
      enrollments: serialize(await t.prisma.enrollment.findMany()),
    };
    expect(leaks(raw, sources)).toEqual([]);
    const hashes = secrets.filter(({ kind }) => kind.startsWith("hash de token de convite de turma"));
    expect(hashes.some(({ value }) => sources.class_invitations.includes(value))).toBe(true);
  });

  it("004/SC-010 004/FR-047 004/FR-048 texto da ementa, títulos e descrições de tópicos, nome da disciplina e do arquivo fora dos logs e da metadata de auditoria", async () => {
    expect(new Set(content.map(({ kind }) => kind))).toEqual(
      new Set([
        "texto da ementa (marcador)",
        "nome da disciplina",
        "descrição da disciplina",
        "nome do arquivo",
        "título de tópico",
        "descrição de tópico",
        // 006: the AI execution's input, the agent's instructions and the model's output.
        "entrada da execução de IA",
        "instruções do agente de IA",
        "saída do modelo",
      ]),
    );
    const events = await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } });
    expect(events.some(({ type }) => type.startsWith("topic."))).toBe(true);
    expect(leaks(content, { logs: logs.text(), "metadata de auditoria": serialize(events) })).toEqual([]);
    // The content itself was stored where it belongs (the scan is not vacuous).
    expect(serialize(await t.prisma.topic.findMany({ select: { title: true } }))).toContain("Tópico da jornada");
    expect(serialize(await t.prisma.syllabusDocument.findMany({ select: { extraction: true } }))).toContain(
      "MARCADOR-EMENTA-004",
    );
    expect(serialize(await t.prisma.aiExecution.findMany({ select: { input: true } }))).toContain("MARCADOR-ENTRADA-006");
    expect(serialize(await t.prisma.aiExecutionOutput.findMany({ select: { output: true } }))).toContain("MARCADOR-SAIDA-006");
  });

  it("006/SC-007 006/FR-061 006/FR-018 instruções, entrada, saída, nome da disciplina e credencial do provedor fora dos logs, da auditoria e das respostas operacionais", async () => {
    const aiKinds = ["instruções do agente de IA", "entrada da execução de IA", "saída do modelo", "nome da disciplina", "credencial do provedor de IA"];
    const scanned = [...content, ...secrets].filter(({ kind }) => aiKinds.includes(kind));
    expect(scanned.map(({ kind }) => kind).sort()).toEqual([...aiKinds].sort());

    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    const operations: Record<string, string> = {};
    for (const path of ["health", "metrics?period=30d", "agents", "model-configs"]) {
      const res = await client.get(`/api/ai/operations/${path}`);
      expect(res.status, path).toBe(200);
      operations[`resposta de /ai/operations/${path}`] = serialize(res.body);
    }
    expect(operations["resposta de /ai/operations/metrics?period=30d"]).toContain("reference-l1");
    const events = await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } });
    expect(leaks(scanned, { logs: logs.text(), auditoria: serialize(events), ...operations })).toEqual([]);
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
