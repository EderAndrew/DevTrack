# Data Model: 019 — Code Runner nos Exercícios

One migration (`<ts>_exercise_code_runner`). Nothing existing changes meaning: the 012 snapshot table
`class_activity_test_cases` starts receiving rows for EXERCISE activities too.

## Changed: `programming_languages`

| Column | Type | Rule |
|--------|------|------|
| `execution` | text NULL | CHECK `execution IN ('java','python','javascript')`; seed: keys `java` → `java`, `python` → `python`, `javascript` → `javascript`; others NULL (research B5) |

## New: `exercise_test_cases` (bank, 010)

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `exercise_id` | uuid FK → `exercises(id)` RESTRICT | |
| `position` | int | 0…19; UNIQUE (`exercise_id`, `position`) |
| `input` | text | ≤ 10 000 chars (may be empty) |
| `expected_output` | text | 1…10 000 chars |
| `visibility` | `work_test_case_visibility` | `PUBLIC` / `PRIVATE` (reuses the 011 enum) |

- Deferred trigger: the exercise is `CODE`; at most 20 rows per exercise; positions gap-free.
- Replaced as a whole on each save of the exercise (delete + insert in the same transaction).
- `ARCHIVED` exercises: no writes (the 010 trigger on `exercises` already blocks edits; a new trigger
  refuses test-case writes when the exercise is ARCHIVED).

## Changed: snapshot (012)

`activities/snapshot/from-exercises.ts` copies the exercise's cases into `class_activity_test_cases`
(already: only CODE, ≤ 20, immutable). Activities applied before 019 keep zero cases.

## New enums

- `code_run_status`: `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`
- `code_run_failure_reason`: `EXPIRED`, `INTERRUPTED`, `DISABLED`, `SANDBOX_ERROR`
- `code_run_outcome`: `COMPILATION_ERROR`, `EXECUTED`
- `code_run_verdict`: `PASSED`, `WRONG_OUTPUT`, `RUNTIME_ERROR`, `TIME_LIMIT`, `MEMORY_LIMIT`, `OUTPUT_LIMIT`

## New: `code_runs`

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `activity_id` | uuid | composite FK (`question_id`, `activity_id`) → `class_activity_questions(id, activity_id)` |
| `question_id` | uuid | the question is `CODE` (trigger) |
| `attempt_id` | uuid | composite FK (`attempt_id`, `activity_id`, `student_user_id`) → the 012 attempt |
| `student_user_id` | uuid FK → `users` | |
| `execution` | text | the profile key copied at creation (CHECK as above) |
| `status` | `code_run_status` | default `QUEUED` |
| `failure_reason` | `code_run_failure_reason` NULL | set iff `FAILED` (CHECK) |
| `outcome` | `code_run_outcome` NULL | set iff `COMPLETED` (CHECK) |
| `source_code` | text NULL | ≤ 65 536 bytes; NULL only after the purge |
| `compile_output` | text NULL | ≤ 16 KB; only with `COMPILATION_ERROR` |
| `public_case_count` | int | 1…20, the PUBLIC cases at creation |
| `passed_count` | int NULL | set iff `COMPLETED` |
| `created_at` | timestamptz | server clock |
| `deadline_at` | timestamptz | `created_at + CODE_RUN_QUEUE_DEADLINE_SECONDS` |
| `claimed_at`, `lease_until` | timestamptz NULL | set iff it was ever `RUNNING` |
| `claimed_by` | text NULL | worker id |
| `claim_token` | uuid NULL | the claim; the result write must match it |
| `finished_at` | timestamptz NULL | set iff `COMPLETED`/`FAILED` |
| `content_purged_at` | timestamptz NULL | set by the maintenance job |

- Partial UNIQUE (`student_user_id`) WHERE `status IN ('QUEUED','RUNNING')` (research B9).
- Index (`status`, `created_at`) WHERE `status = 'QUEUED'` (claim); index (`attempt_id`,
  `question_id`, `created_at` DESC) (latest); index (`finished_at`) WHERE `content_purged_at IS NULL`
  (purge).
- Trigger: transitions only `QUEUED→RUNNING`, `QUEUED→FAILED`, `RUNNING→COMPLETED`,
  `RUNNING→FAILED`; a final row only accepts the purge (content columns → NULL and
  `content_purged_at`); no DELETE.

## New: `code_run_cases`

| Column | Type | Rule |
|--------|------|------|
| `id` | uuid PK | |
| `run_id` | uuid FK → `code_runs` | |
| `test_case_id` | uuid FK → `class_activity_test_cases` | a PUBLIC case of the run's question (trigger) |
| `position` | int | the case's position among the PUBLIC cases; UNIQUE (`run_id`, `position`) |
| `verdict` | `code_run_verdict` | |
| `stdout` | text NULL | ≤ 64 KB; NULL after the purge |
| `stderr` | text NULL | ≤ 16 KB; NULL after the purge |
| `exit_code` | int NULL | |
| `duration_ms` | int | ≥ 0 |

- Inserted only together with the run's `RUNNING → COMPLETED/EXECUTED` (one per PUBLIC case); immutable
  except the purge.

## New: `code_runner_heartbeats`

| Column | Type | Rule |
|--------|------|------|
| `worker_id` | text PK | host + pid + start |
| `started_at`, `last_seen_at` | timestamptz | |
| `executions` | jsonb | `[{ key, version }]`, the profiles this worker runs |
| `limits` | jsonb | `{ timeMs, compileMs, memoryMb, outputBytes }` |

Rows older than 1 day are removed by the worker on start.

## Permissions (seed)

- `atividades.proprias.executar` → STUDENT (contracts/permissions.md).

## State machine: a run

```text
            claim (worker, deadline not passed)            result (claim_token matches)
QUEUED ────────────────────────────────────▶ RUNNING ──────────────────────────────▶ COMPLETED
  │  deadline passed → FAILED/EXPIRED              │  lease passed → FAILED/INTERRUPTED
  │  switched off   → FAILED/DISABLED              │  Docker failure → FAILED/SANDBOX_ERROR
  ▼                                                ▼
FAILED ◀───────────────────────────────────────────┘
```

Derived on read (never stored): `stale` (the editor's code differs from `source_code`, web only).
