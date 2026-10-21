import { z } from "zod";

// Code Runner runs (019 data-model.md, research B6, B8). Platform concepts, fixed in code
// (constitution XXI); the labels live in the web.

/** A run's state (research B8): QUEUED → RUNNING → COMPLETED, or FAILED from either pending state. */
export const CodeRunStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export type CodeRunStatus = z.infer<typeof CodeRunStatusSchema>;

/**
 * Why a run FAILED (research B8): not started in time, the worker died, execution switched off, or
 * the sandbox itself broke. Never the student program's fault (that is a verdict).
 */
export const CodeRunFailureReasonSchema = z.enum(["EXPIRED", "INTERRUPTED", "DISABLED", "SANDBOX_ERROR"]);
export type CodeRunFailureReason = z.infer<typeof CodeRunFailureReasonSchema>;

/** What a COMPLETED run did (research B6): stopped at the check/compile step, or ran the public cases. */
export const CodeRunOutcomeSchema = z.enum(["COMPILATION_ERROR", "EXECUTED"]);
export type CodeRunOutcome = z.infer<typeof CodeRunOutcomeSchema>;

/** One public case's verdict (research B6), in the order the worker decides it. */
export const CodeRunVerdictSchema = z.enum(["PASSED", "WRONG_OUTPUT", "RUNTIME_ERROR", "TIME_LIMIT", "MEMORY_LIMIT", "OUTPUT_LIMIT"]);
export type CodeRunVerdict = z.infer<typeof CodeRunVerdictSchema>;

/**
 * Execution profile of a catalog language (research B5): the `programming_languages.execution` key.
 * The code knows these keys, never the catalog's languages.
 */
export const ExecutionKeySchema = z.enum(["java", "python", "javascript"]);
export type ExecutionKey = z.infer<typeof ExecutionKeySchema>;

/** Why a CODE question of an exercise can never be run (`409 CODE_RUN_NOT_AVAILABLE` `details.reason`). */
export const CodeRunUnavailableReasonSchema = z.enum(["NO_PUBLIC_CASES", "NOT_SUPPORTED"]);
export type CodeRunUnavailableReason = z.infer<typeof CodeRunUnavailableReasonSchema>;

/**
 * Whether the student can run a question now (research B17): AVAILABLE, the execution switched off or
 * no live worker for the profile (UNAVAILABLE), or one of the permanent reasons above.
 */
export const QuestionExecutionStatusSchema = z.enum(["AVAILABLE", "UNAVAILABLE", ...CodeRunUnavailableReasonSchema.options]);
export type QuestionExecutionStatus = z.infer<typeof QuestionExecutionStatusSchema>;

/** The program convention shown on the question (FR-020); a key, the text lives in the web. */
export const ExecutionConventionSchema = z.enum(["JAVA_MAIN_CLASS", "STDIN_STDOUT"]);
export type ExecutionConvention = z.infer<typeof ExecutionConventionSchema>;
