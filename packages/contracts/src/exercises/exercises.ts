import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import {
  CognitiveObjectiveSchema,
  ExerciseDifficultySchema,
  ExerciseOriginSchema,
  ExerciseStatusSchema,
  ExerciseTypeSchema,
} from "./enums.js";

// Exercises of the teacher's private bank (010 contracts/http-api.md, research X4). Strict: unknown
// fields → 400, including `teacherId`, `origin`, `humanReviewed`, `reviewedById` or any model
// field. The same refinements validate the manual input, the edits and (in the API) the AI output.

/** Statement, explanation, expected answer, instructions and code: 1–10 000 characters after trim. */
const LongTextSchema = z.string().trim().min(1).max(10_000);

export const ALTERNATIVES_MIN = 3;
export const ALTERNATIVES_MAX = 5;
export const EXERCISE_SET_MIN = 3;
export const EXERCISE_SET_MAX = 10;

/**
 * The comparison key of an alternative's text: accents, case and the amount of whitespace
 * ignored (the words, serialized). Two alternatives of one exercise never share it (010/FR-004).
 */
export function alternativeKey(text: string): string {
  const words = text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/\s+/).filter(Boolean);
  return JSON.stringify(words);
}

export const AlternativeInputSchema = z.strictObject({
  text: z.string().trim().min(1).max(2000),
  isCorrect: z.boolean(),
});
export type AlternativeInput = z.infer<typeof AlternativeInputSchema>;

/** Why a list of alternatives breaks 010/FR-004, or null. The count is checked by the array bounds. */
export function alternativesProblem(alternatives: readonly AlternativeInput[]): "CORRECT_COUNT" | "DUPLICATE_TEXT" | null {
  if (alternatives.filter((alternative) => alternative.isCorrect).length !== 1) return "CORRECT_COUNT";
  const keys = alternatives.map((alternative) => alternativeKey(alternative.text));
  if (new Set(keys).size !== keys.length) return "DUPLICATE_TEXT";
  return null;
}

const commonFields = {
  statement: LongTextSchema,
  explanation: LongTextSchema,
  difficulty: ExerciseDifficultySchema,
  cognitiveObjective: CognitiveObjectiveSchema,
  /** The topic: an item of a confirmed revision of the teacher's (checked on the server, 404). */
  syllabusItemId: UuidSchema.optional(),
};

/**
 * The three variants of an exercise input, with `extra` fields added to each (`status` on create,
 * `version` on edit). Built per use because a refined object can't be extended.
 */
function exerciseVariants<Extra extends z.core.$ZodLooseShape>(extra: Extra) {
  const openAnswer = z.strictObject({
    type: z.literal("OPEN_ANSWER"),
    ...commonFields,
    expectedAnswer: LongTextSchema,
    ...extra,
  });
  const multipleChoice = z
    .strictObject({
      type: z.literal("MULTIPLE_CHOICE"),
      ...commonFields,
      /** Presentation order; 3–5, exactly one correct, distinct texts (010/FR-004). */
      alternatives: z.array(AlternativeInputSchema).min(ALTERNATIVES_MIN).max(ALTERNATIVES_MAX),
      isTrickQuestion: z.boolean().default(false),
      ...extra,
    })
    .superRefine((value, ctx) => {
      // The generic `Extra` hides the shape from the checker; the object above has `alternatives`.
      const problem = alternativesProblem((value as { alternatives: AlternativeInput[] }).alternatives);
      if (problem) ctx.addIssue({ code: "custom", path: ["alternatives"], message: problem });
    });
  const code = z.strictObject({
    type: z.literal("CODE"),
    ...commonFields,
    instructions: LongTextSchema,
    starterCode: LongTextSchema.optional(),
    expectedSolution: LongTextSchema,
    /** An active entry of the catalog (checked on the server, 422). */
    languageId: UuidSchema,
    ...extra,
  });
  return z.discriminatedUnion("type", [openAnswer, multipleChoice, code]);
}

/** One exercise, discriminated by `type` (010/FR-001–FR-005). */
export const ExerciseInputSchema = exerciseVariants({});
export type ExerciseInput = z.infer<typeof ExerciseInputSchema>;

/** A manual exercise is saved as a draft or already approved, at the teacher's choice (010/FR-011). */
export const ManualExerciseStatusSchema = ExerciseStatusSchema.extract(["DRAFT", "APPROVED"]);
export type ManualExerciseStatus = z.infer<typeof ManualExerciseStatusSchema>;

/** `POST /exercises`: a single manual exercise (010/US5-6). */
export const CreateExerciseRequestSchema = exerciseVariants({ status: ManualExerciseStatusSchema });
export type CreateExerciseRequest = z.infer<typeof CreateExerciseRequestSchema>;

/** `POST /exercises/sets`: 3–10 exercises, all or nothing (010/FR-016). */
export const ExerciseSetRequestSchema = z.strictObject({
  exercises: z.array(ExerciseInputSchema).min(EXERCISE_SET_MIN).max(EXERCISE_SET_MAX),
  status: ManualExerciseStatusSchema,
});
export type ExerciseSetRequest = z.infer<typeof ExerciseSetRequestSchema>;

export const ExerciseAlternativeViewSchema = z.strictObject({
  id: UuidSchema,
  text: z.string(),
  isCorrect: z.boolean(),
  position: z.int(),
});
export type ExerciseAlternativeView = z.infer<typeof ExerciseAlternativeViewSchema>;

export const ExerciseTopicViewSchema = z.strictObject({
  syllabusItemId: UuidSchema,
  itemText: z.string(),
  subjectId: UuidSchema,
  subjectName: z.string(),
  syllabusRevisionId: UuidSchema,
});
export type ExerciseTopicView = z.infer<typeof ExerciseTopicViewSchema>;

/** Everything about an exercise, for its owner only. The fields of other types are null. */
export const ExerciseTeacherViewSchema = z.strictObject({
  id: UuidSchema,
  type: ExerciseTypeSchema,
  statement: z.string(),
  explanation: z.string(),
  difficulty: ExerciseDifficultySchema,
  cognitiveObjective: CognitiveObjectiveSchema,
  origin: ExerciseOriginSchema,
  status: ExerciseStatusSchema,
  /** The situation a restore returns to; set only while ARCHIVED. */
  archivedFromStatus: ExerciseStatusSchema.nullable(),
  /** Optimistic concurrency: every change sends it back (010 research X14). */
  version: z.int().min(1),
  expectedAnswer: z.string().nullable(),
  instructions: z.string().nullable(),
  starterCode: z.string().nullable(),
  expectedSolution: z.string().nullable(),
  language: z.strictObject({ id: UuidSchema, name: z.string() }).nullable(),
  /** Presentation order; empty unless MULTIPLE_CHOICE. */
  alternatives: z.array(ExerciseAlternativeViewSchema),
  isTrickQuestion: z.boolean(),
  topic: ExerciseTopicViewSchema.nullable(),
  humanReviewed: z.boolean(),
  humanEdited: z.boolean(),
  reviewedBy: z.strictObject({ name: z.string() }).nullable(),
  reviewedAt: IsoDateTimeSchema.nullable(),
  batchId: UuidSchema.nullable(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});
export type ExerciseTeacherView = z.infer<typeof ExerciseTeacherViewSchema>;

/**
 * What a student may see of an exercise (010/FR-036, research X12): a closed list, built on the
 * server by copying these fields only. Never the correct alternative, the expected answer or
 * solution, the explanation, the review or the origin. Served by no route in 010.
 */
export const ExerciseStudentViewSchema = z.strictObject({
  id: UuidSchema,
  type: ExerciseTypeSchema,
  statement: z.string(),
  difficulty: ExerciseDifficultySchema,
  instructions: z.string().optional(),
  starterCode: z.string().optional(),
  language: z.strictObject({ name: z.string() }).optional(),
  /** Presentation order. */
  alternatives: z.array(z.strictObject({ id: UuidSchema, text: z.string() })).optional(),
});
export type ExerciseStudentView = z.infer<typeof ExerciseStudentViewSchema>;

export const EXERCISE_PAGE_SIZE_MAX = 50;

/** `GET /exercises` filters (query string). Without `status`: DRAFT and APPROVED. */
export const ExerciseListQuerySchema = z.strictObject({
  subjectId: UuidSchema.optional(),
  syllabusRevisionId: UuidSchema.optional(),
  syllabusItemId: UuidSchema.optional(),
  difficulty: ExerciseDifficultySchema.optional(),
  cognitiveObjective: CognitiveObjectiveSchema.optional(),
  type: ExerciseTypeSchema.optional(),
  origin: ExerciseOriginSchema.optional(),
  status: ExerciseStatusSchema.optional(),
  languageId: UuidSchema.optional(),
  /** Searched in the statement, ignoring accents and case. */
  query: z.string().max(200).optional(),
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().pipe(z.int().min(1).max(EXERCISE_PAGE_SIZE_MAX)).optional(),
});
export type ExerciseListQuery = z.infer<typeof ExerciseListQuerySchema>;

/** Keyset page by `updatedAt desc, id`; `nextCursor` is opaque to the web. */
export const ExercisePageSchema = z.strictObject({
  items: z.array(ExerciseTeacherViewSchema),
  nextCursor: z.string().nullable(),
});
export type ExercisePage = z.infer<typeof ExercisePageSchema>;
