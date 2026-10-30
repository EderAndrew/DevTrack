# Permissions: 023

No new permission. Being the leader or the editor is resource context (checked in the service and by triggers),
never a permission.

| Permission | Granted to | Used by (023) |
|---|---|---|
| `atividades.aplicar` (012) | TEACHER | `groupSize` on apply and in the options edit |
| `entregas.visualizar` (012) | TEACHER | roster and attempt with `participants`; `GET …/attempts/:attemptId/group` |
| `atividades.proprias.visualizar` (012) | STUDENT | the activity with `group`; `GET …/group/candidates` |
| `atividades.proprias.responder` (012) | STUDENT | start with members or alone; `POST …/group/members`; `POST …/group/editing`; saves, submit and help by role |
| `atividades.proprias.executar` (019) | STUDENT | runs by any participant |
| `notas.proprias.visualizar` (012) | STUDENT | the released result of the group's submission |

New rows in `authorization-matrix.ts`: the three student group routes (STUDENT of the class 200 or a 409 by role;
student of another class 404; TEACHER, MANAGER, ADMIN 403) and the teacher group route (TEACHER of the class 200,
teacher B 404; STUDENT, MANAGER, ADMIN 403).
