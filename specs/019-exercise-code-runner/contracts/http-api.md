# HTTP API Contract: 019 — Code Runner nos Exercícios

Shapes live in `packages/contracts/src/code-runs/` (new) and in `src/exercises/` and
`src/activities/` (changed), cataloged in `endpoints.ts`. Unsafe methods need `Origin` and
`Content-Type: application/json`. Bodies are strict: unknown fields → `400`.

## Student: runs

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `POST /me/activities/:activityId/questions/:questionId/code-runs` | `atividades.proprias.executar` | `CreateCodeRunRequest` `{ sourceCode }` (≤ 65 536 bytes UTF-8) → `202 CodeRun` (new) or `200 CodeRun` (the student's pending run, any question) | 400; 404 (activity not visible to the student: another class, not published, closed, cancelled, inactive enrollment; not EXERCISE; question not CODE of this activity); 409 `ATTEMPT_NOT_IN_PROGRESS` (activity visible, but no attempt in progress: not started yet or already concluded); 409 `CODE_RUN_NOT_AVAILABLE` (`details.reason`: `NO_PUBLIC_CASES` \| `NOT_SUPPORTED`); 409 `CODE_RUNNER_UNAVAILABLE` (switched off or no live worker for the profile); 413 `SOURCE_TOO_LARGE`; 429 `RATE_LIMITED` |
| `GET /me/activities/:activityId/questions/:questionId/code-runs/latest` | `atividades.proprias.executar` | → `{ run: CodeRun \| null }`: the last run of the question in the student's current attempt | 404 |
| `GET /me/code-runs/:runId` | `atividades.proprias.executar` | → `CodeRun` | 404 (another student's run, or unknown) |

Reading or creating settles the student's stale runs first (research B8).

### `CodeRun`

```ts
{
  id: string;
  questionId: string;
  status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";
  failureReason: "EXPIRED" | "INTERRUPTED" | "DISABLED" | "SANDBOX_ERROR" | null;
  outcome: "COMPILATION_ERROR" | "EXECUTED" | null;
  sourceCode: string | null;          // null after the 24 h purge
  compileOutput: string | null;
  publicCaseCount: number;
  passedCount: number | null;
  createdAt: string; finishedAt: string | null;
  contentPurged: boolean;
  cases: {                            // only when outcome = EXECUTED, in the order of publicTestCases
    position: number;                 // index into the question's publicTestCases
    verdict: "PASSED" | "WRONG_OUTPUT" | "RUNTIME_ERROR" | "TIME_LIMIT" | "MEMORY_LIMIT" | "OUTPUT_LIMIT";
    stdout: string | null; stderr: string | null; durationMs: number;
  }[];
}
```

Never present: a private case, a test case id, the count of private cases, the worker id, the claim
token or the lease. Built by an allowlist (`code-runs/views/student-run-view.ts`).

## Student: changed activity view

`StudentActivityQuestion` (012) of an EXERCISE CODE question gains:

```ts
execution: {
  status: "AVAILABLE" | "UNAVAILABLE" | "NO_PUBLIC_CASES" | "NOT_SUPPORTED";
  languageVersion: string | null;     // e.g. "Python 3.13", from the live worker
  convention: string | null;          // e.g. "A classe deve se chamar Main" — a key, the text lives in the web
  limits: { timeMs: number; memoryMb: number; outputBytes: number } | null;
} | null                              // null for WORK/EXAM and non-CODE questions
```

`convention` is a key (`JAVA_MAIN_CLASS`, `STDIN_STDOUT`), so the contracts hold no user-facing text.

## Teacher: exercise bank (changed, 010)

- `CreateExerciseRequest`/`UpdateExerciseRequest` (and each item of `POST /exercises/sets`) accept
  `testCases?: { input: string; expectedOutput: string; visibility: "PUBLIC" | "PRIVATE" }[]`
  (0–20, CODE only; another type with a non-empty list → `422 EXERCISE_RULES` with violation
  `TEST_CASES_NOT_ALLOWED`; >20 → `TEST_CASES_LIMIT`; empty expected output → `TEST_CASE_EXPECTED_OUTPUT`).
- `TeacherExercise` returns `testCases: { position, input, expectedOutput, visibility }[]`.
- `GET /programming-languages` returns `execution: "java" | "python" | "javascript" | null` per entry.

## Errors (new codes, web catalog)

`CODE_RUN_NOT_AVAILABLE`, `CODE_RUNNER_UNAVAILABLE`, `SOURCE_TOO_LARGE`, `ATTEMPT_NOT_IN_PROGRESS`
(if not already in the 012 catalog).
