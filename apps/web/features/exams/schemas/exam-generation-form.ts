import {
  type CreateExamGenerationRequest,
  EXAM_GENERATION_TOPICS_MAX,
  EXAM_MAX_QUESTIONS,
  EXAM_QUESTION_TOPICS_MAX,
  EXAM_TRICK_QUESTIONS_MAX,
  GradeStringSchema,
  gradeToCents,
  type WorkDifficulty,
  WorkDifficultySchema,
  type WorkQuestionType,
} from "@repo/contracts";
import { z } from "zod";
import { BELOW_MINIMUM_MESSAGE, DIFFICULTY_MESSAGE, GRADE_FORMAT_MESSAGE, gradeInput } from "./exam-form";

/** "Criar prova com IA" (018/US7, contracts/web-ui.md): the 011 request with up to 20 questions. */
export interface ExamGenerationFormValues {
  subjectId: string;
  revisionId: string;
  topicIds: string[];
  title: string;
  difficulty: WorkDifficulty | "";
  totalGrade: string;
  /** Questions per type, as typed. */
  counts: Record<WorkQuestionType, string>;
  trickCount: string;
}

export type ExamGenerationField = "subjectId" | "topicIds" | "title" | "difficulty" | "totalGrade" | "counts" | "trickCount";

/** In the form's order, for the error summary. */
export const EXAM_GENERATION_FIELDS: readonly ExamGenerationField[] = ["subjectId", "topicIds", "title", "difficulty", "totalGrade", "counts", "trickCount"];

export const emptyExamGenerationForm = (): ExamGenerationFormValues => ({
  subjectId: "",
  revisionId: "",
  topicIds: [],
  title: "",
  difficulty: "",
  totalGrade: "",
  counts: { OPEN_ANSWER: "", MULTIPLE_CHOICE: "", CODE: "" },
  trickCount: "0",
});

export const GENERATION_TOPICS_MESSAGE = `Escolha de 1 a ${EXAM_GENERATION_TOPICS_MAX} tópicos da ementa.`;
export const GENERATION_QUANTITY_MESSAGE = `A prova precisa ter de 1 a ${EXAM_MAX_QUESTIONS} questões no total.`;
export const GENERATION_TOPICS_PER_QUESTION_MESSAGE = `Cada questão trata de até ${EXAM_QUESTION_TOPICS_MAX} tópicos: escolha menos tópicos ou mais questões.`;
export const GENERATION_TRICK_MESSAGE = "As pegadinhas não podem passar das questões de múltipla escolha.";

/** A count as typed: blank is 0; anything but a whole number from 0 to 20 is null. */
export function countOf(value: string): number | null {
  const text = value.trim();
  if (text === "") return 0;
  if (!/^\d{1,2}$/.test(text)) return null;
  const count = Number.parseInt(text, 10);
  return count <= EXAM_MAX_QUESTIONS ? count : null;
}

/** The total the counts add up to, or null while one of them isn't a count. */
export function quantityOf(counts: ExamGenerationFormValues["counts"]): number | null {
  const values = [counts.OPEN_ANSWER, counts.MULTIPLE_CHOICE, counts.CODE].map(countOf);
  return values.some((value) => value === null) ? null : values.reduce<number>((sum, value) => sum + value!, 0);
}

/** The form's own checks, with the messages shown next to each field; the contract checks the request again. */
export const ExamGenerationFormSchema = z
  .object({
    subjectId: z.string(),
    revisionId: z.string(),
    topicIds: z.array(z.string()),
    title: z.string(),
    difficulty: z.union([WorkDifficultySchema, z.literal("")]),
    totalGrade: z.string(),
    counts: z.object({ OPEN_ANSWER: z.string(), MULTIPLE_CHOICE: z.string(), CODE: z.string() }),
    trickCount: z.string(),
  })
  .superRefine((values, ctx) => {
    const issue = (path: ExamGenerationField, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (values.subjectId === "") issue("subjectId", "Escolha a disciplina.");
    if (values.topicIds.length < 1 || values.topicIds.length > EXAM_GENERATION_TOPICS_MAX) issue("topicIds", GENERATION_TOPICS_MESSAGE);
    if (values.title.trim() === "") issue("title", "Informe o título.");
    else if (values.title.trim().length > 200) issue("title", "O título pode ter até 200 caracteres.");
    if (values.difficulty === "") issue("difficulty", DIFFICULTY_MESSAGE);
    const quantity = quantityOf(values.counts);
    if (quantity === null || quantity < 1 || quantity > EXAM_MAX_QUESTIONS) issue("counts", GENERATION_QUANTITY_MESSAGE);
    else if (values.topicIds.length > EXAM_QUESTION_TOPICS_MAX * quantity) issue("topicIds", GENERATION_TOPICS_PER_QUESTION_MESSAGE);
    const grade = GradeStringSchema.safeParse(gradeInput(values.totalGrade));
    if (!grade.success) issue("totalGrade", values.totalGrade.trim() === "" ? "Informe a nota total." : GRADE_FORMAT_MESSAGE);
    else if (quantity !== null && quantity > 0 && gradeToCents(grade.data) < quantity) issue("totalGrade", BELOW_MINIMUM_MESSAGE);
    if ((countOf(values.trickCount) ?? 0) > (countOf(values.counts.MULTIPLE_CHOICE) ?? 0)) issue("trickCount", GENERATION_TRICK_MESSAGE);
  });

/** The contract's request from valid form values; never a model, provider or tier. */
export function toExamGenerationRequest(values: ExamGenerationFormValues, idempotencyKey: string): CreateExamGenerationRequest {
  const distribution = {
    OPEN_ANSWER: countOf(values.counts.OPEN_ANSWER) ?? 0,
    MULTIPLE_CHOICE: countOf(values.counts.MULTIPLE_CHOICE) ?? 0,
    CODE: countOf(values.counts.CODE) ?? 0,
  };
  return {
    subjectId: values.subjectId,
    syllabusRevisionId: values.revisionId,
    topicIds: values.topicIds,
    title: values.title.trim(),
    difficulty: values.difficulty as WorkDifficulty,
    totalGrade: gradeInput(values.totalGrade),
    quantity: distribution.OPEN_ANSWER + distribution.MULTIPLE_CHOICE + distribution.CODE,
    distribution,
    trickCount: Math.min(countOf(values.trickCount) ?? 0, EXAM_TRICK_QUESTIONS_MAX),
    idempotencyKey,
  };
}
