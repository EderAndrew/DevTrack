import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/modules/access-control/permissions";
import { API_ROOT } from "../helpers/env";
import { registeredRoutes } from "../helpers/routes";

/** The entities of data-model.md (001, 003, 004, 006, 008, 009, 010 and 011; 007 adds none) — nothing else exists yet. */
const EXPECTED_MODELS = [
  "User",
  "Role",
  "Permission",
  "RolePermission",
  "UserRole",
  "TeacherProfile",
  "StudentProfile",
  "Invitation",
  "UserToken",
  "AdminBootstrap",
  "Session",
  "AuditEvent",
  "AccessRecord",
  "RateLimitCounter",
  "SchoolClass",
  "ClassInvitation",
  "Enrollment",
  "Subject",
  "StoredFile",
  "SyllabusDocument",
  "SyllabusRevision",
  "SyllabusGroup",
  "SyllabusItem",
  "ClassMeeting",
  "ClassPlan",
  "Topic",
  "TopicSyllabusItem",
  // 006 — AI foundation: generic infrastructure, no agent of any domain (006/FR-003).
  "AiModelConfig",
  "AiAgent",
  "AiAgentVersion",
  "AiPromptVersion",
  "AiOutputSchemaVersion",
  "AiTool",
  "AiAgentTool",
  "AiExecution",
  "AiExecutionTransition",
  "AiExecutionOutput",
  "AiModelCall",
  "AiToolCall",
  "AiProposal",
  "AiEvaluationCase",
  "AiEvaluationResult",
  // 008 — tasks routed to a primary and a fallback model config (009: a model policy).
  "AiTask",
  // 009 — model policy: approvals per model × task, the admin's override, budget alerts.
  "AiModelTaskApproval",
  "AiTaskOverride",
  "AiBudgetAlert",
  // 010 — exercise bank: the language catalog, exercises, their alternatives and AI generation batches.
  "ProgrammingLanguage",
  "Exercise",
  "ExerciseAlternative",
  "ExerciseGenerationBatch",
  // 011 — work bank: works, their topics, questions, alternatives, test cases and AI generation requests.
  "Work",
  "WorkTopic",
  "WorkQuestion",
  "WorkQuestionAlternative",
  "WorkQuestionTestCase",
  "WorkQuestionTopic",
  "WorkGenerationRequest",
  "WorkGenerationRequestTopic",
  // 012 — class activities: the snapshot of the bank, the students' attempts, answers, submissions
  // and gradings.
  "ClassActivity",
  "ClassActivityQuestion",
  "ClassActivityAlternative",
  "ClassActivityTestCase",
  "ClassActivityQuestionTopic",
  "ActivityAttempt",
  "ActivityAnswer",
  "ActivitySubmission",
  "ActivityQuestionGrading",
  // 013 — the result of each exercise of a concluded practice attempt (points and the ranking).
  "ExerciseQuestionResult",
  // 015 (specs/015-controlled-work-ai-help/data-model.md) — the facts of a controlled attempt and the AI help requests.
  "AttemptIntegrityEvent",
  "WorkHelpRequest",
  // 016 (specs/016-attendance-gated-release/data-model.md) — the attendance of a work and the room exits of an attempt.
  "ActivityAttendance",
  "AttemptPause",
  // 017 (specs/017-production-email/data-model.md) — one outbox for the six e-mails (replaces the
  // 003 ClassInvitationDelivery) and the provider notices.
  "MailDelivery",
  "MailNotice",
  // 018 (specs/018-controlled-exams/data-model.md) — the Banco de Provas, and an exam attempt's
  // counted occurrences and holds.
  "Exam",
  "ExamTopic",
  "ExamQuestion",
  "ExamQuestionAlternative",
  "ExamQuestionTestCase",
  "ExamQuestionTopic",
  "ExamGenerationRequest",
  "ExamGenerationRequestTopic",
  "ExamOccurrence",
  "ExamAttemptHold",
  // 019 (specs/019-exercise-code-runner/data-model.md) — the exercise bank's test cases, the run
  // queue with its cases, and the workers' heartbeats.
  "ExerciseTestCase",
  "CodeRun",
  "CodeRunCase",
  "CodeRunnerHeartbeat",
];

/**
 * Word prefixes of the academic domain not built yet (FR-080), without accents, pt-BR and English.
 * 003 brought classes and enrollments in on purpose (`turma`, `matricul`, `class`, `classes`,
 * `enrollment` are allowed, 003/D13) and 004 subjects, syllabi, meetings, plans and topics
 * (`subject`, `syllabus`, `ementa`, `disciplina`, `topic`, `tópico`, `meeting`, `plan`, 004/E22)
 * and 010 the question bank (`questao`, `questoes`, `exercicio`; `exercise` was never listed) and
 * 011 the work bank (`trabalho`, `trabalhos`, and `grade` for a work's total grade and its grading
 * strategies; `work` was never listed) and 012 class activities, submissions and student grades
 * (`nota`, `submiss`; research P24) and 018 exams (`prova`, `exam`). The later phases' terms (attempts
 * named `tentativa`, lessons, courses) stay forbidden.
 * "assignment" is left out on purpose: role assignment is identity vocabulary (`UserRole`).
 */
const ACADEMIC_PREFIXES = [
  "periodo",
  "aula",
  "course",
  "lesson",
  "homework",
  "curricul",
  // Attempts at an exam; delivery and processing `attempts` (003, 004) are not academic.
  "tentativa",
];
/** Matched only as whole words, so `classification` does not count. */
const ACADEMIC_WORDS = ["classe"];
/** Words a prefix catches that are not academic (015: the code `example` of an AI help is not an `exam`). */
const NOT_ACADEMIC = ["example", "examples"];

const stripAccents = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Splits identifiers (camelCase, snake_case, dots, slashes, dashes) into lowercase words. */
function words(identifier: string): string[] {
  return stripAccents(identifier)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function academicTerms(identifier: string): string[] {
  return words(identifier).filter(
    (word) => ACADEMIC_WORDS.includes(word) || (!NOT_ACADEMIC.includes(word) && ACADEMIC_PREFIXES.some((prefix) => word.startsWith(prefix))),
  );
}

function schemaNames() {
  const schema = readFileSync(resolve(API_ROOT, "prisma/schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);
  const enums = [...schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)].flatMap((m) => [
    m[1]!,
    ...m[2]!.split(/\s+/).filter((v) => /^[A-Z_]+$/.test(v)),
  ]);
  const maps = [...schema.matchAll(/@@?map\("([^"]+)"\)/g)].map((m) => m[1]!);
  const fields = [...schema.matchAll(/^model \w+ \{([^}]*)\}/gm)].flatMap((m) =>
    m[1]!
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0]!)
      .filter((name) => /^[a-z]\w*$/.test(name)),
  );
  return { models, names: [...models, ...enums, ...maps, ...fields] };
}

describe("004/E22 006/FR-003 007/FR-031 010/FR-001 fronteira do domínio (FR-080, critério 27)", () => {
  let routes: string[];

  beforeAll(async () => {
    routes = (await registeredRoutes()).map((r) => r.route);
  });

  it("schema.prisma tem exatamente os modelos de data-model.md", () => {
    expect([...schemaNames().models].sort()).toEqual([...EXPECTED_MODELS].sort());
  });

  it("007 acrescenta só a coluna ai_proposal_id, o valor AI_ASSISTED e a relação AiProposal ↔ SyllabusRevision", () => {
    const schema = readFileSync(resolve(API_ROOT, "prisma/schema.prisma"), "utf8");
    const block = (name: string) => schema.match(new RegExp(`^(?:model|enum) ${name} \\{([^}]*)\\}`, "m"))?.[1] ?? "";
    expect(block("SyllabusRevisionSource").split(/\s+/).filter((v) => /^[A-Z_]+$/.test(v))).toEqual([
      "EXTRACTION",
      "MANUAL",
      "REVISION",
      "AI_ASSISTED",
    ]);
    expect(block("SyllabusRevision")).toMatch(/aiProposalId\s+String\?\s+@unique @map\("ai_proposal_id"\) @db\.Uuid/);
    expect(block("SyllabusRevision")).toMatch(/aiProposal\s+AiProposal\?\s+@relation\(fields: \[aiProposalId\], references: \[id\], onDelete: Restrict\)/);
    expect(block("AiProposal")).toMatch(/syllabusRevision\s+SyllabusRevision\?/);
  });

  it("nenhum modelo, enum, tabela, coluna, rota ou permissão usa termo acadêmico de fase futura", () => {
    const candidates = [...schemaNames().names, ...routes, ...PERMISSIONS];
    const offenders = candidates.flatMap((name) => academicTerms(name).map((term) => `${name} (${term})`));
    expect(offenders).toEqual([]);
  });

  it("o detector reconhece termos acadêmicos e ignora falsos positivos", () => {
    for (const name of ["course_enrollments", "classe", "tentativas_prova", "AulaPratica", "homework_items"]) {
      expect(academicTerms(name), name).not.toEqual([]);
    }
    for (const name of [
      "classification",
      "example_code",
      "provisioning",
      "RateLimitCounter",
      "notificationSentAt",
      "sessoes.proprias.listar",
      "SchoolClass",
      "turmas.remover_aluno",
      "enrollment_status",
      "GET /classes/:id/enrollments",
      "matriculas",
      "subjects",
      "GET /subjects/:id",
      "disciplinas.visualizar",
      "ementas.revisar",
      "SyllabusDocument",
      "topic_syllabus_items",
      "TópicoDaEmenta",
      "class_meetings",
      "planejamento.alterar_situacao",
      "ClassPlan",
      "questoes.aprovar",
      "ia.exercicios.gerar",
      "exercise_generation_batches",
      "ExerciseAlternative",
      "trabalhos.criar",
      "ia.trabalhos.gerar",
      "work_grading_strategy",
      "total_grade",
      "notas.lancar",
      "notas.proprias.visualizar",
      "activity_submissions",
      "ActivityAttempt",
      "atividades.proprias.responder",
      "POST /me/activities/:activityId/attempt/submit",
      "provas.encerramentos.decidir",
      "exam_occurrences",
      "ExamAttemptHold",
      "GET /exams/:id",
    ]) {
      expect(academicTerms(name), name).toEqual([]);
    }
  });
});
