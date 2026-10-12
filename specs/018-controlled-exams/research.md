# Research: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

Decisions carry the prefix **T** (T1, T2, …). Each one gives the Decision, the Rationale and the
Alternatives considered.

## T1 — Module layout

**Decision**:

- **API**:
  - `modules/exams`: the teacher's Banco de Provas (CRUD, approve, archive, coverage, student
    preview). It mirrors `works` and imports only its pure parts (`works/types`, `works/grading`,
    `works/grade`).
  - `modules/exam-ai`: "Criar prova com IA", the `exam-generator` agent and its generation requests.
    It mirrors `work-ai`.
  - `modules/exam-sessions`: the teacher's exam monitor (room, time left, occurrences, holds) and the
    three decisions (confirm cancellation, return, do not cancel).
  - `attempt-integrity/exam-occurrences.ts`: the occurrence count and the hold opened by the 4th
    occurrence (T6, T8). It stays in `attempt-integrity` because monitoring lives only there
    (`activities-boundary.spec.ts`, 015).
  - `activities`: the EXAM type, `snapshot/from-exam.ts`, the exam coverage in `scope-check`,
    `status/exam-time.ts` (pure, T4) and `submission/settle-exam.ts` (T5).
  - `student-activities`: the exam rules on start, save and submit, inside the existing 012 locks.
- **Web**:
  - `features/exams` (bank and "Criar prova com IA");
  - `features/exam-session` (teacher's monitor and decisions, next to the 016 "Chamada");
  - `features/exam-attempt` (student's rules screen, timer, alerts, warnings), built on
    `features/controlled-attempt`;
  - the Exam Mode components of 005 in `components/ui/assessment` (timer, time alert, final
    countdown, warning dialog).

**Rationale**:
- The bank is a third bank, kept apart like 010 and 011 (constitution XXIII, spec FR-001).
- The decisions write grades and submissions, so they can't live in `attempt-integrity` or in
  `attendance`, whose boundaries forbid grading (015, 016).
- The hold check and the time rule must sit inside the 012 locks to be race-free, as 016 M1 argued
  for the pause.

**Alternatives**:
- One `exams` module for everything. Rejected: it would mix the bank (teacher's models) with the
  class's attempts, which the constitution keeps apart, and break the existing monitoring boundary.
- Exam as a flag of a work. Rejected by the clarification (Q1 → own bank).

## T2 — The bank: own tables, shared pure rules

**Decision**: new tables `exams`, `exam_topics`, `exam_questions`, `exam_question_alternatives`,
`exam_question_test_cases`, `exam_question_topics`, `exam_generation_requests` and
`exam_generation_request_topics`, shaped like the 011 tables. Differences from 011:

- 1–20 questions (011: 1–10);
- `exam_questions.difficulty` NOT NULL on approval (per question; 011 has it per work);
- every question needs at least one topic on approval (011: optional);
- the exam always has a syllabus revision (topics are required).

The DB enums `work_question_type`, `work_grading_strategy`, `work_difficulty` and
`work_test_case_visibility` are reused: they describe the question model, not the bank. The pure
rules come from `works/types`, `works/grading` and `works/grade` (value split in exact hundredths,
EXACT_MATCH, pending rules). `exams-boundary.spec.ts` (T16) allows exactly those imports.

**Rationale**: same question model, same grading, no copy of the rules; separate data so editing
or archiving one bank never touches the other.

**Alternatives**:
- A polymorphic `bank_items` table. Rejected: rewrites 010/011 and their triggers.
- New enums `exam_*` with the same values. Rejected: duplicated vocabulary with no behavior
  difference; the contracts already share `WorkQuestionType`.

## T3 — The EXAM activity

**Decision**: `class_activity_type` gains `EXAM`. `class_activities` gains:

- `source_exam_id` (set iff EXAM);
- `duration_minutes` (1–120), `inactivity_limit_seconds` (30–60, default 60) and
  `start_window_minutes` (0–60, default 15), all set iff EXAM.

CHECKs for EXAM:
- `execution_mode = 'CONTROLLED'`, `ai_help_allowance = 0`, `release_mode = 'PRESENT_ONLY'`;
- `total_grade` set, `deadline` and `late_policy` NULL.

The 015 and 016 CHECKs that said "only ASSIGNMENT" become "ASSIGNMENT or EXAM" where it applies
(CONTROLLED, PRESENT_ONLY, total grade, question value). The snapshot keeps each question's
difficulty in a new `class_activity_questions.exam_difficulty` (EXAM only). The create body for an
exam is `{ source: { kind: "EXAM", examId }, durationMinutes, inactivityLimitSeconds,
startWindowMinutes, publishAt, title?, instructions?, idempotencyKey, acknowledgeOutOfScope? }`;
mode, help and release mode are refused (`400`).

**Rationale**: the server sets the strict mode, no help and attendance (FR-010), and the DB pins
them. The 012 activity, roster, grading and release keep working with one more type.

**Alternatives**: a separate `class_exams` table. Rejected: duplicates attempts, answers,
submissions, attendance, pauses and grading.

## T4 — Time

**Decision**: pure `activities/status/exam-time.ts`:

- `startDeadline = publishAt + startWindowMinutes`; a start is allowed only when
  `publishAt ≤ now ≤ startDeadline` (`409 EXAM_START_CLOSED` after, the 012 rule before);
- `endsAt = startedAt + durationMinutes`, capped by the activity's `closedAt` / `cancelledAt`;
- `closesAt = startDeadline + durationMinutes`, shown to the teacher; nothing closes automatically
  (the teacher closes as in 012, and every attempt is over by then anyway);
- `remaining = max(0, endsAt − now)`.

Saves and the submit are accepted until `endsAt + EXAM_END_GRACE` (2 s, server clock, a constant),
so an autosave already on the network when the timer hits zero is not lost. Events are never
accepted after `endsAt`. The student view carries `endsAt` and `serverNow`; the browser computes the
offset once per read and ticks locally (SC-002: ≤ 2 s after a reload).

**Rationale**: constitution III; no stored "expired" status; the late student gets the full duration
from their own start (clarification Q2).

**Alternatives**: a common end time for the class. Rejected by Q2. No grace. Rejected: a save sent
at 59.9 s would lose the last answer through no fault of the student.

## T5 — Time-out settlement: an idempotent write on the next touch

**Decision**: an attempt whose `endsAt + grace` passed without a submission and without an open hold
is **settled** by `activities/submission/settle-exam.ts`: one `activity_submissions` row with
`submitted_at = endsAt` (derived, not the time of the settlement), `end_reason = TIME_EXPIRED` (or
`ACTIVITY_CLOSED` when the cap was the close), `late = false`, and the 012 grading of the saved
answers (blank questions score zero, FR-014). It runs, under the activity `FOR SHARE` and the
attempt `FOR UPDATE`, at the start of every operation that touches the attempt: the student's read,
save, submit and events, and the teacher's monitor, roster, review, grading and release. A second
run finds the submission and does nothing. Audit: `exam_attempt.time_expired`, actor SYSTEM.

**Rationale**:
- Grading and release need a submission row; the 012 grading code already works on it.
- The settled facts are deterministic (`submitted_at` is the computed end), so when it runs doesn't
  change the result.
- The project has no scheduler or queue (no new infra, constitution IX), and 012 already writes on a
  read (`result_viewed_at`, research P19).

**Alternatives**:
- A maintenance job. Rejected: jobs are on demand; the teacher would see stale attempts.
- Grading without a submission. Rejected: duplicates the 012 grading and release paths.

## T6 — Occurrences: what counts, and the grouping

**Decision**: the countable integrity types are `SCREEN_LEFT`, `FULLSCREEN_EXITED`, `PASTE_BLOCKED`,
`COPY_BLOCKED`, `CUT_BLOCKED`, `DROP_BLOCKED` and the new `INACTIVITY`. Not counted:
`*_RETURNED`/`*_ENTERED`, connection events, `PAGE_LEAVE_ATTEMPTED` (followed by a `SCREEN_LEFT`
when it happens), `TYPING_LIMIT_EXCEEDED` (the server's own 015 heuristic, recorded as a fact) and
the `*_UNAVAILABLE` notices.

A new table `exam_occurrences` holds one row per counted occurrence: `(attempt_id, ordinal)` UNIQUE,
`kind`, the first integrity event's id and `recorded_at`. Pure `exam-occurrences.ts` decides, for a
batch, which events open a new occurrence:

- a countable event opens one unless it falls within `OCCURRENCE_GROUP_WINDOW` (2 s) of the last
  occurrence of the attempt — measured with `recorded_at` for live events and, inside one buffered
  batch, with `clientOccurredAt` (used only for grouping, never as the official time);
- events while the attempt is paused, on hold, past `endsAt` or submitted are stored (when the 012
  /016 rules allow it) and never counted (FR-020).

It runs in the same transaction as the event insert, under the attempt `FOR UPDATE` (the 015
insert takes `FOR SHARE` today; for EXAM it takes `FOR UPDATE`), so ordinals are gap-free and
concurrent batches serialize (SC-004).

**Rationale**: the count is the server's (constitution III, spec FR-017); one alt+tab fires both
`blur` and `fullscreenchange`, which must count once (spec US4-4).

**Alternatives**: the client tags each action with an occurrence key. Rejected: the client would
define the count. A boolean `counted` on `attempt_integrity_events`. Rejected: the table is
append-only and its rows are the browser's facts; the count is a rule result kept apart.

## T7 — Inactivity in the browser

**Decision**: `features/exam-attempt/hooks/use-inactivity.ts` resets on `keydown`, `pointerdown`,
`pointermove`, `wheel`, `touchstart` and `scroll` (passive listeners). After
`inactivityLimitSeconds` with none of them, it sends one `INACTIVITY` event (with `idleSeconds`) and
stays silent until the next interaction (one per idle period, US4-3). It is suspended while the page
is hidden (that is already `SCREEN_LEFT`), while paused, on hold, before the start and after the end.

**Rationale**: only the browser sees interaction; the server stamps the time and counts. A tampered
client can suppress it, as it can suppress any signal (spec "Untrusted input").

**Alternatives**: server-side idleness from autosave gaps. Rejected: reading a question produces no
save, and network gaps would look like idleness.

## T8 — The hold: "Encerrada por avisos"

**Decision**: a new table `exam_attempt_holds`: one row opened by the occurrence that reaches the
limit (the 4th, or the first after a return), with `opened_at` (server), the occurrence ordinal, and
a resolution (`CANCEL_CONFIRMED`, `RETURNED`, `NOT_CANCELLED`) with `resolved_at` and
`resolved_by_id`, set once. Partial UNIQUE: one open hold per attempt. While open:

- every write of the attempt is refused with `409 EXAM_ATTEMPT_ON_HOLD` (service check under the
  attempt lock, plus the defense triggers of 016 M6 extended to holds);
- the student view omits questions and answers (as the pause) and shows the end message;
- the teacher can't pause the student (`409 EXAM_ATTEMPT_ON_HOLD`);
- settlement (T5) skips the attempt.

"Aguardando decisão" is derived from an open hold. The hold is a `RULE_RESULT`; nothing about grade
or cancellation is written when it opens.

**Rationale**: constitution XVI (explicit states, no flags) and XI (the cancellation is a separate
human decision). Mirrors the pause (016), which the code and tests already handle.

**Alternatives**: a new `activity_attempt_status` value `ON_HOLD`. Rejected: every 012/013 query and
trigger reads that enum; the 016 pause took the same row-based route.

## T9 — The decisions

**Decision**: `exam-sessions` routes, each keyed by the hold id, under the activity `FOR SHARE`, the
attempt `FOR UPDATE` and the hold `FOR UPDATE`:

- **Confirm cancellation** (any time the hold is open): resolves the hold, writes the submission with
  `end_reason = CANCELLED`, `submitted_at = hold.opened_at`, and one `DECIDED` grading per question
  with grade 0, nature `HUMAN_DECISION`, decided by the teacher; `grade = 0`, not partial.
- **Return** (only while `now < endsAt` and the activity ACTIVE): resolves the hold as `RETURNED`; the
  attempt continues. The count is kept, so the next counted occurrence opens a new hold.
- **Do not cancel** (only once `now ≥ endsAt`, or the activity closed): resolves the hold as
  `NOT_CANCELLED` and settles the attempt with `end_reason = ENDED_BY_WARNINGS`,
  `submitted_at = hold.opened_at`, graded as 012 on the answers saved before the hold.

A decision on a hold already resolved → `409 INVALID_STATE_TRANSITION`, no event (US5-7).

**Rationale**: spec FR-021–FR-023; one transition per hold makes double clicks and two tabs safe.

**Alternatives**: "Do not cancel" before the end. Rejected: before the end, not cancelling is
returning (spec US5).

## T10 — Release blocked by pending decisions

**Decision**: the 012 release first settles every expired attempt (T5), then refuses with
`409 EXAM_DECISIONS_PENDING` (with `details.count`) while any hold is open.

**Rationale**: spec FR-024; a student's grade is never released while their outcome is undecided.

## T11 — Pause in an exam

**Decision**: the 016 pause applies unchanged on the teacher side (`chamada.registrar`). The student's
"Sair da sala" route refuses an EXAM with `409 EXIT_NOT_ALLOWED`. The deadline rule of 016 becomes,
for EXAM, `endsAt` (T4): the time keeps running and a pause never moves it. A pause still open at
`endsAt` ends by derivation (`endedBy = TIME_EXPIRED`, a new value of the derived end kind) and the
attempt is settled.

**Rationale**: spec US6 and the decision that only the teacher pauses an exam.

## T12 — Exam monitor (teacher)

**Decision**: `GET /classes/:classId/activities/:activityId/exam-monitor` (`chamada.registrar`)
returns, per ACTIVE enrollment: presence, `examStatus` (`NOT_MARKED`, `PRESENT`, `ANSWERING`,
`PAUSED`, `AWAITING_DECISION`, `SUBMITTED`, `TIME_EXPIRED`, `CANCELLED`, `ENDED_BY_WARNINGS`,
`START_CLOSED`), `endsAt`, `occurrenceCount`, the open hold and the open pause. It reads the
attendance and pause tables in its own query, never importing `attendance` (as 016 M1 did for
`activities`). It settles expired attempts first (T5). The web polls every 5 s
(`ATTENDANCE_POLL_MS`). The occurrences of one attempt come from the existing 015 integrity review
route, extended with `counted` and `ordinal`.

**Performance**: 60 students p95 < 300 ms (3 queries).

## T13 — Student view and the rules acceptance

**Decision**: `StudentActivity` gains `exam` for EXAM:

```text
{ durationMinutes, inactivityLimitSeconds, startDeadline, endsAt|null, serverNow,
  occurrences: { count, warningsAllowed: 3 }, hold: { openedAt }|null,
  endReason: "STUDENT_SUBMITTED"|"TIME_EXPIRED"|"ACTIVITY_CLOSED"|"ENDED_BY_WARNINGS"|"CANCELLED"|null }
```

The start body for an EXAM must be `{ acceptRules: true }` (`400` otherwise); the acceptance is the
`activity_attempt.started` event with `rulesAccepted: true`. The events response gains
`occurrences: { count, held }` so the warning shows right away. Built by allowlist in
`activities/views/student-view.ts` (012 FR-032). With a hold open, `questions` and `answers` are `[]`.

## T14 — The `exam-generator` agent

**Decision**: a new L2 agent `exam-generator` v1, registered DISABLED, permission `ia.provas.gerar`,
task `exam-generation` (BASIC preferred, STANDARD max, same 009 policy as `work-generation`). Output
`GeneratedExamSchema`: 1–20 questions, each with type, statement, key, difficulty and 1–3 topic ids
from the request. `validate-generated-exam.ts` rejects anything outside the request (count, types,
topics, missing key or difficulty) and the result becomes one DRAFT exam (`materialize`). Release
gate: `pnpm --filter api eval:exams` with `test/eval/exam-generator.eval.ts`, golden cases in
`test/fixtures/exam-generator/`, evidence in `test/fixtures/evaluations/exam-generation/<key>.json`,
and catalog approvals for the models that pass.

**Rationale**: constitution XIII, XIX, XXIII; one task per generator so each has its own evidence.

**Alternatives**: reuse `work-generator` with an "exam" flag. Rejected: its output schema has no
per-question difficulty and allows questions without topics; its evidence would not cover exams.

## T15 — Coverage before applying

**Decision**: `POST /classes/:classId/activities/scope-check` accepts `{ kind: "EXAM", examId }` and
its response gains `coverage: { byTopic: { syllabusItemId, title, questions, points, outOfScope }[],
byDifficulty: { difficulty, questions, points }[] }` for EXAM. The pure `exams/coverage.ts` computes
it from the approved exam and the 012 taught scope.

**Rationale**: constitution XXIII ("antes de publicar uma prova…") with the existing pre-apply call.

## T16 — Boundary guards

**Decision**:
- `exams-boundary.spec.ts` (new): `exams`/`exam-ai` (API) and `features/exams` (web) import no
  work or exercise bank code except `works/{types,grading,grade}`; no code execution, model choice
  or float arithmetic; `exam-ai` chooses no model.
- `exam-sessions` joins the attendance-like guard: no AI, no help, no code execution, no float
  arithmetic; grades only through `activities/submission`.
- `activities-boundary.spec.ts` (amended): SC-012 now allows EXAM, and timer/countdown code lives
  only in `features/exam-attempt` and `components/ui/assessment`.
- `work-help-boundary.spec.ts` (amended): help refuses EXAM (`ai_help_allowance = 0` by CHECK).

## T17 — Limits and constants

**Decision**:
- Config: `RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE` (default 60, per teacher).
- Constants (not configurable): `EXAM_MAX_QUESTIONS = 20`, duration 1–120, inactivity 30–60
  (default 60), start window 0–60 (default 15), `EXAM_WARNINGS = 3`, `EXAM_END_GRACE_MS = 2000`,
  `OCCURRENCE_GROUP_WINDOW_MS = 2000`, web alerts at 600 s and 300 s, countdown at 10 s.
- The 015 events rate limit already bounds occurrences.

## T18 — The student's exam shell (web)

**Decision**: `features/exam-attempt` wraps the 015 controlled page:

- **Rules screen**: the rules list and "Iniciar prova"; the start sends `acceptRules: true` and
  enters fullscreen in the same click.
- **During the exam**: `ExamTimer` in the Exam Mode header (`role="timer"`, `aria-live` off);
  `TimeAlert` at 10 and 5 minutes (`role="status"`, polite, non-blocking); `FinalCountdown` in the
  last 10 s (`role="alert"`, once).
- **Warnings**: `WarningDialog` "Aviso n de 3" after each counted occurrence; it is a modal that
  needs a click (which also resets inactivity).
- **Hold, pause and end**: hold notice, pause notice (016) and "Tempo esgotado".
- **State**: in hooks and TanStack Query (polling 5 s for hold/return and pause). No Redux: there
  is no global client state beyond this page (constitution IX); the server is the authority.

## T19 — The hold under the XI exception (constitution v3.5.0)

**Decision**: the hold relies on the XI exception added by the amendment 3.4.0 → 3.5.0
(`constitution-amendment-3.5.0.md`). It meets every condition: the rule is shown and accepted
before the start (FR-028); the server counts registered facts with 3 warnings before the limit
(FR-016–FR-018); the hold never cancels, grades, penalizes or labels (FR-019, FR-032); the teacher
sees the facts and decides between annulling (zero) and returning (FR-021–FR-023); no result is
released before the decision (FR-024); the time running during the hold is announced (FR-011,
FR-028). The 015 rule "events never block" is kept for works.

**Rationale**: the first plan treated the hold as a reading of XI. `/speckit-analyze` (finding C1)
showed that the minutes lost while waiting are an automatic effect no decision undoes, so the
principle was amended instead of reinterpreted, keeping the user's rule.

**Alternatives**: stopping the time during the hold. Rejected: contradicts FR-011 and the user's
decision that the time keeps running.
