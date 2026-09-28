# Contract: permissions and authorization matrix

| Permission | Roles | Used by |
|------------|-------|---------|
| `questoes.visualizar` | TEACHER | `GET /exercises`, `GET /exercises/:id`, `GET /exercise-batches`, `GET /exercise-batches/:id`, `GET /programming-languages` (or `ementas.visualizar`) |
| `questoes.criar` | TEACHER | `POST /exercises/sets`, `POST /exercises` |
| `questoes.editar` | TEACHER | `PUT /exercises/:id`, `POST …/archive`, `POST …/restore`, `DELETE /exercises/:id` |
| `questoes.aprovar` | TEACHER | `POST /exercises/:id/approve`, `POST /exercise-batches/:id/approve` |
| `ia.exercicios.gerar` (+ `ia.execucoes.visualizar`) | TEACHER | `POST /exercise-batches`, `GET /exercise-generation/availability` |
| `ementas.revisar` (004) | TEACHER | language on `PUT /syllabus-revisions/:id` |

ADMIN, MANAGER and STUDENT hold none of them (403). Resource context: every exercise, batch and
topic is filtered by the session teacher; another teacher's id → 404, with no difference between
"doesn't exist" and "not yours".

Every route gets a `MATRIX` row (`test/security/authorization-matrix.ts`) and a
`route-declarations.spec.ts` entry; the 010 security suite builds a complete area for teachers A
and B and calls every route with A's session on B's ids.
