import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { type JourneySecret, OPENROUTER_MARKER_KEY, runFullJourney, SMTP_MARKER_PASSWORD, SMTP_MARKER_URL } from "../helpers/journey";
import { captureLogs } from "../helpers/log-capture";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createWorkHelpApp } from "../helpers/work-help";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, testConfig } from "../helpers/test-app";
import { InvalidConfigError, loadConfig } from "../../src/platform/config/config.schema";
import { SmtpMailer } from "../../src/platform/mail/smtp.mailer";
import { postNotice, resendSecretOf, signedResendNotice } from "../helpers/mail-notices";
import { closedPort, smtpServer } from "../helpers/smtp-server";

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
    t = await createWorkHelpApp({
      logs,
      // 017/US4-5: an SMTP_URL with a password (the journey's mailer stays in memory).
      config: { smtpUrl: SMTP_MARKER_URL, ai: { ...base.ai, openrouter: { ...base.ai.openrouter, apiKey: OPENROUTER_MARKER_KEY } } },
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
      "senha do SMTP_URL",
      "segredo de aviso (MAIL_NOTICE_SECRET)",
      "segredo de aviso decodificado",
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
      mail_deliveries: serialize(await t.prisma.mailDelivery.findMany()),
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
        "rubrica do trabalho (011)",
        "explicação do trabalho (011)",
        // 011/US3: the request's title, the topic the work generator read and what it generated.
        "título do pedido de trabalho (011)",
        "tópico lido pelo gerador de trabalhos (011)",
        "texto gerado pela IA (011)",
        "enunciado revisado do trabalho (011)",
        // 012: the class activity's title and instructions, the student's answers and the teacher's feedback.
        "título da atividade (012)",
        "instruções da atividade (012)",
        "resposta do aluno (012)",
        "código do aluno (012)",
        "feedback da questão (012)",
        "feedback geral (012)",
        // 013: the teacher's comment on a marked exercise.
        "comentário da marcação (013)",
        // 015: the student's questions to the AI help and the orientations (MARCADOR-AJUDA-015, MARCADOR-ORIENTACAO-015).
        "pergunta da ajuda (015)",
        "orientação da ajuda (015)",
        // 016: the note of a room exit declared as "Outro" (MARCADOR-NOTA-016).
        "nota de saída da sala (016)",
        // 017: the recipient and the bounce message inside a provider notice (MARCADOR-DESTINO-017, MARCADOR-BOUNCE-017).
        "destinatário do aviso do provedor",
        "mensagem de bounce do provedor",
        // 018: the exam's title, a statement and its answer keys.
        "título da prova (018)",
        "enunciado da prova (018)",
        "resposta esperada da prova (018)",
        "alternativa correta da prova (018)",
        // 018/US2: the title of the exam applied to the class.
        "título da prova aplicada (018)",
        // 018/US7: "Criar prova com IA" — the request's title, the topic the generator read and its output.
        "título do pedido de prova (018)",
        "tópico lido pelo gerador de provas (018)",
        "texto gerado pela IA (018)",
        // 018/SC-010: the student's answer in an exam (MARCADOR-PROVA-018, also in the statement).
        "resposta do aluno na prova (018)",
        // 019/US1: a code run — the case, the program and what it printed (MARCADOR-*-019).
        "entrada do caso de teste (019)",
        "saída esperada do caso (019)",
        "código executado (019)",
        "saída do programa (019)",
        "saída de erro do programa (019)",
        "código que não compila (019)",
        "mensagem do compilador (019)",
        "código de uma execução que falhou (019)",
      ]),
    );
    const events = await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } });
    expect(events.some(({ type }) => type.startsWith("topic."))).toBe(true);
    expect(leaks(content, { logs: logs.text(), "metadata de auditoria": serialize(events) })).toEqual([]);
    // The content itself was stored where it belongs (the scan is not vacuous).
    expect(serialize(await t.prisma.topic.findMany({ select: { title: true } }))).toContain("Tópico da jornada");
    expect(serialize(await t.prisma.exercise.findMany({ select: { statement: true } }))).toContain("Enunciado da jornada dez");
    expect(serialize(await t.prisma.work.findMany({ select: { title: true } }))).toContain("Trabalho manual da jornada onze");
    expect(serialize(await t.prisma.exam.findMany({ select: { title: true } }))).toContain("Prova manual da jornada dezoito");
    expect(serialize(await t.prisma.exerciseQuestionResult.findMany({ select: { comment: true } }))).toContain("Comentário da marcação da jornada treze");
    const helps = serialize(await t.prisma.workHelpRequest.findMany({ select: { question: true, message: true } }));
    expect(helps).toContain("MARCADOR-AJUDA-015");
    expect(helps).toContain("MARCADOR-ORIENTACAO-015");
    expect(serialize(await t.prisma.attemptPause.findMany({ select: { note: true } }))).toContain("MARCADOR-NOTA-016");
    expect(serialize(await t.prisma.examQuestion.findMany({ select: { statement: true } }))).toContain("MARCADOR-PROVA-018");
    expect(serialize(await t.prisma.activityAnswer.findMany({ select: { text: true } }))).toContain("MARCADOR-PROVA-018");
    expect(serialize(await t.prisma.codeRun.findMany({ select: { sourceCode: true, compileOutput: true } }))).toContain("MARCADOR-COMPILADOR-019");
    expect(serialize(await t.prisma.codeRunCase.findMany({ select: { stdout: true, stderr: true } }))).toContain("MARCADOR-STDERR-019");
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

  it("011/FR-024 011/SC-008 título, enunciados, gabaritos, rubricas, soluções, casos de teste, explicações e o tópico lido pelo gerador de trabalhos fora dos logs, da auditoria e das respostas da Operação de IA", async () => {
    const kinds = [
      "título do trabalho (011)",
      "descrição do trabalho (011)",
      "enunciado do trabalho (011)",
      "resposta esperada do trabalho (011)",
      "alternativa correta do trabalho (011)",
      "solução esperada do trabalho (011)",
      "saída de caso de teste (011)",
      "rubrica do trabalho (011)",
      "explicação do trabalho (011)",
      "título do pedido de trabalho (011)",
      "tópico lido pelo gerador de trabalhos (011)",
      "texto gerado pela IA (011)",
      "enunciado revisado do trabalho (011)",
      // 018/US7: the exam generator's request, topic and output.
      "título do pedido de prova (018)",
      "tópico lido pelo gerador de provas (018)",
      "texto gerado pela IA (018)",
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
    // The generator and its task are there (the scan is not vacuous), with no work content.
    expect(sources["resposta de /ai/operations/metrics?period=30d"]).toContain("work-generator");
    expect(sources["resposta de /ai/operations/tasks"]).toContain("work-generation");
    expect(leaks(scanned, sources)).toEqual([]);

    // The topic reached the model (as untrusted data), the output became the draft and the edit was stored.
    expect(serialize(t.provider.requests)).toContain("MARCADOR-TOPICO-011");
    const stored = serialize(await t.prisma.workQuestion.findMany({ select: { statement: true, rubric: true } }));
    expect(stored).toContain("MARCADOR-GERADO-011");
    expect(stored).toContain("Enunciado do trabalho revisto pelo professor");
    expect(stored).toContain("Rubrica do trabalho da jornada onze");
    // 018/US7: the same for the exam generator.
    expect(serialize(t.provider.requests)).toContain("MARCADOR-TOPICO-018");
    expect(serialize(await t.prisma.examQuestion.findMany({ select: { statement: true } }))).toContain("MARCADOR-GERADO-018");
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

  /** Every column of every table as text, minus `except`; the source holds `value` when any row does. */
  const tableSources = async (values: string[], except: string[] = []) => {
    const tables = await t.prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
    );
    expect(tables.length).toBeGreaterThan(20);
    const sources: Record<string, string> = {};
    for (const { table_name } of tables.filter(({ table_name }) => !except.includes(table_name))) {
      const hits = await t.prisma.$queryRawUnsafe<{ value: string }[]>(
        `SELECT needle AS value FROM unnest($1::text[]) AS needle WHERE EXISTS (SELECT 1 FROM "${table_name}" AS scanned_row WHERE strpos(scanned_row::text, needle) > 0)`,
        values,
      );
      sources[`tabela ${table_name}`] = hits.map(({ value }) => value).join(" ");
    }
    return sources;
  };

  /** The notice route as a provider (and an attacker) uses it: accepted, repeated, refused, unknown provider. */
  const noticeResponses = async () => {
    const delivery = await t.prisma.mailDelivery.findFirstOrThrow({ where: { status: "SENT", messageId: { not: null } } });
    const now = new Date();
    const bounced = signedResendNotice({ type: "email.bounced", messageId: delivery.messageId, at: now, secret: resendSecretOf(t.config) });
    const forged = signedResendNotice({ type: "email.bounced", messageId: delivery.messageId, at: now, secret: Buffer.from("segredo-errado-da-jornada-017") });
    const stale = signedResendNotice({ type: "email.delivered", messageId: delivery.messageId, at: now, signedAt: new Date(now.getTime() - 3_600_000), secret: resendSecretOf(t.config) });
    const responses: Record<string, string> = {};
    for (const [label, provider, notice, status] of [
      ["aviso aceito", "resend", bounced, 200],
      ["aviso repetido", "resend", bounced, 200],
      ["aviso com assinatura falsa", "resend", forged, 401],
      ["aviso fora da janela", "resend", stale, 401],
      ["aviso sem cabeçalhos", "resend", { headers: { "content-type": "application/json" }, body: bounced.body }, 401],
      ["aviso de outro provedor", "ses", bounced, 404],
    ] as const) {
      const res = await postNotice(t, provider, notice);
      expect(res.status, label).toBe(status);
      responses[`resposta de ${label}`] = serialize({ headers: res.headers, body: res.body, text: res.text });
    }
    expect(await t.prisma.mailNotice.count()).toBeGreaterThan(0);
    return responses;
  };

  it("017/US4-5 017/FR-026 017/SC-007 a senha do SMTP_URL e o MAIL_NOTICE_SECRET fora dos logs, da auditoria, das respostas, do erro de configuração e de todas as tabelas", async () => {
    const kinds = ["senha do SMTP_URL", "segredo de aviso (MAIL_NOTICE_SECRET)", "segredo de aviso decodificado"];
    const scanned = secrets.filter(({ kind }) => kinds.includes(kind));
    expect(scanned.map(({ kind }) => kind).sort()).toEqual([...kinds].sort());
    expect(scanned.find(({ kind }) => kind === "senha do SMTP_URL")?.value).toBe(SMTP_MARKER_PASSWORD);

    const sources: Record<string, string> = { logs: logs.text(), ...(await noticeResponses()) };
    sources.auditoria = serialize(await t.prisma.auditEvent.findMany());
    // The loader's refusal names the variables, never a value (a production guard and a malformed secret).
    const noticeSecret = scanned.find(({ kind }) => kind.startsWith("segredo de aviso ("))!.value;
    try {
      loadConfig({
        ...process.env,
        NODE_ENV: "production",
        SMTP_URL: `smtp://jornada:${SMTP_MARKER_PASSWORD}@localhost:1025`,
        MAIL_NOTICE_SECRET: `${noticeSecret}!`,
      });
      expect.unreachable("the configuration was accepted");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidConfigError);
      expect((error as InvalidConfigError).variables).toEqual(expect.arrayContaining(["MAIL_NOTICE_SECRET", "SMTP_URL"]));
      sources["erro do carregador de configuração"] = serialize({ message: (error as Error).message, stack: (error as Error).stack, error });
    }
    Object.assign(sources, await tableSources(scanned.map(({ value }) => value)));
    expect(leaks(scanned, sources)).toEqual([]);
  });

  /**
   * The address a person typed is the fact these 001/003 events record (their audit-events.md):
   * who was invited, and who asked for the admin bootstrap from which operator account. Only those
   * fields are left out of the 017 scan; any other event, or another field of these, still fails it.
   */
  const RECORDED_ADDRESS: Record<string, string[]> = {
    "admin.bootstrap.requested": ["email", "operatorHost", "operatorUser"],
    "invitation.created": ["email"],
    "class_invitation.created": ["email"],
  };
  const withoutRecordedAddress = ({ type, metadata }: { type: string; metadata: unknown }) => {
    const exempt = RECORDED_ADDRESS[type] ?? [];
    const fields = Object.entries((metadata ?? {}) as Record<string, unknown>).filter(([key]) => !exempt.includes(key));
    return { type, metadata: Object.fromEntries(fields) };
  };

  it("017/SC-007 endereços, nomes, links e tokens dos seis e-mails fora dos logs, da auditoria, dos envios, dos avisos e das respostas dos avisos", async () => {
    const mails = [...t.mailer.outbox, ...t.mailer.failed];
    expect(new Set(mails.map(({ template }) => template))).toEqual(
      new Set(["verify-email", "password-reset", "invitation-teacher", "invitation-manager", "admin-activation", "class-invitation"]),
    );
    // The links (and their tokens) as the e-mails carry them; the names as the e-mails' owners store them.
    const links = [...new Set(mails.flatMap((mail) => mail.text.match(/https?:\/\/\S+/g) ?? []))];
    expect(links.length).toBeGreaterThan(5);
    const users = await t.prisma.user.findMany({ select: { name: true } });
    const invitations = await t.prisma.invitation.findMany({ select: { displayName: true } });
    const scanned: JourneySecret[] = [
      ...[...new Set(mails.map((mail) => mail.to))].map((value) => ({ kind: "endereço de um e-mail", value })),
      ...links.map((value) => ({ kind: "link de um e-mail", value })),
      ...links.flatMap((link) => {
        const token = new URL(link).searchParams.get("token");
        return token ? [{ kind: "token de um e-mail", value: token }] : [];
      }),
      ...[...new Set([...users.map(({ name }) => name), ...invitations.map(({ displayName }) => displayName)])]
        .filter((value) => value.length >= 8)
        .map((value) => ({ kind: "nome de um destinatário", value })),
    ];
    const sources: Record<string, string> = {
      ...(await noticeResponses()),
      logs: logs.text(),
      "metadata de auditoria": serialize((await t.prisma.auditEvent.findMany({ select: { type: true, metadata: true } })).map(withoutRecordedAddress)),
      mail_deliveries: serialize(await t.prisma.mailDelivery.findMany()),
      mail_notices: serialize(await t.prisma.mailNotice.findMany()),
    };
    expect(leaks(scanned, sources)).toEqual([]);
  });

  it("017/US4-5 017/FR-026 erros de SMTP (credencial recusada, conexão recusada) não levam a senha nem o endereço a logs, auditoria, envios ou respostas", async () => {
    const password = "MARCADOR-SENHA-SMTP-EAUTH-017";
    const refusing = await smtpServer({ auth: "535 5.7.8 credenciais inválidas" });
    const sources: Record<string, string> = {};
    try {
      for (const [label, url] of [
        ["EAUTH", `smtp://usuario-017:${password}@127.0.0.1:${refusing.port}`],
        ["ECONNECTION", `smtp://usuario-017:${password}@127.0.0.1:${await closedPort()}`],
      ] as const) {
        const config = testConfig({ smtpUrl: url, mail: { ...t.config.mail, sendTimeoutMs: 2_000 } });
        const mailer = new SmtpMailer(config);
        // The same LogCapture: workers log to the first app of the process (apps/api/CLAUDE.md).
        const app = await createTestApp({ config, mailer, logs });
        try {
          const user = await createUser(app, { email: `smtp-${label.toLowerCase()}-017@example.test` });
          const res = await api(app).post("/api/auth/password-reset/request", { email: user.email });
          expect(res.status).toBe(202);
          sources[`resposta (${label})`] = serialize(res.body);
          await app.flushMail();
          const delivery = await app.prisma.mailDelivery.findFirstOrThrow({ where: { userId: user.id, kind: "PASSWORD_RESET" } });
          expect(delivery).toMatchObject({ status: "PENDING", lastErrorCode: label });
          sources[`mail_deliveries (${label})`] = serialize(delivery);
          const thrown = await mailer.send({ to: user.email, template: "verify-email", params: { name: "Pessoa", link: "http://localhost:3000/x" } }).catch((error: unknown) => error);
          expect(thrown).toMatchObject({ name: "MailSendError", code: label });
          sources[`erro do envio (${label})`] = serialize({ message: (thrown as Error).message, stack: (thrown as Error).stack, thrown });
        } finally {
          await app.close();
          mailer.onModuleDestroy();
        }
      }
    } finally {
      await refusing.close();
    }
    sources.logs = logs.text();
    expect(sources.logs).toContain("mail.auth_failed");
    sources.auditoria = serialize(await t.prisma.auditEvent.findMany());
    expect(leaks([{ kind: "senha do SMTP_URL (EAUTH)", value: password }, { kind: "usuário do SMTP_URL", value: "usuario-017" }], sources)).toEqual([]);
  });

  it("017/US4-5 017/SC-007 o Message-ID só fica em mail_deliveries.message_id: nunca em logs, auditoria, respostas ou outras tabelas", async () => {
    const responses = await noticeResponses();
    const rows = await t.prisma.mailDelivery.findMany({ where: { messageId: { not: null } }, select: { messageId: true } });
    expect(rows.length).toBeGreaterThan(5);
    const scanned = rows.map(({ messageId }) => ({ kind: "Message-ID", value: messageId! }));
    const admin = await createUser(t, { roles: ["ADMIN"] });
    const client = api(t, { cookie: await loginAs(t, admin) });
    for (const path of ["teacher-invitations", "manager-invitations"]) {
      const res = await client.get(`/api/${path}`);
      expect(res.status, path).toBe(200);
      responses[`resposta de /${path}`] = serialize(res.body);
    }
    const sources = {
      ...responses,
      logs: logs.text(),
      auditoria: serialize(await t.prisma.auditEvent.findMany()),
      ...(await tableSources(scanned.map(({ value }) => value), ["mail_deliveries"])),
    };
    expect(leaks(scanned, sources)).toEqual([]);
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
