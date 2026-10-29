# Data Model: 021 — Code Runner nos Trabalhos

One migration (`<ts>_work_code_runner`). No new table, enum or model.

## `class_activities` (changed)

| Column | Type | Rule |
|--------|------|------|
| `code_execution_allowed` | `boolean NOT NULL DEFAULT false` | `CHECK (type = 'ASSIGNMENT' OR NOT code_execution_allowed)` (Y1) |

- Set on apply from `codeExecution` (ASSIGNMENT only), changeable by the options edit while the activity
  has no attempt.
- Trigger `class_activities_code_execution_fixed` (`BEFORE UPDATE OF code_execution_allowed`): refuses a
  change when `activity_attempts` has a row of the activity (`check_violation`).
- Existing rows: `false` (FR-003).
- Eligibility (a CODE question with a PUBLIC case in a language with `execution`) is checked by the
  service against the snapshot, never stored (Y2).

## `code_runs` (019, triggers changed)

- `code_runs_insert_valid` (replaced): the question is CODE and the activity is an EXERCISE, **or** an
  ASSIGNMENT with `code_execution_allowed = true`.
- `code_runs_paused` (new, `BEFORE INSERT`): `attempt_paused_writes()` of 016 — no new run while the
  attempt has an open pause on an ACTIVE activity. Updates (the worker's claim and result) are not
  affected.
- Everything else (columns, partial UNIQUE of one pending run per student, transitions, purge) is 019's.

## Derived on read (never stored)

**Resumo de execuções da questão** (Y7, Y8), per attempt and CODE question:

| Field | Source |
|-------|--------|
| `runCount` | `count(*)` of `code_runs` of the attempt and question |
| `pending` | a row with status QUEUED or RUNNING |
| `lastFinished.status`, `failureReason`, `outcome`, `publicCaseCount`, `passedCount`, `finishedAt` | the COMPLETED/FAILED row with the greatest `finished_at` (then id) |
| `lastFinished.cases[]` | its `code_run_cases` (`position`, `verdict`), in position order |

All these columns survive the 24 h purge of `code-run-content` (it empties `source_code`,
`compile_output`, `stdout`, `stderr`), so the summary is the same before and after it.

**Elegibilidade** (Y2): `runnableCodeQuestionCount` of a bank work = CODE questions with ≥ 1 PUBLIC
`work_test_cases` row and a language whose `execution` is not null; the activity's eligibility uses the
same rule over `class_activity_questions` / `class_activity_test_cases`.

## Loader

`OwnAttemptContext` (student activities) gains `codeExecutionAllowed: boolean`.

## Prisma

`ClassActivity.codeExecutionAllowed Boolean @default(false) @map("code_execution_allowed")`.
