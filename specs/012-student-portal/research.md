# Research: 012 — Portal do Aluno

Decisions P1–P24. Each one records what was chosen, why, and what was rejected. Nothing here
needs a new dependency, infrastructure or constitution amendment.

## P1 — Two modules over one domain, the banks untouched

**Decision**: `apps/api/src/modules/activities` holds the class activity domain (snapshot,
lifecycle, taught scope, grading bridge, views, derived status) and the teacher's routes under
`/classes/:classId/activities`. `apps/api/src/modules/student-activities` holds the student's
routes under `/me/…` and imports only the pure parts of `activities` (views, status rules) and its
services. This repeats the 003 split between `enrollments` (teacher) and `my-classes` (student).
`activities` reads the bank rows (`works`, `work_questions`…, `exercises`, `exercise_alternatives`)
through Prisma with the session teacher's filter in its own `snapshot/` readers; it imports from
`modules/works` only the pure grading registry (`works/grading`) and `gradingStrategyOf`
(`works/types`), and nothing from `modules/exercises`.

**Rationale**: the spec says the banks don't change (010/011 stay closed); the works ↔ exercises
boundary (`works-boundary.spec.ts`) is about those two modules and stays intact; the 011 grading
rules were written for 012 to call ("012 DEVE usar estas regras").

**Alternatives**: a method on each bank service returning a snapshot (the banks would depend on an
activities type, or activities would import the exercise service — both cross the boundary);
one module for teacher and student (mixes two authorization contexts in one controller set).

## P2 — One unified snapshot of questions

**Decision**: applying copies the content into `class_activity_questions` (one table for both
sources: type, statement, instructions, starter code, language, value, grading strategy, expected
answer, rubric, expected solution, explanation, trick flag), `class_activity_alternatives`,
`class_activity_test_cases` and `class_activity_question_topics`. `source_work_id` /
`source_exercise_id` keep an informative link (RESTRICT, as every FK of the project).

Mapping: a work question is copied field by field, with its value and strategy. An exercise
becomes a question of the same type: MULTIPLE_CHOICE → `EXACT_MATCH` with its alternatives;
OPEN_ANSWER → `AI_REVIEW` with `expected_answer` and no rubric; CODE → `TEST_CASES` with no test
case (exercises have none), so 011's rule sends it to the teacher (`NO_TEST_CASES`). Its topic is
the exercise's `syllabus_item_id`.

**Rationale**: constitution XXIII (`Question ≠ ExamQuestion`; editing the bank never changes an
applied activity); one grading path and one student allowlist for both sources; answers can
reference an alternative by a real foreign key.

**Alternatives**: referencing bank rows (violates XXIII); a JSON blob per activity (no FK from an
answer to its alternative, no CHECKs, harder allowlist).

## P3 — Activity type and execution mode as enums with today's values only

**Decision**: `class_activity_type` = `EXERCISE | ASSIGNMENT` and `activity_execution_mode` =
`NORMAL`, both columns NOT NULL. `EXAM` and `CONTROLLED` are added later by
`ALTER TYPE … ADD VALUE` in the exams spec. Contracts mirror the same values; nothing accepts or
shows the others (SC-012). The status rules, views and routes switch on the type through a small
registry (`activity-types.ts`: label, whether the total grade comes from the source), so a new
type is a new entry.

**Rationale**: FR-003 asks the axis to exist and the future values not to; the domain-boundary
guard keeps forbidding `exam`/`prova` names until the exams phase.

**Alternatives**: declaring `EXAM`/`CONTROLLED` now and refusing them in code (a dead value that
the guard would have to allow, and that a query could select); a free text column (not an
explicit state).

## P4 — Stored lifecycle, derived publication phase

**Decision**: `class_activity_status` = `ACTIVE | CLOSED | CANCELLED` (ACTIVE → CLOSED; ACTIVE or
CLOSED → CANCELLED; anything else `409 INVALID_STATE_TRANSITION`), in
`activity.state-machine.ts`. "Agendada" / "publicada" is `publish_at > now` / `≤ now` of an ACTIVE
activity, evaluated with the server clock on every read; no job flips a column. `publish_at` can
change only while the activity is still scheduled.

**Rationale**: constitution III (the server clock decides) and XVI (explicit states) without a
scheduler or a boolean flag; a scheduled job would add a race between the flip and a read.

**Alternatives**: a `SCHEDULED → PUBLISHED` transition by an in-process timer (state could lag the
clock, and the student could see an activity before it flips or after).

## P5 — Taught scope: flagged, confirmed by the teacher

**Decision**: the taught scope of a class is the set of syllabus items linked
(`topic_syllabus_items`) to its plan's COMPLETED topics (004 US9). `POST
/classes/:classId/activities/scope-check` returns, for the chosen source, the topics of its
questions outside that scope (and a flag for a class with no plan). `POST …/activities` refuses
with `422 OUT_OF_SCOPE_NOT_ACKNOWLEDGED` when such topics exist and `acknowledgeOutOfScope` is not
`true`; the server recomputes the scope inside the creating transaction. The count of flagged
topics goes to `activity.published`. A work can be applied only to a class of its subject
(`422 SUBJECT_MISMATCH`); exercises have no subject, so only the scope flag applies to them.

**Rationale**: constitution XXIII: "Ao entrar numa atividade de turma, o modelo do banco passa
pela regra do escopo ensinado daquela turma", and the rule says items outside it "são
rejeitados ou sinalizados". Flagging keeps the decision with the teacher (XI) and works for
classes whose plan is not kept up to date. The spec was updated (FR-005a, Assumptions).

**Alternatives**: rejecting out-of-scope items (blocks real use when the teacher assigns ahead of
the plan); ignoring the rule (the spec's first draft; violates XXIII).

## P6 — Grades: exercise total distributed, work values copied

**Decision**: an ASSIGNMENT copies its work's total and the question values. An EXERCISE takes
`totalGrade` (0,01–100,00) in the request; the values come from `distributeGrade` of
`packages/contracts/src/works/grade.ts` in the order the teacher chose. Integer hundredths in
code, `numeric(5,2)` in the database, decimal strings on the wire (011 W3); a deferred trigger
checks that the values add up to the total, as in 011.

**Rationale**: Q3 = A; one grade arithmetic for the whole platform.

## P7 — One attempt per student and activity, ready for more

**Decision**: `activity_attempts` (activity, student, `number`, status `IN_PROGRESS | SUBMITTED`,
`started_at`, `last_saved_at`, `last_progress_audited_at`) with `UNIQUE (activity_id,
student_user_id, number)` and `CHECK (number = 1)` in this feature. Start is `INSERT … ON
CONFLICT DO NOTHING` followed by a read, so clicks and tabs converge on the same row and only the
inserting request audits `activity_attempt.started`.

**Rationale**: FR-016 and SC-006; the CHECK is the one line a multiple-attempts spec removes.

## P8 — Answers: one row per question, overwritten, with a revision

**Decision**: `activity_answers` with `UNIQUE (attempt_id, question_id)`, typed columns by kind
(`text`, `alternative_id`, `source`) and a CHECK that the kind matches the question type; the
alternative is a composite FK `(question_id, alternative_id)` to the snapshot, so an alternative
of another question is impossible. Each answer has `revision` (starts at 1).

Save protocol (`PUT /me/activities/:id/attempt/answers`, up to 10 answers per call): each item
carries `baseRevision` (the revision the tab last saw, `0` for none). Under the attempt's row
lock (`SELECT … FOR UPDATE`):
- content equal to the stored one → `UNCHANGED` (a retry of a save that already landed);
- `baseRevision` equal to the stored revision (or no row) → write, `revision + 1`, `SAVED`;
- otherwise → `CONFLICT` with the server's answer and revision; the tab shows "Esta resposta foi
  alterada em outra aba" and replaces its copy before the student edits again.
Items are independent; the response lists each result.

**Rationale**: FR-017 and the two-tabs edge case: idempotent retries without an idempotency key
per keystroke, and no silent overwrite between tabs.

**Alternatives**: last write wins with no revision (silent loss between tabs); an idempotency key
per save (more state for the same guarantee).

## P9 — Submission: its own immutable row

**Decision**: `activity_submissions` (`UNIQUE (attempt_id)`, `submitted_at` from the server,
`late`, `blank_count`, grade columns, `general_feedback`, `version`, `result_viewed_at`), with
gradings per question in `activity_question_gradings`. `POST …/attempt/submit` with the pending
answers runs in one transaction: lock the activity (`FOR SHARE`) and the attempt (`FOR UPDATE`);
if the attempt is already SUBMITTED, return the existing submission (200, no event); otherwise
check enrollment, phase, status and deadline (P10), write the answers with the same revision
rule as a save (P8: equal content is UNCHANGED, a stale `baseRevision` with other content aborts
the whole submit with `409 ANSWER_CHANGED_ELSEWHERE` and nothing is submitted, so the tab reloads
and the student reviews before submitting again), set the attempt SUBMITTED, insert the submission, grade
(P12) and audit. A save that arrives after it finds the attempt SUBMITTED → `409
ATTEMPT_ALREADY_SUBMITTED`. A trigger refuses any update of an answer whose attempt is SUBMITTED.

Accepting by the teacher (spec FR-006b): `POST …/attempts/:attemptId/accept-submission` runs
the same transaction for an IN_PROGRESS attempt whose student can no longer submit (deadline
passed under REJECT, or activity CLOSED), with the saved answers only, `late = true` and
`accepted_by_id` set; an attempt already submitted returns the existing submission (no event).

**Rationale**: FR-024/025 and SC-006; constitution XVII ("duplo clique … nunca pode gerar duas
submissões"); the teacher's close takes the activity `FOR UPDATE`, so close and submit serialize.

## P10 — Deadline and late policy

**Decision**: `late_policy` = `REJECT | ACCEPT_MARKED`, chosen at creation, changeable while the
activity is ACTIVE. With `now > deadline`: REJECT refuses save and submit (`409 DEADLINE_PASSED`);
ACCEPT_MARKED allows both until the activity is CLOSED, and the submission gets `late = true`.
CLOSED refuses both (`409 ACTIVITY_CLOSED`) whatever the policy. "Now" is the API clock (one
injectable `Clock`, as the workers' `runOnce(now)`), compared in the transaction; the browser
clock is never read. The client gets `deadline` and `serverNow` to show the warnings at 10 and
1 minute.

**Rationale**: Q2 = C; constitution III.

## P11 — Derived student status, one pure function

**Decision**: `deriveStudentStatus({ attempt, submission, gradingComplete, released, deadline,
closed, now })` in `activities/status/student-status.ts`:

| Condition (in order) | Status |
|---|---|
| submission, released and grading complete | `CORRIGIDO` (`GRADED` on the wire) |
| submission | `ENTREGUE` (`SUBMITTED`) |
| `now > deadline` or activity CLOSED | `ATRASADO` (`OVERDUE`) |
| attempt IN_PROGRESS | `EM_ANDAMENTO` (`IN_PROGRESS`) |
| otherwise | `PENDENTE` (`PENDING`) |

`late` is a separate flag on SUBMITTED/GRADED. `canAnswer` (start, save, submit allowed now) is
derived beside it and drives the action ("Iniciar", "Continuar", "Entregar com atraso", "Ver
entrega", "Ver resultado"). The teacher's roster uses `deriveRosterStatus` (NOT_STARTED,
IN_PROGRESS, SUBMITTED, SUBMITTED_LATE, MISSED). Wire values are English enums; Portuguese labels
live in the web.

**Rationale**: FR-014/015, SC-007; a closed activity without submission counts as overdue
(nothing more can be delivered).

## P12 — Grading at submission through the 011 registry

**Decision**: inside the submit transaction, each question goes through `gradeQuestion`
(`works/grading/registry.ts`) with the ports `UnavailableCodeRunner` (011) and a new
`UnavailableAiReview`. To keep the reason honest, 011's `AiReviewOutcome` gains `{ kind:
"UNAVAILABLE" }` and `PendingReason` gains `AI_REVIEW_UNAVAILABLE` (a small, tested change in
`works/grading/ai-review.ts` and the contract). Results are stored per question
(`activity_question_gradings`: status, nature, final/teacher hundredths, pending reason,
feedback, decided by/at). The submission's grade is `computeWorkGrade` (`grade_cents`,
`grade_partial`), recomputed on every teacher decision.

**Rationale**: FR-027/028; no AI and no Code Runner in 012, technical unavailability never a 0.

## P13 — Teacher grading

**Decision**: `PUT /classes/:classId/activities/:activityId/attempts/:attemptId/grades` with the
submission's `version`, decisions `{ questionId, grade, feedback? }` (only questions of the
activity; a RULE_RESULT may be overridden — 011 "the teacher's review prevails") and
`generalFeedback`. Each decision goes through `decideByTeacher`; out of range → `422
GRADE_OUT_OF_RANGE`; stale version → `409 SUBMISSION_VERSION_CONFLICT`. Allowed before and after release;
after release it shows to the student at once and `activity_submission.graded` carries
`afterRelease: true`. Feedback ≤ 5 000 characters per question and general.

## P14 — Release and visibility

**Decision**: `POST …/activities/:activityId/release` sets `result_released_at` /
`result_released_by` (idempotent: already released → 200, no event; CANCELLED → 409). The
student sees a result only when `released && grading complete` — the API builds the `result`
block only then and otherwise sends `result: null` and no grade fields (FR-029, SC-004). The
answer key is never part of the student view, before or after (FR-030).

## P15 — Student views by allowlist

**Decision**: `activities/views/student-view.ts` builds every student shape by copying an
allowlist from the snapshot (position, type, statement, value, instructions, starter code,
language name, PUBLIC test cases, alternative ids and texts in position order) — the 011 FR-033
list applied to the snapshot — never by deleting fields from the teacher view. A security suite
plants `MARCADOR-RESPOSTA-012`, `-RUBRICA-`, `-SOLUCAO-`, `-PRIVADO-`, `-EXPLICACAO-012` and the
correct alternative id in every type and scans every student response, before and after release
(SC-003).

## P16 — Student lists computed in memory, bounded

**Decision**: the student's activities are loaded in two queries (activities of classes with an
ACTIVE enrollment, published and not cancelled, with class, subject and teacher names; the
student's attempts, submissions and gradings for them), then status is derived, filtered, sorted
(deadline asc, then id) and paged with an opaque cursor (`deadline|id`, 20 per page, ≤ 50). A
student's activity count is bounded by enrollments (tens of classes × tens of activities).

**Rationale**: the status depends on the clock and on three tables; one SQL `CASE` copy of the
rule would duplicate P11. `012-performance.spec.ts` checks < 1 s for 10 classes × 50 activities.

**Alternatives**: a materialized status column (stale by the clock); a SQL view (rule in two
places).

## P17 — Dashboard

**Decision**: `GET /me/dashboard` returns the student's first name, the counts by status
(`completed` = SUBMITTED + GRADED), the next activities (PENDING and IN_PROGRESS by deadline, up to
5) and the overdue ones that still accept delivery, each with `urgent` (deadline within 48 h) and
the action. Same loader as P16.

## P18 — Authorization, 404 and denied-access audit

**Decision**: every student query starts from the session user and joins `enrollments (status =
ACTIVE)` → `class_activities (class_id, status ≠ CANCELLED, publish_at ≤ now)` → the student's own
attempt; ids from the path only select within that set. When the id is not found in context, a
second unscoped lookup decides whether it exists; if it does, `student_access.denied` is written
(target type, id, reason code) outside any domain transaction, and the answer is the same 404.
Teacher routes use `ClassContextPolicy` (003) for the class, then the activity by
`(id, class_id)`, then the attempt by `(id, activity_id)`. Bodies are strict (`400` on any unknown
field: `studentUserId`, `status`, `submittedAt`, `late`, grade fields in student bodies).

## P19 — Audit

**Decision**: the events of `contracts/audit-events.md`, in the same transaction as the change.
Reading of constitution VI for NORMAL mode: "envio de respostas" is the submission
(`activity_submission.created`), always audited; the answers themselves are facts with their
`saved_at`, and progress is audited coarsely. Disconnection, reconnection, focus and clipboard
events belong to the CONTROLLED mode of the exams spec — recording them here would be the
disproportionate monitoring that constitution XX rules out.
Progress: a save writes `activity_attempt.progress_saved` only when
`last_progress_audited_at` is null or ≥ 15 minutes old (updated in the same transaction), with the
answered count. The first student read of a released result sets `result_viewed_at` and writes
`activity_result.viewed` once. Rejected saves and submissions write
`activity_submission.rejected` with the error code.

## P20 — Rate limits

**Decision**: the existing `RateLimitService.hit` with three new config variables:
`RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE` (default 60, per student), `RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR`
(20, per student) and `RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR` (300, per teacher: apply, edit,
close, cancel, grade, release). Over the limit → `429 RATE_LIMITED`; the web keeps the content and
retries after the wait.

## P21 — Web structure and the answering screen

**Decision**: `apps/web/features/activities` (teacher) and `apps/web/features/student-activities`
(student), with the usual `api/components/hooks/schemas`; no import from `features/works` or
`features/exercises` (the bank lists are read through their contracts in `activities/api`).
The answering screen builds the NORMAL-mode subset of the 005 Exam Mode contract
(`apps/web/design-system/exam-mode.md`): `ExamProgress`, `QuestionNavigator`, `QuestionHeader`,
`QuestionStatus`, `QuestionStatement`, `AnswerArea` (`MultipleChoiceAnswer`, `EssayAnswer`,
`CodeAnswer` without execution regions), `CodeEditor`, `SaveStatus`, `AttemptStatus` and the
footer with "Entregar atividade" in an `AlertDialog`. They go into
`apps/web/components/ui/assessment/` with registry entries, showcases and `components.md`
sections (CLAUDE.md rule for new foundational components). `ExamTimer`, `ReviewFlag`,
`ExamAlert`/`FocusViolationWarning` and the "bloqueada"/"invalidada" states are not built
(exams only).

`CodeEditor` is a `Textarea` with a line-number gutter, Tab indent and Esc-then-Tab exit, in
`font-mono` inside `components/ui` — no editor library (constitution IX; the contract left the
library to the programming exercises spec, and no execution exists yet).

## P22 — Autosave and offline in the web

**Decision**: `useAttemptAnswers` keeps the answers in component state, marks dirty questions and
saves them after 1,5 s without typing, on question change and on `visibilitychange` to hidden;
`SaveStatus` follows the exam-mode table. Unsent answers also go to `localStorage` under
`devtrack:respostas:<userId>:<activityId>` (the activity's single attempt; the student view carries
no attempt id) (wrapped in try/catch) and are replayed with their
`baseRevision` when the page loads or `online` fires; the key is removed after a successful
submit and every `devtrack:respostas:` key is removed on logout. The server stays the authority:
a CONFLICT result replaces the local copy. No Redux (no global client state).

**Rationale**: FR-018/019, SC-005, constitution III.

## P23 — Start page and navigation

**Decision**: `startPathFor` sends a session with `atividades.proprias.visualizar` and without
`disciplinas.visualizar` to `/painel`. The student menu becomes "Painel", "Minhas atividades",
"Histórico", "Minhas turmas", "Meu perfil". Accepted invitations still land on
`/minhas-turmas?bem-vindo=1` (003). Teacher pages hang under the class (`/turmas/[id]/atividades`),
with a link from the class page.

## P24 — Domain-boundary guard and traceability

**Decision**: `domain-boundary.spec.ts` drops `nota` and `submiss` from `ACADEMIC_PREFIXES`
(student grades and submissions arrive with 012; `notas.lancar` moves to the allowed examples)
and keeps `prova`, `exam`, `tentativa`, `homework`, `lesson`, `course`, `curricul`, `periodo`, `aula`.
Its model list gains the 012 tables. `traceability.spec.ts` adds 012 to `SPECS`; tests carry
`012/USn-k`, `012/FR-…`, `012/SC-…`. A new `apps/api/test/activities-boundary.spec.ts` forbids in
`activities`/`student-activities`: imports of `modules/exercises`, `modules/ai`, `modules/work-ai`
and `modules/exercise-ai`; code execution (`child_process`, `vm`, `eval`, `new Function`,
`worker_threads`); float arithmetic (`parseFloat`, `Number(`, `.toNumber()`); and any student
response built outside `views/student-view.ts`.

## Implementation notes (T070, 2026-10-03)

Decisions taken while implementing, within the spec and this research:

- **Acceptance of an attempt with nothing saved** (FR-006b, P9): the route always names an existing
  attempt, so "sem tentativa → 409 `NOT_STARTED`" applies to an attempt with no saved answer
  (FR-006b accepts "respostas salvas"). The web offers "Aceitar como entrega" only to a student
  whose roster status is MISSED and whose attempt has saved answers.
- **Release and the edit version** (P14): releasing sets `result_released_at`/`_by` but not the
  activity's `version`, so an edit form open in another tab does not conflict with it.
- **Grading no-op** (P13): a `PUT …/grades` whose decisions and general feedback equal what is
  stored writes nothing (no new `version`, no event). Feedback omitted keeps the stored one; an
  empty one clears it. In the web an empty grade field keeps the question as it is (a decision is
  never undone).
- **First view of a result** (P19): set by a conditional `UPDATE … WHERE result_viewed_at IS NULL
  RETURNING id`, so concurrent reads audit once; only `GET /me/activities/:id` (and the start or
  submit that answers the same view) counts, never the list or the dashboard.
- **Result questions** come in the snapshot's position order.
- **Responsiveness** (FR-034, T062) is checked in Playwright at 360 px (no horizontal scroll on
  "Painel", the activity, the answering screen and "Histórico", the menu reachable by Tab): jsdom
  has no layout.
- **Spec review**: the Assumptions hold as implemented (one attempt and one submission, no answer
  key to the student after the release, no AI and no Code Runner, no file upload, deadline by the
  server clock shown in the browser's time zone, "urgente" within 48 h and at most 5 "próximas",
  `/painel` as the student's start page, taught scope flagged and confirmed, rate limits of P20,
  no e-mail). The banks 010/011 are unchanged apart from the planned `works/grading` change (T005).
