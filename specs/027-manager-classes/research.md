# Research: Turmas do gestor e disciplinas da turma (027)

Decisions carry the prefix **Q**, unused by the earlier features. Constitution v4.1.0.

## Q1 — Names: the new table is the turma; `classes` stays the disciplina da turma

- **Decision**: a new table `cohorts` (Prisma `Cohort`) holds the **turma** (the MANAGER's group of students). The
  existing table `classes` (Prisma `SchoolClass`, `classId` everywhere) becomes the **disciplina da turma**: it gains
  `cohort_id NOT NULL` and keeps its id, teacher, subject, calendar dates and status. In code and contracts: turma =
  `cohort`, disciplina da turma = `class` (`classId`). The UI texts stay "Turma" and "Disciplina da turma".
- **Rationale**: every pedagogical table (activities, meetings, plan, attendances, exercise results, alerts, nudges…)
  already points to `classes.id`, and the 026 card already treats `classId` as "a matéria". Keeping that id as the
  offering leaves 004–026 untouched in their foreign keys, routes (`/classes/:id/...`) and contracts; only the
  turma-level concerns (data, invitations, enrollments) move.
- **Alternatives considered**: renaming `classes` to `class_subjects` and creating a new `classes` for the turma —
  rejected: touches every module, route, contract, test and the mobile app for no behavior gain. Keeping enrollments
  per offering and fanning them out from the turma (a copy per disciplina) — rejected: two sources of truth for "who
  is in the turma", against constitution V.

## Q2 — The turma's data leaves `classes`

- **Decision**: `name`, `code`, `academic_year`, `period`, `description` and `search_key` move to `cohorts` and are
  dropped from `classes`. Every read of a class's name goes through its cohort (a Prisma `include` or a SQL join); a
  pure `classLabel(subjectName, cohortName)` builds "<disciplina> · <turma>" (or "<turma>" without subject, FR-030).
- **Rationale**: one source of truth (FR-019: a disciplina da turma never changes turma). About 8 API files read the
  class name today (views, mail, exam alerts, mobile list); they are enumerated in the tasks.
- **Alternatives considered**: keeping a denormalized copy synced by trigger — rejected (drift, triggers for a
  display string).

## Q3 — Enrollments and invitations belong to the cohort

- **Decision**: `enrollments.class_id` and `class_invitations.class_id` are replaced by `cohort_id`. The partial
  UNIQUE indexes become `(cohort_id, student_user_id) WHERE status = 'ACTIVE'` and `(cohort_id, email) WHERE status =
  'PENDING'`. A SQL view `class_enrollments (class_id, enrollment_id, student_user_id, status, enrolled_at)` joins
  `classes` and `enrollments` by cohort; the raw SQL of the pedagogical modules (about 15 sites:
  `activities/roster`, `group/settle-group`, `activity-query`, `attendance`, `pauses`, `exam-monitor`, `ranking`,
  `student-activity-loader`, `group-work`, `attempts`, `group-eligibility`) switch `FROM enrollments e WHERE
  e.class_id = …` to `FROM class_enrollments e WHERE e.class_id = …`; the Prisma relation filters
  (`schoolClass.enrollments.some`, about 5 sites) become `schoolClass.cohort.enrollments.some`.
- **Rationale**: FR-013 (one enrollment, every disciplina of the turma, current and future) holds by construction. The
  view keeps each pedagogical query a one-word change and the same plan (indexed join on `classes.cohort_id`).
- **Guard**: a new `apps/api/test/cohorts-boundary.spec.ts` fails when `enrollments` is joined by `class_id`
  anywhere, and when a module other than `cohorts`, `class-invitations` and `enrollments` writes enrollments or
  invitations.
- **Alternatives considered**: a Prisma `view` model — rejected for now (preview feature); raw SQL and relation
  filters cover every reader.

## Q4 — Effective status (FR-023) is derived in one place

- **Decision**: `effectiveStatus(cohortStatus, classStatus)` (pure, `classes/effective-status.ts`) returns the most
  restrictive (ARCHIVED > INACTIVE > ACTIVE). `ClassContextPolicy.findInContext` (the teacher's single entry to a
  class, used by 20+ services) loads the class with its cohort and returns it with `status` replaced by the effective
  status (and `ownStatus` kept for the status route), so the existing checks (`status === "ARCHIVED"` → `409
  PLAN_ARCHIVED`, activity creation, attendance, exams) work unchanged. Raw SQL that filters by class status (student
  attempts, exam-alert worker recipients, group eligibility) uses a SQL function `class_effective_status(class_id)` or
  the join, and the Prisma readers that bypass the policy (activities, plannable class, student loader, exam nudges,
  alert preferences) load the cohort and call `effectiveStatus()` — all enumerated in T012 and guarded by T006.
- **Rationale**: derived on every read (FR-023), never stored; no cascade writes when the MANAGER changes the cohort.
- **Alternatives considered**: cascading the cohort status into each class — rejected (stored derivation, and the
  teacher's own archive would be lost when the cohort is reactivated).

## Q5 — The teacher closes/archives a disciplina only after its calendar (FR-022)

- **Decision**: `POST /classes/:id/status` stays (teacher, `disciplinas_turma.alterar_situacao`); it is accepted only
  when `planningToday(clock) > endsOn` (004's `PLANNING_TIME_ZONE`, America/Sao_Paulo) — a pure
  `canCloseClass(class, today)` — else `409 CLASS_CALENDAR_NOT_ENDED` (also with no calendar). Transitions ACTIVE ⇄
  INACTIVE → ARCHIVED (the 003 state machine), on the class's **own** status; the cohort must not be ARCHIVED (`409
  INVALID_STATE_TRANSITION`). The class view returns `canChangeStatus` so the web shows the options only then.
- **Rationale**: the injected server clock decides (constitution III); the date rule is the user's (clarify Q2).

## Q6 — Cohort identity and the academic year

- **Decision**: `UNIQUE (academic_year, upper(code))` on `cohorts` (FR-002). "Encerrar" = INACTIVE (FR-004): the
  enrollment stays ACTIVE, so the student keeps reading; the student routes treat a class whose effective status is
  INACTIVE or ARCHIVED as read-only (no new attempt, save or submit — 012 already refuses writes on a closed/archived
  class; the tasks verify each write path against the effective status). "Minhas turmas" (`GET /me/classes`) returns
  cohorts grouped by `academicYear` desc, each with its status and classes; the 026 card offers only classes whose
  effective status is ACTIVE (spec Assumptions).
- **Rationale**: the user's rule (clarify Q3): "ADS 3NA 2026 ≠ ADS 3NA 2027"; in 2027 the student still opens 2026.

## Q7 — Direct enrollment of an existing student (FR-034, constitution 4.1.0)

- **Decision**: two MANAGER routes on the cohort: `POST /cohorts/:id/student-lookup { email }` → `{ found: true,
  studentUserId, name, alreadyEnrolled } | { found: false }` and `POST /cohorts/:id/enrollments { email }` (the server
  resolves the e-mail again; never trusts an id from the body). `found` depends only on the account (ACTIVE, role
  STUDENT, e-mail verified); otherwise `found: false` (no reason given: sem conta, não aluno, não verificado,
  desativada look the same) and `422 STUDENT_NOT_ELIGIBLE` on the enroll route. When found, `alreadyEnrolled` says
  whether an ACTIVE enrollment in the cohort exists; the enroll route answers `409 ALREADY_ENROLLED` in that case. The enrollment
  is created under the cohort's row lock with the partial UNIQUE as backstop (`ON CONFLICT` → `409`), a pending
  invitation for the same e-mail in the cohort is cancelled (`cancel_reason = 'ENROLLED_DIRECTLY'`) in the same
  transaction, and a `CLASS_ENROLLMENT_NOTICE` mail is scheduled through the 017 outbox (no token; link to `/entrar`).
  E-mails go in the body (POST), never in a URL or log. Lookups are limited to 30 per MANAGER per minute (`429`,
  audited), reusing `invitation-rate-limit.ts`'s advisory-lock counter.
- **Rationale**: constitution XXIV/XXV 4.1.0; the lookup is a privileged disclosure, so it is permission-gated,
  rate-limited and audited, and it answers only the name.
- **Alternatives considered**: lookup by partial name/e-mail (clarify Q4 option C) — rejected by the user.

## Q8 — Permissions

- **Decision**: the 003 keys keep their names and move from TEACHER to **MANAGER and ADMIN** (ADMIN accumulates the
  MANAGER function, as for `professores.*`): `turmas.criar`, `turmas.visualizar`, `turmas.editar`,
  `turmas.alterar_situacao`, `turmas.convidar_aluno`, `turmas.reenviar_convite`, `turmas.cancelar_convite`,
  `turmas.visualizar_alunos`, `turmas.remover_aluno`, plus the new `turmas.incluir_aluno` (FR-034). New TEACHER keys:
  `turmas.buscar` (FR-016), `disciplinas_turma.visualizar`, `disciplinas_turma.criar`, `disciplinas_turma.editar`
  (calendar dates), `disciplinas_turma.alterar_situacao`, `disciplinas_turma.visualizar_alunos`. Descriptions are
  rewritten. STUDENT keeps `turmas.proprias.listar`. All in the main 027 migration.
- **Rationale**: explicit capabilities (II); no role-name checks.

## Q9 — The transition (FR-027–FR-030) is the migration itself

- **Decision**: the enum values in a first migration (`ALTER TYPE … ADD VALUE` cannot be used in the transaction
  that adds it); the transition in a second one, in one transaction, before the new constraints:
  1. create `cohorts`; insert one cohort per group of `classes` with the same `academic_year` and `upper(code)`; name,
     code, period and description from the oldest class (`created_at`, then `id`); status the most open (ACTIVE >
     INACTIVE > ARCHIVED); `created_by_id` = the oldest class's teacher; `search_key` recomputed;
  2. `classes.cohort_id` set; the class keeps its own status (FR-027);
  3. enrollments: `cohort_id` from their class; for a student with more than one ACTIVE enrollment in the same new
     cohort, the oldest stays ACTIVE and the others become `REMOVED` with `removed_at` = migration time,
     `removed_by_id` NULL and a new `removal_reason = 'MERGED'` (the column is NULL for the 003 removals) — no row is
     deleted;
  4. invitations: `cohort_id` from their class; two PENDING for the same cohort and e-mail → the one with the latest
     `expires_at` stays, the other `CANCELLED` with `cancel_reason = 'MERGED'`;
  5. drop the moved columns, the old indexes (`classes_teacher_code_key`, the class-keyed partial UNIQUEs) and create
     the new ones; partial UNIQUE `(cohort_id, subject_id) WHERE subject_id IS NOT NULL` on `classes` (FR-018);
  6. permissions moved (Q8); one `cohort_transition.applied` audit row (SYSTEM) with the counts (cohorts, classes,
     merged cohorts, merged enrollments, merged invitations) and the permission changes (`permissionsMoved`,
     `permissionsAdded`: keys and roles, constitution XXV), plus one SYSTEM `enrollment.removed` /
     `class_invitation.cancelled` per merged row (constitution XXIV).
  A verification test (`apps/api/test/integration/027-transition.spec.ts`) builds a pre-027 database state in a
  temporary database (the test database's name + `_transition_027`, created and dropped by the test, never `prisma
  migrate reset`) by running every earlier `migration.sql` in name order, seeds it, runs the two 027 migrations and
  compares, per teacher and student, what they see (SC-002).
- **Rationale**: the beta is small; running inside the deploy's `migrate deploy` keeps it atomic (FR-028) with no
  separate job.
- **Alternatives considered**: a CLI run after deploy — rejected (a window where the code expects cohorts that don't
  exist).

## Q10 — Teacher's turma search and creating a disciplina da turma

- **Decision**: `GET /cohort-directory?q=&cursor=` (teacher, `turmas.buscar`) searches ACTIVE cohorts by
  `search_key` (accent/case-insensitive, 003 D10), keyset by `academic_year desc, name, id`, 20 per page; each item:
  id, name, code, academicYear, period and its classes' `{ subjectName, teacherName }` — nothing else (FR-016,
  XXIV). `POST /classes { cohortId, subjectId, startsOn?, endsOn? }` creates the disciplina da turma: the subject must
  be the teacher's and ACTIVE (else `404`/`409 SUBJECT_INACTIVE`, the 004 code: a subject is ACTIVE or INACTIVE), the cohort ACTIVE (else `409 COHORT_NOT_ACTIVE`,
  re-checked under `SELECT … FOR SHARE` of the cohort so a concurrent archive cannot leave an active class in an
  archived cohort), duplicates → `409 CLASS_SUBJECT_DUPLICATE` (partial UNIQUE). `teacherId` comes from the session.
- **Rationale**: FR-016–FR-019 and the concurrency edge case ("arquivar a turma × acrescentar disciplina"): archiving
  takes `FOR UPDATE` on the cohort, so the two serialize.

## Q11 — Web

- **Decision**: the MANAGER's screens live in a new `apps/web/features/cohorts/` at `/gestao/turmas` and
  `/gestao/turmas/[id]` (list, create, edit, status, invitations, students with "Incluir aluno com conta",
  disciplinas). The teacher's `/turmas` lists their disciplinas da turma (`features/classes`, rewritten), `/turmas/nova`
  becomes "Acrescentar disciplina a uma turma" (search + subject + optional calendar), the class page drops invite/
  remove/edit-turma actions and shows the read-only roster and, after the calendar, "Encerrar"/"Arquivar".
  `features/class-invitations` moves under the cohort page. "Minhas turmas" groups by year. The menu gets "Turmas"
  for whoever has `turmas.visualizar` (pointing to `/gestao/turmas`), and the teacher's "Turmas" for
  `disciplinas_turma.visualizar`.
- **Rationale**: a person with both roles has both screens (edge case); paths don't collide.

## Q12 — Mobile

- **Decision**: no change besides the class label (`GET /mobile/exams` reads the name through the cohort, Q2). The
  app shows the label it receives.
