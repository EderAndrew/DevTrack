import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { type JourneySecret, OPENROUTER_MARKER_KEY, runFullJourney } from "../helpers/journey";
import { captureLogs } from "../helpers/log-capture";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createExerciseAiApp } from "../helpers/exercise-ai";
import { createUser, loginAs } from "../helpers/factories";
import { api, testConfig } from "../helpers/test-app";

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
    // 008/US4-1: the OpenRouter key is configured; the definitions keep the simulated provider (T022).
    const base = testConfig();
    t = await createExerciseAiApp({
      logs,
      config: { ai: { ...base.ai, openrouter: { ...base.ai.openrouter, apiKey: OPENROUTER_MARKER_KEY } } },
      overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }],
    });
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
      "chave do OpenRouter",
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

  it("004/SC-010 004/FR-047 004/FR-048 texto da ementa, títulos e descrições de tópicos, nome da disciplina e do arquivo e (010) o conteúdo dos exercícios fora dos logs e da metadata de auditoria", async () => {
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
        // 007: the text of a golden syllabus document the curriculum agent read.
        "texto do documento de referência (007)",
        // 010: the exercises' statement, answers, solution and explanation.
        "enunciado",
        "resposta esperada",
        "alternativa correta",
        "solução esperada",
        "explicação do exercício",
        "texto gerado pela IA (010)",
        "enunciado revisado (010)",
        "tópico lido pelo gerador (010)",
        // 011: the manual work's title, description, statement and answer keys.
        "título do trabalho (011)",
        "descrição do trabalho (011)",
        "enunciado do trabalho (011)",
        "resposta esperada do trabalho (011)",
        "alternativa correta do trabalho (011)",
        "solução esperada do trabalho (011)",
        "saída de caso de teste (011)",
      ]),
    );
    const events = await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } });
    expect(events.some(({ type }) => type.startsWith("topic."))).toBe(true);
    expect(leaks(content, { logs: logs.text(), "metadata de auditoria": serialize(events) })).toEqual([]);
    // The content itself was stored where it belongs (the scan is not vacuous).
    expect(serialize(await t.prisma.topic.findMany({ select: { title: true } }))).toContain("Tópico da jornada");
    expect(serialize(await t.prisma.exercise.findMany({ select: { statement: true } }))).toContain("Enunciado da jornada dez");
    expect(serialize(await t.prisma.work.findMany({ select: { title: true } }))).toContain("Trabalho manual da jornada onze");
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

  it("007/SC-009 007/FR-044 o texto do documento de referência e a credencial do provedor fora dos logs, da auditoria, das respostas da operação e das mensagens de erro", async () => {
    const scanned = [...content, ...secrets].filter(({ kind }) => ["texto do documento de referência (007)", "credencial do provedor de IA"].includes(kind));
    expect(scanned).toHaveLength(2);

    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    const sources: Record<string, string> = {
      logs: logs.text(),
      auditoria: serialize(await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } })),
    };
    for (const path of ["health", "metrics?period=30d", "agents", "model-configs"]) {
      sources[`resposta de /ai/operations/${path}`] = serialize((await client.get(`/api/ai/operations/${path}`)).body);
    }
    expect(sources["resposta de /ai/operations/metrics?period=30d"]).toContain("curriculum-agent");
    // The failed analysis, as the teacher sees it: only the code, never the output that failed.
    const failed = await t.prisma.aiExecution.findMany({ where: { agentKey: "curriculum-agent", status: "FAILED" }, select: { errorCode: true } });
    expect(failed.map((row) => row.errorCode)).toContain("AI_OUTPUT_PARSE_FAILED");
    sources["mensagens de erro das execuções"] = serialize(failed);
    expect(leaks(scanned, sources)).toEqual([]);

    // The marker was really read and proposed (the scan is not vacuous): in the model's context and the proposal.
    expect(serialize(t.provider.requests)).toContain("MARCADOR-EMENTA-007");
    expect(serialize(await t.prisma.aiProposal.findMany({ where: { status: "REJECTED" }, select: { payload: true } }))).toContain("MARCADOR-EMENTA-007");
  });

  it("010/FR-033 enunciados, respostas, soluções, explicações e o tópico lido pelo gerador fora dos logs, da auditoria e das respostas da Operação de IA", async () => {
    const kinds = [
      "enunciado",
      "resposta esperada",
      "alternativa correta",
      "solução esperada",
      "explicação do exercício",
      "texto gerado pela IA (010)",
      "enunciado revisado (010)",
      "tópico lido pelo gerador (010)",
    ];
    const scanned = content.filter(({ kind }) => kinds.includes(kind));
    expect(new Set(scanned.map(({ kind }) => kind))).toEqual(new Set(kinds));

    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    const sources: Record<string, string> = {
      logs: logs.text(),
      auditoria: serialize(await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } })),
    };
    for (const path of ["health", "metrics?period=30d", "agents", "model-configs", "models", "tasks"]) {
      const res = await client.get(`/api/ai/operations/${path}`);
      expect(res.status, path).toBe(200);
      sources[`resposta de /ai/operations/${path}`] = serialize(res.body);
    }
    // The generator and its task are there (the scan is not vacuous), with no exercise content.
    expect(sources["resposta de /ai/operations/metrics?period=30d"]).toContain("exercise-generator");
    expect(sources["resposta de /ai/operations/tasks"]).toContain("exercise-generation");
    expect(leaks(scanned, sources)).toEqual([]);

    // The topic reached the model (as untrusted data) and the output became the drafts.
    expect(serialize(t.provider.requests)).toContain("MARCADOR-TOPICO-010");
    expect(serialize(await t.prisma.exercise.findMany({ select: { statement: true } }))).toContain("MARCADOR-GERADO-010");
  });

  it("008/US4-1 008/SC-005 a chave do OpenRouter fora dos logs, da auditoria, das respostas (operacionais e de erro) e de todas as tabelas", async () => {
    expect(t.config.ai.openrouter.apiKey).toBe(OPENROUTER_MARKER_KEY);
    const key = secrets.filter(({ kind }) => kind === "chave do OpenRouter");
    expect(key).toHaveLength(1);

    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    const sources: Record<string, string> = { logs: logs.text() };
    for (const path of ["health", "metrics?period=30d", "agents", "model-configs", "unknown-route"]) {
      sources[`resposta de /ai/operations/${path}`] = serialize((await client.get(`/api/ai/operations/${path}`)).body);
    }
    sources["resposta de erro 400"] = serialize((await client.post("/api/ai/executions", { model: "x" })).body);
    // Every column of every table, as text; the same query finds a marker that is stored (not vacuous).
    const [stored] = await t.prisma.$queryRawUnsafe<{ hits: bigint }[]>(
      `SELECT count(*) AS hits FROM "ai_executions" AS row WHERE row::text LIKE '%' || $1 || '%'`,
      "MARCADOR-ENTRADA-006",
    );
    expect(stored?.hits).toBeGreaterThan(0n);
    const tables = await t.prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    expect(tables.length).toBeGreaterThan(20);
    for (const { table_name } of tables) {
      const [row] = await t.prisma.$queryRawUnsafe<{ hits: bigint }[]>(
        `SELECT count(*) AS hits FROM "${table_name}" AS row WHERE row::text LIKE '%' || $1 || '%'`,
        OPENROUTER_MARKER_KEY,
      );
      sources[`tabela ${table_name}`] = (row?.hits ?? 0n) > 0n ? OPENROUTER_MARKER_KEY : "";
    }
    expect(leaks(key, sources)).toEqual([]);
  });

  it("009/SC-009 009/FR-010 escalonamento, ciclo de vida, override e orçamento: eventos e respostas novas sem credencial, conteúdo nem id de usuário", async () => {
    const types = ["ai_execution.escalated", "ai_model_config.lifecycle_changed", "ai_task_override.set", "ai_task_override.removed", "ai_budget.exceeded"];
    const events = await t.prisma.auditEvent.findMany({ where: { type: { in: types } }, select: { type: true, metadata: true } });
    // The journey really emitted every new event (the scan is not vacuous).
    expect(new Set(events.map((event) => event.type))).toEqual(new Set(types));

    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    const sources: Record<string, string> = { "eventos da 009": serialize(events) };
    for (const path of ["models?period=30d", "tasks", "metrics?period=30d"]) {
      const res = await client.get(`/api/ai/operations/${path}`);
      expect(res.status, path).toBe(200);
      sources[`resposta de /ai/operations/${path}`] = serialize(res.body);
    }
    const fixed = await client.put("/api/ai/operations/tasks/reference-alt/override", { modelConfigKey: "fake-alt" });
    expect(fixed.status).toBe(200);
    sources["resposta do override"] = serialize(fixed.body);
    expect(sources["resposta de /ai/operations/metrics?period=30d"]).toContain("budgets");

    const userIds = (await t.prisma.user.findMany({ select: { id: true } })).map(({ id }) => ({ kind: "id de usuário", value: id }));
    expect(leaks([...secrets, ...content, ...userIds], sources)).toEqual([]);
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
