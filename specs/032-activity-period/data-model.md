# Data Model: Período de aplicação da prova e do trabalho (032)

One migration: `apps/api/prisma/migrations/<ts>_032_activity_period/migration.sql` (research AP7).

## `class_activities` (changed)

| Column | Before | After |
|--------|--------|-------|
| `publish_at` | Start (now or scheduled) | Unchanged: the period's start |
| `deadline` | ASSIGNMENT only; after `publish_at` | **ASSIGNMENT and EXAM**: the period's end; after `publish_at`; EXAM also `≥ publish_at + duration_minutes` |
| `late_policy` | ASSIGNMENT only (`REJECT`/`ACCEPT_MARKED`) | ASSIGNMENT only; new rows always `REJECT` (server); `ACCEPT_MARKED` only on rows applied before 032 |
| `duration_minutes` | EXAM only, 1–120, immutable | Unchanged |
| `inactivity_limit_seconds` | EXAM only, 30–60, immutable | Unchanged |
| `start_window_minutes` | EXAM only, 0–60, immutable | **Dropped** |

### Constraints

- `class_activities_type_fields_chk`: `("type" <> 'EXERCISE') = ("total_grade" IS NOT NULL)`, `("type" IN ('ASSIGNMENT',
  'EXAM')) = ("deadline" IS NOT NULL)`, `("type" = 'ASSIGNMENT') = ("late_policy" IS NOT NULL)`, no release on EXERCISE.
- `class_activities_schedule_chk` (unchanged): `deadline > publish_at`.
- `class_activities_exam_chk`: duration and inactivity iff EXAM with their ranges; `type <> 'EXAM' OR deadline >=
  publish_at + make_interval(mins => duration_minutes)`.

### Triggers

- `class_activities_fixed_columns()`: as 018 without `start_window_minutes`; plus: `type = 'EXAM' AND NEW.deadline <
  OLD.deadline AND EXISTS (SELECT 1 FROM activity_attempts WHERE activity_id = OLD.id)` → `check_violation` ("the end of
  exam % only moves later once a student started"). No `now()`: the full rule ("published ⇒ only later") is the
  service's, with the injected `Clock` (research AP5).
- `exam_attempt_holds_transition()` (RETURNED): `ends_at := least(started_at + duration, deadline, closed_at,
  cancelled_at)`.

### Migration of existing rows

1. EXAM: `deadline := publish_at + make_interval(mins => start_window_minutes + duration_minutes)` (today's `closesAt`).
2. ASSIGNMENT: unchanged (`deadline`, `late_policy` as they are).
3. Constraints and triggers replaced, then `DROP COLUMN start_window_minutes`.

Invariant (SC-005): for every attempt `t` of an EXAM, `t.started_at ≤ publish_at + window` before the migration, so
`t.started_at + duration ≤ deadline`: the derived `endsAt` of every attempt is unchanged.

## Derived on read (never stored)

| Value | Rule |
|-------|------|
| Phase | `SCHEDULED` while `now < publish_at`, else `PUBLISHED` (012) |
| Exam start allowed | `publish_at ≤ now ≤ deadline`, student marked present, one attempt (018) |
| Exam attempt end (`endsAt`) | `min(started_at + duration, deadline, closed_at, cancelled_at)` |
| Exam end reason by time | `TIME_EXPIRED` for the duration **and** the period; `ACTIVITY_CLOSED` for close/cancel |
| Work accepts writes | `now ≤ deadline`, or after it only when `late_policy = ACCEPT_MARKED` (legacy), and ACTIVE |
| Attendance mark allowed | ACTIVE, `PRESENT_ONLY`, and `now ≤ deadline` (or legacy `ACCEPT_MARKED`); pure `period.ts` `acceptsAttendanceMark` |
| `periodEnded` (room view) | `now > deadline` and not legacy `ACCEPT_MARKED` |
| `startDeadline`, `closesAt` (wire) | Both `= deadline` (compatibility, AP4) |

## State transitions

None new. Changing the end:

| Activity | Phase | Allowed change of `deadline` |
|----------|-------|------------------------------|
| ASSIGNMENT | any (ACTIVE) | any value `> publish_at` (012, unchanged) |
| EXAM | SCHEDULED | any value `≥ publish_at + duration` (also revalidated when only `publish_at` changes) |
| EXAM | PUBLISHED, end not passed | only later (`422 EXAM_END_CANNOT_MOVE_EARLIER`) |
| EXAM | PUBLISHED, end passed | none (`409 ACTIVITY_PERIOD_ENDED`) |
