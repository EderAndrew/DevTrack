# Permissions: 016

| Permission | Granted to | Used by |
|---|---|---|
| `chamada.registrar` (new) | TEACHER | room view, mark/unmark, pause a student, release a pause |
| `entregas.visualizar` (012) | TEACHER | pauses of an attempt (review), roster `ABSENT` and pause counts |
| `atividades.proprias.responder` (012) | STUDENT | declare an exit (pause) |
| `atividades.proprias.visualizar` (012) | STUDENT | own pause (polling), own pauses in the history |

ADMIN and MANAGER get none of these, so they receive `403`. Every route has a row in
`authorization-matrix.ts`. A request outside the user's context gets `404`: another class's
teacher, a student who is not present, or another student's attempt.
