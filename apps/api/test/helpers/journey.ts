import { randomUUID } from "node:crypto";
import type { TeacherExam, WorkTeacherView } from "@repo/contracts";
import { expect } from "vitest";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { UNVERIFIED_ACCOUNT_TTL_DAYS } from "../../src/modules/retention/unverified-accounts.job";
import { hashToken } from "../../src/platform/crypto/tokens";
import { SyllabusProcessingWorker } from "../../src/modules/syllabus/syllabus-processing.worker";
import { AiExecutionWorker } from "../../src/modules/ai/execution/ai-execution.worker";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { AiRegistrySync } from "../../src/modules/ai/registry/ai-registry.sync";
import { CircuitBreaker } from "../../src/modules/ai/gateway/circuit-breaker";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import { fakeDelay, fakeError, fakeOutput, fakeText, fakeToolCall, FAKE_PROVIDER_CREDENTIAL } from "../fixtures/ai/fake-model-provider";
import { INSTRUCTIONS_MARKER } from "../fixtures/ai/reference-agents";
import { type AiTestApp, drain } from "./ai";
import { pooOutput, scriptCurriculumRun, seedGoldenDocument } from "./curriculum-ai";
import { GOLDEN_MARKER } from "../fixtures/curriculum-agent/build-golden";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { scriptGeneration } from "./exercise-ai";
import { validGeneratedWork } from "../fixtures/work-generation/valid-work";
import { scriptWorkGeneration } from "./work-ai";
import { scriptExamGeneration } from "./exam-ai";
import { validGeneratedExam } from "../fixtures/exam-generator/valid-exam";
import { toUpdateBody } from "./works";
import { toExamUpdateBody } from "./exams";
import { createConfirmedTopic } from "./exercises";
import { READ_CURRICULUM_DOCUMENT } from "../../src/modules/curriculum-ai/proposal/build-proposal";
import { READ_WORK_HELP_REQUEST } from "../../src/modules/work-help/definitions/request-content";
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
import { postNotice, signedResendNotice } from "./mail-notices";
import { api } from "./test-app";

const DAY_MS = 24 * 3600 * 1000;

/** The OpenRouter key the scans look for (008/SC-005); never a real credential. */
export const OPENROUTER_MARKER_KEY = "sk-or-teste-008-CHAVE-FALSA";
/** An SMTP_URL whose password the scans look for (017/SC-007); the journey's mailer stays in memory. */
export const SMTP_MARKER_PASSWORD = "MARCADOR-SENHA-SMTP-017";
export const SMTP_MARKER_URL = `smtp://jornada:${SMTP_MARKER_PASSWORD}@127.0.0.1:1025`;
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
 * `createWorkHelpApp` and was reset with `resetAiDb` (which emits `ai_registry.synced`): the 006
 * flows run the reference agents, the 007 flows the curriculum agent, the 010 ones the exercise
 * generator, the 011 ones the work generator and the 015 ones the AI help, all on the fake provider.
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
  const generationTopic = await createConfirmedTopic(t, generationTeacher.id, {
    languageKey: null,
    // The topic the generator reads (as untrusted tool output): syllabus text, never in logs, audit or operations.
    items: [text("tópico lido pelo gerador (010)", "MARCADOR-TOPICO-010 Herança e polimorfismo"), "Interfaces"],
  });
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
  const generatedBatch = await generationClient.get(`/api/exercise-batches/${batch.body.id}`);
  expect(generatedBatch.body.batch.status).toBe("GENERATED");
  // 010/US4 — the review: one draft edited then approved, one approved as it is, one discarded;
  // the last one closes the generator's proposal (APPROVED_PARTIALLY). Never the texts in audit.
  const [editedDraft, keptDraft, discardedDraft] = generatedBatch.body.exercises as {
    id: string;
    version: number;
    explanation: string;
    difficulty: string;
    cognitiveObjective: string;
    topic: { syllabusItemId: string };
    expectedAnswer: string;
  }[];
  const edited = await generationClient.put(`/api/exercises/${editedDraft!.id}`, {
    type: "OPEN_ANSWER",
    statement: text("enunciado revisado (010)", "Enunciado revisado pelo professor na jornada"),
    explanation: editedDraft!.explanation,
    difficulty: editedDraft!.difficulty,
    cognitiveObjective: editedDraft!.cognitiveObjective,
    syllabusItemId: editedDraft!.topic.syllabusItemId,
    expectedAnswer: editedDraft!.expectedAnswer,
    version: editedDraft!.version,
  });
  expect(edited.status).toBe(200);
  expect((await generationClient.post(`/api/exercises/${editedDraft!.id}/approve`, { version: edited.body.version })).status).toBe(200);
  expect((await generationClient.post(`/api/exercise-batches/${batch.body.id}/approve`, { exerciseIds: [keptDraft!.id] })).status).toBe(200);
  expect((await generationClient.delete(`/api/exercises/${discardedDraft!.id}`, { version: discardedDraft!.version })).status).toBe(204);
  // 010/US5 — the bank: a search without accents finds the manual exercise; one approved exercise
  // is archived (out of the default query) and restored.
  const found = await teacherClient.get("/api/exercises?query=jornada%20dez&pageSize=10");
  expect(found.body.items).toHaveLength(1);
  const archivedExercise = await teacherClient.post(`/api/exercises/${found.body.items[0].id}/archive`, { version: found.body.items[0].version });
  expect(archivedExercise.body.status).toBe("ARCHIVED");
  const restoredExercise = await teacherClient.post(`/api/exercises/${found.body.items[0].id}/restore`, { version: archivedExercise.body.version });
  expect(restoredExercise.body.status).toBe("APPROVED");
  // 011/US1 — a manual work saved and approved: `work.created` and `work.approved`, with ids,
  // counts and enums only, never the title, statements or answer keys (contracts/audit-events.md).
  const work = await teacherClient.post("/api/works", {
    subjectId,
    title: text("título do trabalho (011)", "Trabalho manual da jornada onze"),
    description: text("descrição do trabalho (011)", "Descrição do trabalho da jornada"),
    totalGrade: "10",
    topics: { syllabusRevisionId: confirmed.body.id, syllabusItemIds: [topicItemId] },
    status: "APPROVED",
    questions: [
      {
        type: "OPEN_ANSWER",
        statement: text("enunciado do trabalho (011)", "Enunciado do trabalho da jornada onze"),
        topicItemIds: [topicItemId],
        expectedAnswer: text("resposta esperada do trabalho (011)", "Resposta esperada do trabalho da jornada"),
        rubric: text("rubrica do trabalho (011)", "Rubrica do trabalho da jornada onze"),
        explanation: text("explicação do trabalho (011)", "Explicação do trabalho da jornada onze"),
      },
      {
        type: "MULTIPLE_CHOICE",
        statement: "Qual alternativa do trabalho?",
        alternatives: [
          { text: text("alternativa correta do trabalho (011)", "Alternativa correta do trabalho da jornada"), isCorrect: true },
          { text: "Distrator do trabalho um", isCorrect: false },
          { text: "Distrator do trabalho dois", isCorrect: false },
        ],
      },
      {
        type: "CODE",
        statement: "Implemente o trabalho.",
        expectedSolution: text("solução esperada do trabalho (011)", "class SolucaoDoTrabalhoDaJornada {}"),
        languageId: (await t.prisma.programmingLanguage.findUniqueOrThrow({ where: { key: "java" } })).id,
        testCases: [{ input: "1", expectedOutput: text("saída de caso de teste (011)", "SAIDA-CASO-DE-TESTE-011"), visibility: "PRIVATE" }],
      },
    ],
  });
  expect(work.status).toBe(201);
  // 011/US3 — "Criar trabalho com IA": a request of 2 open answers on one topic, generated by the
  // real work-generator on the fake provider and materialized as a DRAFT work. Its own teacher, so
  // no other flow's execution limit is spent here.
  const workGenerationTeacher = await createUser(t, { roles: ["TEACHER"] });
  const workGenerationClient = api(t, { cookie: await loginAs(t, workGenerationTeacher) });
  const workGenerationTopic = await createConfirmedTopic(t, workGenerationTeacher.id, {
    languageKey: null,
    items: [text("tópico lido pelo gerador de trabalhos (011)", "MARCADOR-TOPICO-011 Herança"), "Interfaces"],
  });
  const workRequest = await workGenerationClient.post("/api/work-generation-requests", {
    subjectId: workGenerationTopic.subject.id,
    syllabusRevisionId: workGenerationTopic.revision.id,
    syllabusItemIds: [workGenerationTopic.itemId],
    title: text("título do pedido de trabalho (011)", "Trabalho gerado da jornada onze"),
    difficulty: "BASIC",
    totalGrade: "2.00",
    total: 2,
    types: ["OPEN_ANSWER"],
    distribution: { mode: "AUTO" },
    trickQuestions: 0,
    idempotencyKey: randomUUID(),
  });
  expect(workRequest.status).toBe(202);
  scriptWorkGeneration(
    t.provider,
    workRequest.body.id,
    validGeneratedWork(
      { difficulty: "BASIC", counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null, topicCount: 1 },
      text("texto gerado pela IA (011)", "MARCADOR-GERADO-011"),
    ),
  );
  expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  expect((await workGenerationClient.get(`/api/work-generation-requests/${workRequest.body.id}`)).body.status).toBe("GENERATED");
  // 011/US5 — the teacher edits the generated work and approves it: `work.edited`, `work.approved`,
  // and the generator's proposal closes in the same transaction.
  const generatedWorkId = (await workGenerationClient.get(`/api/work-generation-requests/${workRequest.body.id}`)).body.workId as string;
  const generatedWork = (await workGenerationClient.get(`/api/works/${generatedWorkId}`)).body as WorkTeacherView;
  const editedBody = toUpdateBody(generatedWork);
  editedBody.questions[0] = { ...editedBody.questions[0]!, statement: text("enunciado revisado do trabalho (011)", "Enunciado do trabalho revisto pelo professor") };
  const editedWork = await workGenerationClient.put(`/api/works/${generatedWorkId}`, { ...editedBody, title: "Trabalho revisto" });
  expect(editedWork.status).toBe(200);
  const approvedWork = await workGenerationClient.post(`/api/works/${generatedWorkId}/approve`, { version: editedWork.body.version });
  expect(approvedWork.status).toBe(200);
  // 011/US7 — the bank lists it; archived, then restored: `work.archived` and `work.restored`.
  expect((await workGenerationClient.get("/api/works?query=revisto")).body.items).toHaveLength(1);
  const archivedWork = await workGenerationClient.post(`/api/works/${generatedWorkId}/archive`, { version: approvedWork.body.version });
  expect(archivedWork.status).toBe(200);
  expect((await workGenerationClient.post(`/api/works/${generatedWorkId}/restore`, { version: archivedWork.body.version })).status).toBe(200);
  // 018/US1 — the Banco de Provas: a manual exam saved as a draft, edited, approved, archived and
  // restored: `exam.created`, `exam.edited`, `exam.approved`, `exam.archived`, `exam.restored`, with
  // ids, counts and enums only, never the title, statements or answer keys.
  const examDraft = await teacherClient.post("/api/exams", {
    subjectId,
    syllabusRevisionId: confirmed.body.id,
    title: text("título da prova (018)", "Prova manual da jornada dezoito"),
    totalGrade: "10.00",
    saveAs: "DRAFT",
    topicIds: [topicItemId],
    questions: [
      {
        type: "OPEN_ANSWER",
        statement: text("enunciado da prova (018)", "Enunciado da prova da jornada dezoito"),
        expectedAnswer: text("resposta esperada da prova (018)", "Resposta esperada da prova da jornada"),
        difficulty: "BASIC",
        topicIds: [topicItemId],
      },
      {
        type: "MULTIPLE_CHOICE",
        statement: "Qual alternativa da prova?",
        alternatives: [
          { text: text("alternativa correta da prova (018)", "Alternativa correta da prova da jornada"), isCorrect: true },
          { text: "Distrator da prova um", isCorrect: false },
          { text: "Distrator da prova dois", isCorrect: false },
        ],
        topicIds: [topicItemId],
      },
    ],
  });
  expect(examDraft.status).toBe(201);
  const examEdit = toExamUpdateBody(examDraft.body as TeacherExam);
  examEdit.questions[1] = { ...examEdit.questions[1]!, difficulty: "ADVANCED" };
  const editedExam = await teacherClient.put(`/api/exams/${examDraft.body.id}`, examEdit);
  expect(editedExam.status).toBe(200);
  const approvedExam = await teacherClient.post(`/api/exams/${examDraft.body.id}/approve`, { version: editedExam.body.version });
  expect(approvedExam.status).toBe(200);
  const archivedExam = await teacherClient.post(`/api/exams/${examDraft.body.id}/archive`, { version: approvedExam.body.version });
  expect(archivedExam.status).toBe(200);
  expect((await teacherClient.post(`/api/exams/${examDraft.body.id}/restore`, { version: archivedExam.body.version })).status).toBe(200);
  // 018/US7 — "Criar prova com IA" by its own teacher: one generation becomes a DRAFT exam
  // (`exam_generation.requested`, `exam_generation.completed`); another answers a question outside the
  // chosen topic and is refused with nothing saved (`exam_generation.rejected` with the code only).
  const examGenerationTeacher = await createUser(t, { roles: ["TEACHER"] });
  const examGenerationClient = api(t, { cookie: await loginAs(t, examGenerationTeacher) });
  const examGenerationTopic = await createConfirmedTopic(t, examGenerationTeacher.id, {
    languageKey: null,
    items: [text("tópico lido pelo gerador de provas (018)", "MARCADOR-TOPICO-018 Herança"), "Interfaces"],
  });
  const examGenerationBody = () => ({
    subjectId: examGenerationTopic.subject.id,
    syllabusRevisionId: examGenerationTopic.revision.id,
    topicIds: [examGenerationTopic.itemId],
    title: text("título do pedido de prova (018)", "Prova gerada da jornada dezoito"),
    difficulty: "BASIC",
    totalGrade: "2.00",
    quantity: 2,
    distribution: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 0 },
    trickCount: 0,
    idempotencyKey: randomUUID(),
  });
  const generatedExamOutput = validGeneratedExam(
    { difficulty: "BASIC", counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 0, CODE: 0 }, trickCount: 0, languageId: null, topicIds: [examGenerationTopic.itemId] },
    text("texto gerado pela IA (018)", "MARCADOR-GERADO-018"),
  );
  for (const output of [generatedExamOutput, { ...generatedExamOutput, questions: generatedExamOutput.questions.map((question) => ({ ...question, topicIds: [randomUUID()] })) }]) {
    const examRequest = await examGenerationClient.post("/api/exam-generation-requests", examGenerationBody());
    expect(examRequest.status).toBe(202);
    scriptExamGeneration(t.provider, examRequest.body.id, output);
    expect(await t.get(AiExecutionWorker).runOnce()).toBe(1);
  }
  expect(await t.prisma.exam.count({ where: { teacherId: examGenerationTeacher.id, origin: "AI_GENERATED", status: "DRAFT" } })).toBe(1);
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
  // 012/US1 — the teacher applies the manual work (its topic not taught yet, so confirmed) and two
  // exercises to the class, edits, closes and cancels: `activity.published`, `activity.updated`,
  // `activity.closed` and `activity.cancelled`, with ids, counts and enums only.
  const activitiesPath = `/api/classes/${classId}/activities`;
  // A work (ASSIGNMENT) has a deadline and a late policy; exercises (EXERCISE) have neither since 013.
  const activityBody = (source: { type: "ASSIGNMENT"; workId: string } | { type: "EXERCISE"; exerciseIds: string[] }) => ({
    idempotencyKey: randomUUID(),
    source,
    title: text("título da atividade (012)", "Atividade da jornada doze"),
    instructions: text("instruções da atividade (012)", "Instruções da atividade da jornada doze"),
    publishAt: null,
    ...(source.type === "ASSIGNMENT" ? { deadline: new Date(Date.now() + 7 * DAY_MS).toISOString(), latePolicy: "REJECT" } : {}),
    acknowledgeOutOfScope: true,
  });
  const appliedWork = await teacherClient.post(activitiesPath, activityBody({ type: "ASSIGNMENT", workId: work.body.id }));
  expect(appliedWork.status).toBe(201);
  const editedActivity = await teacherClient.patch(`${activitiesPath}/${appliedWork.body.id}`, { version: 1, latePolicy: "ACCEPT_MARKED" });
  expect(editedActivity.status).toBe(200);
  // 015/US1 — before any student starts, the work goes to the controlled mode (`activity.settings_changed`).
  const controlledActivity = await teacherClient.patch(`${activitiesPath}/${appliedWork.body.id}`, { version: 2, executionMode: "CONTROLLED" });
  expect(controlledActivity.body).toMatchObject({ executionMode: "CONTROLLED" });
  expect((await teacherClient.post(`${activitiesPath}/${appliedWork.body.id}/close`, {})).status).toBe(200);
  const journeyTeacherId = (await t.prisma.user.findUniqueOrThrow({ where: { email: teacherEmail }, select: { id: true } })).id;
  // Two approved exercises, an open answer or code first: its answer waits for the teacher's mark (013/US3).
  const approvedExercises = (
    await t.prisma.exercise.findMany({
      where: { teacherId: journeyTeacherId, status: "APPROVED" },
      select: { id: true, type: true },
      orderBy: { id: "asc" },
    })
  )
    .sort((a, b) => Number(a.type === "MULTIPLE_CHOICE") - Number(b.type === "MULTIPLE_CHOICE"))
    .slice(0, 2);
  // 013/US1 — exercises go out without grade or deadline (`activity.published` with `possiblePoints`).
  const exerciseSource = { type: "EXERCISE" as const, exerciseIds: approvedExercises.map((exercise) => exercise.id) };
  const appliedExercises = await teacherClient.post(activitiesPath, activityBody(exerciseSource));
  expect(appliedExercises.status).toBe(201);
  expect((await teacherClient.post(`${activitiesPath}/${appliedExercises.body.id}/cancel`, {})).status).toBe(200);
  // 018/US2 — the restored exam goes to the class as an EXAM with its time (`activity.published` with
  // `sourceExamId`, `durationMinutes`, `inactivityLimitSeconds` and `startWindowMinutes`), always CONTROLLED,
  // without help and only for the students marked present; then cancelled.
  const examScope = await teacherClient.post(`${activitiesPath}/scope-check`, { type: "EXAM", examId: examDraft.body.id });
  expect(examScope.body.coverage.byTopic).toHaveLength(1);
  const appliedExam = await teacherClient.post(activitiesPath, {
    idempotencyKey: randomUUID(),
    source: { type: "EXAM", examId: examDraft.body.id },
    title: text("título da prova aplicada (018)", "Prova aplicada da jornada dezoito"),
    publishAt: null,
    durationMinutes: 30,
    inactivityLimitSeconds: 45,
    acknowledgeOutOfScope: true,
  });
  expect(appliedExam.status).toBe(201);
  expect((await teacherClient.post(`${activitiesPath}/${appliedExam.body.id}/cancel`, {})).status).toBe(200);
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
  // 017/US4-5: the SMTP password and the notice secret of the configuration.
  const smtpPassword = decodeURIComponent(new URL(t.config.smtpUrl).password);
  if (smtpPassword) secrets.push({ kind: "senha do SMTP_URL", value: smtpPassword });
  if (t.config.mail.notices.provider === "resend") {
    const key = t.config.mail.notices.secret;
    secrets.push({ kind: "segredo de aviso (MAIL_NOTICE_SECRET)", value: `whsec_${key.toString("base64")}` });
    secrets.push({ kind: "segredo de aviso decodificado", value: key.toString("base64") });
  }
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
  const classStudentClient = api(t, { cookie: keepCookie(classAccepted) });
  const myClasses = await classStudentClient.get("/api/me/classes");
  expect(myClasses.body.items.map((c: { id: string }) => c.id)).toEqual([classId]);
  // 012/US2 — the student's dashboard and list never show the cancelled exercises, whose id answers 404
  // and writes `student_access.denied` (route pattern and reason). Since 016 the closed work was
  // released only to the students marked present (none): it is out of the student's context too
  // (`student_access.denied` with `NOT_PRESENT`).
  expect((await classStudentClient.get("/api/me/dashboard")).body.counts).toEqual({ pending: 0, inProgress: 0, overdue: 0, completed: 0 });
  expect((await classStudentClient.get("/api/me/activities")).body.items).toEqual([]);
  expect((await classStudentClient.get(`/api/me/activities/${appliedExercises.body.id}`)).status).toBe(404);
  expect((await classStudentClient.get(`/api/me/activities/${appliedWork.body.id}`)).status).toBe(404);
  const classStudentId = (await t.prisma.user.findUniqueOrThrow({ where: { email: "aluno-convidado-jornada@example.test" }, select: { id: true } })).id;
  /** 016/US1 — the teacher takes the attendance of a new work: marking releases it to the student. */
  const attendancePath = (activityId: string) => `${activitiesPath}/${activityId}/attendance`;
  const markPresent = async (activityId: string) => {
    expect((await teacherClient.get(attendancePath(activityId))).body).toMatchObject({ releaseMode: "PRESENT_ONLY", present: 0, enrolled: 1 });
    const marked = await teacherClient.post(attendancePath(activityId), { mark: [classStudentId], unmark: [] });
    expect(marked.body).toMatchObject({ present: 1, enrolled: 1 });
  };
  // 012/US3 — the teacher applies the work again; the student starts (and starts again: same
  // attempt, no event; `activity_attempt.started` with `attemptNumber`), saves an answer
  // (`activity_attempt.progress_saved`, counts only) and is refused on the closed work
  // (`activity_submission.rejected` with the code). The answer is content the scans keep out of logs
  // and audit. Since 013 only a work is submitted, graded and released: the exercises below are
  // practice, started, saved, concluded (013/US2) and marked by the teacher (013/US3).
  const openExercises = await teacherClient.post(activitiesPath, activityBody(exerciseSource));
  expect(openExercises.status).toBe(201);
  const startedExercises = await classStudentClient.post(`/api/me/activities/${openExercises.body.id}/attempt`, {});
  expect(startedExercises.status).toBe(200);
  // 015/US2 — this work is answered in the controlled mode: the student leaves the screen and comes back
  // (`attempt_integrity.recorded` per event, its type and `buffered` only); a resend records nothing.
  const openWork = await teacherClient.post(activitiesPath, {
    ...activityBody({ type: "ASSIGNMENT", workId: work.body.id }),
    executionMode: "CONTROLLED",
    aiHelpAllowance: 3,
  });
  expect(openWork.status).toBe(201);
  // 016/US1 — the work is invisible until the attendance (`attendance.marked`, ids only).
  expect((await classStudentClient.post(`/api/me/activities/${openWork.body.id}/attempt`, {})).status).toBe(404);
  await markPresent(openWork.body.id);
  const startedActivity = await classStudentClient.post(`/api/me/activities/${openWork.body.id}/attempt`, {});
  expect(startedActivity.status).toBe(200);
  expect((await classStudentClient.post(`/api/me/activities/${openWork.body.id}/attempt`, {})).status).toBe(200);
  const integrityEvents = [
    { eventId: randomUUID(), type: "SCREEN_LEFT", clientOccurredAt: new Date().toISOString(), buffered: false },
    { eventId: randomUUID(), type: "SCREEN_RETURNED", clientOccurredAt: new Date().toISOString(), buffered: true },
  ];
  const eventsPath = `/api/me/activities/${openWork.body.id}/attempt/events`;
  expect((await classStudentClient.post(eventsPath, { events: integrityEvents })).status).toBe(200);
  expect((await classStudentClient.post(eventsPath, { events: integrityEvents })).status).toBe(200);
  // 015/US2-10 — a paste blocked in a question's field (with the question, still no content), and an
  // answer that grows faster than typing allows: refused, recorded by the server (SYSTEM actor).
  const openAnswerId = (startedActivity.body.questions as { id: string; type: string }[]).find((question) => question.type !== "MULTIPLE_CHOICE")!;
  const pasteEvent = { eventId: randomUUID(), type: "PASTE_BLOCKED", questionId: openAnswerId.id, clientOccurredAt: new Date().toISOString(), buffered: false };
  expect((await classStudentClient.post(eventsPath, { events: [pasteEvent] })).status).toBe(200);
  const pasted = "Texto colado de fora da jornada quinze. ".repeat(60);
  const tooFast = await classStudentClient.put(`/api/me/activities/${openWork.body.id}/attempt/answers`, {
    answers: [{ questionId: openAnswerId.id, baseRevision: 0, answer: openAnswerId.type === "CODE" ? { kind: "CODE", source: pasted } : { kind: "TEXT", text: pasted } }],
  });
  expect(tooFast.body.results[0].outcome).toBe("TYPING_LIMIT_EXCEEDED");
  // 015/US3 — the student asks the AI for help (`work_help.requested`: ids and the question's position,
  // never the question): an orientation is delivered (`work_help.delivered`), an off-topic question is
  // refused (`work_help.out_of_scope`), an orientation that names an alternative is blocked by the
  // leak check (`work_help.blocked`, the reason code only) and a provider failure is reconciled on the
  // next read (`work_help.failed`, the error code only). The questions and orientations are content.
  const helpPath = `/api/me/activities/${openWork.body.id}/attempt/help`;
  const questionOfType = (type: string) => (startedActivity.body.questions as { id: string; type: string }[]).find((question) => question.type === type)!.id;
  const askHelp = async (type: string, question: string) => {
    const res = await classStudentClient.post(helpPath, { questionId: questionOfType(type), question: text("pergunta da ajuda (015)", question), idempotencyKey: randomUUID() });
    expect(res.status).toBe(202);
    return res.body.id as string;
  };
  const answerHelp = async (requestId: string, outcome: "GUIDANCE" | "OUT_OF_SCOPE", message: string) => {
    t.provider.script(fakeToolCall(READ_WORK_HELP_REQUEST, { requestId }), fakeOutput({ outcome, message: text("orientação da ajuda (015)", message), example: null }));
    await drain(t);
  };
  await answerHelp(await askHelp("OPEN_ANSWER", "MARCADOR-AJUDA-015 como começo a resposta da jornada?"), "GUIDANCE", "MARCADOR-ORIENTACAO-015 pense no que a jornada pede primeiro.");
  await answerHelp(await askHelp("OPEN_ANSWER", "Pergunta fora do assunto da jornada quinze"), "OUT_OF_SCOPE", "Recusa fora do assunto da jornada quinze");
  await answerHelp(await askHelp("MULTIPLE_CHOICE", "Qual alternativa da jornada quinze?"), "GUIDANCE", "Orientação bloqueada: a alternativa A da jornada quinze");
  await askHelp("MULTIPLE_CHOICE", "Pergunta que falha na jornada quinze");
  t.provider.script(fakeError("INVALID_REQUEST"));
  await drain(t);
  expect((await classStudentClient.get(helpPath)).body).toMatchObject({ allowance: 3, used: 1, pending: false });
  // 016/US3 — the student leaves the room (`attempt_pause.started`: ids and enums, never the note).
  // While out, the events and the help are refused (`attempt_pause.write_refused` with the operation);
  // the teacher releases the return (`attempt_pause.released` with the seconds away). The note of "Outro" is
  // the student's content (MARCADOR-NOTA-016), kept out of logs and audit.
  const exited = await classStudentClient.post(`/api/me/activities/${openWork.body.id}/attempt/pause`, {
    reason: "OTHER",
    note: text("nota de saída da sala (016)", "MARCADOR-NOTA-016 fui buscar água na jornada"),
  });
  expect(exited.status).toBe(201);
  const pausedEvent = { eventId: randomUUID(), type: "SCREEN_LEFT", clientOccurredAt: new Date().toISOString(), buffered: false };
  expect((await classStudentClient.post(eventsPath, { events: [pausedEvent] })).body.code).toBe("ATTEMPT_PAUSED");
  const pausedHelp = { questionId: questionOfType("OPEN_ANSWER"), question: "Posso pedir ajuda fora da sala?", idempotencyKey: randomUUID() };
  expect((await classStudentClient.post(helpPath, pausedHelp)).body.code).toBe("ATTEMPT_PAUSED");
  expect((await teacherClient.post(`${activitiesPath}/${openWork.body.id}/pauses/${exited.body.id}/release`, {})).status).toBe(200);
  // Every question answered; both texts are registered whatever types the two exercises have.
  const studentText = text("resposta do aluno (012)", "Resposta do aluno da jornada doze");
  const studentCode = text("código do aluno (012)", "class RespostaDaJornadaDoze {}");
  const answersFor = (questions: { id: string; type: string; alternatives: { id: string }[] }[]) =>
    questions.map((question) => ({
      questionId: question.id,
      baseRevision: 0,
      answer:
        question.type === "MULTIPLE_CHOICE"
          ? { kind: "ALTERNATIVE", alternativeId: question.alternatives[0]!.id }
          : question.type === "CODE"
            ? { kind: "CODE", source: studentCode }
            : { kind: "TEXT", text: studentText },
    }));
  const journeyAnswers = answersFor(startedActivity.body.questions);
  const savedAnswer = await classStudentClient.put(`/api/me/activities/${openWork.body.id}/attempt/answers`, { answers: journeyAnswers });
  expect(savedAnswer.body.results[0].outcome).toBe("SAVED");
  const savedPractice = await classStudentClient.put(`/api/me/activities/${openExercises.body.id}/attempt/answers`, {
    answers: answersFor(startedExercises.body.questions),
  });
  expect(savedPractice.body.results[0].outcome).toBe("SAVED");
  // 013/US2 — the student concludes the practice (`exercise_attempt.completed`, counts and points
  // only); a repeat is the same conclusion, "Refazer" opens attempt 2 and the answer key of attempt 1
  // is read.
  const practicePath = `/api/me/activities/${openExercises.body.id}`;
  const concluded = await classStudentClient.post(`${practicePath}/attempts/1/complete`, { answers: [] });
  expect([concluded.status, concluded.body.lastResult.number]).toEqual([200, 1]);
  expect((await classStudentClient.post(`${practicePath}/attempts/1/complete`, { answers: [] })).status).toBe(200);
  expect((await classStudentClient.post(`${practicePath}/attempts`, { afterNumber: 1 })).body.attempt.number).toBe(2);
  expect((await classStudentClient.get(`${practicePath}/attempts/1`)).body.first).toBe(true);
  // 013/US3 — the teacher marks the answers of attempt 1 waiting for a mark right, with a comment
  // (`exercise_result.marked` per change, `from`/`to` and `hasComment`, never the comment).
  const practiceAttemptId = (await teacherClient.get(`${activitiesPath}/${openExercises.body.id}`)).body.roster[0].attemptId as string;
  const practiceReviewPath = `${activitiesPath}/${openExercises.body.id}/attempts/${practiceAttemptId}`;
  const practiceResults = (await teacherClient.get(practiceReviewPath)).body.exercise.results as { questionId: string; result: string }[];
  const awaitingMarks = practiceResults.filter((row) => row.result === "PENDING_TEACHER");
  expect(awaitingMarks.length).toBeGreaterThan(0);
  const marked = await teacherClient.put(`${practiceReviewPath}/marks`, {
    marks: awaitingMarks.map((row) => ({
      questionId: row.questionId,
      result: "CORRECT",
      comment: text("comentário da marcação (013)", "Comentário da marcação da jornada treze"),
    })),
  });
  expect(marked.status).toBe(200);
  // 013/US4, US5 — the student and the teacher read the class ranking (never audited); the marked
  // answer's points show at once (013/SC-005).
  const studentRanking = await classStudentClient.get(`/api/me/classes/${classId}/ranking`);
  expect(studentRanking.status).toBe(200);
  const ownRow = (studentRanking.body.rows as { isViewer: boolean; points: number }[]).find((row) => row.isViewer);
  expect(ownRow?.points).toBeGreaterThan(0);
  expect((await classStudentClient.get("/api/me/dashboard")).body.rankings).toHaveLength(1);
  const teacherRanking = await teacherClient.get(`/api/classes/${classId}/ranking`);
  expect(teacherRanking.body.rows.map((row: { points: number }) => row.points)).toEqual(studentRanking.body.rows.map((row: { points: number }) => row.points));
  // 012/US4 — the student submits (`activity_submission.created`, counts only); a repeat is the same submission.
  const submitPath = `/api/me/activities/${openWork.body.id}/attempt/submit`;
  expect((await classStudentClient.post(submitPath, { answers: [] })).body.status).toBe("SUBMITTED");
  expect((await classStudentClient.post(submitPath, { answers: [] })).status).toBe(200);
  // Since 016 the closed work was never released to this student (not marked present): the same 404.
  expect((await classStudentClient.post(`/api/me/activities/${appliedWork.body.id}/attempt`, {})).body.code).toBe("NOT_FOUND");
  // 012/US5 — the teacher opens the submission, grades the pending questions with feedback
  // (`activity_submission.graded`, grades in hundredths, never the feedback) and releases the result
  // (`activity_result.released`); a saved attempt of a closed activity is accepted as a late
  // submission (`activity_submission.accepted_by_teacher`).
  const exercisesDetail = await teacherClient.get(`${activitiesPath}/${openWork.body.id}`);
  const journeyAttemptId = exercisesDetail.body.roster[0].attemptId as string;
  const attemptPath = `${activitiesPath}/${openWork.body.id}/attempts/${journeyAttemptId}`;
  const reviewedAttempt = await teacherClient.get(attemptPath);
  expect(reviewedAttempt.status).toBe(200);
  const questionValues = new Map((exercisesDetail.body.questions as { id: string; value: string }[]).map((question) => [question.id, question.value]));
  const pending = (reviewedAttempt.body.submission.gradings as { questionId: string; status: string }[]).filter((grading) => grading.status === "PENDING_TEACHER");
  const graded = await teacherClient.put(`${attemptPath}/grades`, {
    version: reviewedAttempt.body.submission.version,
    decisions: pending.map((grading) => ({
      questionId: grading.questionId,
      grade: questionValues.get(grading.questionId),
      feedback: text("feedback da questão (012)", "Feedback da questão da jornada doze"),
    })),
    generalFeedback: text("feedback geral (012)", "Feedback geral da jornada doze"),
  });
  expect(graded.status).toBe(200);
  expect((await teacherClient.post(`${activitiesPath}/${openWork.body.id}/release`, {})).status).toBe(200);
  // 012/US6 — the student reads the released result (`activity_result.viewed`, once).
  expect((await classStudentClient.get(`/api/me/activities/${openWork.body.id}`)).body.status).toBe("GRADED");
  // The graded work and the concluded exercises (013/FR-015).
  expect((await classStudentClient.get("/api/me/activities?status=COMPLETED")).body.items).toHaveLength(2);
  const acceptedWork = await teacherClient.post(activitiesPath, activityBody({ type: "ASSIGNMENT", workId: work.body.id }));
  // 016/US2 — marked by mistake and unmarked before the start (`attendance.unmarked`), then marked again.
  await markPresent(acceptedWork.body.id);
  expect((await teacherClient.post(attendancePath(acceptedWork.body.id), { mark: [], unmark: [classStudentId] })).body).toMatchObject({ present: 0 });
  await markPresent(acceptedWork.body.id);
  const acceptedStart = await classStudentClient.post(`/api/me/activities/${acceptedWork.body.id}/attempt`, {});
  const acceptedAnswers = answersFor(acceptedStart.body.questions);
  await classStudentClient.put(`/api/me/activities/${acceptedWork.body.id}/attempt/answers`, { answers: acceptedAnswers });
  // 016/US5 — the teacher pauses the student (`attempt_pause.started` with `initiatedBy: TEACHER`) and
  // releases the return (`attempt_pause.released`).
  const teacherPause = await teacherClient.post(`${activitiesPath}/${acceptedWork.body.id}/students/${classStudentId}/pause`, {});
  expect([teacherPause.status, teacherPause.body.initiatedBy]).toEqual([201, "TEACHER"]);
  expect((await teacherClient.post(`${activitiesPath}/${acceptedWork.body.id}/pauses/${teacherPause.body.id}/release`, {})).status).toBe(200);
  expect((await teacherClient.post(`${activitiesPath}/${acceptedWork.body.id}/close`, {})).status).toBe(200);
  // A save on the closed work it was released to: refused (`activity_submission.rejected` with the code).
  const closedSave = await classStudentClient.put(`/api/me/activities/${acceptedWork.body.id}/attempt/answers`, { answers: acceptedAnswers });
  expect(closedSave.body.code).toBe("ACTIVITY_CLOSED");
  const acceptedAttemptId = (await teacherClient.get(`${activitiesPath}/${acceptedWork.body.id}`)).body.roster[0].attemptId as string;
  const accepted = await teacherClient.post(`${activitiesPath}/${acceptedWork.body.id}/attempts/${acceptedAttemptId}/accept-submission`, {});
  expect(accepted.body.submission.acceptedByTeacher).toBe(true);
  // 018/US3 — the exam applied again and taken with the server's time: the rules accepted on the start
  // (`activity_attempt.started` with `rulesAccepted`), the answers saved and the exam handed in
  // (`activity_submission.created` with `endReason: STUDENT_SUBMITTED`). A second exam is closed by the
  // teacher while the student answers; once the 2 s grace has passed, the student's next read settles
  // the attempt (`exam_attempt.time_expired`, SYSTEM, `endReason: ACTIVITY_CLOSED`).
  const takeExam = async (title: string) => {
    const applied = await teacherClient.post(activitiesPath, {
      idempotencyKey: randomUUID(),
      source: { type: "EXAM", examId: examDraft.body.id },
      title: text("título da prova aplicada (018)", title),
      publishAt: null,
      durationMinutes: 30,
      acknowledgeOutOfScope: true,
    });
    expect(applied.status).toBe(201);
    await markPresent(applied.body.id);
    const started = await classStudentClient.post(`/api/me/activities/${applied.body.id}/attempt`, { acceptRules: true });
    expect(started.status).toBe(200);
    const saved = await classStudentClient.put(`/api/me/activities/${applied.body.id}/attempt/answers`, { answers: answersFor(started.body.questions) });
    expect(saved.status).toBe(200);
    return applied.body.id as string;
  };
  const handedIn = await takeExam("Prova entregue da jornada dezoito");
  expect((await classStudentClient.post(`/api/me/activities/${handedIn}/attempt/submit`, { answers: [] })).body.exam.endReason).toBe("STUDENT_SUBMITTED");
  const closedExam = await takeExam("Prova encerrada da jornada dezoito");
  expect((await teacherClient.post(`${activitiesPath}/${closedExam}/close`, {})).status).toBe(200);
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  expect((await classStudentClient.get(`/api/me/activities/${closedExam}`)).body.exam.endReason).toBe("ACTIVITY_CLOSED");
  // 018/US4 — an event after the hand-in is refused and nothing stored (`exam_attempt.write_refused`);
  // a third exam gets four occurrences sent together after a lost connection (the browser's times
  // 10 s apart), the 4th opens the hold (`exam_attempt.held`, SYSTEM) and the hand-in is refused
  // (`activity_submission.rejected` with `EXAM_ATTEMPT_ON_HOLD`).
  const examEvent = (type: string, secondsAgo: number) => ({
    eventId: randomUUID(),
    type,
    clientOccurredAt: new Date(Date.now() - secondsAgo * 1000).toISOString(),
    buffered: true,
  });
  const afterHandIn = await classStudentClient.post(`/api/me/activities/${handedIn}/attempt/events`, { events: [examEvent("SCREEN_LEFT", 1)] });
  expect(afterHandIn.body.code).toBe("ATTEMPT_ALREADY_SUBMITTED");
  const heldExam = await takeExam("Prova encerrada por avisos da jornada dezoito");
  const occurrences = await classStudentClient.post(`/api/me/activities/${heldExam}/attempt/events`, {
    events: [examEvent("SCREEN_LEFT", 40), examEvent("FULLSCREEN_EXITED", 30), examEvent("COPY_BLOCKED", 20), examEvent("SCREEN_LEFT", 10)],
  });
  expect(occurrences.body.exam).toEqual({ occurrenceCount: 4, held: true });
  const heldSubmit = await classStudentClient.post(`/api/me/activities/${heldExam}/attempt/submit`, { answers: [] });
  expect(heldSubmit.body.code).toBe("EXAM_ATTEMPT_ON_HOLD");
  // 018/US5 — the teacher decides on the monitor: returns the exam with time left
  // (`exam_attempt.returned`), the next occurrence holds it again and the cancellation is confirmed
  // (`exam_attempt.cancel_confirmed`); a fourth exam held and then closed is not cancelled
  // (`exam_attempt.not_cancelled`).
  const openHoldOf = async (activityId: string) => {
    const monitor = await teacherClient.get(`${activitiesPath}/${activityId}/exam-monitor`);
    expect(monitor.status).toBe(200);
    return monitor.body.students[0].openHold.id as string;
  };
  const decideHold = (activityId: string, holdId: string, decision: "cancel" | "return" | "keep") =>
    teacherClient.post(`${activitiesPath}/${activityId}/exam-holds/${holdId}/${decision}`, {});
  expect((await decideHold(heldExam, await openHoldOf(heldExam), "return")).body.resolution).toBe("RETURNED");
  // Past the 2 s window of the batch that opened the first hold, so the fifth counts on its own.
  await new Promise((resolve) => setTimeout(resolve, 2_100));
  const fifth = await classStudentClient.post(`/api/me/activities/${heldExam}/attempt/events`, { events: [examEvent("SCREEN_LEFT", 0)] });
  expect(fifth.body.exam).toEqual({ occurrenceCount: 5, held: true });
  expect((await decideHold(heldExam, await openHoldOf(heldExam), "cancel")).body.resolution).toBe("CANCEL_CONFIRMED");
  const keptExam = await takeExam("Prova não cancelada da jornada dezoito");
  const keptOccurrences = await classStudentClient.post(`/api/me/activities/${keptExam}/attempt/events`, {
    events: [examEvent("SCREEN_LEFT", 40), examEvent("FULLSCREEN_EXITED", 30), examEvent("COPY_BLOCKED", 20), examEvent("SCREEN_LEFT", 10)],
  });
  expect(keptOccurrences.body.exam).toEqual({ occurrenceCount: 4, held: true });
  const keptHold = await openHoldOf(keptExam);
  expect((await teacherClient.post(`${activitiesPath}/${keptExam}/close`, {})).status).toBe(200);
  expect((await decideHold(keptExam, keptHold, "keep")).body.resolution).toBe("NOT_CANCELLED");
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

  // 017/US1 — the outbox: an address the server refuses (UNDELIVERED, audited with source SMTP), a
  // revoked invitation whose retry is discarded, and an e-mail that fails all 7 attempts (FAILED).
  t.mailer.failNext(1, "permanent");
  expect((await api(t).post("/api/auth/password-reset/request", { email: studentEmail })).status).toBe(202);
  await t.flushMail();
  t.mailer.setFailing(true);
  const revokedInvitation = await managerClient.post("/api/teacher-invitations", {
    email: "prof-revogada-jornada@example.test",
    displayName: "Professora Revogada",
  });
  await t.flushMail();
  expect((await managerClient.post(`/api/teacher-invitations/${revokedInvitation.body.id}/revoke`)).status).toBe(200);
  expect((await api(t).post("/api/auth/password-reset/request", { email: studentEmail })).status).toBe(202);
  await t.flushMail();
  const mailWorker = t.get(MailDeliveryWorker);
  let mailClock = Date.now();
  for (let attempt = 2; attempt <= 7; attempt += 1) await mailWorker.runOnce(new Date((mailClock += 7 * 3_600_000)));
  t.mailer.setFailing(false);
  // 017/US2 — a provider notice: Resend bounces a sent teacher invitation (UNDELIVERED, audited with
  // source NOTICE). The address and the bounce message of the notice are content the scans look for.
  if (t.config.mail.notices.provider === "resend") {
    const bounced = await managerClient.post("/api/teacher-invitations", {
      email: "prof-sem-caixa-jornada@example.test",
      displayName: "Professora Sem Caixa",
    });
    expect(bounced.status).toBe(201);
    await t.flushMail();
    const { messageId } = await t.prisma.mailDelivery.findFirstOrThrow({ where: { invitationId: bounced.body.id, status: "SENT" } });
    content.push({ kind: "destinatário do aviso do provedor", value: "MARCADOR-DESTINO-017" });
    content.push({ kind: "mensagem de bounce do provedor", value: "MARCADOR-BOUNCE-017" });
    const notice = signedResendNotice({ type: "email.bounced", messageId, secret: t.config.mail.notices.secret, at: new Date() });
    expect((await postNotice(t, "resend", notice)).status).toBe(200);
  }

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
