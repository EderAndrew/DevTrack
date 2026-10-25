# HTTP API Contract: 020 — Feedback dos Alunos

Shapes live in `packages/contracts/src/feedback/` (new), cataloged in `endpoints.ts`. Unsafe methods
need `Origin` and `Content-Type: application/json`. Bodies are strict: unknown fields → `400`.

## Student

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `POST /me/feedbacks` | `feedbacks.enviar` | `CreateFeedbackRequest` → `201 StudentFeedback` (new) or `200 StudentFeedback` (the same `submissionId` already stored, J3) | 400 (including an invalid `originPath`); 429 `RATE_LIMITED` with `Retry-After` (J4) |
| `GET /me/feedbacks?cursor=` | `feedbacks.proprios.listar` | → `{ items: StudentFeedback[]; nextCursor: string \| null }`, newest first, 50 per page | 400 (bad cursor) |

### `CreateFeedbackRequest`

```ts
{
  submissionId: string;               // uuid, generated when the dialog opens
  category: "PROBLEM" | "SUGGESTION" | "PRAISE" | "OTHER";
  message: string;                    // trimmed; 10–2 000 code points; no NUL (J9)
  originPath?: string | null;         // pathname only: starts with "/", ≤ 200 chars of [A-Za-z0-9/_.-]; otherwise 400 (J2)
}
```

The student, the status and the time come from the server (FR-002).

### `StudentFeedback`

```ts
{
  id: string;
  category: "PROBLEM" | "SUGGESTION" | "PRAISE" | "OTHER";
  message: string;
  status: "RECEIVED" | "IN_REVIEW" | "RESOLVED" | "ARCHIVED";
  createdAt: string;
}
```

Never present: the history, who changed the status, `statusChangedAt`, `originPath`,
`submissionId`. Built by an allowlist (`student-feedback/views/student-feedback-view.ts`).

## ADMIN

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `GET /feedbacks?status=&category=&cursor=` | `feedbacks.visualizar` | → `{ items: AdminFeedbackListItem[]; nextCursor: string \| null }`, newest first, 50 per page | 400 (unknown filter value, bad cursor) |
| `GET /feedbacks/summary` | `feedbacks.visualizar` | → `{ received: number }` | — |
| `GET /feedbacks/:id` | `feedbacks.visualizar` | → `AdminFeedback` | 404 |
| `POST /feedbacks/:id/status` | `feedbacks.alterar_situacao` | `ChangeFeedbackStatusRequest` `{ status: "IN_REVIEW" \| "RESOLVED" \| "ARCHIVED" }` → `200 AdminFeedback` | 400 (`RECEIVED` or unknown); 404; 409 `INVALID_STATE_TRANSITION` |

### `AdminFeedbackListItem`

```ts
{
  id: string;
  category: …; status: …;
  excerpt: string;                    // the first 140 code points of the message
  student: { id: string; name: string };
  createdAt: string;
}
```

### `AdminFeedback`

```ts
{
  id: string;
  category: …; status: …;
  message: string;
  originPath: string | null;
  student: { id: string; name: string; email: string };
  createdAt: string;
  statusChangedAt: string;
  history: { fromStatus: …; toStatus: …; changedBy: { id: string; name: string }; changedAt: string }[];  // oldest first
}
```

`student.name` is the student profile's display name (003), falling back to the account name.

## Errors

No new code: `RATE_LIMITED` (001) and `INVALID_STATE_TRANSITION` (001) already exist in the web
catalog. The web adds the feedback-specific text for `RATE_LIMITED` in the dialog (web-ui.md).
