import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { AnswerSchema } from "../works/grading.js";
import { ExerciseResultSchema } from "./enums.js";
import { PointsSchema } from "./points.js";

// What the student sees of a concluded EXERCISE attempt (013/FR-012, research K10): built only by the
// API's `student-view.ts` from an allowlist, and only for a concluded attempt of the session student.
// Before a conclusion no student response carries an answer key, an explanation or a result.

/** One exercise of the concluded attempt, with the answer key and the explanation (013/FR-012). */
export const StudentExerciseResultSchema = z.strictObject({
  questionId: UuidSchema,
  position: z.int().min(0),
  /** The student's answer; null when nothing was saved. */
  answer: AnswerSchema.nullable(),
  result: ExerciseResultSchema,
  points: PointsSchema,
  /** "Já pontuado em outra atividade" (013/FR-010a). */
  alreadyScored: z.boolean(),
  /** Multiple choice only. */
  correctAlternativeId: UuidSchema.nullable(),
  /** Open answer only. */
  expectedAnswer: z.string().nullable(),
  /** Code only. */
  expectedSolution: z.string().nullable(),
  explanation: z.string(),
  teacherComment: z.string().nullable(),
});
export type StudentExerciseResult = z.infer<typeof StudentExerciseResultSchema>;

/** `GET /me/activities/:activityId/attempts/:number` and the activity's `lastResult`. */
export const StudentExerciseAttemptSchema = z.strictObject({
  number: z.int().min(1),
  completedAt: IsoDateTimeSchema,
  /** The student's first conclusion: attempt 1 (013/FR-008). */
  first: z.boolean(),
  /** 0 when not the first conclusion. */
  pointsEarned: PointsSchema,
  /** In position order. */
  questions: z.array(StudentExerciseResultSchema),
});
export type StudentExerciseAttempt = z.infer<typeof StudentExerciseAttemptSchema>;

/**
 * `POST /me/activities/:activityId/attempts` ("Refazer", research K4): names the attempt it follows,
 * so a repeated request returns the attempt it already created instead of a second one.
 */
export const RetryAttemptRequestSchema = z.strictObject({ afterNumber: z.int().min(1) });
export type RetryAttemptRequest = z.infer<typeof RetryAttemptRequestSchema>;
