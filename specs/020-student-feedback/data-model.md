# Data Model: 020 — Feedback dos Alunos

One migration (`<ts>_student_feedback`): two enums, two tables, triggers, the permission seed.

## Enums

| Enum | Values |
|---|---|
| `student_feedback_category` | `PROBLEM`, `SUGGESTION`, `PRAISE`, `OTHER` (web: Problema, Sugestão, Elogio, Outro) |
| `student_feedback_status` | `RECEIVED`, `IN_REVIEW`, `RESOLVED`, `ARCHIVED` (web: Recebido, Em análise, Resolvido, Arquivado) |

## `student_feedbacks`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `student_id` | uuid NOT NULL | FK `users(id)` `ON DELETE RESTRICT`; the session user, never from the body |
| `submission_id` | uuid NOT NULL | from the client (J3); `UNIQUE (student_id, submission_id)` |
| `category` | `student_feedback_category` NOT NULL | |
| `message` | text NOT NULL | trimmed; `CHECK (char_length(message) BETWEEN 10 AND 2000)` |
| `origin_path` | text NULL | `CHECK (origin_path IS NULL OR (char_length(origin_path) <= 200 AND origin_path ~ '^/[A-Za-z0-9/_.-]*$' AND origin_path !~ '^//' AND origin_path !~ '(^|/)\.\.(/|$)'))` (J2) |
| `status` | `student_feedback_status` NOT NULL | default `RECEIVED` |
| `created_at` | timestamptz NOT NULL | default `now()` (server clock) |
| `status_changed_at` | timestamptz NOT NULL | default `now()`; set on every status change; the retention age (J8) |

Indexes:
- `(student_id, created_at DESC, id DESC)` — the student's list and the 24 h count (J4, J7);
- `(status, created_at DESC, id DESC)` — the ADMIN list filtered by status and the `received` count;
- `(created_at DESC, id DESC)` — the unfiltered ADMIN list.

Triggers:
- `student_feedbacks_guard_update` (BEFORE UPDATE): only `status` and `status_changed_at` may
  change, and only by an allowed transition (below); anything else raises.
- `student_feedbacks_guard_delete` (BEFORE DELETE): raises unless `devtrack.feedback_purge = 'on'`
  (J8).

## `student_feedback_status_changes`

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `feedback_id` | uuid NOT NULL | FK `student_feedbacks(id)` `ON DELETE CASCADE` (only the purge deletes feedbacks) |
| `from_status` | `student_feedback_status` NOT NULL | |
| `to_status` | `student_feedback_status` NOT NULL | `CHECK (from_status <> to_status AND to_status <> 'RECEIVED')` |
| `changed_by_id` | uuid NOT NULL | FK `users(id)` `ON DELETE RESTRICT`; the ADMIN |
| `changed_at` | timestamptz NOT NULL | default `now()` |

Index `(feedback_id, changed_at)`. Append-only: a trigger refuses UPDATE always and DELETE unless
`devtrack.feedback_purge = 'on'` (the cascade from the purge runs under the same flag).

## State transitions

```text
RECEIVED  → IN_REVIEW | RESOLVED | ARCHIVED
IN_REVIEW → RESOLVED | ARCHIVED
RESOLVED  → IN_REVIEW
ARCHIVED  → IN_REVIEW
```

Anything else (the same status, back to `RECEIVED`, `RESOLVED ↔ ARCHIVED` directly) is `409
INVALID_STATE_TRANSITION`, in `feedback-state.ts` (pure) and in the update trigger.

`RESOLVED ↔ ARCHIVED` goes through `IN_REVIEW` on purpose: a closed feedback is reopened before it is
closed again, so the history shows the reopening.

## Permissions (seed)

| Permission | Role |
|---|---|
| `feedbacks.enviar` | STUDENT |
| `feedbacks.proprios.listar` | STUDENT |
| `feedbacks.visualizar` | ADMIN |
| `feedbacks.alterar_situacao` | ADMIN |

## Derived, never stored

- the `received` count of the menu (`count(*) WHERE status = 'RECEIVED'`);
- the 24 h count and `Retry-After` of the limit (J4).
