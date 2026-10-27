# Permissions: 021

No new permission.

| Permission | Granted to | Used by (021) |
|---|---|---|
| `atividades.proprias.executar` (019) | STUDENT | runs on a work's CODE question, reading own runs |
| `atividades.aplicar` (012) | TEACHER | `codeExecution` on apply and in the options edit; `GET /code-runner/availability` |
| `entregas.visualizar` (012) | TEACHER | `GET …/attempts/:attemptId/code-runs` (the run summary) |

New rows in `authorization-matrix.ts`: `GET /code-runner/availability` (TEACHER 200; STUDENT, MANAGER,
ADMIN 403) and the summary route (TEACHER of the class 200, teacher B 404; STUDENT, MANAGER, ADMIN 403).
