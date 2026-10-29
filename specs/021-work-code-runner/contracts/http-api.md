# HTTP API Contract: 021 — Code Runner nos Trabalhos

Shapes live in `packages/contracts/src/{activities,works,code-runs}/`, cataloged in `endpoints.ts`.
Unsafe methods need `Origin` and `Content-Type: application/json`. Bodies are strict: unknown fields →
`400`.

## Teacher: apply and options (changed, 012/015 routes)

| Method & path | Permission | Change |
|---|---|---|
| `POST /classes/:classId/activities` | `atividades.aplicar` | ASSIGNMENT body: `codeExecution: boolean` (default `false`). EXERCISE and EXAM bodies refuse it (`400`). `true` on a work with no eligible CODE question → `422 CODE_EXECUTION_NOT_ELIGIBLE` (Y2). |
| `PATCH /classes/:classId/activities/:activityId` | `atividades.aplicar` | `codeExecution?: boolean`, ASSIGNMENT only (`400` otherwise). Any change with an attempt in the activity → `409 ACTIVITY_ALREADY_STARTED`; `true` on a non-eligible snapshot → `422 CODE_EXECUTION_NOT_ELIGIBLE`. A change is one of the 015 options (`activity.settings_changed`). |
| `GET` of a teacher activity (list, detail) | (012) | `TeacherActivitySummary` and `TeacherActivity` gain `codeExecution: boolean` (always `false` for EXERCISE and EXAM). |
| `GET /works` (list) | (011) | `WorkSummary` (the items of `WorkPageSchema`) gains `runnableCodeQuestionCount: int ≥ 0` (CODE questions with ≥ 1 PUBLIC case in a language with execution). The detail `WorkTeacherView` does not change. |

## Teacher: runner availability (new)

| Method & path | Permission | Response | Errors |
|---|---|---|---|
| `GET /code-runner/availability` | `atividades.aplicar` | `CodeRunnerAvailability` `{ available: boolean }` — kill switch on and a fresh heartbeat with at least one profile | 403 |

## Teacher: run summary of an attempt (new)

| Method & path | Permission | Response | Errors |
|---|---|---|---|
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/code-runs` | `entregas.visualizar` | `AttemptCodeRunSummary` | 403; 404 (another teacher's class, an activity of another class, an attempt of another activity, an activity that is not an ASSIGNMENT with `codeExecution`) |

```ts
AttemptCodeRunSummary = {
  questions: {                       // every CODE question of the activity, by position
    questionId: string;
    runCount: number;                // accepted runs of the student on this question
    pending: boolean;                // a QUEUED/RUNNING run exists
    lastFinished: null | {
      status: "COMPLETED" | "FAILED";
      failureReason: "EXPIRED" | "INTERRUPTED" | "DISABLED" | "SANDBOX_ERROR" | null;
      outcome: "COMPILATION_ERROR" | "EXECUTED" | null;
      publicCaseCount: number;
      passedCount: number | null;
      finishedAt: string;            // server time
      cases: { position: number; verdict: CodeRunVerdict }[];   // only when outcome = EXECUTED
    };
  }[];
}
```

Never present: source code, an input, an expected or obtained output, stderr, a compiler message, a
private case. The answer is the same before and after the 24 h purge. Reading settles the student's
stale runs first (019 research B8). Not audited.

## Student: runs (019 routes, rules extended)

`POST /me/activities/:activityId/questions/:questionId/code-runs`, `GET …/code-runs/latest`,
`GET /me/code-runs/:runId` keep 019's shapes and errors, and now accept a CODE question of an
ASSIGNMENT with `codeExecution`:

| Situation (ASSIGNMENT) | `POST` | `latest` | `GET :runId` |
|---|---|---|---|
| Activity without `codeExecution`, or an EXAM | 404 | 404 | 404 |
| Not marked present (016) | 404 | 404 | 404 |
| No attempt, or attempt SUBMITTED | `409 ATTEMPT_NOT_IN_PROGRESS` | `{ run: null }` | 404 |
| Attempt paused (016) | `409 ATTEMPT_PAUSED` (+ `attempt_pause.write_refused`, `operation: "CODE_RUN"`) | `409 ATTEMPT_PAUSED` | `409 ATTEMPT_PAUSED` |
| A save would be refused (deadline with REJECT, activity closed) | the save's `409` code (012 `decideOperation("SAVE")`) | the last run | the run |
| Otherwise | 019 (`202`/`200`, `CODE_RUN_NOT_AVAILABLE`, `CODE_RUNNER_UNAVAILABLE`, `413`, `429`) | 019 | 019 |

The pending-run rule and the per-minute limit are shared with exercises. EXERCISE behaviour is
unchanged.

## Student: activity view (unchanged shape)

`StudentQuestion.execution` is now filled for the CODE questions of an ASSIGNMENT with `codeExecution`
(019 statuses `AVAILABLE`, `UNAVAILABLE`, `NO_PUBLIC_CASES`, `NOT_SUPPORTED`); without the option it
stays `null`. Public cases were already in the work's student view (011).

## Error codes (new)

| Code | Status | Message key (web catalog) |
|---|---|---|
| `CODE_EXECUTION_NOT_ELIGIBLE` | 422 | "Este trabalho não tem questão de Código com caso público numa linguagem com execução." |
