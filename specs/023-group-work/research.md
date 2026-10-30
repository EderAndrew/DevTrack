# Research: 023 — Trabalho individual ou em grupo

Decisions carry the prefix **U** (023). Every NEEDS CLARIFICATION of the plan is resolved here; the spec has none.

## U1 — Constitution XXIV needs an amendment (3.6.0)

**Decision**: the plan's gate XXIV fails as the constitution stands: members see classmates' names, the group's
answers and the group's grade. The amendment `constitution-amendment-3.6.0.md` adds a bounded exception
"trabalho em grupo" (MINOR), like 3.3.0 did for the ranking; applied on 2026-10-30 (constitution v3.6.0). The design
below fits its text.

**Rationale**: the user asked for exactly this sharing; the constitution says it is non-negotiable and is amended
only through its command (018 did the same for 3.5.0).

**Alternatives considered**: justify it in Complexity Tracking only (a principle violation cannot be waived there);
let each member keep a private copy of the answers (contradicts "uma tentativa, uma entrega" decided by the user).

## U2 — The format lives on the activity

**Decision**: `class_activities.group_size smallint NULL`: `NULL` = individual, 2–5 = group with that maximum,
counting the leader. CHECKs: not NULL only for `type = 'ASSIGNMENT'` and `release_mode = 'PRESENT_ONLY'`;
`group_size BETWEEN 2 AND 5`. It changes only before the first attempt: the 015/021 trigger that freezes
`execution_mode`, `ai_help_allowance` and `code_execution_allowed` gains this column. Contracts: the apply body and
the 015 options PATCH take `groupSize: 2..5 | null` (default `null`); EXERCISE and EXAM bodies refuse it (400, as
`codeExecution`), and a work applied before 016 (`ALL_ENROLLED`) answers `422 GROUP_NEEDS_ATTENDANCE`; the teacher views carry `groupSize`, the student view too. The change is audited by the existing
`activity.settings_changed` (metadata gains `groupSize` before/after).

**Rationale**: one nullable column reads better than a format enum plus a size that must agree; every older row is
`NULL`, so every older work stays individual with no backfill (FR-003). A group work is always new, so always
`PRESENT_ONLY` (016) and the candidate list always starts from the attendance.

**Alternatives considered**: an enum `work_format` + `group_max_size` (two columns that must agree, one more CHECK);
a group setting per class (the user wants it per work).

## U3 — The group is the attempt; participants link the students

**Decision**: a group does not create a new kind of attempt. The student who starts creates the usual
`activity_attempts` row (its `student_user_id` stays the creator forever, as today). A new table
`attempt_participants (attempt_id, activity_id, student_user_id, attempt_number, joined_at, added_by_user_id)`
lists who takes part in it:

- every attempt of every type gets its owner's row in the same transaction that creates it (the migration
  backfills one row per existing attempt), so "the student's attempt" has one definition everywhere;
- a group attempt gets one more row per member, `added_by_user_id` = the leader who added them;
- `UNIQUE (activity_id, student_user_id, attempt_number)` makes FR-008 a database rule: a student with any
  participation in a work's attempt 1 cannot start another attempt 1 nor join another group in it. EXERCISE
  attempts keep their numbering (one row per attempt n for its owner).

The group's own state is `attempt_groups (attempt_id PK, activity_id, leader_user_id, editor_user_id, version,
created_at)`, created with the attempt when the start brings members; leader and editor have composite FKs to
`attempt_participants`. "Continuar sozinho" in a group work is an attempt with only its owner and no
`attempt_groups` row: exactly an individual attempt (FR-007).

**Rationale**: answers, submission, grading, release, the 015 helps cap, the 019/021 runs and the teacher's review
already hang from the attempt; making the group *be* the attempt reuses all of it, and the participants table
carries the only new fact, who belongs.

**Alternatives considered**: one attempt per member mirroring the leader's answers (two sources of truth, the
submission and the grade copied N times); a `groups` table with its own answers (a parallel attempt model for the
whole 012 stack).

## U4 — Per-student facts point at the participant

**Decision**: the composite FKs `(attempt_id, activity_id, student_user_id) → activity_attempts(id, activity_id,
student_user_id)` of `attempt_integrity_events`, `work_help_requests`, `attempt_pauses` and `code_runs` move to
`attempt_participants(attempt_id, activity_id, student_user_id)`. Their `student_user_id` keeps meaning "the
student this fact is about": the owner in an individual attempt (nothing changes), any member in a group. The exam
tables (`exam_occurrences`, `exam_attempt_holds`) keep theirs: exams are never in a group.

**Rationale**: FR-021 (controlled-mode records, pauses and runs per student) becomes a schema fact with no new
table, and every existing row stays valid because U3 backfills the owner's participation.

**Alternatives considered**: new per-member tables for each fact (four copies of existing models).

## U5 — Every "attempt of this student" query goes through the participants

**Decision**: the student-side lookups that today filter `activity_attempts.student_user_id = <session>`
(`attempts.service.ts` `findAttempt`, `StudentActivityLoader`, `MyActivitiesService`, `FocusEventsService`,
`WorkHelpService`, `MyPauseService`, `CodeRunsService`, `exam-settlement`) join `attempt_participants` instead,
each in its own scoped query (the 016 rule: no cross-module imports). The teacher-side reads that find a student's
attempt by `student_user_id` also go through the participants: `attendance/pauses.service.ts` ("Pausar aluno" and
an attempt's pauses), the room query of `attendance/attendance.service.ts` (each student's `roomStatus`),
`activities/roster.ts` and `activities/attempts-review.service.ts` (each student's situation). A member's situation
is the group attempt's; their pause is their own. The teacher-side roster and review read
the attempt and list its participants. A guard (`test/group-work-boundary.spec.ts`) fails when a student-side
module filters attempts by `a.student_user_id` instead of the participant.

**Rationale**: one rule, applied where each module already scopes; a student outside the group gets the same 404
as an activity of another class (XXIV).

**Alternatives considered**: a shared "attempt resolver" service imported by every module (breaks the 015/016
boundaries the guards keep).

## U6 — Forming and adding members: one lock per activity, all or nothing

**Decision**: start (alone or with members) and "Incluir integrantes" run under the existing context lock
(activity `FOR SHARE`) plus `pg_advisory_xact_lock(hashtext('activity-group'), hashtext(activity_id))`, then
re-check every chosen id: same class, ACTIVE enrollment, attendance row, no participation in the activity, not
the caller, and the total ≤ `group_size`. Any failure refuses the whole request (`409 GROUP_MEMBERS_UNAVAILABLE`
with the unavailable ids; the web re-reads the candidates to show their names), so FR-006 never half-creates a
group. The UNIQUE of U3 is the last defense (a violation → the same 409). The body is only
`{ memberIds: uuid[] }` (1–4 distinct ids) or `{ alone: true }` on a group work; an individual work keeps `{}`.
Candidates: `GET /me/activities/:id/group/candidates` → `{ groupSize, slots, candidates: [{ id, name }] }` in name
order.

**Rationale**: a class has at most ~60 students and a work a handful of starts per minute; one advisory lock per
activity is the simplest serialization that covers the start-alone × added-by-a-leader race (spec edge cases)
without locking rows of other students.

**Alternatives considered**: row locks on each chosen student's enrollment (lock order across concurrent leaders,
deadlock-prone); optimistic insert and retry (the partial group of FR-006 would need compensation).

## U7 — Editing: one owner per group, conditional updates, an append-only log

**Decision**: `attempt_groups.editor_user_id` is the only editor. `POST …/group/editing` with
`{ action: "HAND", toUserId } | { action: "TAKE_BACK" } | { action: "RETURN" }` runs under the attempt's
`FOR UPDATE`: HAND and TAKE_BACK only by the leader, RETURN only by the current editor when not the leader; each
change bumps `version` and appends one `attempt_group_events` row (`kind`, `actor_user_id`, `from_user_id`,
`to_user_id`, `occurred_at` by the server clock). Handing to the current editor answers 200 with no row
(idempotent). After submission, close or cancellation → `409 INVALID_STATE_TRANSITION`.

**Rationale**: FR-013 with explicit transitions (XVI) and one serialization point; the log is the teacher's
"passagens da edição" (FR-020).

**Alternatives considered**: a lease that expires (the user asked for the leader to decide, not a timer).

## U8 — Saves only from the editor; every accepted save logged

**Decision**: `saveAnswers` and `submit` on a group attempt check, under the attempt lock, that the caller is the
editor (`409 GROUP_NOT_EDITOR`) — and for the submit, also the leader (`409 GROUP_NOT_LEADER`; the leader must hold
the editing to submit, so the pending answers are theirs). Database defense:
`activity_answers.saved_by_user_id` (NOT NULL; backfilled with the attempt's owner) and a trigger refusing an
answer write whose `saved_by_user_id` is not the group's editor; `activity_submissions.submitted_by_user_id`
(NULL only for the teacher's "Aceitar como entrega"; backfilled) refused unless it is the group's leader. Every
accepted save of a revision appends `activity_answer_saves (attempt_id, question_id, revision, student_user_id,
saved_at)` from an AFTER trigger, so no save path can skip the log; no content is stored (FR-015). A refused
save is audited as `activity_group.write_refused` (ids and a reason code).

**Rationale**: the 012 save protocol (`baseRevision`, SAVED/UNCHANGED/CONFLICT) is untouched; only who may write
is added. Logging in a trigger makes "cada edição fica registrada" independent of the service code.

**Alternatives considered**: logging in the service (a new save path could forget it); storing the content of
each revision (not needed by the user, and FR-015 forbids it).

## U9 — Pauses, leadership and access loss: settled by the next touch

**Decision**: who may act is computed by the pure `activities/group/group-roles.ts` from the stored leader and
editor, the participants' enrollments and their open pauses: an editor who is paused or lost access is not
effective, and the editing falls back to the leader; a leader who lost access is replaced by the active member who
joined first. Every group route and read first runs `settleGroup` in its own transaction (the 018
`ExamSettlement` pattern), which persists the fallback with an `attempt_group_events` row (`kind`
`EDITING_RESET` with `reason` `PAUSED` or `ACCESS_LOST`, or `LEADER_CHANGED`, actor SYSTEM) and audits
`activity_group.leader_changed`. A paused editor who returns does not get the editing back (FR-023).

**Rationale**: the pause lives in `attendance` and the enrollment in `classes`; neither may import the activity
modules (016, 003). The members poll every few seconds (U12), so a touch comes quickly.

**Alternatives considered**: hooks in `attendance` and `classes` writing group rows (cross-module writes); a job
(the project settles derived state on touch, never by job — 018).

## U10 — Pause triggers look at the writer

**Decision**: `attempt_paused_writes` (016/018) checks an open pause of **the writer** on the attempt — the
`saved_by_user_id` of an answer, the `submitted_by_user_id` of a student's submission, the `student_user_id` of an
integrity event, a help request or a code run — instead of any open pause of the attempt. In an individual attempt
the writer is always the owner, so the behavior is identical (SC-007).

**Rationale**: FR-023: a paused member stops; the others go on.

**Alternatives considered**: keep "any pause stops the whole attempt" (would stop a group because one member left
the room).

## U11 — Controlled mode per student

**Decision**: each member's focus events are written with their own `student_user_id` on the group's attempt
(U4); the timeline and summary of the teacher (015) group them by student with the name; the typing allowance of
`ControlledAnswerGuard` applies to the editor's saves as today. Nothing of one member's events reaches another
member's view.

## U12 — Readers poll the student activity

**Decision**: in a group attempt every member's page polls `GET /me/activities/:activityId` every
`GROUP_POLL_MS = 5000` while the page is visible (the 016 `ATTENDANCE_POLL_MS` pattern); the response carries
`group` (`leader`, `members`, `editor`, `myRole`, `version`, `addedBy` for the notice) and the answers with their
`revision` and `savedBy`. A reader renders the answers read-only; the editor's form keeps its own text and, when a
poll shows another editor, switches to read-only with "A edição está com <nome>". No WebSocket, no new
dependency.

**Rationale**: SC-004 (≤ 10 s) with one existing route; the project forbids WebSockets.

## U13 — AI help and code runs in a group

**Decision**:
- **Help (015)**: the cap of 3 DELIVERED and one REQUESTED per attempt already makes it per group. Only the editor
  requests (`409 GROUP_NOT_EDITOR` otherwise); `student_user_id` is the requester; every member reads the delivered
  orientations of the attempt. The `work-helper` still sees only the student view of the question.
- **Runs (019/021)**: any member may run; the run carries the member's `student_user_id` (one pending run and
  10/min per student unchanged). Admission on a group attempt uses the attempt's time rule (`decideOperation`
  without the editor check) and the member's own pause; the source is what the member's screen holds (for a
  reader, the last saved answer).

## U14 — One submission, one grade, released to every member

**Decision**: the submission is the attempt's, as today; `registerSubmission` is unchanged. The leader submits only
holding the editing (spec FR-018). The teacher's "Aceitar como entrega" works on the group's attempt as on any other
(`submitted_by_user_id` NULL, `accepted_by_id` the teacher) and so counts for every member. The teacher's counters
("x de y entregaram") count per student: each participant of a submitted attempt is submitted. The student's result
(012 P14) is served to every participant of the attempt, only when released, complete and with
`notas.proprias.visualizar`; `result_viewed_at` keeps the first read of anyone (no per-member read state). The
teacher's roster lists one row per attempt with its participants; grading and release do not change.

## U15 — Attendance unmark looks at participation

**Decision**: the 016 unmark refusal (`409 ATTENDANCE_STARTED`) checks a participation of the student in the
activity (own attempt or group), in `attendance`'s own query (FR-025).

## U16 — The teacher's group facts route

**Decision**: `GET /classes/:classId/activities/:activityId/attempts/:attemptId/group` (`entregas.visualizar`,
`ClassContextPolicy`) answers `{ leader, members: [{ id, name, joinedAt, addedBy }], events: [...],
saves: [{ questionId, entries: [{ studentId, revision, savedAt }] }] }` for a group attempt (404 for an individual
one); the attempt detail and the roster gain `participants` (ids and names). Built as an allowlist
(`activities/views/teacher-group-view.ts`), not audited, like the 015 timeline and the 021 summary.

## U17 — Web

**Decision**: a new `features/group-work` (API calls, hooks, components): `GroupStartDialog` (the message of
FR-004, the candidate checklist with "n de N", "Iniciar em grupo", "Continuar sozinho"), `GroupBar` (members,
"Editando agora", "Passar a edição", "Retomar a edição", "Devolver a edição", "Incluir integrantes") and
`GroupNotice` ("Você está no grupo de <líder> neste trabalho"); `activity-answering.tsx` takes a `readOnly` flag
from the group state and hides "Entregar" from non-leaders; the apply form (`work-options.tsx`) gains "Formato"
(Individual / Em grupo + "Máximo de integrantes, com o líder"); the teacher review gains `GroupFacts`. Words in
`features/group-work/schemas/`. All with design-system components; names rendered as text.

## U18 — Rate limits and new configuration

**Decision**: no new environment variable. Starts keep the 012 start limit; editing changes and inclusions count in
the 012 per-student save limit (`activity-saves`), which a person clicking cannot reach. `GROUP_POLL_MS` is a web
constant.

## U19 — Audit events

**Decision**: new types `activity_group.created` (attemptId, activityId, memberCount), `activity_group.member_added`
(attemptId, memberId, addedById), `activity_group.editing_changed` (attemptId, kind, fromUserId, toUserId),
`activity_group.leader_changed` (attemptId, fromUserId, toUserId, reason) and `activity_group.write_refused`
(attemptId, operation, reason). Saves are not audited one by one (the 012 throttled `progress_saved` stays); the
`activity_answer_saves` log is the record. Metadata: ids, enums, counts — never names or answers.
