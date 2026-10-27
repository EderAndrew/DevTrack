# Research: 021 — Code Runner nos Trabalhos

Decisions carry the prefix **Y**. The Code Runner itself (worker, sandbox, profiles, limits, verdicts,
comparison, retention, kill switch) is 019's (research B1–B17) and does not change.

## Y1 — The teacher's option is a column of the activity

**Decision**: `class_activities.code_execution_allowed boolean NOT NULL DEFAULT false`, with
`CHECK (type = 'ASSIGNMENT' OR NOT code_execution_allowed)`. The apply body of an ASSIGNMENT takes
`codeExecution: boolean` (default `false`); the strict EXERCISE and EXAM bodies refuse it (400). The
update body takes it as optional, ASSIGNMENT only (400 otherwise, as `executionMode`), and it joins the
015 "options" of `ActivitiesService.update`: a change with an attempt in the activity is
`409 ACTIVITY_ALREADY_STARTED`, audited as `activity.settings_changed`. A trigger refuses changing the
column once the activity has an attempt (defense in depth; the service answers first).

**Rationale**: the same shape and lifecycle as `execution_mode`/`ai_help_allowance` (015/FR-002, FR-005),
which the teacher already learned; a CHECK keeps exercises (always run, 019) and exams (never run, 018)
out by construction. Existing rows get `false` (FR-003).

**Alternatives considered**: a per-question flag (more choice than the spec asks; the teacher decides
per work); an enum (two values only); reusing `execution_mode` (independent of NORMAL/CONTROLLED,
FR-004).

## Y2 — Eligibility is derived from the snapshot, never stored

**Decision**: a pure `codeExecutionEligible(questions)` in `activities/` — true when the snapshot has a
CODE question with at least one PUBLIC case whose language has `execution` (019 catalog column). The
apply and the update refuse `codeExecution: true` on a non-eligible work with
`422 CODE_EXECUTION_NOT_ELIGIBLE`. The web needs the same answer before applying, so `WorkSummary`
gains `runnableCodeQuestionCount` (int ≥ 0), computed by `work-query.ts` with the same rule over the
bank's questions; the option appears only when it is > 0 (US2-1, US2-2).

**Rationale**: the rule reads catalog data and counts cases (no code execution, allowed by
`works-boundary.spec.ts`); computing it on read keeps the bank and the snapshot from disagreeing after a
catalog change.

**Alternatives considered**: a separate eligibility route (one more request on the apply form); showing
the option always and refusing on submit (US2-2 asks it to be hidden).

## Y3 — The runner's availability for the teacher

**Decision**: a new teacher route `GET /code-runner/availability` (`atividades.aplicar`) answering
`{ available: boolean }` from `RunnerAvailability.state` (kill switch + fresh heartbeat with at least
one profile). The apply form shows the US2-6 notice when it is false; the option stays enabled. The
apply never checks it (FR-001 asks only for eligibility).

**Rationale**: the warning is about the moment of applying; the student's own `execution` (019) keeps
deciding the button at answering time.

**Alternatives considered**: refusing the option while the runner is down (US2-6 says it stays
available); embedding availability in `WorkSummary` (a list of works is not about the runner).

## Y4 — Admission of a run on a work

**Decision**: `CodeRunsService.runnableQuestion` accepts an EXERCISE (019, unchanged) or an ASSIGNMENT
whose `codeExecutionAllowed` is true; anything else (EXAM, ASSIGNMENT without the option) stays
`OutOfContext` → the same 404 of 019. For an ASSIGNMENT, after the attempt check
(`409 ATTEMPT_NOT_IN_PROGRESS`), the service applies the same rules as the 015 help
(`work-help.service.ts` `admissible`): paused → `AttemptPaused` → `409 ATTEMPT_PAUSED` with
`attempt_pause.write_refused` (`operation: "CODE_RUN"`) after the rollback; then
`decideOperation("SAVE", factsOf(context, now))` (012) — a refusal answers its own code (the deadline
without late submission, a closed activity). Presence (016) is already in `StudentActivityLoader`
(`NOT_PRESENT` → 404). `OwnAttemptContext` gains `codeExecutionAllowed`. The save facts move from
`work-help` to `student-activities/save-facts.ts` (`saveFactsOf`, pure, next to the loader), since
`code-runs` never imports `work-help`. Rate limit and one pending run
per student are 019's, shared across exercises and works (FR-010).

**Rationale**: FR-006 ties execution to "a save would be accepted"; reusing `decideOperation` makes that
literally the save rule instead of a copy. The attempt is read `FOR SHARE` (019) — enough, since a run
never writes the attempt.

**Alternatives considered**: a separate service for works (duplicates the queue logic); checking only
`IN_PROGRESS` (would let a work run after a REJECT deadline).

## Y5 — Database defense

**Decision**: one migration:
- the column and CHECK of Y1, and a `BEFORE UPDATE` trigger refusing a change of
  `code_execution_allowed` while `activity_attempts` has a row of the activity;
- `code_runs_insert_valid` replaced: a CODE question of an EXERCISE, or of an ASSIGNMENT with
  `code_execution_allowed`;
- `code_runs_paused`: `BEFORE INSERT ON code_runs` reusing 016's `attempt_paused_writes()` (keyed by
  `attempt_id`); only the insert, so the worker still finishes a run of a paused attempt (US4-7).

**Rationale**: the same layered defense 016 and 019 use (service answers, trigger guarantees).

## Y6 — What the student reads of a work's runs

**Decision**: for a run of an ASSIGNMENT, `latest` and `get` answer only while the attempt is
IN_PROGRESS and not paused: paused → `409 ATTEMPT_PAUSED` (no audit: a read), not in progress →
`latest` gives `{ run: null }` (019) and `get` the same 404 as another student's run. Exercises keep
019's behaviour.

**Rationale**: FR-011 (runs only during the attempt) and 016/FR-013 (no answer while paused: a run
holds the student's program and outputs).

## Y7 — The teacher's summary is its own route in `code-runs`

**Decision**: `GET /classes/:classId/activities/:activityId/attempts/:attemptId/code-runs`
(`entregas.visualizar`, like the 015 timeline), served by `CodeRunReviewService` in `modules/code-runs`
with `ClassContextPolicy`: another teacher's class, an activity of another class, an attempt of another
activity, or an activity that is not an ASSIGNMENT with the option → 404. It settles the student's stale
runs first (019 `settleStaleRuns`), then answers one item per CODE question of the activity, in
position order:

```text
{ questionId, runCount, pending, lastFinished: null | { status, failureReason, outcome,
  publicCaseCount, passedCount, finishedAt, cases: [{ position, verdict }] } }
```

No source, input, output, stderr or compiler message (FR-013). Not audited (a read, as 015).

**Rationale**: the activities modules never import `code-runs` (boundary); the 015 timeline set the
pattern of a review fact served by its own module. `code_run_cases.verdict` and the run's counts
survive the 24 h purge (019 keeps rows, empties content), so the summary is the same before and after
(FR-013, SC-005), derived on every read (FR-014).

**Alternatives considered**: embedding the summary in `TeacherAttempt` (would make `activities` read
`code_runs`, against the boundary); storing counters on the attempt (stored derived data).

## Y8 — Counting

**Decision**: `runCount` = every `code_runs` row of the attempt and question (accepted requests; a
refused request never creates one). `lastFinished` = the COMPLETED/FAILED row with the greatest
`finished_at` (ties by id). `pending` = a QUEUED/RUNNING row exists. A COMPLETED run with
`outcome = COMPILATION_ERROR` shows "Erro de compilação" and no cases; FAILED shows "Não foi possível
executar agora".

## Y9 — The student view and the web

**Decision**:
- `toStudentActivity` passes `executionOf` for an EXERCISE (019) or an ASSIGNMENT with
  `codeExecutionAllowed`; any other CODE question keeps `execution: null` — so a work without the option
  shows nothing (US1-5).
- `activity-answering.tsx` mounts `CodeRunPanel` when `question.type === "CODE" && question.execution &&
  editable`, instead of "EXERCISE only". The 015 focus page renders the same component, so the panel
  lives in it unchanged (FR-009); the document-level clipboard block already covers the result.
- `features/activities/components/work-options.tsx`: the checkbox "Permitir executar o código" (apply
  and the options edit), shown only when `runnableCodeQuestionCount > 0`, with the US2-6 notice from
  `GET /code-runner/availability`; the detail and the list show "Execução de código: permitida".
- `features/code-run/components/code-run-summary.tsx` (+ hook) mounted by `attempt-review.tsx` on each
  CODE question when the activity has the option.

## Y10 — Contracts

**Decision**: `codeExecution` in `CreateAssignmentRequest` (default false) and `UpdateActivityRequest`
(optional), and as `codeExecution: boolean` in `TeacherActivitySummary`/`TeacherActivity`;
`runnableCodeQuestionCount` in `WorkSummary`; `code-runs/review.ts` with `AttemptCodeRunSummary`;
`code-runs/availability.ts` with `CodeRunnerAvailability`; two endpoint-catalog entries. The student
shapes do not change (the per-question `execution` already exists).

## Y11 — Audit

**Decision**: no new type. `activity.published` and `activity.settings_changed` metadata gain
`codeExecution`; `code_run.requested` gains `activityType` (`EXERCISE`/`ASSIGNMENT`);
`attempt_pause.write_refused`'s `operation` gains `CODE_RUN`. Metadata stays ids, enums, counts and
times.

## Y12 — Tests and guards

**Decision**: per-story integration suites `021-us1-run-work` … `021-us4-rules`, `021-schema`
(CHECK, triggers), and security suites: isolation (teacher B's summary, student on another class's work),
private cases on works (SC-002, the 012 `MARCADOR-PRIVADO-012`), invariance (submission, grades and
release equal with 0 and 50 runs — SC-003), audit/log scan with a work's `MARCADOR-CODIGO-021`, and the
refusal matrix of SC-004 (no option, exam, paused, submitted, REJECT deadline, closed). Web tests for
the option, the panel on a work (normal and focus page), the summary, keyboard and axe. One E2E
`work-code-runner.spec.ts`. `traceability.spec.ts` gets 021 at the first implementation phase.
`activities-boundary.spec.ts` keeps passing: the activity modules gain only a column and the pure
eligibility; `code-runner-boundary.spec.ts` is unchanged.

## Y13 — No new configuration or dependency

The limits, the kill switch, the rate (`RATE_LIMIT_CODE_RUNS_PER_MINUTE`, scope `code-runs`) and the
retention job are 019's. No npm dependency, no infrastructure.
