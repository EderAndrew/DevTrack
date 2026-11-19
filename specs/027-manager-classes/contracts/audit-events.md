# Audit events: Turmas do gestor e disciplinas da turma (027)

Written in the operation's transaction (append-only table). Metadata: ids, enums, counts — never a name, free text or
an e-mail, except the 003 `class_invitation.created`, which keeps its `email` as today.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `cohort.created` | USER (MANAGER) | COHORT | `code`, `academicYear` |
| `cohort.updated` | USER (MANAGER) | COHORT | `fields` |
| `cohort.status_changed` | USER (MANAGER) | COHORT | `from`, `to`, `cancelledInvitations` |
| `cohort.student_lookup` | USER (MANAGER) | COHORT | `cohortId`, `found` |
| `cohort.student_lookup_rate_limited` | USER (MANAGER) | COHORT | `cohortId` (own transaction) |
| `class_invitation.created` | USER (MANAGER) | CLASS_INVITATION | `cohortId`, `email` (as 003, `classId` → `cohortId`) |
| `class_invitation.resent` | USER (MANAGER) | CLASS_INVITATION | `cohortId`, `sendCount` |
| `class_invitation.cancelled` | USER (MANAGER) \| SYSTEM (transition) | CLASS_INVITATION | `cohortId`, `invitationId`, `reason` (`MANAGER`, `CLASS_ARCHIVED`, `ALREADY_ENROLLED`, `ENROLLED_DIRECTLY`, `MERGED`) |
| `class_invitation.accepted` | USER \| ANONYMOUS | CLASS_INVITATION | `cohortId`, `userId`, `mode`, `alreadyEnrolled` |
| `class_invitation.acceptance_refused` | USER \| ANONYMOUS | CLASS_INVITATION | `reason` |
| `enrollment.created` | USER \| ANONYMOUS (acceptance; USER: the MANAGER of a direct enrollment) | ENROLLMENT | `cohortId`, `userId`, `invitationId`, `source` |
| `enrollment.removed` | USER (MANAGER) \| SYSTEM (transition) | ENROLLMENT | `cohortId`, `userId`, `reason` (`MANAGER`, `MERGED`) |
| `class.created` | USER (TEACHER) | CLASS | `cohortId`, `subjectId` (replaces 003 `code`, `academicYear`) |
| `class.updated` | USER (TEACHER) | CLASS | `fields` |
| `class.status_changed` | USER (TEACHER) | CLASS | `from`, `to` |
| `cohort_transition.applied` | SYSTEM (migration) | COHORT_TRANSITION | `cohorts`, `classes`, `mergedCohorts`, `mergedEnrollments`, `mergedInvitations`, `permissionsMoved` (`[{ key, from: "TEACHER", to: ["MANAGER", "ADMIN"] }]`), `permissionsAdded` (`[{ key, roles }]`) — the role-permission changes of the migration (constitution XXV) |

The types of 003 listed here (`class_invitation.*`, `enrollment.*`, `class.*`) are **replaced** by these rows: their
metadata is exactly the one above, never the union with 003's (`audit-coverage.spec.ts`, `REPLACED_BY_027`).
`cohort_transition.applied` is written only by the migration, so the journey never emits it; `027-transition.spec.ts`
(T046) checks it.

The transition also writes one SYSTEM `enrollment.removed` / `class_invitation.cancelled` (`reason: "MERGED"`) per row
it changes (constitution XXIV: every enrollment change is audited); their counts equal `mergedEnrollments` /
`mergedInvitations`.
