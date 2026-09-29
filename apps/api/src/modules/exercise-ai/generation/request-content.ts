import { ExerciseDifficultySchema } from "@repo/contracts";
import { z } from "zod";

export const READ_EXERCISE_GENERATION_REQUEST = "read-exercise-generation-request";
export const EXERCISE_GENERATION_BATCH = "EXERCISE_GENERATION_BATCH";

/**
 * What `read-exercise-generation-request` returns (010 contracts/exercise-generator.md, research
 * X11): the topic of the execution's own batch and its configuration, nothing else — no subject
 * name, other syllabi, users, classes or students. `build` reads it back from the tool results,
 * so both sides parse the same strict schema.
 */
export const ExerciseGenerationRequestContentSchema = z.strictObject({
  /** The syllabus text, as the model sees it: data, never instructions (the untrusted block). */
  topic: z.strictObject({
    itemText: z.string(),
    groupTitle: z.string().nullable(),
    syllabusTitle: z.string().nullable(),
    competency: z.string().nullable(),
  }),
  request: z.strictObject({
    difficulty: ExerciseDifficultySchema,
    total: z.int(),
    counts: z.strictObject({ OPEN_ANSWER: z.int(), MULTIPLE_CHOICE: z.int(), CODE: z.int() }),
    trickQuestions: z.int(),
    /** The syllabus' language name when the batch has code; null otherwise. */
    language: z.string().nullable(),
  }),
});
export type ExerciseGenerationRequestContent = z.infer<typeof ExerciseGenerationRequestContentSchema>;
