import { z } from "zod";
import { AiErrorCodeSchema } from "../ai/enums.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { TestCaseVisibilitySchema, WorkDifficultySchema, WorkGenerationRequestStatusSchema } from "../works/enums.js";
import { GradeOutputSchema, GradeStringSchema, gradeToCents } from "../works/grade.js";
import { WORK_ALTERNATIVES_MAX, WORK_ALTERNATIVES_MIN, WORK_TEST_CASES_MAX, WORK_TITLE_MAX, WorkSubjectRefSchema } from "../works/works.js";
import { EXAM_MAX_QUESTIONS, EXAM_MIN_QUESTIONS, EXAM_QUESTION_TOPICS_MAX, EXAM_QUESTION_TOPICS_MIN } from "./questions.js";

// "Criar prova com IA" (018 contracts/http-api.md, contracts/exam-generator.md, research T14). No
// model, provider, tier, family or task field: the 009 policy picks the model (strict → 400). The
// result is one DRAFT exam; only the teacher approves it.

export const EXAM_GENERATION_TOPICS_MAX = 10;
export const EXAM_TRICK_QUESTIONS_MAX = 3;

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

const TypeCountSchema = z.int().min(0).max(EXAM_MAX_QUESTIONS);

/** Questions per type; they add up to `quantity`. */
export const ExamGenerationDistributionSchema = z.strictObject({
  OPEN_ANSWER: TypeCountSchema,
  MULTIPLE_CHOICE: TypeCountSchema,
  CODE: TypeCountSchema,
});
export type ExamGenerationDistribution = z.infer<typeof ExamGenerationDistributionSchema>;

/** `POST /exam-generation-requests`. */
export const CreateExamGenerationRequestSchema = z
  .strictObject({
    subjectId: UuidSchema,
    /** The topics: 1–10 distinct items of this confirmed revision of the teacher's. */
    syllabusRevisionId: UuidSchema,
    topicIds: z.array(UuidSchema).min(1).max(EXAM_GENERATION_TOPICS_MAX),
    title: z.string().trim().min(1).max(WORK_TITLE_MAX),
    /** The exam's pedagogical difficulty; never a model tier. */
    difficulty: WorkDifficultySchema,
    totalGrade: GradeStringSchema,
    quantity: z.int().min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
    distribution: ExamGenerationDistributionSchema,
    /** 0–3 and at most the multiple-choice count. */
    trickCount: z.int().min(0).max(EXAM_TRICK_QUESTIONS_MAX),
    /** One per teacher intent; the same key and body return the same request. */
    idempotencyKey: UuidSchema,
  })
  .superRefine((value, ctx) => {
    if (!distinct(value.topicIds)) {
      ctx.addIssue({ code: "custom", path: ["topicIds"], message: "DUPLICATE_TOPIC" });
    } else if (value.topicIds.length > EXAM_QUESTION_TOPICS_MAX * value.quantity) {
      ctx.addIssue({ code: "custom", path: ["topicIds"], message: "TOO_MANY_TOPICS_FOR_TOTAL" });
    }
    if (gradeToCents(value.totalGrade) < value.quantity) {
      ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "BELOW_MINIMUM_PER_QUESTION" });
    }
    const { OPEN_ANSWER, MULTIPLE_CHOICE, CODE } = value.distribution;
    if (OPEN_ANSWER + MULTIPLE_CHOICE + CODE !== value.quantity) {
      ctx.addIssue({ code: "custom", path: ["distribution"], message: "SUM_MISMATCH" });
    }
    if (value.trickCount > MULTIPLE_CHOICE) {
      ctx.addIssue({ code: "custom", path: ["trickCount"], message: "ABOVE_MULTIPLE_CHOICE" });
    }
  });
export type CreateExamGenerationRequest = z.infer<typeof CreateExamGenerationRequestSchema>;

/** `GET /exam-generation/availability`: whether "Criar prova com IA" can be used now (as 011). */
export const ExamGenerationAvailabilitySchema = z.strictObject({
  availability: z.enum(["AVAILABLE", "AGENT_DISABLED", "MODEL_UNAVAILABLE", "PAUSED"]),
});
export type ExamGenerationAvailability = z.infer<typeof ExamGenerationAvailabilitySchema>;

/** A request and where its generation stands (status derived from the execution, never stored). */
export const ExamGenerationRequestSchema = z.strictObject({
  id: UuidSchema,
  status: WorkGenerationRequestStatusSchema,
  subject: WorkSubjectRefSchema,
  syllabusRevisionId: UuidSchema,
  topics: z.array(z.strictObject({ syllabusItemId: UuidSchema, itemText: z.string() })),
  title: z.string(),
  difficulty: WorkDifficultySchema,
  totalGrade: GradeOutputSchema,
  quantity: z.int().min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
  distribution: ExamGenerationDistributionSchema,
  trickCount: z.int().min(0).max(EXAM_TRICK_QUESTIONS_MAX),
  executionId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema.nullable(),
  /** The 006 code of a FAILED or CANCELLED generation; never a provider message. */
  failureCode: AiErrorCodeSchema.nullable(),
  /** The DRAFT exam created by the generation. */
  examId: UuidSchema.nullable(),
});
export type ExamGenerationRequest = z.infer<typeof ExamGenerationRequestSchema>;

// Output schema v1 of `exam-generator` (contracts/exam-generator.md). Strict, and without grade,
// values, ids of its own, status or origin: those come from the request and the server. What the
// model sends is checked against the request (`validate-generated-exam.ts`) before anything is
// written, so a count, type or topic mismatch is a rejection reason, not a parse error. Optional
// texts are nullable: strict structured output asks for every field.

const Text = z.string().min(1).max(10_000);

const generatedCommon = {
  statement: Text,
  explanation: Text.nullable(),
  difficulty: WorkDifficultySchema,
  /** Among the request's `topicIds` (checked against the request). */
  topicIds: z.array(UuidSchema).min(EXAM_QUESTION_TOPICS_MIN).max(EXAM_QUESTION_TOPICS_MAX),
};

export const GeneratedExamQuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("OPEN_ANSWER"), ...generatedCommon, expectedAnswer: Text, rubric: Text.nullable() }),
  z.strictObject({
    type: z.literal("MULTIPLE_CHOICE"),
    ...generatedCommon,
    /** Presentation order, 3–5; one correct and distinct texts are checked against the request. */
    alternatives: z.array(z.string().min(1).max(2000)).min(WORK_ALTERNATIVES_MIN).max(WORK_ALTERNATIVES_MAX),
    correctIndex: z.int().min(0).max(WORK_ALTERNATIVES_MAX - 1),
    isTrickQuestion: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("CODE"),
    ...generatedCommon,
    /** An active entry of the catalog (checked by the validation). */
    languageId: UuidSchema,
    instructions: Text.nullable(),
    starterCode: Text.nullable(),
    expectedSolution: Text,
    testCases: z
      .array(z.strictObject({ input: z.string().max(10_000), expectedOutput: z.string().max(10_000), visibility: TestCaseVisibilitySchema }))
      .max(WORK_TEST_CASES_MAX),
  }),
]);
export type GeneratedExamQuestion = z.infer<typeof GeneratedExamQuestionSchema>;

export const GeneratedExamSchema = z.strictObject({
  title: z.string().min(1).max(WORK_TITLE_MAX),
  questions: z.array(GeneratedExamQuestionSchema).min(EXAM_MIN_QUESTIONS).max(EXAM_MAX_QUESTIONS),
});
export type GeneratedExam = z.infer<typeof GeneratedExamSchema>;
