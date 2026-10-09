# Research: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

Decisions carry the prefix **M** (M1, M2, …). Each one gives the Decision, the Rationale and the
Alternatives considered.

## M1 — Module layout

**Decision**: a new API module, `modules/attendance`, holds:

- the teacher's routes for the attendance and the room view, and for pausing and releasing a
  student;
- the student's routes for declaring an exit and reading their own pause;
- the pure room-status rule (`room-status.ts`) and the pause views.

The pure pause-time rule (`pause-time.ts`) lives in `activities/status/`, next to the other
derived statuses. The roster needs it, and `activities` never imports `attendance`, while
`attendance` may import `activities`, as 015 imports the student loader.

`student-activities` and `activities` never import it. They read the two new tables directly in
their existing scoped queries:

- the visibility predicate and the attempt's lock query (M4, M6);
- the roster and the activity summaries (M9).

The web gets `features/attendance`: the "Chamada" tab, the room panel, the exit dialog and the
pause notice. `features/activities` and `features/student-activities` import its components, as
they already do with `controlled-attempt` and `work-help`.

**Rationale**: visibility and the paused-attempt refusal have to sit inside the queries and the
row locks of 012 to be race-free (M6). A hook such as 015's `AnswerSaveGuard` would add a second
query outside the lock. Attendance is neither AI nor monitoring, so the 012/015 boundary guards
keep their meaning. The new module gets its own small guard (M12).

**Alternatives**:
- Everything in `activities`/`student-activities`. Rejected: two more responsibilities in
  services that already exceed 20 KB, and no single home to guard.
- A hook interface for visibility. Rejected: the predicate has to be part of the same SQL.
  Otherwise list, detail, start and lock each run an extra query and can race.

## M2 — Who sees an activity: `release_mode` on the activity

**Decision**: a new enum `activity_release_mode` with the values `ALL_ENROLLED` and `PRESENT_ONLY`.
`class_activities` gets `release_mode NOT NULL DEFAULT 'ALL_ENROLLED'`, with:

- a CHECK that `type = 'ASSIGNMENT' OR release_mode = 'ALL_ENROLLED'`;
- an immutability rule in the 012 trigger.

Behaviour:
- **Existing rows**: become `ALL_ENROLLED`, so works applied before 016 stay visible to every
  enrolled student (spec Assumptions).
- **New ASSIGNMENT**: the server applies it as `PRESENT_ONLY`. The field is not in the create
  body, so a body that sends it gets `400`.
- **Take-home work**: the later feature will add the teacher's choice. It will most likely expose
  `ALL_ENROLLED` for works.

**Rationale**:
- Using an enum and not a flag follows constitution XVI and gives the take-home feature a ready
  value.
- The CHECK keeps exercises free (FR-007) at the DB level.

**Alternatives**:
- Deriving "requires attendance" from `created_at > deploy`. Rejected: implicit and untestable.
- Backfilling old works to `PRESENT_ONLY`. Rejected: works already in progress would disappear
  (spec Assumptions).

## M3 — The attendance record

**Decision**: a table `activity_attendances` with:
- primary key `(activity_id, student_user_id)`;
- `class_id`, `marked_at` (server clock) and `marked_by_id` (the teacher).

Rules:
- **Mark**: `INSERT … ON CONFLICT DO NOTHING`, so marking twice is idempotent and the first
  `marked_at` is kept.
- **Unmark**: `DELETE`, allowed only while the student has no attempt. A trigger refuses it
  otherwise, and the service answers `409 ATTENDANCE_STARTED` first.
- **Insert rules** (trigger): the activity is `PRESENT_ONLY` and ACTIVE, and the student has an
  ACTIVE enrollment in the activity's class.
- **The record's history** lives in the audit (`attendance.marked` / `attendance.unmarked`). The
  table holds only the current presence.

**Rationale**:
- A row per present student is the simplest thing the visibility predicate can test with
  `EXISTS`.
- Delete-on-unmark keeps "presente" an explicit fact, not a status column with a flag.

**Alternatives**:
- A status column `PRESENT/ABSENT` with rows for every student. Rejected: it would need rows for
  absent students and would have to follow enrollment changes.
- An append-only log with derived presence. Rejected: visibility would need a "latest row" query
  on every read, and the audit already keeps the history.

## M4 — Visibility predicate (FR-008)

**Decision**: every student path adds one clause to its scoped query:

```sql
(ca.release_mode = 'ALL_ENROLLED'
 OR EXISTS (SELECT 1 FROM activity_attendances aa
            WHERE aa.activity_id = ca.id AND aa.student_user_id = :student))
```

The clause goes into:
- `visibleTo` (Prisma `where`, used for the list, the dashboard, the detail and concluded
  attempts);
- `StudentActivityLoader.ownAttempt` (015 events and help);
- `attempts.service` `lockContext` (start, save, submit).

`deniedReason` gains `NOT_PRESENT` for `student_access.denied`. The student's answer stays the
same `404`.

A DB trigger on `activity_attempts` INSERT refuses an attempt of a `PRESENT_ONLY` activity
without an attendance row. It reads that row `FOR SHARE`.

**Rationale**:
- One clause in the three places 012 already centralized.
- The trigger makes "only present students start" true even if a future path forgets the clause.

**Alternatives**: a view or SQL function for visibility. Rejected: it changes the 012 query style
everywhere for one clause.

## M5 — Marking is releasing; the teacher's batch

**Decision**: the route is `POST /classes/:classId/activities/:activityId/attendance`, with the
body `{ mark: uuid[], unmark: uuid[] }`, each list 0–200 long and disjoint from the other.
- **All-or-nothing**: if any id to unmark has an attempt, the request fails with
  `409 ATTENDANCE_STARTED` and `details.studentUserIds`, and nothing is written.
- **Unknown or non-ACTIVE students** get `422 STUDENT_NOT_IN_CLASS`.
- **Idempotency**: marking a present student or unmarking an absent one is a no-op, with no audit.
- **Response**: the room view (M8).

The web keeps the checkboxes local until "Liberar para os presentes" and sends only the
differences. Each later click on a single student ("Marcar presente" next to a late student) sends
a one-item batch at once.

**Rationale**:
- Deltas, not a full set, so two teacher tabs never undo each other's marks (spec Edge Cases).
- All-or-nothing keeps the teacher's confirmation honest.

**Alternatives**:
- `PUT` with the full set. Rejected: a stale tab would unmark students.
- One route per student. Rejected: 37 requests for "Marcar todos" (SC-005).

## M6 — The pause: a row, PAUSED derived

**Decision**: a table `attempt_pauses` with:
- the attempt (composite FK);
- `initiated_by` (`STUDENT` | `TEACHER`) and `reason` (`BATHROOM` | `WATER` | `PHONE` | `OTHER` |
  `TEACHER`);
- `note` (≤ 200 characters, only for `OTHER`);
- `started_at` / `started_by_id`;
- `released_at` / `released_by_id`, set together and only once.

A partial UNIQUE `(attempt_id) WHERE released_at IS NULL` allows one open pause per attempt.

The attempt's status enum does not change: an attempt is PAUSED when it is `IN_PROGRESS` and has an
open pause. That is derived on read, like every 012 status.

**Pause from the student**: `POST /me/activities/:activityId/attempt/pause` takes
`{ reason, note? }`. The route uses the same transaction shape as save and submit:
1. `lockContext` with the M4 clause;
2. the attempt `FOR UPDATE`;
3. checks: `IN_PROGRESS`, activity ACTIVE, class ACTIVE, `PRESENT_ONLY`;
4. insert.

If a pause is already open, the route returns it (`200`), so a double click or two tabs do not
fail.

**Save, submit, help request and events** run under the same attempt lock. After the lock they
check the open pause and answer `409 ATTEMPT_PAUSED`. Whatever reached the lock before the pause
committed was accepted (US3-9).

A help request already `REQUESTED` before the pause is not cancelled. Its orientation is
materialized as in 015 and shown after the resume, and only new requests are refused (spec Edge
Cases).

**Defense in depth**: triggers on `activity_answers` (INSERT/UPDATE), `activity_submissions`,
`attempt_integrity_events` and `work_help_requests` (INSERT) refuse writes while the attempt has an
open pause. The one exception is a teacher's acceptance (012 FR-006b) after the activity is
closed: a closed activity ends the pause (M7).

**Rationale**: the 012 attempt row lock already serializes the student's writes, so making the
pause one more write under that lock gives the ordering US3-9 asks for without new machinery.

**Alternatives**:
- A `PAUSED` value in `activity_attempt_status`. Rejected: it duplicates the open pause row,
  creates a stored status that can disagree with it, and touches every 012/013/015 status switch.
- A boolean `paused` flag. Rejected by constitution XVI.

## M7 — Ending a pause; closing and cancelling

**Decision**:
- **Release**: `POST /classes/:classId/activities/:activityId/pauses/:pauseId/release`. It sets
  `released_at` and `released_by_id` once. Calling it again on a released pause returns it
  unchanged (`200`), so a double click never ends a *later* pause. That is why the route is keyed
  by pause, not by student.
- **Released at the deadline or later**: the release is allowed. The 012 deadline rule then
  decides whether the student can still save or submit (FR-015).
- **Closed or cancelled activity**: the open pause is **not** written. Its effective end is
  derived as the activity's `closed_at`/`cancelled_at`. Release then answers
  `409 ACTIVITY_CLOSED`, and the pause shows as "encerrada com a atividade".
- **Close audit**: `activity.closed` and `activity.cancelled` gain `pausedCount`, and
  `activity_submission.accepted_by_teacher` gains `pauseEnded`. Together they record "pausa
  encerrada pelo encerramento" (spec audit list).
- **Teacher acceptance** (012 FR-006b): it works on a paused attempt in two cases, after the
  close and after the deadline of an ACTIVE activity that refuses late work (spec US3-7). The
  defense trigger on `activity_submissions` lets a teacher's acceptance (`accepted_by_id` set)
  through. The pause then ends by derivation at the acceptance's `submitted_at`, with
  `endedBy: ACCEPTED`, and is not written either.

**Rationale**:
- Writing the end inside the close or the acceptance would put pause code in `activities` and
  stamp the DB clock instead of the injected `Clock`.
- Deriving it follows the "durations derived on read" rule of 015.

**Alternatives**: a trigger on close that ends every open pause. Rejected: it uses the DB clock and
the write is hidden.

## M8 — The room view and refresh without WebSockets

**Decision**: `GET /classes/:classId/activities/:activityId/attendance` returns
`{ releaseMode, present, enrolled, students[] }`.

Each student row carries:
- `studentUserId`, `name`, `markedAt | null`;
- `roomStatus` (`NOT_MARKED` | `PRESENT` | `ANSWERING` | `OUT_OF_ROOM` | `SUBMITTED`);
- `openPause | null`, with `id`, `reason`, `note`, `initiatedBy` and `startedAt`;
- `attemptId | null`.

`roomStatus` comes from the pure `room-status.ts`. The query count stays at 3 whatever the class
size.

Polling, every 5 s while the page is visible (TanStack `refetchInterval`, not in the background):
- the teacher's "Chamada" tab;
- the student's "Minhas atividades" and dashboard, through the existing list query;
- the student's answering page, through `GET /me/activities/:activityId/attempt/pause`.

5 s keeps the spec's 10 s bound (FR-009, FR-014, FR-020) with margin for one slow response.

**Rationale**:
- The project forbids WebSockets without a spec that needs them, and the 015 help already polls.
- At 40 students and one request per 5 s each, the load is 8 req/s of indexed reads.

**Alternatives**:
- Server-sent events. Rejected: a new transport and a long-lived connection per student, for a
  10 s bound that polling meets.
- Polling every 10 s. Rejected: a slow response would miss the bound.

## M9 — Teacher views: summary, roster, review

**Decision**:
- **Activity summaries and detail**: `TeacherActivitySummary` and `TeacherActivity` gain
  `attendance: { present, enrolled } | null`. It is null for `ALL_ENROLLED`, and the UI shows
  "Aguardando chamada" when `present = 0`.
- **Roster** (012 FR-006):
  - `RosterStatus` gains `ABSENT`, which applies to `PRESENT_ONLY` when the student has no
    attendance and no attempt. It never counts as `MISSED`.
  - Each row gains `markedAt | null` and `pauses: { count, secondsAway, open }`.
  - The close's `missedCount` excludes `ABSENT`.
- **Review**: `GET /classes/:classId/activities/:activityId/attempts/:attemptId/pauses` returns
  the pauses with their derived durations.
- **Student history**: the own submitted attempt shows its pauses (`pauses` in the student
  detail, after submission only).

**Rationale**: FR-019/FR-021 with the 012 pattern: one roster query batch, statuses derived in a
pure function.

**Alternatives**: putting the pauses in the 015 integrity timeline. Rejected: pauses exist in
NORMAL works too and are not monitoring events.

## M10 — Controlled mode during a pause (FR-017)

**Decision**: on the client, the order is:
1. the exit dialog stops the 015 focus monitor;
2. it flushes the answer autosave and the event queue;
3. it calls the pause route;
4. only then does it leave fullscreen.

During the pause the events route answers `409 ATTEMPT_PAUSED`, and the monitor stays off. If the
teacher pauses the student, the next poll (or a `409 ATTEMPT_PAUSED` on a save) stops the monitor
first. Events still queued are kept in `localStorage` and sent after the resume.

Resuming in CONTROLLED mode shows the 015 start notice again ("Retomar em modo controlado"), so
fullscreen comes from a user gesture, as browsers require.

**Rationale**: a declared exit must not appear as a screen exit (FR-017), and fullscreen can only
be requested from a gesture.

**Alternatives**: recording the pause as an integrity event. Rejected: it mixes a declared,
teacher-released fact with monitoring facts, and NORMAL works have no integrity events.

## M11 — Rate limits and limits

**Decision**:
- `RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR` (default 20) per student. It counts on the operation's
  `tx`, the lesson of the 015 pool fix.
- The pause-read route is covered by the global limit.
- The batch is limited to 200 ids per list, which covers the largest class.
- The note is limited to 200 characters (CHECK and contract).
- The polling interval is a web constant (`ATTENDANCE_POLL_MS = 5000`).

**Rationale**: the spec leaves these to the plan; the values follow the 015 rate limits.

## M12 — Guards and traceability

**Decision**:
- **New guard**: `apps/api/test/attendance-boundary.spec.ts`. The `attendance` module (API and
  web) imports no AI, `work-help`, `attempt-integrity`, grading or bank module and uses no float
  arithmetic.
- **Existing guards**: `activities-boundary.spec.ts` gets `attendance` added to the modules the
  activity modules may not import (they read its tables, not its code).
- **Domain models**: `domain-boundary.spec.ts` pins the new models.
- **Endpoint catalog**: lists the 7 new routes.
- **Traceability**: `SPECS` gains `016`.

**Rationale**: the project's practice of one guard per new module, and the traceability rule in
CLAUDE.md.

## M13 — Permissions

**Decision**: one new permission, `chamada.registrar`, granted to TEACHER by migration. It covers
marking and unmarking, the room view, pausing a student and releasing a pause.

Reused permissions:
- `entregas.visualizar` (teacher): the pauses of an attempt in the review;
- `atividades.proprias.responder` (student): declaring an exit;
- `atividades.proprias.visualizar` (student): reading their own pause.

**Rationale**: taking attendance is a new capability, distinct from applying an activity. A future
role, such as a monitor who takes attendance, could hold it alone.

**Alternatives**: reusing `atividades.aplicar`. Rejected: it couples applying a work with
supervising the room.
