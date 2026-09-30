import {
  centsToGrade,
  type CreateWorkRequest,
  CreateWorkRequestSchema,
  distributeGrade,
  GradeStringSchema,
  gradeToCents,
  type ManualWorkStatus,
  type TestCaseVisibility,
  WORK_ALTERNATIVES_MIN,
  type WorkDifficulty,
  type WorkQuestionInput,
  type WorkQuestionType,
} from "@repo/contracts";
import { z } from "zod";
import { INVALID_DATA } from "@/lib/forms/field-messages";

/** Labels of the work enums (011 contracts/web-ui.md). */
export const WORK_QUESTION_TYPE_LABELS: Record<WorkQuestionType, string> = {
  OPEN_ANSWER: "Pergunta e resposta",
  MULTIPLE_CHOICE: "Múltipla escolha",
  CODE: "Código",
};
export const WORK_DIFFICULTY_LABELS: Record<WorkDifficulty, string> = {
  BASIC: "Básico",
  INTERMEDIATE: "Intermediário",
  ADVANCED: "Avançado",
};
export const TEST_CASE_VISIBILITY_LABELS: Record<TestCaseVisibility, string> = {
  PUBLIC: "Pública",
  PRIVATE: "Privada",
};

/** An alternative of the form; `key` is the form's own, so the "Correta" mark follows its alternative. */
export interface WorkAlternativeFormValue {
  key: string;
  text: string;
}

export interface WorkTestCaseFormValue {
  input: string;
  expectedOutput: string;
  visibility: TestCaseVisibility;
}

/**
 * One question card. Every type's fields live in the card, so switching the type keeps what was
 * typed; `toCreateWorkRequest` sends only the chosen type's. The correct alternative is the `key`
 * of the checked radio ("" while none is).
 */
export interface WorkQuestionFormValues {
  type: WorkQuestionType;
  statement: string;
  explanation: string;
  /** 0–3 of the work's topics. */
  topicItemIds: string[];
  expectedAnswer: string;
  rubric: string;
  alternatives: WorkAlternativeFormValue[];
  correctAlternative: string;
  isTrickQuestion: boolean;
  instructions: string;
  starterCode: string;
  expectedSolution: string;
  languageId: string;
  testCases: WorkTestCaseFormValue[];
}

export interface WorkFormValues {
  subjectId: string;
  title: string;
  description: string;
  /** As typed: "0,50", "10" or "7.5". */
  totalGrade: string;
  difficulty: WorkDifficulty | "";
  /** The confirmed revision the topics come from ("" for none). */
  revisionId: string;
  /** 0–10 items of that revision, in the order they were checked. */
  topicItemIds: string[];
  questions: WorkQuestionFormValues[];
}

export const emptyWorkAlternative = (): WorkAlternativeFormValue => ({
  key: crypto.randomUUID(),
  text: "",
});
export const emptyTestCase = (): WorkTestCaseFormValue => ({
  input: "",
  expectedOutput: "",
  visibility: "PUBLIC",
});

export const emptyQuestion = (): WorkQuestionFormValues => ({
  type: "OPEN_ANSWER",
  statement: "",
  explanation: "",
  topicItemIds: [],
  expectedAnswer: "",
  rubric: "",
  alternatives: Array.from(
    { length: WORK_ALTERNATIVES_MIN },
    emptyWorkAlternative,
  ),
  correctAlternative: "",
  isTrickQuestion: false,
  instructions: "",
  starterCode: "",
  expectedSolution: "",
  languageId: "",
  testCases: [],
});

export const emptyWork = (): WorkFormValues => ({
  subjectId: "",
  title: "",
  description: "",
  totalGrade: "",
  difficulty: "",
  revisionId: "",
  topicItemIds: [],
  questions: [emptyQuestion()],
});

/** "0,50" → "0.50": the contract's grade takes a dot (research W3). */
export const gradeInput = (value: string) => value.trim().replace(",", ".");

/** "0.17" → "0,17": grades are shown with a comma. */
export const formatGrade = (grade: string) => grade.replace(".", ",");

/**
 * What each question is worth, as the server will record it (011/FR-011, research W4), or null
 * while the total isn't a valid grade or can't give 0,01 to each question.
 */
export function questionValues(
  totalGrade: string,
  count: number,
): string[] | null {
  const parsed = GradeStringSchema.safeParse(gradeInput(totalGrade));
  if (!parsed.success || count === 0 || gradeToCents(parsed.data) < count)
    return null;
  return distributeGrade(gradeToCents(parsed.data), count).map(centsToGrade);
}

const optional = (value: string) => (value.trim() === "" ? undefined : value);

function toQuestionInput(
  question: WorkQuestionFormValues,
  workTopics: ReadonlySet<string>,
): WorkQuestionInput {
  const common = {
    statement: question.statement,
    explanation: optional(question.explanation),
    // A topic unchecked from the work leaves its questions too.
    topicItemIds: question.topicItemIds.filter((id) => workTopics.has(id)),
  };
  // Incomplete values are the contract's to refuse (the form validates with it before sending).
  if (question.type === "OPEN_ANSWER") {
    return {
      type: question.type,
      ...common,
      expectedAnswer: question.expectedAnswer,
      rubric: optional(question.rubric),
    } as WorkQuestionInput;
  }
  if (question.type === "MULTIPLE_CHOICE") {
    return {
      type: question.type,
      ...common,
      alternatives: question.alternatives.map((alternative) => ({
        text: alternative.text,
        isCorrect: alternative.key === question.correctAlternative,
      })),
      isTrickQuestion: question.isTrickQuestion,
    } as WorkQuestionInput;
  }
  return {
    type: question.type,
    ...common,
    instructions: optional(question.instructions),
    starterCode: optional(question.starterCode),
    expectedSolution: question.expectedSolution,
    languageId: optional(question.languageId),
    testCases: question.testCases,
  } as WorkQuestionInput;
}

/** The contract's body for the form: blank optional fields left out, the grade with a dot. */
export function toCreateWorkRequest(
  values: WorkFormValues,
  status: ManualWorkStatus,
): CreateWorkRequest {
  const topics =
    values.revisionId !== "" && values.topicItemIds.length > 0
      ? {
          syllabusRevisionId: values.revisionId,
          syllabusItemIds: values.topicItemIds,
        }
      : null;
  const workTopics = new Set(topics?.syllabusItemIds ?? []);
  return {
    subjectId: values.subjectId,
    title: values.title,
    description: optional(values.description),
    difficulty: values.difficulty === "" ? null : values.difficulty,
    totalGrade: gradeInput(values.totalGrade),
    topics,
    questions: values.questions.map((question) =>
      toQuestionInput(question, workTopics),
    ),
    status,
  } as CreateWorkRequest;
}

/** What a blank required field says; anything else the contract refuses is "Dados inválidos.". */
const EMPTY_MESSAGES: Record<string, string> = {
  subjectId: "Escolha a disciplina.",
  title: "Informe o título.",
  totalGrade: "Informe a nota total.",
  statement: "Informe o enunciado.",
  expectedAnswer: "Informe a resposta esperada.",
  text: "Informe o texto da alternativa.",
  expectedSolution: "Informe a solução esperada.",
  languageId: "Escolha a linguagem.",
};
export const GRADE_FORMAT_MESSAGE =
  "Informe a nota de 0,01 a 100,00, com até duas casas decimais.";
export const BELOW_MINIMUM_MESSAGE =
  "A nota total precisa dar pelo menos 0,01 para cada questão.";
export const CORRECT_COUNT_MESSAGE = "Marque a alternativa correta.";
export const DUPLICATE_TEXT_MESSAGE =
  "As alternativas não podem repetir o mesmo texto.";
export const QUESTION_TOPICS_MESSAGE = "Escolha até 3 tópicos do trabalho.";

const isBlank = (value: unknown) =>
  value === undefined ||
  value === null ||
  (typeof value === "string" && value.trim() === "");

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (value, key) =>
      value && typeof value === "object"
        ? (value as Record<PropertyKey, unknown>)[key]
        : undefined,
    input,
  );
}

/** The form's path and message for one issue of the contract. */
function formIssue(
  body: CreateWorkRequest,
  path: readonly PropertyKey[],
  message: string,
): { path: (string | number)[]; message: string } {
  const parts = path.map((part) => part as string | number);
  const [head] = parts;
  if (head === "totalGrade") {
    const text = isBlank(body.totalGrade)
      ? EMPTY_MESSAGES.totalGrade!
      : message === "BELOW_MINIMUM_PER_QUESTION"
        ? BELOW_MINIMUM_MESSAGE
        : GRADE_FORMAT_MESSAGE;
    return { path: ["totalGrade"], message: text };
  }
  if (head === "topics")
    return { path: ["topicItemIds"], message: INVALID_DATA };
  if (head === "questions" && parts.length >= 3) {
    const [, index, field] = parts;
    if (field === "alternatives" && parts.length === 3) {
      const correct = message === "CORRECT_COUNT";
      return {
        path: [
          "questions",
          index!,
          correct ? "correctAlternative" : "alternatives",
        ],
        message: correct
          ? CORRECT_COUNT_MESSAGE
          : message === "DUPLICATE_TEXT"
            ? DUPLICATE_TEXT_MESSAGE
            : INVALID_DATA,
      };
    }
    if (field === "topicItemIds")
      return {
        path: ["questions", index!, "topicItemIds"],
        message: QUESTION_TOPICS_MESSAGE,
      };
  }
  const key = String(parts.at(-1));
  return {
    path: parts,
    message: isBlank(valueAt(body, path))
      ? (EMPTY_MESSAGES[key] ?? INVALID_DATA)
      : INVALID_DATA,
  };
}

/**
 * The form checked by the contract's `CreateWorkRequestSchema` (the same rules the API applies,
 * 011/FR-008), with each issue moved onto the form's field.
 */
export const workFormSchema = z
  .custom<WorkFormValues>()
  .superRefine((values, ctx) => {
    const body = toCreateWorkRequest(values, "DRAFT");
    const result = CreateWorkRequestSchema.safeParse(body);
    if (result.success) return;
    for (const issue of result.error.issues) {
      const { path, message } = formIssue(body, issue.path, issue.message);
      ctx.addIssue({ code: "custom", path, message });
    }
  });
