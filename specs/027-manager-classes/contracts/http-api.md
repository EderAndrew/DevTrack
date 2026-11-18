# HTTP API: Turmas do gestor e disciplinas da turma (027)

Every schema lives in `packages/contracts` (new `cohorts/` directory; `classes/` rewritten) and is cataloged in
`endpoints.ts`. Unsafe methods need `Origin` + `Content-Type: application/json` as always. Errors `{statusCode, code,
message}`. A cohort outside the MANAGER's capability → `403`; a class of another teacher → `404` (XXIV).

## MANAGER (and ADMIN) — turma

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /cohorts` | `turmas.visualizar` | query `q?`, `academicYear?`, `status?` (default ACTIVE+INACTIVE), `cursor?`, `limit?` (≤50) | `CohortPage` (most recent first) |
| `POST /cohorts` | `turmas.criar` | `{ name, code, academicYear, period?, description? }` | `201 CohortView`; `409 COHORT_CODE_TAKEN` |
| `GET /cohorts/:id` | `turmas.visualizar` | — | `CohortDetail`: data, `activeEnrollmentCount`, `classes[{ id, subjectName, teacherName, effectiveStatus }]` (FR-007) |
| `PATCH /cohorts/:id` | `turmas.editar` | partial create body (strict) | `CohortView`; ARCHIVED → `409 COHORT_ARCHIVED` |
| `POST /cohorts/:id/status` | `turmas.alterar_situacao` | `{ to: "ACTIVE"\|"INACTIVE"\|"ARCHIVED" }` | `CohortView`; invalid → `409 INVALID_STATE_TRANSITION` |
| `GET /cohorts/:id/invitations` | `turmas.visualizar` | 003 query | 003 page (+ 017 delivery) |
| `POST /cohorts/:id/invitations` | `turmas.convidar_aluno` | `{ email }` | `201`; 003 codes; cohort not ACTIVE → `409 COHORT_NOT_ACTIVE` |
| `POST /cohorts/:id/invitations/:invitationId/resend` | `turmas.reenviar_convite` | `{}` | 003 |
| `POST /cohorts/:id/invitations/:invitationId/cancel` | `turmas.cancelar_convite` | `{}` | 003 (reason `MANAGER`) |
| `GET /cohorts/:id/enrollments` | `turmas.visualizar_alunos` | 003 query | `CohortEnrollmentPage`: name, e-mail, status, source |
| `POST /cohorts/:id/enrollments/:enrollmentId/remove` | `turmas.remover_aluno` | `{}` | 003 effects, for every class of the cohort (FR-014) |
| `POST /cohorts/:id/student-lookup` | `turmas.incluir_aluno` | `{ email }` | `{ found: true, studentUserId, name, alreadyEnrolled } \| { found: false }`; 30/min → `429` |
| `POST /cohorts/:id/enrollments` | `turmas.incluir_aluno` | `{ email }` | `201 CohortEnrollmentView`; `409 ALREADY_ENROLLED`, `422 STUDENT_NOT_ELIGIBLE`, `409 COHORT_NOT_ACTIVE` |

The old `/classes/:id/invitations*`, `/classes/:id/enrollments/:enrollmentId/remove`, `POST /classes` (003 body) and
`PATCH /classes/:id` (turma fields) are removed from the catalog.

## TEACHER — disciplina da turma

| Method & path | Permission | Request | Response |
|---|---|---|---|
| `GET /cohort-directory` | `turmas.buscar` | `q` (1–100), `cursor?` | ACTIVE cohorts: `{ id, name, code, academicYear, period, classes[{ subjectName, teacherName }] }` only (FR-016) |
| `GET /classes` | `disciplinas_turma.visualizar` | `q?`, `status?`, `cursor?` | own classes: `{ id, subjectName, cohort{ id, name, code, academicYear, period }, ownStatus, effectiveStatus, startsOn, endsOn }` |
| `POST /classes` | `disciplinas_turma.criar` | `{ cohortId, subjectId, startsOn?, endsOn? }` | `201 ClassView`; `404` (cohort/subject unknown or not own), `409 COHORT_NOT_ACTIVE`, `409 SUBJECT_INACTIVE` (004: a subject is ACTIVE or INACTIVE), `409 CLASS_SUBJECT_DUPLICATE` |
| `GET /classes/:id` | `disciplinas_turma.visualizar` | — | `ClassView` + `canChangeStatus` (FR-022) |
| `PATCH /classes/:id` | `disciplinas_turma.editar` | `{ startsOn, endsOn }` (004 rules) | `ClassView` |
| `POST /classes/:id/status` | `disciplinas_turma.alterar_situacao` | `{ to }` | `ClassView`; before the end / no calendar → `409 CLASS_CALENDAR_NOT_ENDED`; cohort ARCHIVED → `409 INVALID_STATE_TRANSITION` |
| `GET /classes/:id/enrollments` | `disciplinas_turma.visualizar_alunos` | 003 query | read-only roster: the 003 teacher view of a student (name, RA, status) |

Every other `/classes/:id/...` route of 004–025 is unchanged; its context check is `ClassContextPolicy` with the
effective status (research Q4).

## STUDENT

| Method & path | Change |
|---|---|
| `GET /me/classes` | `MyCohortList`: `{ years: [{ academicYear, cohorts: [{ id, name, code, period, status, classes: [{ classId, subjectName, teacherName, effectiveStatus }] }] }] }`, most recent year first (FR-025) |
| `GET /me/activities`, `GET /me/dashboard` (`classId`) | the 026 check becomes "an ACTIVE enrollment in the class's cohort"; same `404` |
| public `GET /class-invitations/:token` | shows the cohort (name, code, period), never teacher or subject (FR-010) |

## Mail

`CLASS_ENROLLMENT_NOTICE` (FR-034): subject "Você foi incluído na turma <nome>", body with the cohort's name, code and
period and the `/entrar` link; no token, no teacher, no subject. Rebuilt per attempt by the enrollments
`MailSubject` (017).
