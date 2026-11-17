# Audit events: Turmas do gestor e disciplinas da turma (027)

Written in the operation's transaction (append-only table). Metadata: ids, enums, counts — never a name, free text or
an e-mail, except the 003 `class_invitation.created`, which keeps its `email` as today.

| Type | Actor | Metadata |
|---|---|---|
| `cohort.created` | MANAGER | `code`, `academicYear` |
| `cohort.updated` | MANAGER | `fields` |
| `cohort.status_changed` | MANAGER | `from`, `to`, `cancelledInvitations` |
| `class_invitation.created/resent/cancelled/accepted/acceptance_refused` | as 003 | `classId` → `cohortId`; reason += `MANAGER`, `ENROLLED_DIRECTLY`, `MERGED` |
| `enrollment.created` | acceptance or MANAGER | `cohortId`, `userId`, `invitationId`, `source` |
| `enrollment.removed` | MANAGER | `cohortId`, `userId`, `reason` |
| `cohort.student_lookup` | MANAGER | `cohortId`, `found` |
| `cohort.student_lookup_rate_limited` | MANAGER | `cohortId` (own transaction) |
| `class.created` | TEACHER | `cohortId`, `subjectId` (replaces 003 `code`, `academicYear`) |
| `class.updated` | TEACHER | `fields` |
| `class.status_changed` | TEACHER | `from`, `to` |
| `cohort_transition.applied` | SYSTEM (migration) | `cohorts`, `classes`, `mergedCohorts`, `mergedEnrollments`, `mergedInvitations` |
