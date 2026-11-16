# Data Model: Matéria atual do aluno (026)

**No migration.** No table, column, enum, trigger or permission changes. The feature reads data that already exists.

## Read model

| Concept | Source | Notes |
|---------|--------|-------|
| Subject choice ("matéria") | `school_classes.id` of an `enrollments` row with `student_user_id = session user` and `status = 'ACTIVE'` | Research D1. Any class status counts, as in "Minhas turmas" |
| Subject label | `subjects.name` through `school_classes.subject_id` (nullable), plus `school_classes.name` | `"<disciplina> · <turma>"`, only `"<turma>"` when `subject_id` is null |
| Tie-breaker of equal labels | `school_classes.period`, `users.name` of the class's teacher | Web only (D7); already in "Minhas turmas" |
| Activities of the subject | `class_activities` within the existing `visibleTo(student, now)` scope **and** `class_id = classId` | Every 012/013/016/018/023 rule unchanged (FR-010) |
| Ranking block of the subject | `RankingService.dashboardFor` narrowed to `classId` | ACTIVE class and `ranking.turma.visualizar` only (D4) |

## Validation rules

- `classId` (query of `GET /me/activities` and `GET /me/dashboard`): optional; when present, a UUID (else `400
  VALIDATION_ERROR`); then an ACTIVE enrollment of the session student in it (else `404 NOT_FOUND`, no body detail).
- `materia` (page address, web): an unknown or foreign value is never sent; the web falls back to the first class of
  "Minhas turmas" and shows the notice (D6).

## State

None new. Enrollment `ACTIVE` / not `ACTIVE` is the 003 lifecycle; activity statuses stay derived on read (012).
