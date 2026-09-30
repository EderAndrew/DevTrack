# Contract: permissions and authorization matrix

| Permission | Roles | Used by |
|------------|-------|---------|
| `trabalhos.visualizar` | TEACHER | `GET /works`, `GET /works/:id`, `GET /works/:id/student-preview`, `GET /work-generation-requests`, `GET /work-generation-requests/:id`, `GET /works/programming-languages` |
| `trabalhos.criar` | TEACHER | `POST /works` |
| `trabalhos.editar` | TEACHER | `PUT /works/:id` |
| `trabalhos.arquivar` | TEACHER | `POST /works/:id/archive`, `POST /works/:id/restore` |
| `trabalhos.aprovar` | TEACHER | `POST /works/:id/approve` |
| `ia.trabalhos.gerar` (+ `ia.execucoes.visualizar`) | TEACHER | `POST /work-generation-requests`, `GET /work-generation/availability` |

Seeded by the migration. ADMIN, MANAGER and STUDENT hold none of them (403); a user with ADMIN
and TEACHER sees only their own bank, as a teacher. No check by role name.

Resource context: every work, question, request, subject, revision and topic is filtered by the
session teacher; another teacher's id → 404, with no difference between "doesn't exist" and "not
yours".

Every route gets a `MATRIX` row (`test/security/authorization-matrix.ts`) and a
`route-declarations.spec.ts` entry; the 011 security suite builds a complete area (subject,
confirmed syllabus, manual and AI works, a request) for teachers A and B and calls every route
with A's session on B's ids, and every route with STUDENT, ADMIN and MANAGER sessions (SC-008).
