# Data model: Turmas do gestor e disciplinas da turma (027)

One Prisma migration (`2026111xxxxxxx_027_manager_classes`), which is also the transition (research Q9). PostgreSQL 17.

## New: `cohorts` (Prisma `Cohort`) — the turma

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text NOT NULL | 003 FR-001 sizes (moved from `classes`) |
| `code` | text NOT NULL | 003 format; `UNIQUE (academic_year, upper(code))` (FR-002) |
| `academic_year` | int NOT NULL | CHECK 1900–2100 |
| `period` | text NULL | |
| `description` | text NULL | |
| `status` | `class_status` NOT NULL DEFAULT `ACTIVE` | ACTIVE ⇄ INACTIVE → ARCHIVED (003 state machine; FR-004) |
| `status_changed_at` | timestamptz NULL | |
| `search_key` | text NOT NULL | name + code, lowercase, no accents (003 D10); index for the search |
| `created_by_id` | uuid NOT NULL FK `users` | who created it (FR-001); the cohort belongs to no person |
| `created_at` / `updated_at` | timestamptz | |

Indexes: `(status, academic_year DESC, created_at DESC, id DESC)` (manager list), `(academic_year DESC, name, id)
WHERE status = 'ACTIVE'` (teacher directory), trigram-free `search_key` prefix/contains as 003 does today.

## Changed: `classes` (Prisma `SchoolClass`) — the disciplina da turma

- **Added** `cohort_id uuid NOT NULL FK cohorts ON DELETE RESTRICT`; index `(cohort_id)`.
- **Dropped** `name`, `code`, `academic_year`, `period`, `description`, `search_key` (now the cohort's, Q2) and the
  index `classes_teacher_code_key`.
- **Kept** `id`, `teacher_id`, `subject_id` (NULL only for migrated classes, FR-030 — the service refuses a new one
  without subject), `starts_on`/`ends_on` (both or neither), `status` (the class's **own** status), timestamps.
- **New** partial UNIQUE `(cohort_id, subject_id) WHERE subject_id IS NOT NULL` (FR-018).
- `teacher_id`, `cohort_id` and `subject_id` are immutable after insert (trigger `classes_identity_immutable`,
  FR-019); a migrated class without subject stays without one (FR-030).
- Effective status = most restrictive of `cohorts.status` and `classes.status` (FR-023), derived: pure
  `effectiveStatus()` and SQL function `class_effective_status(class_id uuid) RETURNS class_status STABLE`.

## Changed: `enrollments`

- `class_id` → **`cohort_id`** (FK cohorts). Partial UNIQUE `(cohort_id, student_user_id) WHERE status = 'ACTIVE'`
  (FR-015); index `(cohort_id, status)`.
- **New** `removal_reason enrollment_removal_reason NULL` — enum `MANAGER`, `MERGED`. The service writes `MANAGER` on
  every removal from 027 on and the transition writes `MERGED`; the 003 rows (teacher removals) stay NULL. The CHECK
  `status = 'REMOVED'` ⇔ `removed_at IS NOT NULL` stays.
- **New** `source enrollment_source NOT NULL DEFAULT 'INVITATION'` — `INVITATION` or `DIRECT` (FR-034); existing rows
  are `INVITATION`. **New** `enrolled_by_id uuid NULL FK users` (the MANAGER). CHECK `(source = 'DIRECT') =
  (enrolled_by_id IS NOT NULL)` and `source = 'DIRECT' ⇒ invitation_id IS NULL`.

## View: `class_enrollments`

```sql
CREATE VIEW class_enrollments AS
SELECT c.id AS class_id, e.id AS enrollment_id, e.student_user_id, e.status, e.enrolled_at
FROM classes c JOIN enrollments e ON e.cohort_id = c.cohort_id;
```

Read-only; every pedagogical "is this student in this class" query uses it (Q3).

## Changed: `class_invitations`

- `class_id` → **`cohort_id`**. Partial UNIQUE `(cohort_id, email) WHERE status = 'PENDING'`.
- `class_invitation_cancel_reason` += `ENROLLED_DIRECTLY` (FR-034) and `MERGED` (transition); `TEACHER` stays for old
  rows, new manual cancels use the new `MANAGER`. (`invited_by_id` is the MANAGER from 027 on; old rows keep the
  teacher.)

## Changed: enums

- `mail_kind` += `CLASS_ENROLLMENT_NOTICE` (the subject lives in `enrollments`, registered as `MailSubject`; the
  delivery references the enrollment through `mail_deliveries.subject_id`, as the other kinds do).
- `class_invitation_cancel_reason` += `MANAGER`, `ENROLLED_DIRECTLY`, `MERGED`.
- new `enrollment_removal_reason` (`MANAGER`, `MERGED`), `enrollment_source` (`INVITATION`, `DIRECT`).

## Permissions (seed in the migration, research Q8)

| Key | Roles | Notes |
|---|---|---|
| `turmas.criar`, `turmas.visualizar`, `turmas.editar`, `turmas.alterar_situacao` | MANAGER, ADMIN | moved from TEACHER; describe the cohort |
| `turmas.convidar_aluno`, `turmas.reenviar_convite`, `turmas.cancelar_convite` | MANAGER, ADMIN | moved |
| `turmas.visualizar_alunos`, `turmas.remover_aluno` | MANAGER, ADMIN | moved; "remover" = encerrar matrícula |
| `turmas.incluir_aluno` | MANAGER, ADMIN | new (FR-034): lookup + direct enrollment |
| `turmas.buscar` | TEACHER | new (FR-016) |
| `disciplinas_turma.visualizar`, `.criar`, `.editar`, `.alterar_situacao`, `.visualizar_alunos` | TEACHER | new |
| `turmas.proprias.listar` | STUDENT | unchanged |

## State machines

- Cohort: ACTIVE ⇄ INACTIVE, ACTIVE/INACTIVE → ARCHIVED (final). Archive cancels PENDING invitations
  (`CLASS_ARCHIVED`) in the same transaction (FR-005), under `FOR UPDATE` of the cohort.
- Class (own): same transitions, teacher only, only when `planningToday > ends_on` (FR-022) and the cohort is not
  ARCHIVED.
- Enrollment: ACTIVE → REMOVED (reason `MANAGER` or `MERGED`); a new ACTIVE row may follow (003 FR-043).
- Invitation: unchanged (PENDING → ACCEPTED/EXPIRED/CANCELLED).

## Transition mapping (FR-027–FR-030)

| Before (per `classes` row) | After |
|---|---|
| name, code, year, period, description | the cohort of its `(academic_year, upper(code))` group, from the oldest class |
| class status | class keeps it; cohort = most open of the group |
| enrollments | same rows, `cohort_id`; duplicates ACTIVE → oldest stays, others REMOVED/`MERGED` |
| invitations | same rows, `cohort_id`; duplicate PENDING → latest expiry stays, other CANCELLED/`MERGED` |
| meetings, plan, activities, attendances, results, alerts, nudges, audit | untouched (still keyed by `classes.id`) |
