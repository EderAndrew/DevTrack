# Contract: permissions and authorization matrix

| Permission | Roles | Used by |
|------------|-------|---------|
| `atividades.visualizar` | TEACHER | `GET /classes/:classId/activities`, `GET /classes/:classId/activities/:activityId` |
| `atividades.aplicar` | TEACHER | `POST …/activities/scope-check`, `POST …/activities`, `PATCH …/activities/:activityId`, `POST …/close`, `POST …/cancel` |
| `entregas.visualizar` | TEACHER | `GET …/activities/:activityId/attempts/:attemptId` |
| `notas.lancar` | TEACHER | `PUT …/attempts/:attemptId/grades`, `POST …/attempts/:attemptId/accept-submission` |
| `notas.liberar` | TEACHER | `POST …/activities/:activityId/release` |
| `atividades.proprias.visualizar` | STUDENT | `GET /me/dashboard`, `GET /me/activities`, `GET /me/activities/:activityId` |
| `atividades.proprias.responder` | STUDENT | `POST /me/activities/:activityId/attempt`, `PUT …/attempt/answers`, `POST …/attempt/submit` |
| `notas.proprias.visualizar` | STUDENT | the `result` block of the student routes (without it: always `null`) |

Seeded by the migration (`notas.lancar` and `notas.proprias.visualizar` are the constitution's
names). ADMIN and MANAGER hold none (403, constitution XXIV). No check by role name. Teacher routes
also need the bank permissions only on the web side, to list sources (`GET /works`,
`GET /exercises` keep their 010/011 permissions).

Resource context:
- teacher: the class through `ClassContextPolicy`; activity by `(id, classId)`; attempt by
  `(id, activityId)`; sources (work, exercises) of the session teacher, APPROVED.
- student: ACTIVE enrollment in the activity's class; activity ACTIVE or CLOSED, not CANCELLED,
  `publish_at ≤ now`; attempt and submission of the session user.
- out of context → 404, identical for "doesn't exist" and "not yours"; an existing out-of-context
  id targeted by a student writes `student_access.denied`.

Every route gets a `MATRIX` row (`test/security/authorization-matrix.ts`) and a
`route-declarations.spec.ts` entry. `012-isolation.spec.ts` builds teachers A and B with a class,
two activities (one per type) and students A1, A2 (A's class) and B1 (B's class), then calls every
teacher route with A's session on B's ids, every student route with A1's session on A2's and
B1's resources and on a scheduled and a cancelled activity, and every route with STUDENT (teacher
routes), TEACHER (student routes), ADMIN and MANAGER sessions (SC-002).
