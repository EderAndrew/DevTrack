# Permissions: 015

| Permission | Granted to | Used by |
|---|---|---|
| `ia.ajuda.pedir` (new) | STUDENT | help request and read; the `work-helper` agent and its `read-work-help-request` tool |
| `atividades.aplicar` (012) | TEACHER | mode and help settings, `GET /work-help/availability` |
| `entregas.visualizar` (012) | TEACHER | integrity summary and timeline, help of an attempt |
| `atividades.proprias.responder` (012) | STUDENT | integrity events |
| `atividades.proprias.visualizar` (012) | STUDENT | own integrity events |

ADMIN and MANAGER get none (403); the admin enables `work-helper` through the 006 agent
operations. Every route has a row in `authorization-matrix.ts`; out of context → 404.
