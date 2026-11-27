# Research: Período de aplicação da prova e do trabalho (032)

Decisions carry the prefix **AP**. Each records the decision, why, and what was rejected.

## AP1 — The period's end is the existing `deadline` column, for ASSIGNMENT and EXAM

- **Decision**: `class_activities.deadline` becomes "the end of the period" for both ASSIGNMENT and EXAM (CHECK: set iff
  `type IN ('ASSIGNMENT','EXAM')`); the start stays `publish_at` (now or scheduled, 012). No new column. The wire keeps
  the field name `deadline` (already on the teacher and student shapes, nullable; now non-null for EXAM too); the UI calls
  it "Término".
- **Rationale**: a work under `REJECT` already *is* a period (start → deadline, everything refused after it, 012 FR-005,
  `operations.ts`), so the work needs no new rule, only the removal of the late policy from new bodies (AP2). One column
  means one CHECK (`deadline > publish_at`, already there), one index (`class_id, status, deadline`, already there) and
  one ordering for the student lists, which now place exams by their end too.
- **Alternatives**: a new `ends_at` column for both (two columns meaning the same thing for works, a backfill and a rename
  of every reader); renaming `deadline` (touches every 012–031 reader, contract and test for no behavior change).
- **Risk handled in tasks**: readers that treat "has a deadline" as "is an ASSIGNMENT" (`ACTIVITY_TYPES.hasDeadline`,
  `wouldBeLate`, `isPastDeadline`, the dashboard's "overdue still accepting", the history) must keep branching on the
  **type**; EXAM timing is ruled only in `status/exam-time.ts`. A task lists every reader of `deadline` and pins it with a
  test (an EXAM past its end is never `OVERDUE`/`SUBMITTED_LATE`, never in "overdue still accepting").

## AP2 — No late policy on new works; the old `ACCEPT_MARKED` works keep it

- **Decision**: `latePolicy` leaves the create and update bodies (strict → `400`). The server writes `REJECT` on every new
  ASSIGNMENT; the column stays (ASSIGNMENT only, CHECK) so the works applied with `ACCEPT_MARKED` keep accepting late
  submissions marked late until the teacher closes them (spec FR-016, Q2: B). The teacher's view keeps `latePolicy` (read
  only) so the detail can show "Aceita entrega atrasada (regra anterior)".
- **Rationale**: zero behavior change for any existing work; the late path (`SUBMITTED_LATE`, the late badge) stays tested
  through the legacy rows.
- **Alternatives**: dropping the enum and converting `ACCEPT_MARKED` to `REJECT` (a student who could still hand in loses
  it, rejected by the user); a fixed grace after migration (arbitrary).

## AP3 — Exam time: the start window goes, the period caps every attempt

- **Decision**: in `exam-time.ts`: `startDeadline(t) = t.deadline`; `canStart = publishAt ≤ now ≤ deadline` (inclusive,
  as today's start deadline); `endsAt = min(startedAt + duration, deadline, closedAt, cancelledAt)`; `closesAt(t) =
  t.deadline`; `endedByActivity` becomes `endedEarly` with the reason kept as today's `ACTIVITY_CLOSED` only for the close
  or cancellation — an end by the period is `TIME_EXPIRED`, like the duration (the student ran out of the exam's time).
  Grace (2 s), settlement on the next touch (`exam_attempt.time_expired`, SYSTEM), holds and decisions are unchanged and
  read this `endsAt`.
- **Rationale**: spec FR-006/FR-007 and Q "Corta no fim". Keeping `endsAt` as the single source means the student timer,
  the monitor, the review, the alerts and the nudge follow without their own logic.
- **Alternatives**: a new end reason `PERIOD_ENDED` (an extra enum value and labels for a case the student experiences as
  "time over"; rejected).

## AP4 — Wire compatibility: `startDeadline` and `closesAt` stay, equal to the end

- **Decision**: `ActivityExamSchema` drops `startWindowMinutes`; `startDeadline` and `closesAt` stay on the teacher's exam
  block, the student's exam block, the monitor (`ExamMonitorSchema`) and the mobile list (`closesAt`), all equal to
  `deadline`. The create body drops `startWindowMinutes` (strict → `400`); `EXAM_START_WINDOW_*` constants go.
- **Rationale**: the mobile app (024) is an installed APK that parses the monitor and list with strict schemas; removing
  either field would break it until a new build. With both equal to the end, its labels stay true ("pode iniciar até",
  "encerra às"). The web reads them too and ships in the same deploy.
- **Alternatives**: removing the fields (forces an EAS build and a coordinated rollout); a contract version (no versioning
  exists for one field).

## AP5 — Changing the end (FR-012)

- **Decision**: the update body accepts `deadline` for ASSIGNMENT (as today: any time while ACTIVE, after `publishAt`)
  and for EXAM: while scheduled, any value with `deadline ≥ publishAt + duration`; once published, only a **later** value
  while the current end has not passed — earlier → `422 EXAM_END_CANNOT_MOVE_EARLIER`, current end already passed →
  `409 ACTIVITY_PERIOD_ENDED`. The rule is the pure `status/period.ts` `canChangeEnd` (constitution VII: testable without
  HTTP), applied in the service under the activity's `FOR UPDATE` with the injected `Clock`. The immutability trigger
  backs only the part that needs no clock: an EXAM **with an attempt** never gets a smaller `deadline` (`EXISTS
  activity_attempts`, like the 015 mode rule) — never `now()`, so tests with a fake `Clock` cannot disagree with the
  database. `publishAt` stays editable only while scheduled (012), and after any change of `publishAt` or `deadline` the
  pair is revalidated by `validPeriod` (`422 INVALID_SCHEDULE`).
- **Rationale**: Q1: A. Since no attempt can have been settled by the period while the end is in the future, extending
  simply moves every running attempt's `endsAt` (derived) — nobody's time is cut, nobody is reopened.
- **Alternatives**: allowing earlier ends (cuts running attempts, rejected); reopening after the end (would have to undo
  `time_expired` settlements, out of scope).

## AP6 — Attendance after the end (FR-014)

- **Decision**: `AttendanceService.apply`, under the activity row it already locks, refuses a batch with any `mark` when
  the pure `status/period.ts` `acceptsAttendanceMark` says no (`now > deadline`) with `409 ACTIVITY_PERIOD_ENDED` (nothing written), except a legacy ASSIGNMENT with `ACCEPT_MARKED`
  (it still accepts work after the end, AP2). `unmark` keeps the 016 rule. Not audited, like `ATTENDANCE_STARTED` (no
  attendance refusal is audited today); the spec's audit line is read that way. The room view gains `periodEnded`
  (derived from the `Clock`) so the web disables the marks.
- **Rationale**: "depois do horário de fim ninguém mais é liberado"; marking is the release (016).
- **Alternatives**: accepting the mark as a pure record (the presence would still release reading the statement of a
  finished exam; rejected).

## AP7 — One migration `…_032_activity_period`

- **Decision**: (1) `UPDATE class_activities SET deadline = publish_at + start_window_minutes + duration_minutes` for every
  EXAM (today's `closesAt`); (2) replace `class_activities_type_fields_chk` (deadline iff ASSIGNMENT or EXAM, late policy
  iff ASSIGNMENT) and `class_activities_exam_chk` (without the window, plus `deadline >= publish_at + duration`);
  (3) `class_activities_fixed_columns()` without `start_window_minutes` and with "an EXAM's deadline never decreases once
  it has an attempt" (no clock, AP5); (4) `exam_attempt_holds_transition()` RETURNED's `ends_at` also `least(…, deadline)`; (5) drop
  `start_window_minutes`. Every started attempt keeps its end: `startedAt ≤ publish + window` ⇒ `startedAt + duration ≤
  deadline` (SC-005, US4-1).
- **Rationale**: conversion and the schema change must be atomic; the triggers that read the window must change with it.
- **Alternatives**: keeping `start_window_minutes` nullable "for history" (dead column the triggers still mention).

## AP8 — Web form: "Período"

- **Decision**: one fieldset "Período" for ASSIGNMENT and EXAM: "Início" (Agora | Agendar → date + time, the 012 radios)
  and "Término" (date, prefilled with the start's date, + time). EXAM keeps "Duração" and "Limite de inatividade"; the
  "Limite para iniciar" field and the work's "Prazo de entrega" + "Política de atraso" go. Client validation mirrors the
  server (end after start; exam period ≥ duration) and maps `INVALID_SCHEDULE` to the end field. The detail shows
  "Período: 30/11 19:10 → 22:00" and, for a published exam, "Estender término"; the monitor shows "Termina às".
- **Rationale**: spec FR-003, US1, US3; reuses the existing `localToIso`/`isoToLocal` helpers and DS fields.

## AP9 — Messages

- **Decision**: `INVALID_SCHEDULE` → "O término deve ser depois do início e, na prova, deixar pelo menos a duração."; new
  `EXAM_END_CANNOT_MOVE_EARLIER` (422) "Depois de publicada, o término da prova só pode ser estendido."; new
  `ACTIVITY_PERIOD_ENDED` (409) "O período desta atividade terminou."; `EXAM_START_CLOSED` text → "O período desta prova
  terminou." No exam text says "fraude", "cola" or "violação".

## AP11 — `latePolicy` comes from the type, never from the body

- **Decision**: `ACTIVITY_TYPES` gains `hasLatePolicy` (ASSIGNMENT only) beside `hasDeadline` (now ASSIGNMENT and
  EXAM). `ActivitiesService.create` writes `deadline` when `hasDeadline` and `latePolicy = REJECT` only when
  `hasLatePolicy`; `update` no longer reads `latePolicy` at all.
- **Rationale**: today `create` writes `{ deadline, latePolicy: body.latePolicy }` whenever `hasDeadline` (line ~222);
  flipping `hasDeadline` for EXAM without this split would write an undefined `latePolicy` and violate the CHECK.

## AP10 — Tests and guards

- **Decision**: `SPECS += 032` in `traceability.spec.ts` at the first phase, with US1–US4 and SC-001–SC-006 pending. Pure
  unit tests for `exam-time.ts` (period cap, inclusive start, extension) and `period.ts` (`validPeriod`, `canChangeEnd`,
  `acceptsAttendanceMark`), integration per US scenario (create, start,
  cap, attendance refusal, extension, legacy `ACCEPT_MARKED`), a migration test that seeds pre-032 rows and checks AP7's
  invariant, contracts tests (bodies refuse `startWindowMinutes`/`latePolicy`), web tests per form and detail scenario
  with a11y, the mobile tests unchanged (compatibility, AP4). No new boundary guard.
