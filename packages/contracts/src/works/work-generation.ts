import { z } from "zod";
import { AiErrorCodeSchema } from "../ai/enums.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { splitEvenly } from "../common/split-evenly.js";
import { TestCaseVisibilitySchema } from "../common/test-cases.js";
import { WorkDifficultySchema, WorkGenerationRequestStatusSchema, type WorkQuestionType, WorkQuestionTypeSchema } from "./enums.js";
import { GradeOutputSchema, GradeStringSchema, gradeToCents } from "./grade.js";
import {
  WORK_ALTERNATIVES_MAX,
  WORK_DESCRIPTION_MAX,
  WORK_QUESTION_TOPICS_MAX,
  WORK_QUESTIONS_MAX,
  WORK_QUESTIONS_MIN,
  WORK_TEST_CASES_MAX,
  WORK_TITLE_MAX,
  WORK_TOPICS_MAX,
  WorkSubjectRefSchema,
} from "./works.js";

// The AI generation of a work (011 contracts/http-api.md, contracts/work-generator.md, research
// W6, W12, W13). No language field: it comes from the revision. No free topic text: topics are
// item ids. No model, provider, tier, family, task or instruction field (FR-024).

export const WORK_TRICK_QUESTIONS_MAX = 3;

/** Questions per type; the types not requested are 0. */
export type WorkQuestionTypeCounts = Record<WorkQuestionType, number>;

/**
 * Splits `total` over `types` (011/FR-019): the chosen types in the fixed order OPEN_ANSWER,
 * MULTIPLE_CHOICE, CODE share it through `splitEvenly`. Pure, so the form previews exactly what
 * the server records. 10 over three types → 4, 3, 3.
 */
export function distributeWorkQuestions(total: number, types: readonly WorkQuestionType[]): WorkQuestionTypeCounts {
  const chosen = WorkQuestionTypeSchema.options.filter((type) => types.includes(type));
  const counts: WorkQuestionTypeCounts = { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 0, CODE: 0 };
  splitEvenly(total, chosen.length).forEach((count, index) => {
    counts[chosen[index]!] = count;
  });
  return counts;
}

const TypeCountSchema = z.int().min(1).max(WORK_QUESTIONS_MAX);

export const WorkGenerationDistributionSchema = z.discriminatedUnion("mode", [
  z.strictObject({ mode: z.literal("AUTO") }),
  z.strictObject({
    mode: z.literal("MANUAL"),
    /** One entry per requested type, each ≥ 1, summing to the total. */
    counts: z.strictObject({
      OPEN_ANSWER: TypeCountSchema.optional(),
      MULTIPLE_CHOICE: TypeCountSchema.optional(),
      CODE: TypeCountSchema.optional(),
    }),
  }),
]);
export type WorkGenerationDistribution = z.infer<typeof WorkGenerationDistributionSchema>;

const distinct = (values: readonly string[]) => new Set(values).size === values.length;

const WorkGenerationFieldsSchema = z.strictObject({
  subjectId: UuidSchema,
  /** The topics (research W11): 1–10 distinct items of this confirmed revision of the teacher's. */
  syllabusRevisionId: UuidSchema,
  syllabusItemIds: z.array(UuidSchema).min(1).max(WORK_TOPICS_MAX),
  title: z.string().trim().min(1).max(WORK_TITLE_MAX),
  description: z.string().trim().max(WORK_DESCRIPTION_MAX).nullish(),
  /** Required for a generated work (011/FR-009); never a model tier. */
  difficulty: WorkDifficultySchema,
  totalGrade: GradeStringSchema,
  total: z.int().min(WORK_QUESTIONS_MIN).max(WORK_QUESTIONS_MAX),
  /** One, two or three distinct types. */
  types: z.array(WorkQuestionTypeSchema).min(1).max(WorkQuestionTypeSchema.options.length),
  distribution: WorkGenerationDistributionSchema,
  /** 0–3 and at most the multiple-choice count; 0 without multiple choice (011/FR-020). */
  trickQuestions: z.int().min(0).max(WORK_TRICK_QUESTIONS_MAX),
  /** One per teacher intent; the same key and body return the same request. */
  idempotencyKey: UuidSchema,
  regeneratedFromId: UuidSchema.optional(),
});

type WorkGenerationFields = z.infer<typeof WorkGenerationFieldsSchema>;

/** The counts a request asks for: the manual ones, or the automatic distribution. */
export function workGenerationCounts(
  request: Pick<WorkGenerationFields, "total" | "types" | "distribution">,
): WorkQuestionTypeCounts {
  if (request.distribution.mode === "AUTO") return distributeWorkQuestions(request.total, request.types);
  const { counts } = request.distribution;
  return { OPEN_ANSWER: counts.OPEN_ANSWER ?? 0, MULTIPLE_CHOICE: counts.MULTIPLE_CHOICE ?? 0, CODE: counts.CODE ?? 0 };
}

/** `POST /work-generation-requests` (011/FR-018–FR-022). */
export const WorkGenerationRequestSchema = WorkGenerationFieldsSchema.superRefine((value, ctx) => {
  if (!distinct(value.syllabusItemIds)) {
    ctx.addIssue({ code: "custom", path: ["syllabusItemIds"], message: "DUPLICATE_TOPIC" });
  } else if (value.syllabusItemIds.length > WORK_QUESTION_TOPICS_MAX * value.total) {
    ctx.addIssue({ code: "custom", path: ["syllabusItemIds"], message: "TOO_MANY_TOPICS_FOR_TOTAL" });
  }
  if (gradeToCents(value.totalGrade) < value.total) {
    ctx.addIssue({ code: "custom", path: ["totalGrade"], message: "BELOW_MINIMUM_PER_QUESTION" });
  }
  if (!distinct(value.types)) {
    ctx.addIssue({ code: "custom", path: ["types"], message: "DUPLICATE_TYPE" });
    return;
  }
  if (value.distribution.mode === "AUTO" && value.total < value.types.length) {
    ctx.addIssue({ code: "custom", path: ["total"], message: "BELOW_TYPE_COUNT" });
  }
  if (value.distribution.mode === "MANUAL") {
    const given = Object.entries(value.distribution.counts).filter(([, count]) => count !== undefined);
    const sameTypes = given.length === value.types.length && given.every(([type]) => value.types.includes(type as WorkQuestionType));
    if (!sameTypes) ctx.addIssue({ code: "custom", path: ["distribution", "counts"], message: "TYPES_MISMATCH" });
    else if (given.reduce((sum, [, count]) => sum + (count ?? 0), 0) !== value.total) {
      ctx.addIssue({ code: "custom", path: ["distribution", "counts"], message: "SUM_MISMATCH" });
    }
  }
  if (value.trickQuestions > workGenerationCounts(value).MULTIPLE_CHOICE) {
    ctx.addIssue({ code: "custom", path: ["trickQuestions"], message: "ABOVE_MULTIPLE_CHOICE" });
  }
});
export type WorkGenerationRequest = z.infer<typeof WorkGenerationRequestSchema>;

/** A request and where its generation stands (status derived, never stored). */
export const WorkGenerationRequestViewSchema = z.strictObject({
  id: UuidSchema,
  status: WorkGenerationRequestStatusSchema,
  subject: WorkSubjectRefSchema,
  syllabusRevisionId: UuidSchema,
  topics: z.array(z.strictObject({ syllabusItemId: UuidSchema, itemText: z.string() })),
  title: z.string(),
  description: z.string().nullable(),
  difficulty: WorkDifficultySchema,
  totalGrade: GradeOutputSchema,
  total: z.int(),
  counts: z.strictObject({ OPEN_ANSWER: z.int(), MULTIPLE_CHOICE: z.int(), CODE: z.int() }),
  trickQuestions: z.int(),
  /** The syllabus' language, copied when the request has code; null otherwise. */
  language: z.strictObject({ name: z.string() }).nullable(),
  distribution: z.enum(["AUTO", "MANUAL"]),
  executionId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema.nullable(),
  /** The 006 code of a FAILED or CANCELLED generation; never a provider message. */
  failureCode: AiErrorCodeSchema.nullable(),
  /** The DRAFT work created by the generation. */
  workId: UuidSchema.nullable(),
  regeneratedFromId: UuidSchema.nullable(),
});
export type WorkGenerationRequestView = z.infer<typeof WorkGenerationRequestViewSchema>;

/** `GET /work-generation/availability` (006 semantics, no reason text). */
export const WorkGenerationAvailabilitySchema = z.strictObject({
  availability: z.enum(["AVAILABLE", "AGENT_DISABLED", "MODEL_UNAVAILABLE", "PAUSED"]),
});
export type WorkGenerationAvailability = z.infer<typeof WorkGenerationAvailabilitySchema>;

/** `GET /work-generation-requests`: the teacher's requests, newest first. */
export const WorkGenerationRequestListQuerySchema = z.strictObject({ cursor: z.string().max(200).optional() });
export type WorkGenerationRequestListQuery = z.infer<typeof WorkGenerationRequestListQuerySchema>;

export const WorkGenerationRequestPageSchema = z.strictObject({
  items: z.array(WorkGenerationRequestViewSchema),
  nextCursor: z.string().nullable(),
});
export type WorkGenerationRequestPage = z.infer<typeof WorkGenerationRequestPageSchema>;

// Output schema v1 of `work-generator` (contracts/work-generator.md). Strict, and without title,
// description, grade, values, ids, status or the work's topics: those come from the request
// (FR-027, FR-028). The bounds are loose on purpose: what the model sends is checked against the
// request before anything is written (research W13), so a count mismatch is a reason, not a parse error.

const Text = z.string().min(1).max(10_000);

const generatedCommon = {
  statement: Text,
  explanation: Text,
  /** Short refs of the selected topics ("T1".."T10"), mapped to item ids by `build`. */
  topicRefs: z.array(z.string().min(1).max(8)).max(WORK_TOPICS_MAX),
  difficulty: WorkDifficultySchema,
};

export const GeneratedWorkQuestionSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("OPEN_ANSWER"), ...generatedCommon, expectedAnswer: Text, rubric: Text.nullable() }),
  z.strictObject({
    type: z.literal("MULTIPLE_CHOICE"),
    ...generatedCommon,
    /** Presentation order. The structural rules (3–5, one correct, distinct) are checked against the request. */
    alternatives: z
      .array(z.strictObject({ text: z.string().min(1).max(2000), isCorrect: z.boolean() }))
      .min(1)
      .max(WORK_ALTERNATIVES_MAX + 1),
    isTrickQuestion: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("CODE"),
    ...generatedCommon,
    instructions: Text.nullable(),
    starterCode: Text.nullable(),
    expectedSolution: Text,
    /** The language name the request gave; checked against the request's. */
    language: z.string().min(1).max(80),
    testCases: z
      .array(z.strictObject({ input: z.string().max(10_000), expectedOutput: z.string().max(10_000), visibility: TestCaseVisibilitySchema }))
      .max(WORK_TEST_CASES_MAX),
  }),
]);
export type GeneratedWorkQuestion = z.infer<typeof GeneratedWorkQuestionSchema>;

export const GeneratedWorkSchema = z.strictObject({
  questions: z.array(GeneratedWorkQuestionSchema).min(1).max(WORK_QUESTIONS_MAX + 1),
});
export type GeneratedWork = z.infer<typeof GeneratedWorkSchema>;
