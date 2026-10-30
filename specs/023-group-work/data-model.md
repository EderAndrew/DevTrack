# Data Model: 023 — Trabalho individual ou em grupo

One migration (`…_group_work`). Decisions in research U2–U10.

## Changed tables

### `class_activities`

| Column | Type | Rule |
|--------|------|------|
| `group_size` | `smallint NULL` | `NULL` = individual; 2–5 = group, counting the leader (CHECK `group_size BETWEEN 2 AND 5`). Not NULL only when `type = 'ASSIGNMENT'` and `release_mode = 'PRESENT_ONLY'` (CHECK). Changes only before the first attempt (the 015/021 freeze trigger gains it). |

### `activity_answers`

| Column | Type | Rule |
|--------|------|------|
| `saved_by_user_id` | `uuid NOT NULL` | Who wrote the current revision. Backfill: the attempt's `student_user_id`. FK `(attempt_id, activity_id, saved_by_user_id) → attempt_participants`. Trigger: in a group attempt it must equal `attempt_groups.editor_user_id`. |

### `activity_submissions`

| Column | Type | Rule |
|--------|------|------|
| `submitted_by_user_id` | `uuid NULL` | The student who submitted; NULL only when `accepted_by_id` is set (CHECK) or for a system-settled exam (`end_reason` not `STUDENT_SUBMITTED`). Backfill: the attempt's owner where `accepted_by_id IS NULL` and the end reason allows it. Trigger: in a group attempt it must equal `attempt_groups.leader_user_id`. Immutable (the submitted-facts trigger gains it). |

### Per-student facts — FK target moves (U4)

`attempt_integrity_events`, `work_help_requests`, `attempt_pauses`, `code_runs`: the composite FK
`(attempt_id, activity_id, student_user_id)` now references `attempt_participants (attempt_id, activity_id,
student_user_id)` instead of `activity_attempts (id, activity_id, student_user_id)`. Columns unchanged. Exam tables
keep their FK.

### Triggers changed

- `attempt_paused_writes` (016/018): the open pause looked up is the **writer's** on that attempt
  (`saved_by_user_id`, `submitted_by_user_id`, `student_user_id`) — U10.
- The options freeze trigger (015 F2, 021 Y1): also `group_size`.

## New tables

### `attempt_participants`

Who takes part in an attempt. Every attempt has its owner's row (insert in the start's transaction; the migration
backfills one per existing attempt); a group attempt has one more per member.

| Column | Type | Rule |
|--------|------|------|
| `attempt_id` | `uuid` | FK `(attempt_id, activity_id) → activity_attempts (id, activity_id)` |
| `activity_id` | `uuid` | |
| `student_user_id` | `uuid` | FK → `student_profiles.user_id` |
| `attempt_number` | `int` | Equal to the attempt's `number` (trigger) |
| `joined_at` | `timestamptz` | Server clock |
| `added_by_user_id` | `uuid NULL` | NULL for the owner; the leader for a member (FK → participant of the same attempt) |

- PK `(attempt_id, student_user_id)`; UNIQUE `(attempt_id, activity_id, student_user_id)` (FK target of U4).
- **UNIQUE `(activity_id, student_user_id, attempt_number)`** — FR-008: one participation per attempt number.
- Insert only (no UPDATE; DELETE refused by trigger, except `resetDb`); a member row (`added_by_user_id` not NULL)
  only when the attempt has an `attempt_groups` row, the activity's `group_size` admits one more and the attempt is
  `IN_PROGRESS` (trigger).
- Index `(activity_id, student_user_id)` for the student-side lookups (U5).

### `attempt_groups`

The state of a group attempt. One row per group; none for individual attempts.

| Column | Type | Rule |
|--------|------|------|
| `attempt_id` | `uuid PK` | FK `(attempt_id, activity_id) → activity_attempts` |
| `activity_id` | `uuid` | The activity must have `group_size` not NULL (trigger) |
| `leader_user_id` | `uuid` | FK `(attempt_id, leader_user_id) → attempt_participants` |
| `editor_user_id` | `uuid` | FK `(attempt_id, editor_user_id) → attempt_participants` |
| `version` | `int` | Bumped on every change |
| `created_at` | `timestamptz` | |

- Created in the start's transaction (leader = editor = the owner); UPDATE only of `leader_user_id`,
  `editor_user_id`, `version`, and only while the attempt is `IN_PROGRESS` (trigger); no DELETE.

### `attempt_group_events` (append-only)

The editing and leadership history (FR-015, FR-020, FR-023).

| Column | Type | Rule |
|--------|------|------|
| `id` | `uuid PK` | |
| `attempt_id` | `uuid` | FK → `attempt_groups` |
| `kind` | enum `attempt_group_event_kind` | `EDITING_HANDED`, `EDITING_TAKEN_BACK`, `EDITING_RETURNED`, `EDITING_RESET`, `LEADER_CHANGED` |
| `reason` | enum `attempt_group_event_reason NULL` | `PAUSED`, `ACCESS_LOST` — set iff `EDITING_RESET` or `LEADER_CHANGED` (CHECK) |
| `actor_user_id` | `uuid NULL` | The student who acted; NULL for the system settlement (U9) |
| `from_user_id` | `uuid` | Previous editor or leader |
| `to_user_id` | `uuid` | New editor or leader (≠ from, CHECK) |
| `occurred_at` | `timestamptz` | Server clock |

- Index `(attempt_id, occurred_at)`. UPDATE and DELETE refused (trigger).

### `activity_answer_saves` (append-only)

Who saved each revision of each answer (FR-015). Written only by an AFTER trigger on `activity_answers` when a row
is inserted or its `revision` changes. No content.

| Column | Type | Rule |
|--------|------|------|
| `attempt_id` | `uuid` | |
| `question_id` | `uuid` | |
| `revision` | `int` | |
| `student_user_id` | `uuid` | = the answer's `saved_by_user_id` |
| `saved_at` | `timestamptz` | = the answer's `saved_at` |

- PK `(attempt_id, question_id, revision)`. UPDATE and DELETE refused (trigger).

## Derived (never stored)

- **Effective leader and editor** (`activities/group/group-roles.ts`, U9): stored leader unless their enrollment is
  no longer ACTIVE (then the active member who joined first); stored editor unless paused or without access (then the
  effective leader). Persisted by `settleGroup` on the next touch.
- **My role** in the student view: `LEADER`, `EDITOR`, `MEMBER` (a leader who holds the editing is `LEADER` with
  `canEdit`).
- **Free slots**: `group_size − participants`.

## State and transitions

- Attempt: unchanged (012) — `IN_PROGRESS → SUBMITTED`.
- Editing owner (per group, while `IN_PROGRESS`):
  - leader → member: `EDITING_HANDED` (leader only; member active and not paused);
  - member → leader: `EDITING_TAKEN_BACK` (leader) or `EDITING_RETURNED` (that member);
  - member → leader: `EDITING_RESET` (system: the member paused or lost access);
  - anything after submission, close or cancel → `409 INVALID_STATE_TRANSITION`.
- Leader: changes only by `LEADER_CHANGED` with `ACCESS_LOST` (system).
