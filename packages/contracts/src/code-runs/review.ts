import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import {
  CodeRunFailureReasonSchema,
  CodeRunOutcomeSchema,
  CodeRunVerdictSchema,
} from "./enums.js";
import { TEST_CASES_MAX } from "./run.js";

// The teacher's summary of a student's runs in a work (021 contracts/http-api.md, research Y10). Ids,
// enums, counts and times only: no source code, input, expected or obtained output, stderr, compiler
// message or private case, so the answer is the same before and after the 24 h purge.

/** The last finished run of a question; `cases` only when `outcome` is EXECUTED. */
export const AttemptCodeRunLastFinishedSchema = z.strictObject({
  /** 023/FR-021: the participant who ran it (in a group, any member runs as themselves). */
  studentUserId: UuidSchema,
  status: z.enum(["COMPLETED", "FAILED"]),
  /** Set exactly when FAILED. */
  failureReason: CodeRunFailureReasonSchema.nullable(),
  /** Set exactly when COMPLETED. */
  outcome: CodeRunOutcomeSchema.nullable(),
  publicCaseCount: z.int().min(0).max(TEST_CASES_MAX),
  /** Set exactly when COMPLETED. */
  passedCount: z.int().min(0).max(TEST_CASES_MAX).nullable(),
  finishedAt: IsoDateTimeSchema,
  cases: z
    .array(
      z.strictObject({
        position: z
          .int()
          .min(0)
          .max(TEST_CASES_MAX - 1),
        verdict: CodeRunVerdictSchema,
      }),
    )
    .max(TEST_CASES_MAX),
});
export type AttemptCodeRunLastFinished = z.infer<
  typeof AttemptCodeRunLastFinishedSchema
>;

export const AttemptCodeRunQuestionSchema = z.strictObject({
  questionId: UuidSchema,
  /** The accepted runs on this question in the attempt (every participant's, in a group). */
  runCount: z.int().min(0),
  /** A QUEUED/RUNNING run exists. */
  pending: z.boolean(),
  lastFinished: AttemptCodeRunLastFinishedSchema.nullable(),
});
export type AttemptCodeRunQuestion = z.infer<
  typeof AttemptCodeRunQuestionSchema
>;

/** `GET …/attempts/:attemptId/code-runs`: every CODE question of the activity, by position. */
export const AttemptCodeRunSummarySchema = z.strictObject({
  questions: z.array(AttemptCodeRunQuestionSchema),
});
export type AttemptCodeRunSummary = z.infer<typeof AttemptCodeRunSummarySchema>;
