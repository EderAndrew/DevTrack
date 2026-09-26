# Permissions Contract: 007 — Curriculum Agent

**No new permission.** The routes reuse the 004 and 006 catalogs. The agent's
`requiredPermission` is `ementas.revisar` (006 FR-005), which `TEACHER` already has.

| Operation | Permissions (all required) | Context (404 when it fails) |
|---|---|---|
| `GET /syllabus-documents/:id/ai` (status) | `ementas.visualizar`, `ia.execucoes.visualizar` | document's subject owned by the session teacher |
| `POST /syllabus-documents/:id/ai-analyses` (request) | `ementas.revisar`, `ia.execucoes.visualizar` | same |
| `POST /syllabus-documents/:id/ai-proposals/:proposalId/apply` | `ementas.revisar`, `ia.propostas.revisar` | same, plus the proposal belongs to the teacher, is `CURRICULUM_EXTRACTION` and targets this document |
| Follow and cancel the execution (006 routes) | `ia.execucoes.visualizar` | execution in the teacher's workspace |
| Open and reject the proposal (006 routes) | `ia.propostas.revisar` | proposal in the teacher's workspace |
| Tool `read-curriculum-document` (inside the execution) | `ementas.revisar` (re-checked at the execution start and on each call) | the document is owned by the execution's workspace **and** is the execution's resource |

Roles:
- `TEACHER` has every permission above.
- `ADMIN` alone gets `403` on all of them. It keeps `ia.operacao.visualizar` and
  `ia.agentes.gerenciar` (aggregates and switches, never content).
- `MANAGER` and `STUDENT` get `403`.

Missing capability → `403`; outside the context → `404`, without revealing that the
resource exists.

## Authorization matrix additions

- `test/security/authorization-matrix.ts`: the three new routes, each with the rows teacher
  (own → 2xx), other teacher (→ 404), ADMIN (→ 403), MANAGER (→ 403), STUDENT (→ 403) and
  anonymous (→ 401).
- `test/security/004-curriculum-authorization-matrix.ts`: `VALID_BODY` entries for
  `ai-analyses` and `apply`.
- `test/security/006-ai-authorization-matrix.ts`: `POST /ai/proposals/:id/decision` with
  `APPROVE` on a `CURRICULUM_EXTRACTION` proposal → `409 AI_PROPOSAL_APPLY_REQUIRED` for its
  owner and 404 for teacher B.
