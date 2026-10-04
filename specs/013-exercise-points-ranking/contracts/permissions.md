# Contract: permissions and authorization matrix

New permissions, seeded by the migration (research K14):

| Permission | Roles | Used by |
|------------|-------|---------|
| `exercicios.corrigir` | TEACHER | `PUT /classes/:classId/activities/:activityId/attempts/:attemptId/marks` |
| `ranking.visualizar` | TEACHER | `GET /classes/:classId/ranking` |
| `ranking.turma.visualizar` | STUDENT | `GET /me/classes/:classId/ranking`; the `rankings` block of `GET /me/dashboard` (without it: `[]`) |

012 permissions used by the new student routes: `atividades.proprias.responder` (`POST
/me/activities/:activityId/attempts`, `POST …/attempts/:number/complete`) and
`atividades.proprias.visualizar` (`GET …/attempts/:number`). ADMIN and MANAGER hold none (403).
`notas.lancar`, `notas.liberar` and `notas.proprias.visualizar` never apply to EXERCISE.

Resource context:
- teacher: the class through `ClassContextPolicy`; activity by `(id, classId)`; attempt by
  `(id, activityId)`;
- student: ACTIVE enrollment in the class (ranking) or the activity's class; attempts of the
  session user only, selected by `number` inside them;
- out of context → 404, identical for "doesn't exist" and "not yours"; an existing out-of-context
  id targeted by a student writes `student_access.denied` (012).

Every new route gets a `MATRIX` row and a `route-declarations.spec.ts` entry.
`013-isolation.spec.ts` reuses the 012 cast (teachers A and B, students A1, A2, B1): A on B's
ranking, attempts and marks; A1 on B's class ranking, on A2's attempts by number; STUDENT on
teacher routes, TEACHER on student routes, ADMIN and MANAGER on all (SC-006).
