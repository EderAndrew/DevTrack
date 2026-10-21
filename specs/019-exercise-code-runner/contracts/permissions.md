# Permissions: 019

| Permission | Granted to | Used by |
|---|---|---|
| `atividades.proprias.executar` (new) | STUDENT | create a run, read own runs |
| `questoes.criar`, `questoes.editar`, `questoes.visualizar` (010) | TEACHER | test cases in the exercise bank, `GET /programming-languages` |

TEACHER, MANAGER and ADMIN get no `atividades.proprias.executar`, so they receive `403` on the run
routes. Every route has a row in `authorization-matrix.ts`. Outside the student's context → `404`:
an activity of another class or not released, a WORK or EXAM activity, a question of another
activity, another student's run, a run without an attempt in progress.
