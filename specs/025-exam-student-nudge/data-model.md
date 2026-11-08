# Data Model: 025

One Prisma migration `<ts>_025_exam_student_nudge`. Nothing of 018/024 changes shape in the database.

## Table `exam_nudges`

| Column | Type | Rule |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `attempt_id` | uuid NOT NULL | FK `activity_attempts(id)` ON DELETE CASCADE |
| `activity_id` | uuid NOT NULL | FK `class_activities(id)`; must equal the attempt's activity (trigger) |
| `sent_by_user_id` | uuid NOT NULL | FK `users(id)`; the teacher |
| `sent_at` | timestamptz NOT NULL | server clock (passed by the service from `Clock`) |
| `dismissed_at` | timestamptz NULL | set once by the student's dismissal; CHECK `dismissed_at IS NULL OR dismissed_at >= sent_at` |

Indexes and constraints:

- `exam_nudges_one_pending` — UNIQUE `(attempt_id) WHERE dismissed_at IS NULL` (one pending per attempt, N1).
- `exam_nudges_attempt_sent` — index `(attempt_id, sent_at)` (timeline, monitor aggregate, student poll).

Triggers:

- `exam_nudges_insert_valid` (BEFORE INSERT): the attempt is `IN_PROGRESS`, its activity is `EXAM` and equals
  `activity_id`, there is no `exam_attempt_holds` row with `resolution IS NULL` and no `attempt_pauses` row with
  `released_at IS NULL` for it; `dismissed_at` is NULL. Else `RAISE` (mapped to `409 EXAM_NUDGE_NOT_ALLOWED`).
- `exam_nudges_update_guard` (BEFORE UPDATE): only `dismissed_at` may change, and only from NULL to a value.
- `exam_nudges_no_delete` (BEFORE DELETE): refused unless the delete cascades from the attempt
  (`pg_trigger_depth() > 1`).

## Permission seed

`permissions`: `('provas.avisos.enviar', 'Enviar aviso discreto a um aluno durante a prova')`; `role_permissions`:
`TEACHER`. `PermissionKey` in `access-control/permissions.ts` and the authorization matrix gain the key.

## Derived (never stored) — `exam-nudges/nudge-status.ts`

Attempt facts read with the nudge: attempt status, submission present, open hold, unreleased pause (ended by
derivation per 016 `pauseTime`), `endsAt` (018 `exam-time`), activity status, occurrence count (`max(ordinal)` of
`exam_occurrences`).

| Name | Rule |
|---|---|
| `running` | IN_PROGRESS, no submission, no open hold, no open pause, `now < endsAt`, activity ACTIVE |
| `canSend` | `running` and occurrence count ≥ 2 and no pending nudge |
| `shown` (student) | nudge pending and `running` |
| `status` (teacher) | `DISMISSED` if `dismissed_at`; else `UNSEEN` if the attempt ended (submission present, `now ≥ endsAt` or activity closed/cancelled); else `PENDING` |

A pending nudge on a held or paused attempt is `PENDING` (not shown); it is shown again if the attempt returns to
`running` (US2-6).

## State transitions

```text
(sent) ──► PENDING ──(student "Entendi")──► DISMISSED
              │
              └──(attempt ends; derived)──► UNSEEN
```

## Relationships

- `activity_attempts 1 ─ * exam_nudges` (at most one pending).
- No FK to or from `exam_occurrences`, `exam_attempt_holds`, `attempt_pauses`, `activity_submissions`: a nudge
  never changes them (SC-003, boundary spec).
