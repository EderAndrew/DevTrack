# Data Model: 012 — Portal do Aluno

One migration (`<ts>_class_activities`). Conventions of the project: UUID PKs
(`gen_random_uuid()`), `timestamptz(6)`, snake_case columns, every FK `ON DELETE RESTRICT`,
grades `numeric(5,2)` (integer hundredths in code, decimal string on the wire). Nothing of the
001–011 tables changes, except the permission seed and the `PendingReason` value added to the
grading contract (P12, no table).

## Enums

| Enum | Values | Notes |
|------|--------|-------|
| `class_activity_type` | `EXERCISE`, `ASSIGNMENT` | `EXAM` added by the exams spec (P3) |
| `activity_execution_mode` | `NORMAL` | `CONTROLLED` added by the exams spec (P3) |
| `class_activity_status` | `ACTIVE`, `CLOSED`, `CANCELLED` | scheduled/published derived from `publish_at` (P4) |
| `activity_late_policy` | `REJECT`, `ACCEPT_MARKED` | Q2 = C (P10) |
| `activity_attempt_status` | `IN_PROGRESS`, `SUBMITTED` | |
| `activity_question_type` | `OPEN_ANSWER`, `MULTIPLE_CHOICE`, `CODE` | same values as the banks |
| `activity_grading_status` | `GRADED`, `PENDING_TEACHER`, `DECIDED` | `SUGGESTED` exists in the 011 contract but no AI runs in 012 |
| `activity_grading_nature` | `RULE_RESULT`, `HUMAN_DECISION` | |

The grading strategy reuses `work_grading_strategy` (011); the pending reason is `text` checked
against the contract enum (CHECK), so a new reason doesn't need a migration of this table.

## Tables

### `class_activities`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `class_id` | uuid FK → `classes` | the class of the session teacher (P18) |
| `teacher_id` | uuid FK → `users` | the class's teacher at creation; every teacher query filters by the class |
| `type` | `class_activity_type` | |
| `execution_mode` | `activity_execution_mode` | default `NORMAL` |
| `status` | `class_activity_status` | default `ACTIVE`; transitions in `activity.state-machine.ts` |
| `title` | text | 1–200, trimmed |
| `instructions` | text null | ≤ 10 000 |
| `total_grade` | numeric(5,2) | 0.01–100.00 and ≥ 0.01 per question (CHECK) |
| `question_count` | int | 1–10, equal to the questions (deferred trigger) |
| `publish_at` | timestamptz | |
| `deadline` | timestamptz | CHECK `deadline > publish_at` |
| `late_policy` | `activity_late_policy` | |
| `source_work_id` | uuid null FK → `works` | ASSIGNMENT only (CHECK type ↔ source) |
| `source_subject_id` | uuid null FK → `subjects` | the work's subject, = class subject (P5) |
| `out_of_scope_topic_count` | int | ≥ 0; what the teacher acknowledged at creation |
| `result_released_at` | timestamptz null | release (P14) |
| `result_released_by_id` | uuid null FK → `users` | both release columns null or both set (CHECK) |
| `closed_at`, `cancelled_at` | timestamptz null | set by the transitions |
| `idempotency_key` | uuid | `UNIQUE (teacher_id, idempotency_key)` |
| `version` | int | default 1; optimistic edits |
| `created_at`, `updated_at` | timestamptz | |

Indexes: `(class_id, status, deadline)`, `(class_id, publish_at)`.

### `class_activity_questions`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `activity_id` | uuid FK | `UNIQUE (activity_id, position)`; `UNIQUE (activity_id, id)` for composite FKs |
| `position` | int | 0–9, contiguous (deferred trigger) |
| `type` | `activity_question_type` | |
| `grading_strategy` | `work_grading_strategy` | CHECK type ↔ strategy (MC ↔ EXACT_MATCH, CODE ↔ TEST_CASES, OPEN_ANSWER ↔ AI_REVIEW) |
| `value` | numeric(5,2) | 0.01–100.00; deferred trigger: sum per activity = `total_grade` |
| `statement` | text | |
| `instructions`, `starter_code` | text null | |
| `language_id` | uuid null FK → `programming_languages` | CODE only |
| `expected_answer`, `rubric` | text null | OPEN_ANSWER (teacher only) |
| `expected_solution` | text null | CODE (teacher only) |
| `explanation` | text null | teacher only |
| `is_trick_question` | bool | teacher only |
| `source_exercise_id` | uuid null FK → `exercises` | informative; a work's questions point to the activity's `source_work_id` |

Deferred trigger: an activity has `question_count` questions at commit. No FK to `work_questions`:
editing a work deletes and recreates its questions, and a RESTRICT FK would stop the teacher from
editing the bank after applying it (implementation note, T006). The snapshot tables are immutable
(trigger on UPDATE/DELETE), and so are an activity's class, type, mode, grade and source.

### `class_activity_alternatives`

`id`, `question_id` (FK), `position` (0–4, `UNIQUE (question_id, position)`), `text`, `is_correct`
(teacher only), `UNIQUE (question_id, id)`. Deferred trigger: MULTIPLE_CHOICE questions have 3–5
alternatives with exactly one correct.

### `class_activity_test_cases`

`id`, `question_id` (FK, CODE only), `position` (`UNIQUE (question_id, position)`), `input`,
`expected_output`, `visibility` (`work_test_case_visibility`: PUBLIC reaches the student, PRIVATE
never).

### `class_activity_question_topics`

`question_id` (FK), `syllabus_item_id` (FK → `syllabus_items`), PK both. Copied from
`work_question_topics` or the exercise's `syllabus_item_id`.

### `activity_attempts`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `activity_id` | uuid FK | |
| `student_user_id` | uuid FK → `student_profiles.user_id` | |
| `number` | int | `CHECK (number = 1)` in 012; `UNIQUE (activity_id, student_user_id, number)` (P7) |
| `status` | `activity_attempt_status` | IN_PROGRESS → SUBMITTED only (trigger refuses the way back) |
| `started_at`, `last_saved_at` | timestamptz / null | |
| `last_progress_audited_at` | timestamptz null | throttles `activity_attempt.progress_saved` (P19) |
| `created_at`, `updated_at` | timestamptz | |

Index: `(student_user_id, activity_id)`.

### `activity_answers`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `attempt_id` | uuid | composite FK `(attempt_id, activity_id)` → `activity_attempts (id, activity_id)`; `UNIQUE (attempt_id, question_id)` |
| `activity_id` | uuid | shared by both composite FKs: the question belongs to the attempt's activity |
| `question_id` | uuid | composite FK `(question_id, activity_id, question_type)` → `class_activity_questions (id, activity_id, type)` |
| `question_type` | `activity_question_type` | the question's type, carried by the FK, so a CHECK validates the answer's shape |
| `text` | text null | ≤ 20 000 (CHECK) |
| `alternative_id` | uuid null | composite FK `(question_id, alternative_id)` → `class_activity_alternatives (question_id, id)`; null = blank choice |
| `source` | text null | ≤ 100 000 (CHECK) |
| `revision` | int | ≥ 1 (P8) |
| `saved_at` | timestamptz | |

Trigger: no INSERT/UPDATE/DELETE when the attempt is SUBMITTED (P9).

### `activity_submissions`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `attempt_id` | uuid FK | `UNIQUE` (one submission per attempt) |
| `activity_id`, `student_user_id` | uuid | denormalized for the roster; composite FK `(attempt_id, activity_id, student_user_id)` → the attempt |
| `submitted_at` | timestamptz | server clock |
| `late` | bool | `submitted_at > deadline` at submission |
| `blank_count` | int | ≥ 0 |
| `grade` | numeric(5,2) | sum of final grades (0 … total) |
| `grade_partial` | bool | true while a question has no final grade |
| `general_feedback` | text null | ≤ 5 000 |
| `graded_at` | timestamptz null | last teacher decision |
| `result_viewed_at` | timestamptz null | first student view of a released result (P19) |
| `accepted_by_id` | uuid null FK → `users` | set when the teacher accepted the attempt (FR-006b); then `late = true` (CHECK) |
| `version` | int | optimistic teacher grading (P13) |

Immutable columns after insert (trigger): `attempt_id`, `activity_id`, `student_user_id`,
`submitted_at`, `late`, `blank_count`, `accepted_by_id`.

`blank_count` counts the questions that are blank by spec FR-023: no answer row, multiple choice
with `alternative_id` null, text empty after trim, code empty after trim or equal to the starter
code.

### `activity_question_gradings`

| Column | Type | Rules |
|--------|------|-------|
| `submission_id` | uuid FK | PK with `question_id` |
| `question_id` | uuid | composite FKs `(submission_id, activity_id)` and `(question_id, activity_id)`: a question of the submission's activity |
| `status` | `activity_grading_status` | |
| `nature` | `activity_grading_nature` null | GRADED → RULE_RESULT, DECIDED → HUMAN_DECISION, PENDING → null (CHECK) |
| `final_grade` | numeric(5,2) null | not null iff GRADED/DECIDED (CHECK); 0 … question value (trigger) |
| `teacher_grade` | numeric(5,2) null | DECIDED only |
| `pending_reason` | text null | not null iff PENDING_TEACHER (CHECK) |
| `feedback` | text null | ≤ 5 000 |
| `decided_by_id`, `decided_at` | uuid / timestamptz null | DECIDED only |

## Derived (never stored)

- **Publication phase** of an ACTIVE activity: `SCHEDULED` if `publish_at > now`, else
  `PUBLISHED` (P4).
- **Student status**: `PENDING | IN_PROGRESS | OVERDUE | SUBMITTED | GRADED`, plus `late` and
  `canAnswer` (P11).
- **Roster status** for the teacher: `NOT_STARTED | IN_PROGRESS | SUBMITTED | SUBMITTED_LATE |
  MISSED` (P11).
- **Grading complete**: every question of the submission has a final grade
  (`grade_partial = false`).
- **Result visible to the student**: `result_released_at IS NOT NULL` and grading complete (P14).
- **Taught scope** of a class: syllabus items of COMPLETED topics of its plan (P5).

## Relationships

```text
SchoolClass 1─* ClassActivity 1─* ClassActivityQuestion 1─* ClassActivityAlternative
                     │                    ├─* ClassActivityTestCase
                     │                    └─* ClassActivityQuestionTopic *─1 SyllabusItem
                     └─* ActivityAttempt (per student; 1 in 012) 1─* ActivityAnswer
                                  └─0..1 ActivitySubmission 1─* ActivityQuestionGrading
StudentProfile 1─* ActivityAttempt          Enrollment(ACTIVE) gates every student read/write
Work ─(source)─ ClassActivity               Exercise ─(source)─ ClassActivityQuestion
```

## Validation rules (from the spec)

| Rule | Where |
|------|-------|
| Apply only APPROVED items of the session teacher, 1 work or 1–10 exercises (FR-001) | service, 404/422 |
| Work subject = class subject (FR-005a) | service, `422 SUBJECT_MISMATCH` |
| Out-of-scope topics need `acknowledgeOutOfScope` (FR-005a) | service, `422 OUT_OF_SCOPE_NOT_ACKNOWLEDGED` |
| `deadline > publish_at`; `publish_at` editable only while scheduled (FR-005) | contract + CHECK, `422` |
| Class ACTIVE to apply; class not ACTIVE → read-only for students (edge case) | service, `409 CLASS_NOT_ACTIVE` |
| Answer kind matches question type; alternative of the question; size limits (FR-020) | contract + trigger/CHECK, `400`/`422 INVALID_ANSWER` |
| No save after submit, close, cancel, enrollment removal, or deadline under REJECT (FR-021, FR-024a) | service under row lock, `409` codes |
| One attempt, one answer per question, one submission (FR-016/017/025) | UNIQUEs + `ON CONFLICT` + row locks |
| Teacher grade 0 … value, two decimals (FR-006) | `decideByTeacher` + trigger, `422 GRADE_OUT_OF_RANGE` |
| Grade sum 0 … total (FR-028) | `computeWorkGrade` + CHECK |
