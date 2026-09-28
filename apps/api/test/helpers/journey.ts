import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { UNVERIFIED_ACCOUNT_TTL_DAYS } from "../../src/modules/retention/unverified-accounts.job";
import { hashToken } from "../../src/platform/crypto/tokens";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { CircuitBreaker } from "../../src/modules/ai/gateway/circuit-breaker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeDelay, fakeError, fakeOutput, fakeText, fakeToolCall, FAKE_PROVIDER_CREDENTIAL } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER } from "../fixtures/ai/reference-agents";
import type { AiTestApp } from "./ai";
import { pooOutput, scriptCurriculumRun, seedGoldenDocument } from "./curriculum-ai";
import { GOLDEN_MARKER } from "../fixtures/curriculum-agent/build-golden";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { scriptGeneration } from "./exercise-ai";
import { createConfirmedTopic } from "./exercises";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import {
  createSyllabusDocument,
  createUser,
  DEFAULT_PASSWORD,
  loginAs,
  requestVerificationToken,
  syllabusFixture,
  uniqueEmail,
} from "./factories";
import { SYLLABUS_MARKER } from "../fixtures/syllabus/build-fixtures";
import { api } from "./test-app";

const DAY_MS = 24 * 3600 * 1000;

/** The OpenRouter key the scans look for (008/SC-005); never a real credential. */
export const OPENROUTER_MARKER_KEY = "sk-or-teste-008-CHAVE-FALSA";
const OPERATOR = { host: "host-jornada", user: "operador-jornada" };

/** A secret produced during the journey; `kind` names it in failure messages, never the value. */
export interface JourneySecret {
  kind: string;
  value: string;
}

export interface JourneyResult {
  secrets: JourneySecret[];
  /** 004 pedagogical content (FR-047, FR-048): never in logs nor in audit metadata. */
  content: JourneySecret[];
}

/**
 * Runs every flow of feature 001 once against `t`, in order, on an empty database: admin
 * bootstrap (CLI service), e-mail verification, login and sessions, manager and teacher
 * invitations (accept, refuse, claim, revoke, self-invite), teacher and account lifecycle,
 * password reset, rate limit, last-ADMIN protection, the maintenance jobs and the 003 flows
 * implemented so far (classes, class invitations, their management and acceptance, enrollments, own classes), and the 004
 * flows implemented so far (subjects, classes as offerings, syllabus upload, processing and review, the class calendar). Together they emit every audit event
 * type of the contracts/audit-events.md of 001, 003, 004 and 006, except the retired
 * ones and those still pending in audit-coverage.spec.ts.
 *
 * `t` must be created with a no-op LOGIN_DELAY (the rate-limit alert needs 10 failed logins).
 * Used by the SC-005 secret scan and the SC-008 audit coverage tests. `t` comes from
 * `createExerciseAiApp` and was reset with `resetAiDb` (which emits `ai_registry.synced`): the 006
 * flows run the reference agents, the 007 flows the curriculum agent and the 010 ones the exercise
 * generator, all on the fake provider.
 */
export async function runFullJourney(t: AiTestApp): Promise<JourneyResult> {
  const secrets: JourneySecret[] = [];
  const content: JourneySecret[] = [{ kind: "texto da ementa (marcador)", value: SYLLABUS_MARKER }];
  /** Pedagogical text sent by the journey; `kind` names it in failure messages. */
  const text = (kind: string, value: string) => {
    content.push({ kind, value });
    return value;
  };
  const keep = (kind: string, value: string | undefined) => {
    expect(value, `${kind} ausente`).toBeTruthy();
    secrets.push({ kind, value: value! });
    return value!;
  };
  const keepToken = (kind: string, value: string | undefined) => {
    const token = keep(kind, value);
    secrets.push({ kind: `hash de ${kind}`, value: hashToken(token) });
    return token;
  };
  const keepCookie = (res: { headers: Record<string, unknown> }) => {
    const header = ([] as string[]).concat((res.headers["set-cookie"] as string[] | undefined) ?? []);
    const pair = header.map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    const secret = keep("cookie de sessão", pair?.slice(SESSION_COOKIE_NAME.length + 1));
    return `${SESSION_COOKIE_NAME}=${secret}`;
  };
  const keepLoginAs = async (user: { id: string }) => {
    const cookie = await loginAs(t, user);
    keep("cookie de sessão", cookie.slice(SESSION_COOKIE_NAME.length + 1));
    return cookie;
  };
  const tokenFromLink = (link: string | undefined) =>
    link ? (new URL(link).searchParams.get("token") ?? undefined) : undefined;

  keep("APP_HMAC_SECRET", process.env.APP_HMAC_SECRET);
  keep("APP_HMAC_SECRET (hex)", t.config.hmacSecret.toString("hex"));
  keep("senha padrão das fábricas", DEFAULT_PASSWORD);
  const login = async (email: string, password: string) => {
    const res = await api(t).post("/api/auth/login", { email, password });
    expect(res.status, `login de ${email}`).toBe(200);
    return keepCookie(res);
  };

  // US3 — bootstrap: requested + link_printed, superseded (cancelled), activation, refusal.
  const bootstrap = t.get(AdminBootstrapService);
  const adminEmail = uniqueEmail("admin");
  const adminPassword = keep("senha do ADMIN", "senha-do-admin-da-jornada-2026");
  const first = await bootstrap.run({ email: adminEmail, printLink: true, operator: OPERATOR });
  keepToken("token de ativação de ADMIN", tokenFromLink("link" in first ? first.link : undefined));
  const second = await bootstrap.run({ email: adminEmail, printLink: true, operator: OPERATOR });
  expect(second).toMatchObject({ outcome: "PENDING", cancelledPrevious: true });
  const activationToken = keepToken("token de ativação de ADMIN", tokenFromLink("link" in second ? second.link : undefined));
  const activation = await api(t).post("/api/admin-activation", { token: activationToken, password: adminPassword });
  expect(activation.status).toBe(200);
  expect((await bootstrap.run({ email: uniqueEmail("outro-admin"), printLink: false, operator: OPERATOR })).outcome).toBe(
    "REFUSED",
  );
  const admin = await login(adminEmail, adminPassword);
  const adminClient = api(t, { cookie: admin });

  // US1 — e-mail verification of an unverified account (public signup is gone, 003 FR-048).
  const studentEmail = uniqueEmail("aluno");
  const studentPassword = keep("senha do aluno", "senha-do-aluno-da-jornada");
  await createUser(t, { name: "Aluna da Jornada", email: studentEmail, password: studentPassword, verified: false });
  const verifyToken = keepToken("token de verificação", await requestVerificationToken(t, studentEmail));
  expect((await api(t).post("/api/auth/verify-email", { token: verifyToken })).status).toBe(200);

  // US2 — login, own sessions, logout, logout-all.
  const studentA = await login(studentEmail, studentPassword);
  const studentB = await login(studentEmail, studentPassword);
  const studentClient = api(t, { cookie: studentA });
  expect((await studentClient.get("/api/me")).status).toBe(200);
  const sessions = (await studentClient.get("/api/me/sessions")).body.items as { id: string; current: boolean }[];
  const other = sessions.find((s) => !s.current)!;
  expect((await studentClient.delete(`/api/me/sessions/${other.id}`)).status).toBe(204);
  expect((await api(t, { cookie: studentB }).get("/api/me")).status).toBe(401);
  expect((await studentClient.post("/api/auth/logout")).status).toBe(204);
  const studentC = await login(studentEmail, studentPassword);
  expect((await api(t, { cookie: studentC }).post("/api/auth/logout-all")).status).toBe(204);
  const student = await t.prisma.user.findUniqueOrThrow({ where: { email: studentEmail } });

  // US4 — manager invitations: self-invite, resend, accept, revoke.
  expect(
    (await adminClient.post("/api/manager-invitations", { email: adminEmail, displayName: "Eu mesmo" })).body.code,
  ).toBe("SELF_INVITE_FORBIDDEN");
  const managerEmail = uniqueEmail("gestora");
  const managerPassword = keep("senha da MANAGER", "senha-da-gestora-da-jornada");
  const managerInvite = await adminClient.post("/api/manager-invitations", { email: managerEmail, displayName: "Gestora" });
  expect(managerInvite.status).toBe(201);
  expect((await adminClient.post(`/api/manager-invitations/${managerInvite.body.id}/resend`)).status).toBe(200);
  await t.flushMail();
  for (const mail of t.mailer.messagesFor(managerEmail)) keepToken("token de convite", tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0]));
  const managerToken = t.mailer.lastTokenFor(managerEmail, "invitation-manager")!;
  expect((await api(t).post("/api/invitations/accept", { token: managerToken, password: managerPassword })).status).toBe(200);
  const revoked = await adminClient.post("/api/manager-invitations", { email: uniqueEmail("revogada"), displayName: "Revogada" });
  expect((await adminClient.post(`/api/manager-invitations/${revoked.body.id}/revoke`)).status).toBe(200);

  // US5/US6 — teacher invitations: new account, SIGN_IN_REQUIRED refusal, claim of an unverified account.
  const manager = await login(managerEmail, managerPassword);
  const managerClient = api(t, { cookie: manager });
  const inviteTeacher = async (email: string) => {
    const res = await managerClient.post("/api/teacher-invitations", { email, displayName: "Docente" });
    expect(res.status, `convite de professor para ${email}`).toBe(201);
    await t.flushMail();
    return keepToken("token de convite", t.mailer.lastTokenFor(email, "invitation-teacher"));
  };
  const teacherEmail = uniqueEmail("docente");
  const teacherPassword = keep("senha do professor", "senha-do-docente-da-jornada");
  const teacherToken = await inviteTeacher(teacherEmail);
  expect((await api(t).post("/api/invitations/accept", { token: teacherToken, password: teacherPassword })).status).toBe(200);

  const refusedToken = await inviteTeacher(studentEmail);
  expect((await api(t).post("/api/invitations/accept", { token: refusedToken })).body.code).toBe("SIGN_IN_REQUIRED");

  const unverified = await createUser(t, { verified: false });
  await keepLoginAs(unverified);
  const claimPassword = keep("senha do aceite com posse", "senha-nova-do-aceite-com-posse");
  const claimToken = await inviteTeacher(unverified.email);
  expect((await api(t).post("/api/invitations/accept", { token: claimToken, password: claimPassword })).body.mode).toBe(
    "CLAIM_ACCOUNT",
  );

  // 003/US1 — classes: create, edit, inactivate, archive (before the teacher is deactivated below).
  // 003/US2 — while the class is active, students are invited by e-mail.
  // 003/US3 — the first one accepts by creating an account; the second is refused once the
  // class is inactive, and archiving then cancels it.
  const teacherClient = api(t, { cookie: await login(teacherEmail, teacherPassword) });
  const created = await teacherClient.post("/api/classes", { name: "Turma da Jornada", code: "JOR-1", academicYear: 2026 });
  expect(created.status).toBe(201);
  const classId = created.body.id as string;
  expect((await teacherClient.patch(`/api/classes/${classId}`, { period: "1º semestre" })).status).toBe(200);
  // 004/US1 — the teacher creates, renames and deactivates a subject, and links the class to it.
  const subject = await teacherClient.post("/api/subjects", { name: text("nome da disciplina", "Disciplina da Jornada Quatro") });
  expect(subject.status).toBe(201);
  const subjectId = subject.body.id as string;
  const offering = { subjectId, startsOn: "2026-02-02", endsOn: "2026-06-30" };
  expect((await teacherClient.patch(`/api/classes/${classId}`, offering)).body.plannable).toBe(true);
  expect((await teacherClient.patch(`/api/subjects/${subjectId}`, { description: text("descrição da disciplina", "Descrição da disciplina da jornada") })).status).toBe(200);
  // 004/US2 — syllabus upload and processing: one readable PDF, and an unreadable file stored
  // directly (the upload inspection would refuse it) so that processing fails for good.
  const syllabus = await teacherClient.upload(`/api/subjects/${subjectId}/syllabus-documents`, {
    bytes: syllabusFixture("poo.pdf"),
    filename: text("nome do arquivo", "ementa-jornada-004.pdf"),
    contentType: "application/pdf",
  });
  expect(syllabus.status).toBe(201);
  const unreadable = await createSyllabusDocument(t, subjectId, { fixture: "corrompido.pdf" });
  expect(await t.get(SyllabusProcessingWorker).runOnce()).toBe(2);
  expect((await teacherClient.get(`/api/syllabus-documents/${syllabus.body.document.id}`)).body.processingStatus).toBe(
    "PROCESSED",
  );
  expect((await t.prisma.syllabusDocument.findUniqueOrThrow({ where: { id: unreadable.id } })).processingStatus).toBe(
    "FAILED",
  );
  // 004/US3 — the teacher reviews the extracted content, fixes an item and confirms it.
  const draft = await teacherClient.post(`/api/syllabus-documents/${syllabus.body.document.id}/revisions`, {
    source: "EXTRACTION",
  });
  expect(draft.status).toBe(201);
  const groups = (draft.body.groups as { title: string | null; items: { id: string; text: string }[] }[]).map((group) => ({
    title: group.title,
    items: group.items.map((item) => ({ id: item.id, text: item.text })),
  }));
  groups[0]!.items[0]!.text = "Classes, objetos e métodos";
  const reviewed = await teacherClient.put(`/api/syllabus-revisions/${draft.body.id}`, {
    title: draft.body.title,
    syllabusText: draft.body.syllabusText,
    competencyText: draft.body.competencyText,
    groups,
  });
  expect(reviewed.status).toBe(200);
  const confirmed = await teacherClient.post(`/api/syllabus-revisions/${draft.body.id}/confirm`, {});
  expect(confirmed.body.status).toBe("CONFIRMED");
  // 010/US1 — a manual set of three exercises, one on a topic of the confirmed syllabus, and a
  // single one: `exercise.created` per exercise, never with their texts (contracts/audit-events.md).
  const topicItemId = confirmed.body.groups[0].items[0].id as string;
  const exerciseCommon = { explanation: text("explicação do exercício", "Explicação do exercício da jornada"), difficulty: "BASIC", cognitiveObjective: "APPLY" };
  const exerciseSet = await teacherClient.post("/api/exercises/sets", {
    status: "APPROVED",
    exercises: [
      { type: "OPEN_ANSWER", statement: text("enunciado", "Enunciado da jornada dez"), ...exerciseCommon, syllabusItemId: topicItemId, expectedAnswer: text("resposta esperada", "Resposta esperada da jornada") },
      {
        type: "MULTIPLE_CHOICE",
        statement: "Qual alternativa?",
        ...exerciseCommon,
        alternatives: [
          { text: text("alternativa correta", "Alternativa correta da jornada"), isCorrect: true },
          { text: "Distrator um", isCorrect: false },
          { text: "Distrator dois", isCorrect: false },
        ],
      },
      {
        type: "CODE",
        statement: "Implemente.",
        ...exerciseCommon,
        instructions: "Implemente a classe.",
        expectedSolution: text("solução esperada", "class SolucaoDaJornada {}"),
        languageId: (await t.prisma.programmingLanguage.findUniqueOrThrow({ where: { key: "java" } })).id,
      },
    ],
  });
  expect(exerciseSet.status).toBe(201);
  expect((await teacherClient.post("/api/exercises", { type: "OPEN_ANSWER", statement: "Avulso", ...exerciseCommon, expectedAnswer: "Sim", status: "DRAFT" })).status).toBe(201);
  // 010/US2 — "Criar com IA": a batch of 3, generated by the real exercise-generator on the fake
  // provider and materialized as drafts. Another teacher, so the 006 per-teacher execution limit
  // the flows below rely on is not spent here.
  const generationTeacher = await createUser(t, { roles: ["TEACHER"] });
  const generationClient = api(t, { cookie: await loginAs(t, generationTeacher) });
  const generationTopic = await createConfirmedTopic(t, generationTeacher.id, { languageKey: null });
  const batch = await generationClient.post("/api/exercise-batches", {
    syllabusRevisionId: generationTopic.revision.id,
    syllabusItemId: generationTopic.itemId,
    difficulty: "BASIC",
    total: 3,
    types: ["OPEN_ANSWER"],
    distribution: { mode: "AUTO" },
    trickQuestions: 0,
    idempotencyKey: randomUUID(),
  });
  expect(batch.status).toBe(202);
  scriptGeneration(
    t.provider,
    batch.body.id,
    validGeneratedBatch({ difficulty: "BASIC", counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null }, text("texto gerado pela IA (010)", "MARCADOR-GERADO-010")),
  );
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  expect((await generationClient.get(`/api/exercise-batches/${batch.body.id}`)).body.batch.status).toBe("GENERATED");
  // 007/US1 — "Preencher com IA" on the processed PDF: the real curriculum-agent, on the fake
  // provider, reads the document and proposes its content without touching the syllabus.
  const aiDocumentId = syllabus.body.document.id as string;
  scriptCurriculumRun(t.provider, aiDocumentId, pooOutput());
  const analysis = await teacherClient.post(`/api/syllabus-documents/${aiDocumentId}/ai-analyses`, {});
  expect(analysis.status).toBe(202);
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  expect((await teacherClient.get(`/api/syllabus-documents/${aiDocumentId}/ai`)).body.pendingProposalId).not.toBeNull();
  for (const type of ["ai_execution.requested", "ai_proposal.created"]) {
    const event = await t.prisma.auditEvent.findFirstOrThrow({ where: { type }, orderBy: { id: "desc" } });
    expect(event.metadata, type).toMatchObject({ agentKey: "curriculum-agent" });
  }
  expect(await t.prisma.auditEvent.count({ where: { type: "curriculum_ai.analysis_requested", targetId: aiDocumentId } })).toBe(1);
  // 007/US3 — the teacher accepts the title and the first group: the next revision is an
  // AI_ASSISTED draft, and the confirmed one stays as it was.
  const proposalId = (await teacherClient.get(`/api/syllabus-documents/${aiDocumentId}/ai`)).body.pendingProposalId as string;
  const applied = await teacherClient.post(`/api/syllabus-documents/${aiDocumentId}/ai-proposals/${proposalId}/apply`, {
    acceptedItemIds: ["title", "group:0"],
    replaceDraft: false,
  });
  expect(applied.status).toBe(200);
  expect(applied.body.revision).toMatchObject({ number: 2, status: "DRAFT", source: "AI_ASSISTED", aiProposalId: proposalId });
  expect(applied.body.proposal.status).toBe("PARTIALLY_APPROVED");
  // 007/SC-009 — a golden document carrying MARCADOR-EMENTA-007: an analysis that fails on an
  // invalid output, then one whose proposal (echoing the marker) the teacher rejects. A second
  // teacher, so the 006 per-teacher execution limit the flows below rely on is not spent here.
  content.push({ kind: "texto do documento de referência (007)", value: GOLDEN_MARKER });
  const goldenTeacher = await createUser(t, { roles: ["TEACHER"], name: "Professora do Documento de Referência" });
  const goldenClient = api(t, { cookie: await loginAs(t, goldenTeacher) });
  const { document: golden } = await seedGoldenDocument(t, goldenTeacher.id, "minimo");
  t.provider.script(fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: golden.id }), fakeText(`não é JSON ${GOLDEN_MARKER}`));
  expect((await goldenClient.post(`/api/syllabus-documents/${golden.id}/ai-analyses`, {})).status).toBe(202);
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  const failedAnalysis = (await goldenClient.get(`/api/syllabus-documents/${golden.id}/ai`)).body;
  expect(failedAnalysis.lastExecution).toMatchObject({ status: "FAILED", errorCode: "AI_OUTPUT_PARSE_FAILED" });
  scriptCurriculumRun(t.provider, golden.id, {
    title: "Tópicos de Orientação a Objetos",
    syllabusText: `Encapsulamento e herança. Documento fictício de teste ${GOLDEN_MARKER}.`,
    competencyText: null,
    groups: [{ title: "Conceitos", items: [{ text: "Encapsulamento", sourceRef: null }, { text: "Herança", sourceRef: null }] }],
    warnings: [{ code: "FIELD_NOT_FOUND", field: "competencyText", groupIndex: null }],
    languageKey: null,
  });
  expect((await goldenClient.post(`/api/syllabus-documents/${golden.id}/ai-analyses`, {})).status).toBe(202);
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  const goldenProposalId = (await goldenClient.get(`/api/syllabus-documents/${golden.id}/ai`)).body.pendingProposalId as string;
  const rejected = await goldenClient.post(`/api/ai/proposals/${goldenProposalId}/decision`, { decision: "REJECT" });
  expect(rejected.body.status).toBe("REJECTED");
  // 009/US4-3 — an invalid output escalates once, BASIC → STANDARD (the task allows it): an
  // approved STANDARD entry joins the catalog, the BASIC model answers no JSON, the STANDARD one a
  // valid output. The rejection above never escalates; this invalid output does.
  const standard = await t.prisma.aiModelConfig.create({
    data: {
      key: "anthropic-standard-jornada",
      provider: "fake",
      family: "anthropic",
      tier: "STANDARD",
      mode: "GENERATION",
      lifecycle: "PRODUCTION",
      model: "fake-model-standard-jornada",
      status: "ENABLED",
      maxOutputTokens: 32_000,
      timeoutMs: 60_000,
      definitionHash: "jornada",
      capabilities: { structuredOutput: true, tools: true, vision: true, reasoning: true },
    },
  });
  const extractionTask = await t.prisma.aiTask.findUniqueOrThrow({ where: { key: "curriculum-extraction" } });
  await t.prisma.aiModelTaskApproval.create({
    data: { modelConfigId: standard.id, taskId: extractionTask.id, metrics: (extractionTask.policy as { quality: Record<string, number> }).quality, evaluatedAt: new Date(), evidence: "jornada", valid: true, syncedAt: new Date() },
  });
  const basicModel = (await t.prisma.aiModelConfig.findFirstOrThrow({ where: { tier: "BASIC", family: "anthropic", status: "ENABLED", lifecycle: "PRODUCTION" }, orderBy: { key: "asc" } })).model;
  t.provider.scriptFor(basicModel, fakeToolCall(READ_CURRICULUM_DOCUMENT, { documentId: golden.id }), fakeText("não é JSON"));
  t.provider.scriptFor(standard.model, fakeOutput(pooOutput()));
  const escalatedAnalysis = await goldenClient.post(`/api/syllabus-documents/${golden.id}/ai-analyses`, {});
  expect(escalatedAnalysis.status).toBe(202);
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  t.provider.scriptFor(basicModel);
  t.provider.scriptFor(standard.model);
  expect(await t.prisma.aiExecution.findUniqueOrThrow({ where: { id: escalatedAnalysis.body.execution.id } })).toMatchObject({ escalationUsed: true, escalationToTier: "STANDARD" });
  // 004/US4 — the teacher marks two class days, then unmarks one whose topic is archived there.
  const meetingsPath = `/api/classes/${classId}/meetings`;
  const calendar = await teacherClient.put(meetingsPath, {
    planRevision: null,
    add: ["2026-03-04", "2026-03-11"],
    remove: [],
    resolutions: [],
  });
  expect(calendar.body.total).toBe(2);
  // 004/US5 — the class uses the confirmed syllabus, and a topic is planned on the second day.
  const plan = await teacherClient.put(`/api/classes/${classId}/plan/syllabus`, {
    planRevision: null,
    revisionId: draft.body.id,
  });
  expect(plan.status).toBe(200);
  const planned = await teacherClient.post(`/api/classes/${classId}/plan/topics`, {
    planRevision: plan.body.revision,
    title: text("título de tópico", "Tópico da jornada: classes"),
    meetingId: calendar.body.items[1].id,
    itemIds: [reviewed.body.groups[0].items[0].id],
  });
  expect(planned.status).toBe(201);
  const unmarked = await teacherClient.put(meetingsPath, {
    planRevision: planned.body.revision,
    add: [],
    remove: ["2026-03-11"],
    resolutions: [{ topicId: planned.body.topics[0].id, action: "ARCHIVE" }],
  });
  expect(unmarked.body.total).toBe(1);
  // 004/US6 — the teacher edits, merges, splits, archives, restores and reorders topics.
  let planRevision = unmarked.body.planRevision as number;
  const planWrite = async (method: "post" | "patch" | "put", path: string, body: object = {}) => {
    const res = await teacherClient[method](`/api/classes/${classId}/plan${path}`, { planRevision, ...body });
    expect(res.status, `${method} ${path}`).toBeLessThan(300);
    planRevision = res.body.revision;
    return res.body as { topics: { id: string; title: string }[] };
  };
  const topic = (title: string) => ({ title: text("título de tópico", title), itemIds: [] });
  const inheritance = (await planWrite("post", "/topics", topic("Tópico da jornada: herança"))).topics.at(-1)!;
  const modifiers = (await planWrite("post", "/topics", topic("Tópico da jornada: modificadores"))).topics.at(-1)!;
  await planWrite("patch", `/topics/${inheritance.id}`, {
    description: text("descrição de tópico", "Descrição revisada do tópico da jornada"),
  });
  await planWrite("post", "/topics/merge", {
    topicIds: [inheritance.id, modifiers.id],
    ...topic("Tópico da jornada: herança e modificadores"),
  });
  const split = await planWrite("post", `/topics/${inheritance.id}/split`, {
    parts: [topic("Tópico da jornada: herança, parte 1"), topic("Tópico da jornada: herança, parte 2")],
  });
  await planWrite("post", `/topics/${inheritance.id}/archive`);
  await planWrite("post", `/topics/${inheritance.id}/restore`);
  // 004/US7 — the teacher confirms the plan.
  await planWrite("post", "/status", { action: "CONFIRM" });
  await planWrite("put", "/topic-order", {
    items: [...split.topics].reverse().map((topic) => ({ topicId: topic.id, meetingId: null })),
  });
  // 004/US9 — the teacher starts the plan, completes the class of a topic and reopens it.
  const [taught, ...rest] = [...split.topics].reverse();
  await planWrite("post", "/status", { action: "START" });
  await planWrite("put", "/topic-order", {
    items: [
      { topicId: taught!.id, meetingId: unmarked.body.items[0].id as string },
      ...rest.map((other) => ({ topicId: other.id, meetingId: null })),
    ],
  });
  await planWrite("post", `/topics/${taught!.id}/complete`);
  await planWrite("post", `/topics/${taught!.id}/reopen`);
  expect((await teacherClient.post(`/api/subjects/${subjectId}/status`, { status: "INACTIVE" })).status).toBe(200);
  const inviteToClass = async (email: string) => {
    expect((await teacherClient.post(`/api/classes/${classId}/invitations`, { email })).status).toBe(201);
    await t.flushMail();
    return keepToken("token de convite de turma", t.mailer.lastTokenFor(email, "class-invitation"));
  };
  const classToken = await inviteToClass("aluno-convidado-jornada@example.test");
  const classStudentPassword = keep("senha do aluno convidado", "aluno-convidado-da-jornada");
  const classAccepted = await api(t).post("/api/class-invitations/accept", {
    token: classToken,
    name: "Aluno Convidado",
    ra: "JOR-0001",
    password: classStudentPassword,
  });
  expect(classAccepted.status).toBe(200);
  // 006/US1, US3 — AI executions: one completed after a tool call, one failed on an invalid output,
  // one failed on a tool outside the allowlist, one cancelled in the queue, one cancelled while
  // running, and the rate limit. The input, the instructions, the
  // model's output and the provider's credential are content/secrets the scans look for.
  secrets.push({ kind: "credencial do provedor de IA", value: FAKE_PROVIDER_CREDENTIAL });
  // 008/US4-1: the OpenRouter key in the configuration (the provider stays the simulated one).
  if (t.config.ai.openrouter.apiKey) secrets.push({ kind: "chave do OpenRouter", value: t.config.ai.openrouter.apiKey });
  content.push({ kind: "instruções do agente de IA", value: INSTRUCTIONS_MARKER });
  const aiOutput = text("saída do modelo", "MARCADOR-SAIDA-006");
  const aiInput = { text: text("entrada da execução de IA", "MARCADOR-ENTRADA-006") };
  const aiResource = { type: "SUBJECT", id: subjectId };
  const requestAi = (extra: object = {}) =>
    teacherClient.post("/api/ai/executions", { agentKey: "reference-l1", resource: aiResource, input: aiInput, idempotencyKey: crypto.randomUUID(), ...extra });
  const aiWorker = t.get(AiExecutionWorker);
  const aiDone = await requestAi();
  expect(aiDone.status).toBe(202);
  // 008/US3 — the primary is down and each logical call goes to the fallback. The reference tasks
  // have no fallback, so the route fixed on the execution gets one before it runs.
  const fallbackConfig = await t.prisma.aiModelConfig.findUniqueOrThrow({ where: { key: "fake-alt" }, select: { id: true } });
  await t.prisma.aiExecution.update({ where: { id: aiDone.body.id }, data: { fallbackModelConfigId: fallbackConfig.id } });
  const gateway = t.get(ModelGateway);
  const timing = gateway.timing;
  gateway.timing = { sleep: async () => {}, random: () => 0 };
  t.provider.scriptFor("fake-model-1", fakeError("UNAVAILABLE"));
  t.provider.scriptFor("fake-model-2", fakeToolCall("reference.read-subject", { subjectId }), fakeOutput({ summary: aiOutput }));
  // 009/US8 — a tiny daily budget: this execution's calls cross it (the app reads the budgets on each check).
  const budgets = t.config.ai.budgets;
  t.config.ai.budgets = { ...budgets, daily: "0.000001" };
  expect(await aiWorker.runOnce()).toBe(1);
  t.config.ai.budgets = budgets;
  t.provider.scriptFor("fake-model-1");
  t.provider.scriptFor("fake-model-2");
  gateway.timing = timing;
  expect((await teacherClient.get(`/api/ai/executions/${aiDone.body.id}`)).body.status).toBe("COMPLETED");
  // 008/US6 — failures in a row open a config's circuit; past the wait, a successful probe closes it.
  const circuit = t.get(CircuitBreaker);
  const altConfig = { key: "fake-alt", provider: "fake", model: "fake-model-2" };
  for (let i = 0; i < t.config.ai.circuit.failureThreshold; i += 1) await circuit.recordTransientFailure(altConfig);
  expect(circuit.state("fake-alt")).toBe("OPEN");
  const clock = circuit.now;
  circuit.now = () => clock() + t.config.ai.circuit.openSeconds * 1000;
  expect(circuit.allow("fake-alt")).toBe("PROBE");
  await circuit.recordSuccess(altConfig);
  circuit.now = clock;
  expect(circuit.state("fake-alt")).toBe("CLOSED");
  t.provider.script(fakeText(`não é JSON ${aiOutput}`));
  expect((await requestAi()).status).toBe(202);
  expect(await aiWorker.runOnce()).toBe(1);
  t.provider.script(fakeToolCall("reference.slow", { subjectId }));
  expect((await requestAi()).status).toBe(202);
  expect(await aiWorker.runOnce()).toBe(1);
  const aiQueued = await requestAi();
  expect((await teacherClient.post(`/api/ai/executions/${aiQueued.body.id}/cancel`)).body.status).toBe("CANCELLED");
  t.provider.script(fakeDelay(2_000, fakeOutput({ summary: aiOutput })));
  const aiRunning = await requestAi();
  const aiSeen = t.provider.requests.length;
  const aiCycle = aiWorker.runOnce();
  for (let i = 0; i < 100 && t.provider.requests.length <= aiSeen; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
  expect((await teacherClient.post(`/api/ai/executions/${aiRunning.body.id}/cancel`)).body.cancelRequested).toBe(true);
  await aiCycle;
  // 006/US5 — proposals of the L2 agent: approved, partially approved, rejected and one expired
  // by a worker cycle past its validity. The items carry the model's output marker.
  const proposeAi = async () => {
    t.provider.script(fakeOutput({ items: [{ id: "i1", label: aiOutput }, { id: "i2", label: "Item 2" }] }));
    const res = await requestAi({ agentKey: "reference-l2", input: {} });
    expect(res.status).toBe(202);
    expect(await aiWorker.runOnce()).toBe(1);
    return (await teacherClient.get(`/api/ai/executions/${res.body.id}`)).body.proposalId as string;
  };
  for (const body of [{ decision: "APPROVE" }, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["i1"] }, { decision: "REJECT" }]) {
    expect((await teacherClient.post(`/api/ai/proposals/${await proposeAi()}/decision`, body)).status).toBe(200);
  }
  await proposeAi();
  await aiWorker.runOnce(new Date(Date.now() + (t.config.ai.proposalTtlDays + 1) * 86_400_000));
  // 006/US7 — the administrator turns an agent and a model config off and on again.
  for (const [path, off, on] of [
    ["/api/ai/operations/agents/reference-l1/status", "DISABLED", "ACTIVE"],
    ["/api/ai/operations/model-configs/fake-alt/status", "DISABLED", "ENABLED"],
  ] as const) {
    expect((await adminClient.post(path, { status: off })).status).toBe(200);
    expect((await adminClient.post(path, { status: on })).status).toBe(200);
  }
  // 009/US7 — the administrator fixes an approved model for a task, then removes the override.
  expect((await adminClient.put("/api/ai/operations/tasks/reference-alt/override", { modelConfigKey: "fake-alt" })).status).toBe(200);
  expect((await adminClient.delete("/api/ai/operations/tasks/reference-alt/override")).status).toBe(200);
  // 008/US2 — a deploy with another model: the registry sync audits the change of the config;
  // 009 — and of its lifecycle (a promotion in code).
  await t.prisma.aiModelConfig.update({
    where: { key: "fake-alt" },
    data: { model: "fake-model-anterior", lifecycle: "EVALUATING", definitionHash: "deploy-anterior" },
  });
  await t.get(AiRegistrySync).sync();
  for (let i = 0; i < t.config.rateLimit.aiExecutionsPerMinute; i += 1) {
    if ((await requestAi()).status === 429) break;
  }

  // 003/US7 — the new student sees the class in "Minhas turmas".
  const myClasses = await api(t, { cookie: keepCookie(classAccepted) }).get("/api/me/classes");
  expect(myClasses.body.items.map((c: { id: string }) => c.id)).toEqual([classId]);
  // 003/US6 — the teacher lists the class's students and removes the one who joined.
  const students = await teacherClient.get(`/api/classes/${classId}/enrollments?query=Aluno`);
  expect(students.body.items).toHaveLength(1);
  const enrollmentId = students.body.items[0].id as string;
  expect((await teacherClient.post(`/api/classes/${classId}/enrollments/${enrollmentId}/remove`, {})).status).toBe(200);
  const lateToken = await inviteToClass("aluno-atrasado-jornada@example.test");
  // 003/US5 — the teacher lists, resends and cancels an invitation.
  const resentEmail = "aluno-reenvio-jornada@example.test";
  const resentId = (await teacherClient.post(`/api/classes/${classId}/invitations`, { email: resentEmail })).body.id as string;
  await t.flushMail();
  keepToken("token de convite de turma", t.mailer.lastTokenFor(resentEmail, "class-invitation"));
  expect((await teacherClient.get(`/api/classes/${classId}/invitations?query=reenvio`)).body.items).toHaveLength(1);
  expect((await teacherClient.post(`/api/classes/${classId}/invitations/${resentId}/resend`, {})).status).toBe(200);
  await t.flushMail();
  keepToken("token de convite de turma reenviado", t.mailer.lastTokenFor(resentEmail, "class-invitation"));
  expect((await teacherClient.post(`/api/classes/${classId}/invitations/${resentId}/cancel`, {})).status).toBe(200);
  expect((await teacherClient.post(`/api/classes/${classId}/status`, { status: "INACTIVE" })).status).toBe(200);
  expect((await api(t).post("/api/class-invitations/preview", { token: lateToken })).status).toBe(400);
  const refused = await api(t).post("/api/class-invitations/accept", {
    token: lateToken,
    name: "Aluno Atrasado",
    ra: "JOR-0002",
    password: classStudentPassword,
  });
  expect(refused.body.code).toBe("TOKEN_INVALID");
  expect((await teacherClient.post(`/api/classes/${classId}/status`, { status: "ARCHIVED" })).status).toBe(200);

  // US5 — teacher lifecycle; US4/FR-052 — account suspension and reactivation.
  const teacher = await t.prisma.user.findUniqueOrThrow({ where: { email: teacherEmail } });
  expect((await managerClient.post(`/api/teachers/${teacher.id}/deactivate`)).status).toBe(200);
  await keepLoginAs(student);
  expect((await adminClient.post(`/api/users/${student.id}/suspend`)).status).toBe(200);
  expect((await adminClient.post(`/api/users/${student.id}/reactivate`)).status).toBe(200);

  // US8 — password reset.
  expect((await api(t).post("/api/auth/password-reset/request", { email: studentEmail })).status).toBe(202);
  await t.flushMail();
  const resetToken = keepToken("token de recuperação", t.mailer.lastTokenFor(studentEmail, "password-reset"));
  const resetPassword = keep("senha redefinida", "senha-redefinida-da-jornada");
  expect(
    (await api(t).post("/api/auth/password-reset/confirm", { token: resetToken, password: resetPassword })).status,
  ).toBe(200);

  // FR-022 — rate limit: e-mail+origin block, then the cross-origin alert (10 origins).
  const wrong = "senha-errada-da-jornada";
  for (let i = 0; i < 6; i += 1) {
    await api(t).post("/api/auth/login", { email: teacherEmail, password: wrong }).set("X-Forwarded-For", "203.0.113.50");
  }
  for (let i = 0; i < 10; i += 1) {
    await api(t)
      .post("/api/auth/login", { email: managerEmail, password: wrong })
      .set("X-Forwarded-For", `198.51.100.${i + 1}`);
  }

  // FR-054 — two ADMINs suspending each other at once: one refusal, audited.
  const secondAdmin = await createUser(t, { roles: ["ADMIN"], name: "Segunda Admin" });
  const secondAdminCookie = await keepLoginAs(secondAdmin);
  const adminUser = await t.prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const race = await Promise.all([
    adminClient.post(`/api/users/${secondAdmin.id}/suspend`),
    api(t, { cookie: secondAdminCookie }).post(`/api/users/${adminUser.id}/suspend`),
  ]);
  expect(race.map((r) => r.status).sort()).toEqual([200, 409]);

  // FR-017, FR-076, FR-077 — retention jobs.
  await createUser(t, { verified: false, createdAt: new Date(Date.now() - (UNVERIFIED_ACCOUNT_TTL_DAYS + 1) * DAY_MS) });
  await t.prisma.$executeRaw`
    INSERT INTO access_records (user_id, ip, occurred_at)
    VALUES (${student.id}::uuid, '203.0.113.99'::inet, ${new Date(Date.now() - 200 * DAY_MS)}::timestamptz)`;
  await t.prisma.$executeRaw`
    INSERT INTO audit_events (occurred_at, type, actor_type, metadata)
    VALUES (${new Date(Date.now() - 6 * 365 * DAY_MS)}::timestamptz, 'auth.signup', 'ANONYMOUS', '{}'::jsonb)`;
  expect((await t.get(MaintenanceService).run()).status).toBe("completed");

  await t.flushMail();
  return { secrets, content };
}
