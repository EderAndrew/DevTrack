# Permissions: 020

| Permission | Granted to | Used by |
|---|---|---|
| `feedbacks.enviar` (new) | STUDENT | `POST /me/feedbacks` |
| `feedbacks.proprios.listar` (new) | STUDENT | `GET /me/feedbacks` |
| `feedbacks.visualizar` (new) | ADMIN | `GET /feedbacks`, `GET /feedbacks/summary`, `GET /feedbacks/:id` |
| `feedbacks.alterar_situacao` (new) | ADMIN | `POST /feedbacks/:id/status` |

TEACHER and MANAGER get none: `403` on every feedback route, including feedbacks of students of
their classes (FR-011). A STUDENT gets `403` on the ADMIN routes; an ADMIN without the STUDENT role
gets `403` on the `/me/feedbacks` routes. Another student's feedback is never addressable by a
student (no route takes a feedback id on the student side). Every route has a row in
`authorization-matrix.ts`.

`feedbacks.visualizar` joins `STAFF_AREA_PERMISSIONS` in the web, so an ADMIN keeps the AppShell.
