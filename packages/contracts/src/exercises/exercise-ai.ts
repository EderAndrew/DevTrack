import { z } from "zod";
import { CognitiveObjectiveSchema, ExerciseDifficultySchema } from "./enums.js";
import { ALTERNATIVES_MAX, EXERCISE_SET_MAX } from "./exercises.js";

// Output schema v1 of `exercise-generator` (010 contracts/exercise-generator.md). Strict, and
// without ids, topic or batch: those come from the batch (FR-031). What the model sends is checked
// against the batch before anything is written (research X10).

const Text = z.string().min(1).max(10_000);

const common = {
  statement: Text,
  explanation: Text,
  difficulty: ExerciseDifficultySchema,
  cognitiveObjective: CognitiveObjectiveSchema,
};

export const GeneratedExerciseSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("OPEN_ANSWER"), ...common, expectedAnswer: Text }),
  z.strictObject({
    type: z.literal("MULTIPLE_CHOICE"),
    ...common,
    /** Presentation order. The structural rules (3–5, one correct, distinct) are checked against the batch. */
    alternatives: z
      .array(z.strictObject({ text: z.string().min(1).max(2000), isCorrect: z.boolean() }))
      .min(1)
      .max(ALTERNATIVES_MAX + 1),
    isTrickQuestion: z.boolean(),
  }),
  z.strictObject({
    type: z.literal("CODE"),
    ...common,
    instructions: Text,
    starterCode: Text.nullable(),
    expectedSolution: Text,
    /** The language name the request gave; checked against the batch's. */
    language: z.string().min(1).max(80),
  }),
]);
export type GeneratedExercise = z.infer<typeof GeneratedExerciseSchema>;

export const GeneratedExerciseBatchSchema = z.strictObject({
  exercises: z.array(GeneratedExerciseSchema).min(1).max(EXERCISE_SET_MAX + 1),
});
export type GeneratedExerciseBatch = z.infer<typeof GeneratedExerciseBatchSchema>;
