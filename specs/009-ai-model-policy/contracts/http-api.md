# Contract: HTTP API changes

Schemas in `packages/contracts/src/ai/operations.ts` (constitution XXVI); new routes get
`endpoints.ts` entries. No new permission. Every response is aggregate: no content, credential,
teacher id or execution id (006 admin scan).

## Unchanged, reaffirmed

`POST /ai/executions` and `POST /syllabus-documents/:id/ai-analyses`: strict bodies; `model`,
`provider`, `family`, `tier` or `task` → `400 VALIDATION_ERROR`. Availability
(`GET /syllabus-documents/:id/ai`): `MODEL_UNAVAILABLE` when the task's selection is unavailable.

## `GET /ai/operations/metrics` (`ia.operacao.visualizar`)

Adds:

```ts
byTask:   { taskKey, agentKeys: string[], executions, calls, inputTokens, outputTokens, avgDurationMs, estimatedCost, currency, fallbacks, escalations }[]
byTier:   { tier: "BASIC" | "STANDARD" | "ADVANCED" | null, calls, inputTokens, outputTokens, avgDurationMs, estimatedCost, currency }[]
byFamily: { family: string | null, calls, inputTokens, outputTokens, avgDurationMs, estimatedCost, currency, fallbackCalls }[]
budgets:  { scope: "DAILY" | "MONTHLY" | "PER_AGENT" | "PER_USER", agentKey: string | null, limit: string | null, spent: string, exceeded: boolean, usersOverBudget: number | null }[]
```

`byAgent` gains `escalations`; `byModel` gains `tier`, `family` (from the catalog entry of the
call's config).

## `GET /ai/operations/models` (`ia.operacao.visualizar`) — new

```ts
{ key, family, model, tier, mode, lifecycle, status, capabilities, contextWindow,
  price: { inputPerMTok, outputPerMTok, currency } | null,
  approvals: { taskKey, valid: boolean, metrics: Record<string, number>, evaluatedAt,
               avgCostPerExecution: string | null /* real, in the period */ }[] }[]
```

Query `period` as in metrics (for `avgCostPerExecution`).

## `GET /ai/operations/tasks` (`ia.operacao.visualizar`) — new

```ts
{ key, mode, minimumTier, preferredTier, maxTier, allowedFamilies, requiredCapabilities,
  fallback, escalation, quality: Record<string, number>, agentKeys: string[],
  selection: { primaryKey, fallbackKey, reason } | { unavailable: UnavailableReason },
  override: { modelConfigKey, setAt } | null,
  overrideCandidates: string[] /* keys an override may fix now: admitted at the preferred tier, PRODUCTION, enabled */ }[]
```

## `PUT /ai/operations/tasks/:key/override` (`ia.agentes.gerenciar`) — new

Body `{ modelConfigKey }` (strict). `200` with the task view. `404` unknown task; `409
AI_OVERRIDE_NOT_ALLOWED` when the model doesn't qualify for the task (other tier, family or
mode, not `PRODUCTION`, no valid approval, disabled). Same override again → `200`, no new event.
Audit `ai_task_override.set`.

## `DELETE /ai/operations/tasks/:key/override` (`ia.agentes.gerenciar`) — new

`200` with the task view; no override → `200`, no event. Audit `ai_task_override.removed`.

Unsafe methods keep the Origin + JSON rules (006 R6); the 006 authorization matrix gains the
three new routes.
