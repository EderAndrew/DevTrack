import { z } from "zod";
import { AiErrorCodeSchema } from "../ai/enums.js";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { ExerciseBatchStatusSchema, ExerciseDifficultySchema } from "./enums.js";
import { EXERCISE_SET_MAX, ExerciseTeacherViewSchema } from "./exercises.js";

// Generation batches (010 contracts/http-api.md, "Generation batches"; research X8, X13). The
// request is `ExerciseBatchRequestSchema` (distribution.ts).

export const ExerciseBatchViewSchema = z.strictObject({
  id: UuidSchema,
  status: ExerciseBatchStatusSchema,
  /** The revision too, so "Gerar de novo" can send the same request (US4-6). */
  topic: z.strictObject({ syllabusItemId: UuidSchema, syllabusRevisionId: UuidSchema, itemText: z.string(), subjectName: z.string() }),
  difficulty: ExerciseDifficultySchema,
  total: z.int(),
  counts: z.strictObject({ OPEN_ANSWER: z.int(), MULTIPLE_CHOICE: z.int(), CODE: z.int() }),
  trickQuestions: z.int(),
  /** The syllabus' language, copied when the batch has code; null otherwise. */
  language: z.strictObject({ name: z.string() }).nullable(),
  distribution: z.enum(["AUTO", "MANUAL"]),
  createdAt: IsoDateTimeSchema,
  generatedAt: IsoDateTimeSchema.nullable(),
  /** The 006 code of a FAILED or CANCELLED generation; never a provider message. */
  failureCode: AiErrorCodeSchema.nullable(),
  approved: z.int(),
  discarded: z.int(),
  archived: z.int(),
  /** DRAFT exercises of the batch still waiting for the teacher. */
  pendingReview: z.int(),
  regeneratedFromId: UuidSchema.nullable(),
});
export type ExerciseBatchView = z.infer<typeof ExerciseBatchViewSchema>;

/** `GET /exercise-batches`: the teacher's batches, newest first. */
export const ExerciseBatchListQuerySchema = z.strictObject({ cursor: z.string().max(200).optional() });
export type ExerciseBatchListQuery = z.infer<typeof ExerciseBatchListQuerySchema>;

export const ExerciseBatchPageSchema = z.strictObject({
  items: z.array(ExerciseBatchViewSchema),
  nextCursor: z.string().nullable(),
});
export type ExerciseBatchPage = z.infer<typeof ExerciseBatchPageSchema>;

/** `GET /exercise-batches/:id`: the batch and its exercises (the drafts to review). */
export const ExerciseBatchDetailSchema = z.strictObject({
  batch: ExerciseBatchViewSchema,
  exercises: z.array(ExerciseTeacherViewSchema),
});
export type ExerciseBatchDetail = z.infer<typeof ExerciseBatchDetailSchema>;

/** `GET /exercise-generation/availability` (006 semantics, no reason text). */
export const ExerciseGenerationAvailabilitySchema = z.strictObject({
  availability: z.enum(["AVAILABLE", "AGENT_DISABLED", "MODEL_UNAVAILABLE", "PAUSED"]),
});
export type ExerciseGenerationAvailability = z.infer<typeof ExerciseGenerationAvailabilitySchema>;

/** `POST /exercise-batches/:id/approve`: several DRAFTs of the batch at once (010/FR-014). */
export const ApproveBatchExercisesRequestSchema = z.strictObject({
  exerciseIds: z.array(UuidSchema).min(1).max(EXERCISE_SET_MAX),
});
export type ApproveBatchExercisesRequest = z.infer<typeof ApproveBatchExercisesRequestSchema>;
