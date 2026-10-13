import {
  centsToGrade,
  type CreateExamRequest,
  CreateExamRequestSchema,
  distributeGrade,
  type ExamOrigin,
  type ExamQuestionEdit,
  type ExamQuestionTeacherView,
  type ExamRuleViolation,
  type ExamStatus,
  GradeStringSchema,
  gradeToCents,
  type ManualExamStatus,
  type TeacherExam,
  type TestCaseVisibility,
  type UpdateExamRequest,
  UpdateExamRequestSchema,
  WORK_ALTERNATIVES_MIN,
  type WorkDifficulty,
  type WorkQuestionType,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";

/** Labels of the exam enums (018 contracts/web-ui.md). */
export const QUESTION_TYPE_LABELS: Record<WorkQuestionType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Código",
};
export const DIFFICULTY_LABELS: Record<WorkDifficulty, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
};
export const TEST_CASE_VISIBILITY_LABELS: Record<TestCaseVisibility, string> = { PUBLIC: "Pública", PRIVATE: "Privada" };
export const EXAM_STATUS_LABELS: Record<ExamStatus, string> = { DRAFT: "Rascunho", APPROVED: "Aprovada", ARCHIVED: "Arquivada" };
export const EXAM_ORIGIN_LABELS: Record<ExamOrigin, string> = { MANUAL: "Manual", AI_GENERATED: "Gerada por IA" };

/** An alternative of the form; `key` is the form's own, so the "Correta" mark follows its alternative. */
export interface AlternativeFormValue {
  key: string;
  text: string;
}

export interface TestCaseFormValue {
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
}

/**
 * One question card. Every type's fields live in the card, so switching the type keeps what was
 * typed; the request takes only the chosen type's. The correct alternative is the `key` of the
 * checked radio ("" while none is).
 */
export interface ExamQuestionFormValues {
  /** A saved question of the exam being edited (its type can't change); absent for a new one. */
  questionId?: string;
  type: WorkQuestionType;
  statement: string;
  explanation: string;
  /** "" until chosen: a draft may leave it, the approval needs it (018/FR-004). */
  difficulty: WorkDifficulty | "";
  /** 1–3 of the exam's topics. */
  topicIds: string[];
  expectedAnswer: string;
  rubric: string;
  alternatives: AlternativeFormValue[];
  correctAlternative: string;
  isTrickQuestion: boolean;
  instructions: string;
  starterCode: string;
  expectedSolution: string;
  languageId: string;
  testCases: TestCaseFormValue[];
}

export interface ExamFormValues {
  subjectId: string;
  title: string;
  description: string;
  /** As typed: "0,50", "10" or "7.5". */
  totalGrade: string;
  /** The confirmed revision the topics come from. */
  revisionId: string;
  /** 1–20 items of that revision, in the order they were checked. */
  topicIds: string[];
  questions: ExamQuestionFormValues[];
}

export const emptyAlternative = (): AlternativeFormValue => ({ key: crypto.randomUUID(), text: "" });
export const emptyTestCase = (): TestCaseFormValue => ({ input: "", expectedOutput: "", visibility: "PUBLIC" });

export const emptyExamQuestion = (topicIds: string[] = []): ExamQuestionFormValues => ({
  type: "OPEN_ANSWER",
  statement: "",
  explanation: "",
  difficulty: "",
  // A single exam topic is the obvious one; with more, the teacher picks.
  topicIds: topicIds.length === 1 ? [...topicIds] : [],
  expectedAnswer: "",
  rubric: "",
  alternatives: Array.from({ length: WORK_ALTERNATIVES_MIN }, emptyAlternative),
  correctAlternative: "",
  isTrickQuestion: false,
  instructions: "",
  starterCode: "",
  expectedSolution: "",
  languageId: "",
  testCases: [],
});

export const emptyExam = (): ExamFormValues => ({
  subjectId: "",
  title: "",
  description: "",
  totalGrade: "",
  revisionId: "",
  topicIds: [],
  questions: [emptyExamQuestion()],
});

/** "0,50" → "0.50": the contract's grade takes a dot. */
export const gradeInput = (value: string) => value.trim().replace(",", ".");

/** "0.17" → "0,17": grades are shown with a comma. */
export const formatGrade = (grade: string) => grade.replace(".", ",");

/**
 * What each question is worth, as the server will record it (018/FR-003, the 011 rule), or null
 * while the total isn't a valid grade or can't give 0,01 to each question. Shown, never typed.
 */
export function questionValues(totalGrade: string, count: number): string[] | null {
  const parsed = GradeStringSchema.safeParse(gradeInput(totalGrade));
  if (!parsed.success || count === 0 || gradeToCents(parsed.data) < count) return null;
  return distributeGrade(gradeToCents(parsed.data), count).map(centsToGrade);
}

const optional = (value: string) => (value.trim() === "" ? undefined : value);

function toQuestionInput(question: ExamQuestionFormValues, examTopics: ReadonlySet<string>): ExamQuestionEdit {
  const common = {
    ...(question.questionId ? { id: question.questionId } : {}),
    statement: question.statement,
    explanation: optional(question.explanation),
    difficulty: question.difficulty === "" ? null : question.difficulty,
    // A topic unchecked from the exam leaves its questions too.
    topicIds: question.topicIds.filter((id) => examTopics.has(id)),
  };
  // Incomplete values are the contract's to refuse (the form validates with it before sending).
  if (question.type === "OPEN_ANSWER") {
    return { type: question.type, ...common, expectedAnswer: question.expectedAnswer, rubric: optional(question.rubric) } as ExamQuestionEdit;
  }
  if (question.type === "MULTIPLE_CHOICE") {
    return {
      type: question.type,
      ...common,
      alternatives: question.alternatives.map((alternative) => ({ text: alternative.text, isCorrect: alternative.key === question.correctAlternative })),
      isTrickQuestion: question.isTrickQuestion,
    } as ExamQuestionEdit;
  }
  return {
    type: question.type,
    ...common,
    instructions: optional(question.instructions),
    starterCode: optional(question.starterCode),
    expectedSolution: question.expectedSolution,
    languageId: optional(question.languageId),
    testCases: question.testCases,
  } as ExamQuestionEdit;
}

/** The contract's body for the form: blank optional fields left out, the grade with a dot. */
export function toCreateExamRequest(values: ExamFormValues, saveAs: ManualExamStatus): CreateExamRequest {
  const examTopics = new Set(values.topicIds);
  return {
    subjectId: values.subjectId,
    syllabusRevisionId: values.revisionId,
    title: values.title,
    description: optional(values.description),
    totalGrade: gradeInput(values.totalGrade),
    saveAs,
    topicIds: values.topicIds,
    questions: values.questions.map((question) => toQuestionInput(question, examTopics)),
  } as CreateExamRequest;
}

/** `PUT /exams/:id`: the whole exam, each saved question with its id, and the version it was read at. */
export function toUpdateExamRequest(values: ExamFormValues, version: number): UpdateExamRequest {
  const { subjectId: _subjectId, saveAs: _saveAs, ...rest } = toCreateExamRequest(values, "DRAFT");
  return { ...rest, version } as UpdateExamRequest;
}

/** What a blank required field says; anything else the contract refuses is "Dados inválidos.". */
const EMPTY_MESSAGES: Record<string, string> = {
  subjectId: "Escolha a disciplina.",
  syllabusRevisionId: "Escolha a ementa.",
  title: "Informe o título.",
  totalGrade: "Informe a nota total.",
  statement: "Informe o enunciado.",
  expectedAnswer: "Informe a resposta esperada.",
  text: "Informe o texto da alternativa.",
  expectedSolution: "Informe a solução esperada.",
  languageId: "Escolha a linguagem.",
};
export const GRADE_FORMAT_MESSAGE = "Informe a nota de 0,01 a 100,00, com até duas casas decimais.";
export const BELOW_MINIMUM_MESSAGE = "A nota total precisa dar pelo menos 0,01 para cada questão.";
export const CORRECT_COUNT_MESSAGE = "Marque a alternativa correta.";
export const DUPLICATE_TEXT_MESSAGE = "As alternativas não podem repetir o mesmo texto.";
export const EXAM_TOPICS_MESSAGE = "Escolha de 1 a 20 tópicos da ementa.";
export const QUESTION_TOPICS_MESSAGE = "Escolha de 1 a 3 tópicos da prova.";
export const DIFFICULTY_MESSAGE = "Escolha a dificuldade.";

const isBlank = (value: unknown) => value === undefined || value === null || (typeof value === "string" && value.trim() === "");

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (value, key) => (value && typeof value === "object" ? (value as Record<PropertyKey, unknown>)[key] : undefined),
    input,
  );
}

/** The form's path and message for one issue of the contract. */
function formIssue(body: CreateExamRequest, path: readonly PropertyKey[], message: string): { path: (string | number)[]; message: string } {
  const parts = path.map((part) => part as string | number);
  const [head] = parts;
  if (head === "totalGrade") {
    const text = isBlank(body.totalGrade) ? EMPTY_MESSAGES.totalGrade! : message === "BELOW_MINIMUM_PER_QUESTION" ? BELOW_MINIMUM_MESSAGE : GRADE_FORMAT_MESSAGE;
    return { path: ["totalGrade"], message: text };
  }
  if (head === "syllabusRevisionId") return { path: ["revisionId"], message: EMPTY_MESSAGES.syllabusRevisionId! };
  if (head === "topicIds") return { path: ["topicIds"], message: EXAM_TOPICS_MESSAGE };
  if (head === "questions" && parts.length >= 3) {
    const [, index, field] = parts;
    if (field === "alternatives" && parts.length === 3) {
      const correct = message === "CORRECT_COUNT";
      return {
        path: ["questions", index!, correct ? "correctAlternative" : "alternatives"],
        message: correct ? CORRECT_COUNT_MESSAGE : message === "DUPLICATE_TEXT" ? DUPLICATE_TEXT_MESSAGE : INVALID_DATA,
      };
    }
    if (field === "topicIds") return { path: ["questions", index!, "topicIds"], message: QUESTION_TOPICS_MESSAGE };
  }
  const key = String(parts.at(-1));
  return { path: parts, message: isBlank(valueAt(body, path)) ? (EMPTY_MESSAGES[key] ?? INVALID_DATA) : INVALID_DATA };
}

/** The difficulty every question needs to be approved (018/FR-004), as form issues. */
function difficultyIssues(values: ExamFormValues, ctx: z.RefinementCtx) {
  values.questions.forEach((question, index) => {
    if (question.difficulty === "") ctx.addIssue({ code: "custom", path: ["questions", index, "difficulty"], message: DIFFICULTY_MESSAGE });
  });
}

/**
 * The form checked by the contract's `CreateExamRequestSchema` (the same rules the API applies),
 * each issue moved onto the form's field; `approve` adds the approval's difficulty on every question.
 */
export const examFormSchema = (approve: boolean) =>
  z.custom<ExamFormValues>().superRefine((values, ctx) => {
    const body = toCreateExamRequest(values, "DRAFT");
    const result = CreateExamRequestSchema.safeParse(body);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const { path, message } = formIssue(body, issue.path, issue.message);
        ctx.addIssue({ code: "custom", path, message });
      }
    }
    if (approve) difficultyIssues(values, ctx);
  });

/** The edit of a saved exam: the same checks with `UpdateExamRequestSchema`; an APPROVED exam keeps its approval rules. */
export const examEditFormSchema = (approved: boolean) =>
  z.custom<ExamFormValues>().superRefine((values, ctx) => {
    const body = toUpdateExamRequest(values, 1);
    const result = UpdateExamRequestSchema.safeParse(body);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const { path, message } = formIssue(body as unknown as CreateExamRequest, issue.path, issue.message);
        ctx.addIssue({ code: "custom", path, message });
      }
    }
    if (approved) difficultyIssues(values, ctx);
  });

const questionFormValues = (question: ExamQuestionTeacherView): ExamQuestionFormValues => {
  const alternatives = (question.alternatives ?? []).map((alternative) => ({
    key: crypto.randomUUID(),
    text: alternative.text,
    isCorrect: alternative.isCorrect,
  }));
  return {
    ...emptyExamQuestion(),
    questionId: question.id,
    type: question.type,
    statement: question.statement,
    explanation: question.explanation ?? "",
    difficulty: question.difficulty ?? "",
    topicIds: question.topicIds,
    expectedAnswer: question.expectedAnswer ?? "",
    rubric: question.rubric ?? "",
    ...(question.type === "MULTIPLE_CHOICE"
      ? {
          alternatives: alternatives.map(({ key, text }) => ({ key, text })),
          correctAlternative: alternatives.find((alternative) => alternative.isCorrect)?.key ?? "",
        }
      : {}),
    isTrickQuestion: question.isTrickQuestion,
    instructions: question.instructions ?? "",
    starterCode: question.starterCode ?? "",
    expectedSolution: question.expectedSolution ?? "",
    languageId: question.language?.id ?? "",
    testCases: (question.testCases ?? []).map(({ input, expectedOutput, visibility }) => ({ input, expectedOutput, visibility })),
  };
};

/** A saved exam loaded into the form (`/provas/[id]`), grades with a comma. */
export function examFormValues(exam: TeacherExam): ExamFormValues {
  return {
    subjectId: exam.subject.id,
    title: exam.title,
    description: exam.description ?? "",
    totalGrade: formatGrade(exam.totalGrade),
    revisionId: exam.syllabusRevisionId,
    topicIds: exam.topics.map((topic) => topic.syllabusItemId),
    questions: exam.questions.map(questionFormValues),
  };
}

/** What blocks the approval of the saved exam (018/FR-004), as the server checks it: question by question. */
export function approvalBlockers(exam: TeacherExam): ExamRuleViolation[] {
  return exam.questions.flatMap((question) => [
    ...(question.difficulty ? [] : [{ position: question.position, field: "difficulty", reason: "DIFFICULTY_MISSING" }]),
    ...(question.topicIds.length > 0 ? [] : [{ position: question.position, field: "topicIds", reason: "TOPIC_MISSING" }]),
  ]);
}

/** One rule a question breaks, in words, with its number (1-based) — never color alone. */
export function violationText(violation: ExamRuleViolation): string {
  const reason: Record<string, string> = {
    DIFFICULTY_MISSING: "sem dificuldade",
    TOPIC_MISSING: "sem tópico",
    ANSWER_KEY_MISSING: "sem gabarito",
  };
  return `Questão ${violation.position + 1}: ${reason[violation.reason] ?? "revise esta questão"}.`;
}
