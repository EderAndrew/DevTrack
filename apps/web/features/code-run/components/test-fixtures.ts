import type { AttemptCodeRunLastFinished, AttemptCodeRunQuestion, CodeRun, QuestionExecution } from "@repo/contracts";

export const ACTIVITY_ID = "bbbbbbbb-0000-4000-8000-000000000019";
export const QUESTION_ID = "cccccccc-0000-4000-8000-000000000019";
export const OTHER_QUESTION_ID = "cccccccc-0000-4000-8000-000000000020";
export const RUN_ID = "eeeeeeee-0000-4000-8000-000000000019";

export const PUBLIC_CASES = [
  { input: "1\n", expectedOutput: "2\n" },
  { input: "3\n", expectedOutput: "6\n" },
];

export const SOURCE = "print(int(input()) * 2)\n";

export const available = (overrides: Partial<QuestionExecution> = {}): QuestionExecution => ({
  status: "AVAILABLE",
  languageVersion: "Python 3.13",
  convention: "STDIN_STDOUT",
  limits: { timeMs: 2000, memoryMb: 256, outputBytes: 65_536 },
  ...overrides,
});

/** A run as the API answers it (019 contracts/http-api.md): by default COMPLETED, both cases passed. */
export const codeRun = (overrides: Partial<CodeRun> = {}): CodeRun => ({
  id: RUN_ID,
  questionId: QUESTION_ID,
  status: "COMPLETED",
  failureReason: null,
  outcome: "EXECUTED",
  sourceCode: SOURCE,
  compileOutput: null,
  publicCaseCount: 2,
  passedCount: 2,
  createdAt: "2026-10-15T12:00:00.000Z",
  finishedAt: "2026-10-15T12:00:02.000Z",
  contentPurged: false,
  cases: [
    { position: 0, verdict: "PASSED", stdout: "2\n", stderr: "", durationMs: 120 },
    { position: 1, verdict: "PASSED", stdout: "6\n", stderr: "", durationMs: 95 },
  ],
  ...overrides,
});

export const pendingRun = (status: "QUEUED" | "RUNNING", overrides: Partial<CodeRun> = {}) =>
  codeRun({ status, outcome: null, passedCount: null, finishedAt: null, cases: [], ...overrides });

// 021/US3: the teacher's summary of a student's runs in a work.
export const CLASS_ID = "aaaaaaaa-0000-4000-8000-000000000021";
export const ATTEMPT_ID = "dddddddd-0000-4000-8000-000000000021";

/** The last finished run of a summary: by default EXECUTED, 1 of 2 public cases passed. */
export const lastFinished = (overrides: Partial<AttemptCodeRunLastFinished> = {}): AttemptCodeRunLastFinished => ({
  status: "COMPLETED",
  failureReason: null,
  outcome: "EXECUTED",
  publicCaseCount: 2,
  passedCount: 1,
  finishedAt: "2026-10-15T12:00:02.000Z",
  cases: [
    { position: 0, verdict: "PASSED" },
    { position: 1, verdict: "WRONG_OUTPUT" },
  ],
  ...overrides,
});

/** One CODE question of the summary: by default 3 runs, none pending, the last 1 of 2. */
export const summaryQuestion = (overrides: Partial<AttemptCodeRunQuestion> = {}): AttemptCodeRunQuestion => ({
  questionId: QUESTION_ID,
  runCount: 3,
  pending: false,
  lastFinished: lastFinished(),
  ...overrides,
});
