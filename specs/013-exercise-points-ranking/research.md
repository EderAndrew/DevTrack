# Research: 013 — Pontuação e Ranking dos Exercícios

Decisions K1–K18. The 012 decisions (P1–P24) still hold unless a K decision below replaces them
for EXERCISE activities; ASSIGNMENT activities don't change.

## K1 — Same tables, type-driven columns

**Decision**: an EXERCISE activity stays a row of `class_activities` with its snapshot in
`class_activity_questions`/`_alternatives`/`_question_topics` (012 P2). `total_grade`, `deadline`
and `late_policy` become nullable, with a CHECK by type: required for ASSIGNMENT, null for
EXERCISE. The question's `value` becomes nullable the same way (null for EXERCISE), and the
EXERCISE question gains `difficulty` (`exercise_difficulty`, 010) and `points` (int). The deferred
trigger "values add up to `total_grade`" runs only for ASSIGNMENT. The type registry
(`activity-types.ts`, P3) gains what differs: `scoring: "GRADE" | "POINTS"`, `hasDeadline`,
`attempts: "SINGLE" | "PRACTICE"`.

**Rationale**: the snapshot, the taught-scope check (FR-005a), autosave, the offline buffer, the
student loader and the isolation rules are the same; a second table family would duplicate them.
The registry keeps "if EXERCISE" out of the services (P3).

**Alternatives**: separate `exercise_activities` tables (duplicates every 012 rule and test);
keeping the grade columns with a dummy value (a grade that means nothing, against the spec).

## K2 — Points are fixed by difficulty, copied at application

**Decision**: `EXERCISE_POINTS = { BASIC: 15, INTERMEDIATE: 30, ADVANCED: 60 }` in
`packages/contracts/src/activities/points.ts` (shared by the API and the web preview). The
snapshot copies the exercise's `difficulty` and `points`; a CHECK ties the pair (`BASIC ↔ 15`,
`INTERMEDIATE ↔ 30`, `ADVANCED ↔ 60`). The activity's possible points are the sum of its
questions' points (derived, not stored). Points are integers end to end.

**Rationale**: FR-002/003; the snapshot rule (constitution XXIII, 012 FR-002) — changing the
exercise's difficulty in the bank never changes an applied activity. Integers keep the boundary
guard's "no float arithmetic" true without the grade helpers.

**Alternatives**: a points table (data nobody edits; the spec fixes the values); computing from
the bank on read (breaks the snapshot).

## K3 — Attempts: numbered, one open at a time

**Decision**: drop `CHECK (number = 1)` (012 P7) and replace it with:
- `UNIQUE (activity_id, student_user_id) WHERE status = 'IN_PROGRESS'` (one open attempt);
- the existing `UNIQUE (activity_id, student_user_id, number)`;
- a trigger: `number = 1` when the activity is ASSIGNMENT, and for EXERCISE a new attempt `n > 1`
  only if attempt `n − 1` of the same student is SUBMITTED.
For EXERCISE the attempt's SUBMITTED status reads "concluded" (wire: `COMPLETED`); a new
`completed_at` column (server clock) is set when it concludes, NULL for ASSIGNMENT attempts,
whose time stays in `activity_submissions` (CHECK).

**Rationale**: FR-005, FR-008. The **first conclusion is attempt number 1 concluded**: since a new
attempt exists only after the previous one is concluded and two tabs share the one open attempt,
"first conclusion" is a fact of the data, not a race.

**Alternatives**: a `first_completion` flag (redundant with `number = 1`); unlimited open attempts
(two tabs could race to "first").

## K4 — Retry is its own idempotent operation

**Decision**: `POST /me/activities/:id/attempts` with `{ afterNumber }` creates attempt
`afterNumber + 1` only when attempt `afterNumber` is the latest and concluded; if attempt
`afterNumber + 1` already exists it is returned (200, no event). Starting the first attempt keeps
012's `POST /me/activities/:id/attempt` (idempotent `ON CONFLICT`).

**Rationale**: a double click on "Refazer" or a retried request after a dropped connection must
not create two practice attempts (constitution XVII); naming the attempt it follows makes the
repeat detectable without an idempotency-key table.

## K5 — Conclusion replaces submission for EXERCISE

**Decision**: `POST /me/activities/:id/attempts/:number/complete` with the pending answers, one
transaction, under the 012 locks (activity `FOR SHARE`, attempt `FOR UPDATE`): write the answers
with the revision rule (P8; a stale revision aborts with `409 ANSWER_CHANGED_ELSEWHERE`), set the
attempt SUBMITTED with `completed_at`, compute the results (K6/K7), audit. An attempt already
concluded returns the same result (200, no event). No `activity_submissions` row and no
`activity_question_gradings` rows are written for EXERCISE (CHECK/trigger: those tables accept
only ASSIGNMENT attempts). 012's `POST …/attempt/submit` answers `409 INVALID_STATE_TRANSITION` for an
EXERCISE activity.

**Rationale**: FR-007; a submission row is grade-centric (`grade`, `late`, release); conclusion
has none of it. Same transaction shape as P9, so the concurrency tests carry over.

## K6 — Per-question results in one table, scoring guarded by a partial UNIQUE

**Decision**: `exercise_question_results` — one row per `(attempt_id, question_id)` of a concluded
EXERCISE attempt, with `class_id`, `student_user_id`, `source_exercise_id` (denormalized, composite
FKs to the attempt and the question), `scoring` (bool), `result` (`CORRECT` | `WRONG` |
`PENDING_TEACHER` | `UNSCORED`), `points` (int), `comment`, `nature`, `decided_by_id`,
`decided_at`, `version`. A partial `UNIQUE (class_id, student_user_id, source_exercise_id) WHERE
scoring` makes a bank exercise score at most once per student and class (FR-010a).

At conclusion, per question of the attempt:
- attempt number 1: insert with `scoring = true` (`ON CONFLICT … WHERE scoring DO NOTHING`); if
  the slot was taken by another activity of the class, insert with `scoring = false` — shown as
  "já pontuado";
- attempt number > 1: `scoring = false`.

Result by type (FR-009, FR-010):

| Question | Answer | Scoring row | Practice / already-scored row |
|---|---|---|---|
| Multiple choice | correct alternative | `CORRECT`, points = value | `CORRECT`, 0 |
| Multiple choice | other or blank | `WRONG`, 0 | `WRONG`, 0 |
| Open answer, code | blank (012 FR-023 rule) | `WRONG`, 0 | `WRONG`, 0 |
| Open answer, code | answered | `PENDING_TEACHER`, 0 | `UNSCORED`, 0 ("Compare com o gabarito") |

CHECKs: `points = 0` unless `scoring ∧ result = CORRECT`, then `points` = the question's points
(trigger); `PENDING_TEACHER` only with `scoring`; `UNSCORED` only without; `nature` RULE_RESULT for
multiple choice and blanks, HUMAN_DECISION after a teacher mark, null while pending.

**Rationale**: one place answers "what did the student get on this exercise", the ranking is a
SUM over it, and the "once per class" rule is a database guarantee under concurrency (two
activities with the same exercise concluded at once). Multiple choice reuses 011 `EXACT_MATCH`
through the grading registry only for the right/wrong comparison — no grade.

**Alternatives**: a separate `point_awards` table (two rows to keep in step); deriving results on
read (the teacher's mark needs a row anyway, and the once-per-class rule needs a constraint).

## K7 — Cancellation and the slot

**Decision**: a CANCELLED activity's results stay, `scoring` included; the ranking sums only
results of non-cancelled activities, and the slot is not freed (spec FR-010a: the points don't
migrate). CLOSED activities keep counting; pending marks stay markable. `PUT …/marks` on a CANCELLED activity → `409 INVALID_STATE_TRANSITION`; on CLOSED
it works.

## K8 — Teacher marks right or wrong

**Decision**: `PUT /classes/:classId/activities/:activityId/attempts/:attemptId/marks` with
`{ marks: { questionId, result: "CORRECT" | "WRONG", comment? }[] }` (1–10, distinct). Only rows
with `scoring = true` of open answer or code are markable (`422 NOT_MARKABLE` otherwise, which
covers multiple choice, blanks, practice and already-scored rows). Marking sets `points`, `nature
= HUMAN_DECISION`, `decided_by/at`, `version + 1`; a changed mark is allowed any time (FR-017).
A mark equal to the stored one is a no-op (no version, no event). Optimistic `version` per row is
not needed: the body states the absolute result, so two tabs converge on the last decision, and
each change is audited with from/to.

**Rationale**: FR-016/017; no grade, no release (`notas.*` untouched).

## K9 — Student status and counters for EXERCISE

**Decision**: `deriveStudentStatus` gains the EXERCISE branch: any concluded attempt →
`COMPLETED`; an open attempt → `IN_PROGRESS`; else `PENDING`; never `OVERDUE`, `SUBMITTED` or
`GRADED`. `awaitingCorrection` = a `PENDING_TEACHER` row exists for the student's attempt 1.
`canAnswer` for EXERCISE: enrollment ACTIVE, class ACTIVE, activity ACTIVE and published (no
deadline). Counters: `completed` counts COMPLETED too. The dashboard's "next" list puts EXERCISE
activities (no deadline) after the ones with a deadline, newest publication first (FR-015).
Roster: `NOT_STARTED`, `IN_PROGRESS`, `COMPLETED` + `pendingMarks`.

## K10 — Answer key after conclusion, by allowlist

**Decision**: `student-view.ts` gets `toStudentExerciseResult(question, result, answer)`, copying
only: the student's answer, `result`, `points`, `alreadyScored`, the correct alternative id,
`expectedAnswer` or `expectedSolution`, `explanation`, the teacher's `comment`. Built only for a
concluded attempt of the session student. Before conclusion the 012 allowlist (P15) applies
unchanged. ASSIGNMENT views don't change (FR-030 of 012 still holds for works).

**Rationale**: FR-011/012, SC-004; the boundary guard keeps every student shape in
`student-view.ts`.

## K11 — Ranking computed on read

**Decision**: a pure `rankClass(rows)` in `modules/ranking/rank.ts`: input `{ name, points,
isViewer }[]`; order by points desc, then name with `localeCompare(…, "pt-BR", { sensitivity:
"base" })`; position = standard competition ranking (1, 2, 2, 4). The service reads the ACTIVE
enrollments of the class with the user's `name` (the same name the 012 roster shows) and
`SUM(points)` of `exercise_question_results` joined to non-cancelled activities of the class, in
one query. Students with no results get 0.

**Rationale**: FR-018–FR-023, SC-005 — derived on every read, like the statuses (no cache, no
job); a class is at most a few hundred students.

**Alternatives**: a stored total updated on each result (a second source of truth to keep in
step under marks and cancellations); `RANK()` in SQL (the alphabetical tie order in pt-BR is
simpler and testable in the pure function).

## K12 — What a ranking row carries

**Decision**: `{ position, name, points, isViewer }`. `isViewer` is about the requester (the
highlighted row, FR-021), not about the classmate; no user id, e-mail, enrollment or activity
data (FR-020, SC-007). The teacher's ranking uses the same shape, with `isViewer` always false.

## K13 — Routes and module

**Decision**: a new API module `modules/ranking` with `GET /me/classes/:classId/ranking`
(student, ACTIVE enrollment → else 404) and `GET /classes/:classId/ranking` (teacher,
`ClassContextPolicy`). `GET /me/dashboard` gains `rankings: { class, top: RankingRow[] (≤ 5) }[]`,
one per class with ACTIVE enrollment, built by the same service. The ranking module reads
`exercise_question_results`, enrollments and users; it imports neither banks nor AI.

## K14 — Permissions

**Decision**: new permissions seeded by the migration: `exercicios.corrigir` (TEACHER, marks),
`ranking.visualizar` (TEACHER, ranking of own classes), `ranking.turma.visualizar` (STUDENT,
ranking of a class with ACTIVE enrollment and the dashboard block — without it, `rankings: []`).
EXERCISE activities never use `notas.lancar`, `notas.liberar` or `notas.proprias.visualizar`:
`PUT …/grades`, `POST …/accept-submission` and `POST …/release` answer `409
INVALID_STATE_TRANSITION` for an EXERCISE activity.

## K15 — Audit

**Decision**: new types `exercise_attempt.completed` (`activityId`, `attemptNumber`, `first`,
`questionCount`, `blankCount`, `correctCount`, `pendingCount`, `alreadyScoredCount`, `points`)
and `exercise_result.marked` (`activityId`, `attemptId`, `questionId`, `from`, `to`, `points`,
`hasComment`), one per changed mark. `activity_attempt.started` gains `attemptNumber`;
`activity_submission.rejected` gains the operations `RETRY` and `COMPLETE`; `activity.published`
for EXERCISE carries `possiblePoints` instead of `totalCents`/`latePolicy`. Viewing the ranking
is not audited. Metadata never carries answer, answer key or comment text.

## K16 — Rate limits

**Decision**: `RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR` (default 60, per student: start, retry and
complete of EXERCISE activities), apart from 012's submits limit (20/h, kept for ASSIGNMENT).
Saves keep `RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE`; marks count in
`RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR`. Ranking reads are not limited beyond the global
limits.

**Rationale**: practice invites many attempts; 20/h would block a student who redoes a short set.

## K17 — Migration of existing EXERCISE activities (Q3 = A)

**Decision**: the 012 data is not in real use. The migration, inside one transaction with the
012 immutability triggers disabled for its own statements (`ALTER TABLE … DISABLE TRIGGER`, then
`ENABLE`): deletes the `activity_question_gradings`, `activity_submissions`, `activity_answers` and
`activity_attempts` of EXERCISE activities; sets their `total_grade`, `deadline`, `late_policy`
and `result_released_*` to NULL and their questions' `value` to NULL; fills `difficulty` and
`points` from the source exercise. Audit rows are append-only and stay as history. A test seeds a
012-shaped EXERCISE activity with a submission and checks the result.

**Rationale**: spec Assumptions (Q3 = A); no student loses real work.

## K18 — Web

**Decision**: the 012 features stay (`features/activities`, `features/student-activities`);
the ranking gets `features/ranking` (API, hooks, `RankingTable`, `RankingCard`). Pages:
- teacher "Nova atividade": Exercício hides nota total, prazo and atraso and shows "Vale 30
  pontos" per exercise and "Total: 105 pontos";
- teacher activity detail: EXERCISE without "Liberar resultado" and late policy; roster with
  "Concluiu", "Pontos aguardando correção: N";
- teacher attempt page: EXERCISE shows "Certo" / "Errado" (radio group) + comment per open/code
  question of attempt 1, "Salvar correção";
- student activity: EXERCISE without deadline or grade; "Concluir exercícios" with the
  `AlertDialog` ("N exercícios em branco valem 0 ponto nesta conclusão"); the result screen per
  question (Certo / Errado / Aguardando correção / Já pontuado / Compare com o gabarito, by text
  and icon), the answer key and explanation, "Você ganhou N pontos" (first conclusion) or "Refazer
  não vale pontos", and "Refazer";
- student dashboard: one `RankingCard` per class (top 5) with "Ver ranking completo";
- new pages `/minhas-turmas/[id]/ranking` (student) and `/turmas/[id]/ranking` (teacher); the
  viewer's row says "Você" besides the highlight.
Labels: "pontos" never "nota"; points as integers ("30 pontos", "1 ponto").
