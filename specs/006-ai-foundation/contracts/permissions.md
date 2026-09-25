# Permissions Contract: 006 — AI Foundation

This adds permissions to the catalog of 001, 003 and 004 through an idempotent data migration
(`INSERT … ON CONFLICT DO NOTHING`). Code checks permissions, never role names. The context
check (the execution or proposal belongs to the session teacher) happens afterwards, in the
service, and fails with 404.

| Permission | Description | TEACHER | STUDENT | MANAGER | ADMIN |
|------------|-------------|:-------:|:-------:|:-------:|:-----:|
| `ia.execucoes.visualizar` | Request (plus the agent's permission), list, view and cancel own AI executions | ✅ | — | — | — |
| `ia.propostas.revisar` | List, open and decide own AI proposals | ✅ | — | — | — |
| `ia.operacao.visualizar` | View AI health, metrics, usage, cost, agents and model configs (no content) | — | — | — | ✅ |
| `ia.agentes.gerenciar` | Enable and disable agents and model configs | — | — | — | ✅ |

**Agent permission.** Each agent declares `requiredPermission` (FR-005), and its spec adds
that permission to the catalog and grants it to a role. This feature grants none. The
reference agents of the tests (`apps/api/test/fixtures/ai`) reuse existing permissions:
`ia.execucoes.visualizar`, plus `ia.agentes.gerenciar` for an agent the teacher can't run.

**Multiple roles.** A user holds the union of the permissions of their active roles:
- `ADMIN` + `TEACHER` acts as a teacher only over their own workspace;
- `ADMIN` alone gets `403` on the teacher routes, so no pedagogical content reaches them
  (FR-031, US2-5);
- a teacher who is also a student uses the teacher permissions; the student permissions
  open no AI route.

## Authorization matrix

Tests: `apps/api/test/security/006-ai-authorization-matrix.ts`, added to the general
`authorization-matrix.ts`.

| Subject | Teacher routes (`/ai/executions*`, `/ai/proposals*`) | Operations routes (`/ai/operations/*`) |
|---------|------------------------------------------------------|----------------------------------------|
| anonymous | 401 | 401 |
| unverified e-mail | 403 `EMAIL_NOT_VERIFIED` | 403 |
| STUDENT | 403 | 403 |
| MANAGER | 403 | 403 |
| ADMIN (no TEACHER) | 403 | reads 200; status changes 200 |
| TEACHER A, own execution or proposal | 200/202 | 403 |
| TEACHER A, B's execution or proposal | 404 | 403 |
| TEACHER without the agent's permission | `POST /ai/executions` → 403 | 403 |

## Menu (web, UX only)

"Operação de IA" (`/admin/ia`) shows up only with `ia.operacao.visualizar`. The toggles
show up only with `ia.agentes.gerenciar`. The API authorizes every request anyway.
