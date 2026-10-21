import { z } from "zod";
import { ExecutionConventionSchema, QuestionExecutionStatusSchema } from "./enums.js";

/**
 * Whether and how the student can run an EXERCISE CODE question (019 research B17); null on every
 * other question. The version and the limits come from a live worker's heartbeat (research B10), so
 * the screen shows what the worker actually applies; null when no worker serves the profile.
 */
export const QuestionExecutionSchema = z.strictObject({
  status: QuestionExecutionStatusSchema,
  /** e.g. "Python 3.13", the worker's label. */
  languageVersion: z.string().nullable(),
  convention: ExecutionConventionSchema.nullable(),
  limits: z
    .strictObject({ timeMs: z.int().min(1), memoryMb: z.int().min(1), outputBytes: z.int().min(1) })
    .nullable(),
});
export type QuestionExecution = z.infer<typeof QuestionExecutionSchema>;
