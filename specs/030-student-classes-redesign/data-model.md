# Data model: "Minhas turmas" do aluno redesenhada (030)

**No migration.** Nothing new is stored; `enrollments.enrolled_at` (timestamptz NOT NULL, 003/027) already exists and is
now also read by `GET /me/classes`.

## Contract change (`packages/contracts/src/classes/my-classes.ts`)

`MyCohortSchema` (strict) gains one field:

| Field | Type | Source | Rule |
|-------|------|--------|------|
| `enrolledAt` | ISO date-time string | `enrollments.enrolled_at` of the session student's ACTIVE enrollment in that turma | always the student's own; one per turma (027: the enrollment is the turma's) |

Everything else in `MyCohortList` / `MyCohort` / `MyCohortClass` is unchanged (SC-006).

## Web view model (`apps/web/features/my-classes/schemas/my-classes.ts`, not a contract)

`SubjectCard` — one card of the screen, derived by `subjectCards(list)` in the API's order (MT3):

| Field | From |
|-------|------|
| `key` | `classId`, or `cohort:<cohortId>` for a turma without disciplinas |
| `classId` | `MyCohortClass.classId`, or `null` (turma without disciplinas: no "Acessar turma", no ranking) |
| `cohortName`, `cohortCode`, `period`, `cohortStatus` | the turma |
| `academicYear` | the year group |
| `enrolledAt` | the turma's `enrolledAt` |
| `subjectName`, `teacherName`, `effectiveStatus` | the disciplina (null / absent for a turma without disciplinas) |

Pure helpers: `subjectCards`, `studentYears(list)` (distinct years, most recent first), `resolveYear(param, years)`
(MT5), `normalizeSearch(text)` and `filterSubjectCards(cards, { year, search })` (MT4), `cardStatusBadge(card)` (the
027 rule: the turma's badge, else the disciplina's when the turma is ACTIVE).

## States

None new. The statuses shown are the 027 effective statuses, derived on read as today.
