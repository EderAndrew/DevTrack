import { z } from "zod";
import { IsoDateTimeSchema, UuidSchema } from "../common/primitives.js";
import { CodeRunFailureReasonSchema, CodeRunOutcomeSchema, CodeRunStatusSchema, CodeRunVerdictSchema } from "./enums.js";

// A student's run of a CODE question (019 contracts/http-api.md, research B13). Built on the server
// from an allowlist (`code-runs/views/student-run-view.ts`): no private case, test case id, count of
// private cases, worker id, claim token or lease.

/** Largest source a run takes, in UTF-8 bytes (64 KB); more → `413 SOURCE_TOO_LARGE`. */
export const CODE_RUN_MAX_SOURCE_BYTES = 65_536;
/** Test cases per CODE exercise (research B16), as the 011 work bank. */
export const TEST_CASES_MAX = 20;
/** The web polls a pending run every second, only while the page is visible (research B13). */
export const CODE_RUN_POLL_MS = 1000;

/** UTF-8 length of a string without `TextEncoder`/`Buffer` (a lone surrogate counts as U+FFFD, 3 bytes). */
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (unit >= 0xd800 && unit <= 0xdbff && i + 1 < value.length && (value.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}

/** `POST …/code-runs`: the program as typed; an empty program is accepted (spec Edge Cases). */
export const CreateCodeRunRequestSchema = z.strictObject({
  sourceCode: z.string().refine((value) => utf8ByteLength(value) <= CODE_RUN_MAX_SOURCE_BYTES),
});
export type CreateCodeRunRequest = z.infer<typeof CreateCodeRunRequestSchema>;

/** One public case of an EXECUTED run; `position` indexes the question's `publicTestCases`. */
export const CodeRunCaseSchema = z.strictObject({
  position: z.int().min(0).max(TEST_CASES_MAX - 1),
  verdict: CodeRunVerdictSchema,
  /** Null after the 24 h purge (research B12). */
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  durationMs: z.int().min(0),
});
export type CodeRunCase = z.infer<typeof CodeRunCaseSchema>;

export const CodeRunSchema = z.strictObject({
  id: UuidSchema,
  questionId: UuidSchema,
  status: CodeRunStatusSchema,
  /** Set exactly when FAILED. */
  failureReason: CodeRunFailureReasonSchema.nullable(),
  /** Set exactly when COMPLETED. */
  outcome: CodeRunOutcomeSchema.nullable(),
  /** Null after the 24 h purge. */
  sourceCode: z.string().nullable(),
  /** The check/compile message of a COMPILATION_ERROR; null otherwise or after the purge. */
  compileOutput: z.string().nullable(),
  publicCaseCount: z.int().min(0).max(TEST_CASES_MAX),
  /** Set exactly when COMPLETED. */
  passedCount: z.int().min(0).max(TEST_CASES_MAX).nullable(),
  createdAt: IsoDateTimeSchema,
  finishedAt: IsoDateTimeSchema.nullable(),
  contentPurged: z.boolean(),
  /** Only when `outcome` is EXECUTED, in the order of `publicTestCases`. */
  cases: z.array(CodeRunCaseSchema).max(TEST_CASES_MAX),
});
export type CodeRun = z.infer<typeof CodeRunSchema>;

/** `GET …/code-runs/latest`: the last run of the question in the student's current attempt. */
export const LatestCodeRunSchema = z.strictObject({ run: CodeRunSchema.nullable() });
export type LatestCodeRun = z.infer<typeof LatestCodeRunSchema>;
