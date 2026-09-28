import { z } from "zod";

// Public enums of the exercise bank (010 data-model.md). Platform concepts, so fixed in code
// (constitution XXI); languages and subjects are data, never enums.

export const ExerciseTypeSchema = z.enum(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"]);
export type ExerciseType = z.infer<typeof ExerciseTypeSchema>;

/**
 * The pedagogical difficulty of an exercise (010 FR-007). Unrelated to the AI model tier
 * (`AiModelTierSchema`): no value of one implies a value of the other.
 */
export const ExerciseDifficultySchema = z.enum(["BASIC", "INTERMEDIATE", "ADVANCED"]);
export type ExerciseDifficulty = z.infer<typeof ExerciseDifficultySchema>;

/** The cognitive objective, an axis independent of the difficulty (constitution XXI, 010 FR-008). */
export const CognitiveObjectiveSchema = z.enum(["RECOGNIZE", "UNDERSTAND", "APPLY", "ANALYZE", "CREATE"]);
export type CognitiveObjective = z.infer<typeof CognitiveObjectiveSchema>;

export const ExerciseOriginSchema = z.enum(["MANUAL", "AI_GENERATED"]);
export type ExerciseOrigin = z.infer<typeof ExerciseOriginSchema>;

export const ExerciseStatusSchema = z.enum(["DRAFT", "APPROVED", "ARCHIVED"]);
export type ExerciseStatus = z.infer<typeof ExerciseStatusSchema>;

/** Derived from the batch's AI execution and its materialization, never stored twice (010 research X13). */
export const ExerciseBatchStatusSchema = z.enum(["PENDING", "GENERATED", "FAILED", "CANCELLED"]);
export type ExerciseBatchStatus = z.infer<typeof ExerciseBatchStatusSchema>;
