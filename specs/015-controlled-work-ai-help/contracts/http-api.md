# HTTP API Contract: 015 — Trabalho em Modo Controlado com Ajuda da IA

Shapes live in `packages/contracts/src/activities/` (changed), `src/attempt-integrity/` and
`src/work-help/` (new), cataloged in `endpoints.ts`. Unsafe methods need `Origin` and
`Content-Type: application/json`. Bodies are strict (unknown fields → 400).

## Changed 012 shapes

- `CreateActivity` / `UpdateActivity` (ASSIGNMENT): `executionMode: "NORMAL" | "CONTROLLED"`
  (default NORMAL) and `aiHelpAllowance: 0 | 3` (default 0). EXERCISE with either → 400.
- `TeacherActivity`, `TeacherActivitySummary`, `StudentActivity`, `StudentActivitySummary`:
  `executionMode` and `aiHelp: { allowance: 0 | 3 }` (student detail also `used`).
- Roster row: `aiHelpUsed: 0..3`.
- `SaveAnswersResult` per-answer outcome gains `TYPING_LIMIT_EXCEEDED` (the stored answer and its
  revision are returned unchanged).

## Teacher routes

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `POST /classes/:classId/activities` | `atividades.aplicar` | + `executionMode`, `aiHelpAllowance` | 012 errors + 503 `AI_HELP_UNAVAILABLE` |
| `PATCH /classes/:classId/activities/:activityId` | `atividades.aplicar` | + `executionMode`, `aiHelpAllowance` | 012 errors + 409 `ACTIVITY_ALREADY_STARTED`, 503 `AI_HELP_UNAVAILABLE` |
| `GET /work-help/availability` | `atividades.aplicar` | → `{ available: boolean, reason: "AGENT_DISABLED" \| "MODEL_UNAVAILABLE" \| null }` | — |
| `GET /classes/:classId/activities/:activityId/integrity` | `entregas.visualizar` | → `{ items: IntegritySummary[] }` (one per ACTIVE student with an attempt) | 404 |
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/integrity` | `entregas.visualizar` | → `IntegrityTimeline` | 404 |
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/help` | `entregas.visualizar` | → `{ allowance, used, items: TeacherHelpItem[] }` | 404 |

`IntegritySummary`: `{ studentUserId, attemptId, screenExits, timeAwaySeconds, fullscreenExits, disconnections, offlineSeconds,
clipboardBlocks, typingLimitRejections, fullscreenUnavailable, detectionUnavailable }`.
`IntegrityTimeline`: `{ events: { type, questionPosition|null, recordedAt, clientOccurredAt|null,
buffered }[], intervals: { kind: "SCREEN" | "FULLSCREEN" | "CONNECTION", from, to, seconds, open }[], totals }`.
`TeacherHelpItem`: `{ id, questionPosition, question, status, message|null, example|null,
reasonCode|null, requestedAt, resolvedAt|null }`.

## Student routes

| Method & path | Permission | Body → Response | Errors |
|---|---|---|---|
| `POST /me/activities/:activityId/attempt/events` | `atividades.proprias.responder` | `{ events: IntegrityEventInput[1..50] }` → `{ recorded: { eventId, recordedAt }[] }` | 404, 409 `NOT_STARTED` / `ATTEMPT_ALREADY_SUBMITTED` / `NOT_CONTROLLED` / `ACTIVITY_CLOSED`, 422 `UNKNOWN_QUESTION`, 429 |
| `GET /me/activities/:activityId/attempt/integrity` | `atividades.proprias.visualizar` | → `{ events, totals }` (own attempt) | 404 |
| `POST /me/activities/:activityId/attempt/help` | `ia.ajuda.pedir` | `{ questionId, question (1–500), idempotencyKey }` → `202 StudentHelpItem` (same key → 200, same item) | 404, 409 `NOT_STARTED` / `ATTEMPT_ALREADY_SUBMITTED` / `HELP_PENDING` / `HELP_EXHAUSTED` / `HELP_NOT_ENABLED` / `DEADLINE_PASSED` / `ACTIVITY_CLOSED`, 422 `UNKNOWN_QUESTION`, 429, 503 `AI_HELP_UNAVAILABLE` |
| `GET /me/activities/:activityId/attempt/help` | `ia.ajuda.pedir` | → `{ allowance, used, pending, items: StudentHelpItem[] }` | 404 |

`IntegrityEventInput`: `{ eventId: uuid, type: client types of data-model.md (not
TYPING_LIMIT_EXCEEDED), questionId?: uuid, clientOccurredAt: ISO, buffered: boolean }`.
`StudentHelpItem`: `{ id, questionId, question, status, message|null, example|null, requestedAt,
resolvedAt|null }` — BLOCKED and FAILED never carry text or reason; no answer key, no execution
id.

Server-controlled fields refused in bodies (400): `recordedAt`, `status`, `used`, `allowance` (on
student routes), `message`, `reasonCode`, `studentUserId`, `attemptId`, durations.
