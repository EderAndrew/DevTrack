import { z } from "zod";
import { UuidSchema } from "../common/primitives.js";
import { ExerciseDifficultySchema, type ExerciseType, ExerciseTypeSchema } from "./enums.js";
import { EXERCISE_SET_MAX, EXERCISE_SET_MIN } from "./exercises.js";

// The AI generation request of a batch (010 contracts/http-api.md, research X6, X9). No language
// field: the language comes from the syllabus revision. No free topic text: the topic is an item id.

export const TRICK_QUESTIONS_MAX = 3;

/** Exercises per type; the types not requested are 0. */
export type ExerciseTypeCounts = Record<ExerciseType, number>;

/**
 * Splits `total` over `types` (010/FR-019, research X6): the chosen types in the fixed order
 * OPEN_ANSWER, MULTIPLE_CHOICE, CODE each get `floor(total / k)`, and the first `total mod k` one
 * more. Pure and deterministic, so the form previews exactly what the server records.
 */
export function distributeExercises(total: number, types: readonly ExerciseType[]): ExerciseTypeCounts {
  const chosen = ExerciseTypeSchema.options.filter((type) => types.includes(type));
  const counts: ExerciseTypeCounts = { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 0, CODE: 0 };
  if (chosen.length === 0) return counts;
  const base = Math.floor(total / chosen.length);
  const rest = total % chosen.length;
  chosen.forEach((type, index) => {
    counts[type] = base + (index < rest ? 1 : 0);
  });
  return counts;
}

const TypeCountSchema = z.int().min(1).max(EXERCISE_SET_MAX);

export const ExerciseBatchDistributionSchema = z.discriminatedUnion("mode", [
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
export type ExerciseBatchDistribution = z.infer<typeof ExerciseBatchDistributionSchema>;

const ExerciseBatchFieldsSchema = z.strictObject({
  /** The topic (research X9): an item of this confirmed revision of the teacher's. */
  syllabusRevisionId: UuidSchema,
  syllabusItemId: UuidSchema,
  difficulty: ExerciseDifficultySchema,
  total: z.int().min(EXERCISE_SET_MIN).max(EXERCISE_SET_MAX),
  /** One, two or three distinct types. */
  types: z.array(ExerciseTypeSchema).min(1).max(ExerciseTypeSchema.options.length),
  distribution: ExerciseBatchDistributionSchema,
  /** 0–3 and at most the multiple-choice count; 0 without multiple choice (010/FR-020). */
  trickQuestions: z.int().min(0).max(TRICK_QUESTIONS_MAX),
  /** One per teacher intent; the same key and body return the same batch. */
  idempotencyKey: UuidSchema,
  regeneratedFromId: UuidSchema.optional(),
});

type ExerciseBatchFields = z.infer<typeof ExerciseBatchFieldsSchema>;

/** The counts a request asks for: the manual ones, or the automatic distribution. */
export function batchCounts(request: Pick<ExerciseBatchFields, "total" | "types" | "distribution">): ExerciseTypeCounts {
  if (request.distribution.mode === "AUTO") return distributeExercises(request.total, request.types);
  const { counts } = request.distribution;
  return { OPEN_ANSWER: counts.OPEN_ANSWER ?? 0, MULTIPLE_CHOICE: counts.MULTIPLE_CHOICE ?? 0, CODE: counts.CODE ?? 0 };
}

/** `POST /exercise-batches` (010/FR-018–FR-020). */
export const ExerciseBatchRequestSchema = ExerciseBatchFieldsSchema.superRefine((value, ctx) => {
  if (new Set(value.types).size !== value.types.length) {
    ctx.addIssue({ code: "custom", path: ["types"], message: "DUPLICATE_TYPE" });
    return;
  }
  if (value.distribution.mode === "MANUAL") {
    const given = Object.entries(value.distribution.counts).filter(([, count]) => count !== undefined);
    const sameTypes = given.length === value.types.length && given.every(([type]) => value.types.includes(type as ExerciseType));
    if (!sameTypes) ctx.addIssue({ code: "custom", path: ["distribution", "counts"], message: "TYPES_MISMATCH" });
    else if (given.reduce((sum, [, count]) => sum + (count ?? 0), 0) !== value.total) {
      ctx.addIssue({ code: "custom", path: ["distribution", "counts"], message: "SUM_MISMATCH" });
    }
  }
  if (value.trickQuestions > batchCounts(value).MULTIPLE_CHOICE) {
    ctx.addIssue({ code: "custom", path: ["trickQuestions"], message: "ABOVE_MULTIPLE_CHOICE" });
  }
});
export type ExerciseBatchRequest = z.infer<typeof ExerciseBatchRequestSchema>;
