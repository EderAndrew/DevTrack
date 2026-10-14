# Data Model: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

One migration, `<ts>_controlled_exams`, makes these changes:

- **New Prisma models**: the Banco de Provas (`Exam`, `ExamTopic`, `ExamQuestion`,
  `ExamQuestionAlternative`, `ExamQuestionTestCase`, `ExamQuestionTopic`, `ExamGenerationRequest`,
  `ExamGenerationRequestTopic`), `ExamOccurrence` and `ExamAttemptHold`, pinned by
  `domain-boundary.spec.ts`.
- **Changed**: `class_activities`, `class_activity_questions`, `activity_submissions`; enum values in
  `class_activity_type` and `attempt_integrity_event_type`.
- **New enums**: `exam_status`, `exam_origin`, `exam_end_reason`, `exam_occurrence_kind`,
  `exam_hold_resolution`.
- **Seed**: the permissions of `contracts/permissions.md` for TEACHER; the `exam-generator` agent
  (DISABLED) by the 006 registry on boot.

## New: the Banco de Provas (research T2)

Shaped like the 011 tables; only the differences are listed.

### `exams`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `teacher_id` | uuid | FK → `users`; every query filters by it |
| `subject_id` | uuid | FK → `subjects` |
| `syllabus_revision_id` | uuid | NOT NULL (topics are required); confirmed revision of the subject |
| `title`, `title_search_key`, `description` | text | title 1–200 |
| `total_grade` | numeric(5,2) | 0.01–100.00; the questions' values add up to it (deferred trigger) |
| `question_count` | int | 1–20, equal to the number of questions (deferred trigger) |
| `origin` | `exam_origin` (`MANUAL`, `AI_GENERATED`) | immutable (trigger) |
| `status` | `exam_status` (`DRAFT`, `APPROVED`, `ARCHIVED`) | |
| `archived_from_status` | `exam_status` NULL | set iff ARCHIVED (CHECK) |
| `generation_request_id` | uuid NULL UNIQUE | set iff AI_GENERATED (CHECK) |
| `human_reviewed`, `human_edited`, `reviewed_by_id`, `reviewed_at` | | as 011 |
| `version` | int | optimistic concurrency of the aggregate |
| `created_at`, `updated_at` | timestamptz | |

### `exam_questions`

As `work_questions` (type, grading strategy by type, statement, value, explanation, keys, code
fields, trick flag, `generation_item_id`), plus:

| Column | Type | Rules |
|---|---|---|
| `difficulty` | `work_difficulty` NULL | required for APPROVED (deferred trigger on the exam's status) |

`exam_question_alternatives`, `exam_question_test_cases` (≤ 20 per question) and
`exam_question_topics` (1–3 per question for APPROVED, topics of the exam only, composite FK) follow
011. `exam_topics` ≤ 20 per exam.

Approval (`DRAFT → APPROVED`, deferred trigger): every question has its key, a difficulty and at
least one topic.

### `exam_generation_requests` / `exam_generation_request_topics`

As the 011 pair: teacher, subject, revision, title, difficulty, total grade, quantity (1–20),
per-type distribution, trick count (0–3, ≤ multiple-choice count), topics (1–10), the AI execution
link and `generated_at`. Status derived from the execution, never stored.

## Changed: `class_activities` (research T3)

| Column | Type | Rules |
|---|---|---|
| `type` | `class_activity_type` += `EXAM` | |
| `source_exam_id` | uuid NULL | FK → `exams`; set iff EXAM (CHECK) |
| `duration_minutes` | smallint NULL | 1–120; set iff EXAM (CHECK) |
| `inactivity_limit_seconds` | smallint NULL | 30–60; set iff EXAM (CHECK) |
| `start_window_minutes` | smallint NULL | 0–60; set iff EXAM (CHECK) |

CHECKs changed or added:
- `type = 'EXAM'` ⇒ `execution_mode = 'CONTROLLED'`, `ai_help_allowance = 0`,
  `release_mode = 'PRESENT_ONLY'`, `total_grade IS NOT NULL`, `deadline IS NULL`,
  `late_policy IS NULL`, `source_work_id IS NULL`;
- `CONTROLLED` and `PRESENT_ONLY` allowed for `ASSIGNMENT` or `EXAM` (was ASSIGNMENT only);
- the 012 immutability trigger adds the four new columns.

## Changed: `class_activity_questions`

| Column | Type | Rules |
|---|---|---|
| `exam_difficulty` | `work_difficulty` NULL | set iff the activity is EXAM (deferred trigger) |
| `value` | | now ASSIGNMENT or EXAM (deferred trigger by type) |

## Changed: `activity_submissions`

| Column | Type | Rules |
|---|---|---|
| `end_reason` | `exam_end_reason` NULL (`STUDENT_SUBMITTED`, `TIME_EXPIRED`, `ACTIVITY_CLOSED`, `ENDED_BY_WARNINGS`, `CANCELLED`) | set iff the activity is EXAM (trigger) |
| `cancelled_by_id` | uuid NULL | FK → `users`; set iff `end_reason = 'CANCELLED'` (CHECK) |

A `CANCELLED` submission has `grade = 0`, `grade_partial = false` and every question graded
`DECIDED` with 0 by `cancelled_by_id` (trigger checks the grade). `TIME_EXPIRED`, `ACTIVITY_CLOSED`
and `ENDED_BY_WARNINGS` have `late = false` and `submitted_at` equal to the derived end
(research T5, T9).

## Changed: `attempt_integrity_event_type`

Gains `INACTIVITY`. A new nullable `attempt_integrity_events.idle_seconds` smallint, set iff
`INACTIVITY` (CHECK, 30–60).

## New: `exam_occurrences` (research T6)

| Column | Type | Rules |
|---|---|---|
| `attempt_id`, `activity_id`, `student_user_id` | uuid | composite FK → `activity_attempts` |
| `ordinal` | smallint | ≥ 1; `UNIQUE (attempt_id, ordinal)`; gap-free (trigger: `ordinal = max + 1`) |
| `kind` | `exam_occurrence_kind` (`SCREEN_LEFT`, `FULLSCREEN_EXITED`, `CLIPBOARD`, `INACTIVITY`) | |
| `first_event_id` | uuid | FK → `attempt_integrity_events`, same attempt (composite FK) |
| `recorded_at` | timestamptz | server clock; the first event's |

Triggers: INSERT only for an EXAM attempt `IN_PROGRESS`, with no open pause and no open hold;
append-only (UPDATE and DELETE refused, bypassed only by `resetDb`).

## New: `exam_attempt_holds` (research T8)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id`, `activity_id`, `student_user_id` | uuid | composite FK → `activity_attempts` |
| `occurrence_ordinal` | smallint | the occurrence that opened it (composite FK → `exam_occurrences`) |
| `opened_at` | timestamptz | server clock |
| `resolution` | `exam_hold_resolution` NULL (`CANCEL_CONFIRMED`, `RETURNED`, `NOT_CANCELLED`) | set once |
| `resolved_at`, `resolved_by_id` | NULL | set together with `resolution` (CHECK); the class's teacher |

Constraints and triggers:
- partial `UNIQUE (attempt_id) WHERE resolution IS NULL`;
- INSERT only when the occurrence's ordinal is `EXAM_WARNINGS + 1` or later and the previous hold
  (if any) was `RETURNED`;
- UPDATE only sets the resolution once; DELETE refused;
- `RETURNED` refused when `now() ≥` the attempt's end (the service checks with the injected clock
  first; the trigger is the backstop with the DB clock and the same derivation).

### Defense triggers (extending 016 M6)

The 016 triggers on `activity_answers`, `activity_submissions`, `attempt_integrity_events` and
`work_help_requests` also refuse the write when the attempt has an open hold. Exemptions: the
submission written by the teacher's decision (`end_reason IN ('CANCELLED', 'ENDED_BY_WARNINGS')`) and
the integrity events (they are stored as facts; only the occurrence count ignores them, FR-020).

## Derived, never stored

| Value | Rule (`activities/status/exam-time.ts`, `exam-sessions/exam-status.ts`) |
|---|---|
| `startDeadline` | `publish_at + start_window_minutes` |
| `endsAt` | `started_at + duration_minutes`, capped by `closed_at` / `cancelled_at` |
| `closesAt` (teacher info) | `startDeadline + duration_minutes` |
| Remaining time | `max(0, endsAt − now)` |
| Attempt on hold ("aguardando decisão") | an open hold |
| Occurrence count | `max(ordinal)` of the attempt, 0 when none |
| `examStatus` | no presence → `NOT_MARKED`; presence, no attempt, `now ≤ startDeadline` → `PRESENT`; presence, no attempt, after → `START_CLOSED`; open hold → `AWAITING_DECISION`; submission → its `end_reason` (`STUDENT_SUBMITTED` → `SUBMITTED`); open pause → `PAUSED`; otherwise `ANSWERING` |
| Pause end kind (016) | gains `TIME_EXPIRED` when `endsAt` came before a release |

## State transitions

```text
exam (bank):  DRAFT ──approve──▶ APPROVED ──archive──▶ ARCHIVED ──restore──▶ (previous)

attempt (EXAM, 012 status IN_PROGRESS → SUBMITTED):
  ANSWERING ──occurrence 1..3──▶ ANSWERING (warning n de 3)
  ANSWERING ──occurrence 4 (or next after a return)──▶ AWAITING_DECISION   [hold opened, RULE_RESULT]
     AWAITING_DECISION ──confirm cancellation──▶ SUBMITTED(CANCELLED, grade 0)   [HUMAN_DECISION]
     AWAITING_DECISION ──return (now < endsAt)──▶ ANSWERING                       [HUMAN_DECISION]
     AWAITING_DECISION ──do not cancel (now ≥ endsAt)──▶ SUBMITTED(ENDED_BY_WARNINGS)
  ANSWERING ──teacher pause──▶ PAUSED ──teacher release (now < endsAt)──▶ ANSWERING
  ANSWERING ──submit──▶ SUBMITTED(STUDENT_SUBMITTED)
  ANSWERING | PAUSED ──endsAt + grace, next touch──▶ SUBMITTED(TIME_EXPIRED | ACTIVITY_CLOSED)

hold:  open ──one resolution──▶ resolved (immutable)
```

Invalid transitions → `409 INVALID_STATE_TRANSITION` (or the specific codes of
`contracts/http-api.md`).

## Evidence classes (constitution X, XI)

- **FACT**: integrity events (with `INACTIVITY`), start, pauses, saved answers.
- **RULE_RESULT**: occurrences and their ordinals, warnings, the hold, time settlement, MC grading,
  write refusals.
- **SUGGESTION**: the AI-generated DRAFT exam.
- **HUMAN_DECISION**: approval, application, presence, pause and release, cancellation (grade 0),
  return, do-not-cancel, teacher grades, result release.
