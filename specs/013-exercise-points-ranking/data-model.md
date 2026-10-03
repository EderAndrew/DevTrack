# Data Model: 013 — Pontuação e Ranking dos Exercícios

One migration (`<ts>_exercise_points`) over the 012 tables. Project conventions: UUID PKs,
`timestamptz(6)`, snake_case, FKs `ON DELETE RESTRICT`; points are `int`. ASSIGNMENT rows keep
every 012 rule; the new CHECKs say "by type".

## Enums

| Enum | Values | Notes |
|------|--------|-------|
| `exercise_result` (new) | `CORRECT`, `WRONG`, `PENDING_TEACHER`, `UNSCORED` | research K6 |
| `exercise_difficulty` (010) | `BASIC`, `INTERMEDIATE`, `ADVANCED` | reused by the snapshot |
| `activity_grading_nature` (012) | `RULE_RESULT`, `HUMAN_DECISION` | reused by the results |

No change to `activity_attempt_status` (`IN_PROGRESS`, `SUBMITTED`): for EXERCISE, SUBMITTED
reads "concluded" (K3).

## Changed tables

### `class_activities`

| Column | Change | Rules |
|--------|--------|-------|
| `total_grade` | NOT NULL → NULL | CHECK: NOT NULL iff `type = 'ASSIGNMENT'` |
| `deadline` | NOT NULL → NULL | CHECK: NOT NULL iff ASSIGNMENT; the `deadline > publish_at` CHECK applies when not null |
| `late_policy` | NOT NULL → NULL | CHECK: NOT NULL iff ASSIGNMENT |
| `result_released_at`, `_by_id` | — | CHECK: both NULL for EXERCISE |

The deferred `class_activities_valid` trigger checks the value sum only for ASSIGNMENT. The
"fixed columns" trigger keeps `type` immutable, so a row never changes side.

### `class_activity_questions`

| Column | Change | Rules |
|--------|--------|-------|
| `value` | NOT NULL → NULL | CHECK: NOT NULL (0.01–100.00) iff the activity is ASSIGNMENT (deferred trigger, the question doesn't carry the type) |
| `difficulty` | new, `exercise_difficulty` NULL | NOT NULL iff the activity is EXERCISE (same trigger) |
| `points` | new, `int` NULL | CHECK `(difficulty, points)` ∈ {(BASIC, 15), (INTERMEDIATE, 30), (ADVANCED, 60)} or both NULL |
| `source_exercise_id` | — | NOT NULL iff the activity is EXERCISE (same trigger) |
| | new `UNIQUE (activity_id, id, points)` | target of the results' composite FK |

The snapshot immutability trigger stays: `difficulty` and `points` never change after insert.

### `activity_attempts`

| Column / constraint | Change | Rules |
|---|---|---|
| `activity_attempts_number_chk` (`number = 1`) | dropped | replaced by `number ≥ 1` |
| `completed_at` | new, timestamptz NULL | NOT NULL iff EXERCISE ∧ SUBMITTED (trigger, with the activity type) |
| `activity_attempts_one_open` | new partial UNIQUE `(activity_id, student_user_id) WHERE status = 'IN_PROGRESS'` | one open attempt |
| trigger `activity_attempts_numbering` | new, BEFORE INSERT | ASSIGNMENT: `number = 1`; EXERCISE: `number = 1`, or attempt `number − 1` of the same student exists and is SUBMITTED |
| | new `UNIQUE (id, activity_id, student_user_id)` | target of the results' composite FK |

The 012 transition trigger (IN_PROGRESS → SUBMITTED only) and the answers' "no change after
SUBMITTED" trigger are unchanged and cover EXERCISE.

### `activity_submissions`, `activity_question_gradings`

Unchanged columns. New trigger: insert refused when the attempt's activity is EXERCISE (K5).

## New table: `exercise_question_results`

| Column | Type | Rules |
|--------|------|-------|
| `attempt_id` | uuid | PK with `question_id`; composite FK `(attempt_id, activity_id, student_user_id)` → `activity_attempts (id, activity_id, student_user_id)` |
| `question_id` | uuid | composite FK `(question_id, activity_id, question_points)` → `class_activity_questions (id, activity_id, points)` |
| `activity_id` | uuid | shared by both FKs |
| `question_points` | int | the question's points, carried by the FK |
| `class_id` | uuid FK → `classes` | = the activity's class (trigger) |
| `student_user_id` | uuid | from the attempt FK |
| `source_exercise_id` | uuid FK → `exercises` | = the question's source (trigger) |
| `scoring` | bool | the row that counts for this exercise in this class |
| `result` | `exercise_result` | |
| `points` | int | CHECK `points = CASE WHEN scoring AND result = 'CORRECT' THEN question_points ELSE 0 END` |
| `nature` | `activity_grading_nature` NULL | NULL iff `PENDING_TEACHER` or `UNSCORED`; RULE_RESULT or HUMAN_DECISION otherwise |
| `comment` | text NULL | ≤ 2 000; only with HUMAN_DECISION |
| `decided_by_id` | uuid NULL FK → `users` | NOT NULL iff HUMAN_DECISION (with `decided_at`) |
| `decided_at` | timestamptz NULL | |
| `created_at`, `updated_at` | timestamptz | |

Constraints:
- `UNIQUE (class_id, student_user_id, source_exercise_id) WHERE scoring` — once per class
  (FR-010a, K6);
- CHECK `result <> 'PENDING_TEACHER' OR scoring`; CHECK `result <> 'UNSCORED' OR NOT scoring`;
- trigger: only `result`, `points`, `nature`, `comment`, `decided_by_id`, `decided_at`,
  `updated_at` may change, and only on a `scoring` row of an OPEN_ANSWER/CODE question (the
  teacher's mark); no DELETE.

Indexes: `(class_id, student_user_id) WHERE scoring` (ranking sum), `(activity_id, result) WHERE
result = 'PENDING_TEACHER'` (roster counts).

## Derived (never stored)

- **Possible points** of an EXERCISE activity: Σ `points` of its questions.
- **Points earned in an activity**: Σ `points` of the results of the student's attempt 1.
- **Student points in a class**: Σ `points` of `scoring` results whose activity is not CANCELLED
  (K7).
- **Student status** (EXERCISE): `COMPLETED` / `IN_PROGRESS` / `PENDING`; `awaitingCorrection`
  (K9).
- **Roster status** (EXERCISE): `NOT_STARTED` / `IN_PROGRESS` / `COMPLETED`, `pendingMarks`.
- **Ranking**: `rankClass` over the ACTIVE enrollments (K11).

## Relationships

```text
ClassActivity(EXERCISE) 1─* ClassActivityQuestion(difficulty, points, source_exercise_id)
        └─* ActivityAttempt(number 1..n, one IN_PROGRESS, completed_at)
                 ├─* ActivityAnswer (012)
                 └─* ExerciseQuestionResult(scoring, result, points) *─1 ClassActivityQuestion
SchoolClass 1─* ExerciseQuestionResult            Exercise(bank) 1─* ExerciseQuestionResult (once per class when scoring)
Enrollment(ACTIVE) + User.name + Σ points ──▶ Ranking (derived)
```

## Validation rules (from the spec)

| Rule | Where |
|------|-------|
| EXERCISE body without `totalGrade`, `deadline`, `latePolicy` (FR-001) | contract (discriminated by type), `400` |
| Points fixed by difficulty (FR-002) | snapshot + CHECK |
| EXERCISE edit: title, instructions, `publishAt` while scheduled (FR-004) | contract + service, `422` |
| One open attempt; retry only after the latest concluded (FR-005) | partial UNIQUE + trigger + K4 |
| Conclusion idempotent, attempt immutable after (FR-007) | 012 locks and triggers |
| Only attempt 1 scores; once per class (FR-008, FR-010a) | `number = 1` + partial UNIQUE |
| All-or-nothing points (FR-010) | CHECK on `points` |
| Marks only on scoring open/code rows (FR-017) | service `422 NOT_MARKABLE` + trigger |
| No grade/release routes for EXERCISE (FR-013, FR-017) | service `409 INVALID_STATE_TRANSITION` |
