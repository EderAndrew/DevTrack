# Data Model: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

One migration, `<ts>_attendance_gated_release`, makes these changes:

- **New Prisma models**: `ActivityAttendance` and `AttemptPause`, pinned by
  `domain-boundary.spec.ts`.
- **Changed**: `ClassActivity` gains one column.
- **New enums**: `ActivityReleaseMode`, `AttemptPauseInitiator` and `AttemptPauseReason`.
- **Seed**: the `chamada.registrar` permission for TEACHER.

## Changed: `class_activities`

| Column | Type | Rules |
|---|---|---|
| `release_mode` | `activity_release_mode` (`ALL_ENROLLED`, `PRESENT_ONLY`) `NOT NULL DEFAULT 'ALL_ENROLLED'` | CHECK `type = 'ASSIGNMENT' OR release_mode = 'ALL_ENROLLED'`; immutable (added to the 012 trigger's immutable columns) |

Existing rows become `ALL_ENROLLED` (research M2). The activities service creates every new
ASSIGNMENT as `PRESENT_ONLY`.

## New: `activity_attendances`

| Column | Type | Rules |
|---|---|---|
| `activity_id` | uuid | PK part; FK → `class_activities` |
| `student_user_id` | uuid | PK part; FK → `student_profiles (user_id)` |
| `class_id` | uuid | equal to the activity's class (trigger) |
| `marked_at` | timestamptz | server clock; kept on a repeated mark (`ON CONFLICT DO NOTHING`) |
| `marked_by_id` | uuid | FK → `users`; the class's teacher |

Triggers:
- **BEFORE INSERT**: the activity is `PRESENT_ONLY` and `ACTIVE`, the class is ACTIVE, and the
  student has an `ACTIVE` enrollment in `class_id`.
- **BEFORE DELETE**: refused when an `activity_attempts` row exists for
  `(activity_id, student_user_id)` (research M3). The service checks the same first, under
  `FOR UPDATE` of the attendance rows.
- **BEFORE UPDATE**: always refused. A presence is inserted or deleted, never edited.

Index: `(activity_id)` is covered by the PK. `resetDb` deletes the rows before activities.

## New: `attempt_pauses`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `attempt_id`, `activity_id`, `student_user_id` | uuid | composite FK → `activity_attempts (id, activity_id, student_user_id)` |
| `initiated_by` | `attempt_pause_initiator` (`STUDENT`, `TEACHER`) | |
| `reason` | `attempt_pause_reason` (`BATHROOM`, `WATER`, `PHONE`, `OTHER`, `TEACHER`) | CHECK `(initiated_by = 'TEACHER') = (reason = 'TEACHER')` |
| `note` | text NULL | ≤ 200 characters; only when `reason = 'OTHER'` (CHECK) |
| `started_at` | timestamptz | server clock |
| `started_by_id` | uuid | FK → `users` (the student or the teacher) |
| `released_at` | timestamptz NULL | server clock; set together with `released_by_id` (CHECK) |
| `released_by_id` | uuid NULL | FK → `users`; the class's teacher |

Constraints:
- Partial `UNIQUE (attempt_id) WHERE released_at IS NULL`: one open pause per attempt.
- Index `(activity_id, released_at)` for the room view.

Triggers:
- **INSERT**: allowed only when the activity is `PRESENT_ONLY` and `ACTIVE`, and the attempt is
  `IN_PROGRESS`.
- **UPDATE**: allowed only to set `released_*` once, from NULL. Every other column is immutable.
- **DELETE**: refused (bypassed only by `resetDb`).

### Defense triggers on existing tables (research M6)

These triggers act on `activity_answers` (INSERT/UPDATE), `activity_submissions`,
`attempt_integrity_events` and `work_help_requests` (INSERT). They refuse the write when the
attempt has a pause with `released_at IS NULL` **and** the activity is `ACTIVE`.

There is one exemption. A submission written by the teacher's acceptance (012 FR-006b,
`accepted_by_id IS NOT NULL`) always passes, whether the activity is still ACTIVE (deadline passed
without late acceptance) or closed. The acceptance ends the pause by derivation (research M7).

## Derived, never stored

| Value | Rule |
|---|---|
| Attempt PAUSED | `IN_PROGRESS`, an open pause, and the activity ACTIVE |
| A pause's end kind (`endedBy`) | `RELEASE` when `released_at` is set; else `ACCEPTED` when the attempt has a submission accepted by the teacher; else `ACTIVITY_CLOSED` when the activity is closed or cancelled; else `null` (open) |
| A pause's end | `released_at`, else the accepted submission's `submitted_at`, else the activity's `closed_at` / `cancelled_at`, else still open |
| Pause duration, time away (`activities/status/pause-time.ts`) | end − `started_at` (open: now − `started_at`) |
| `roomStatus` (`attendance/room-status.ts`) | no attendance → `NOT_MARKED`; attendance and no attempt → `PRESENT`; attempt `SUBMITTED` → `SUBMITTED`; open pause → `OUT_OF_ROOM`; otherwise `ANSWERING` |
| Roster `ABSENT` (012 roster status) | `PRESENT_ONLY`, no attendance and no attempt; never `MISSED` |
| Visibility to the student | `ALL_ENROLLED`, or an attendance row exists, on top of the 012 rule (research M4) |

## State transitions

```text
presence (activity, student):  absent ──mark──▶ present ──unmark (no attempt only)──▶ absent

attempt (012 status IN_PROGRESS):
   ANSWERING ──student exit / teacher pause──▶ PAUSED ──teacher release──▶ ANSWERING
   ANSWERING ──submit──▶ SUBMITTED              (never from PAUSED: 409 ATTEMPT_PAUSED)
   PAUSED ──activity closed/cancelled──▶ pause ended by derivation; 012 FR-006b applies
   PAUSED ──teacher accepts (012 FR-006b)──▶ SUBMITTED; pause ended by derivation (ACCEPTED)

attempt_pauses row:  open (released_at NULL) ──release──▶ released (immutable)
```

## Evidence classes (constitution X, XI)

- **FACT**: presence and its time, the declared exit and its reason, start and release times.
- **RULE_RESULT**: visibility, the refusal of writes while paused, `roomStatus`, durations.
- **HUMAN_DECISION**: marking a student present, pausing a student, releasing a return, and the
  grade.
