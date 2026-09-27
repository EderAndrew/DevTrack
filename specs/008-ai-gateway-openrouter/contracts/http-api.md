# Contract: HTTP API changes

No new route and no new permission. Schemas live in `packages/contracts/src/ai/` (constitution
XXVI); `endpoints.ts` entries keep their paths.

## `POST /ai/executions` and `POST /syllabus-documents/:id/ai-analyses`

Unchanged request (strict: an extra `model`, `provider` or `task` field → `400
VALIDATION_ERROR`). New refusal, checked after the per-user limits and after a replay is
answered:

| Condition | Status | Body `code` | Audit |
|-----------|--------|-------------|-------|
| `AI_AGENT_EXECUTIONS_PER_HOUR` reached for the agent | 429 + `Retry-After` | `RATE_LIMITED` | `ai_execution.rate_limited`, `scope: "agent"` |

Availability (`GET /syllabus-documents/:id/ai`): `MODEL_UNAVAILABLE` when neither the primary nor the
fallback of the task is enabled, registered and allowed by its circuit.

## `GET /ai/operations/health` (`AiHealthSchema`)

Each `modelConfigs[]` entry gains:

```ts
circuit: z.enum(["CLOSED", "OPEN", "HALF_OPEN"]) // AiCircuitStateSchema; state of the answering instance
```

## `GET /ai/operations/metrics` (`AiMetricsSchema`)

`AiAgentMetricsSchema` gains:

```ts
taskKey: z.string().nullable(), // null for pre-008 versions
fallbacks: z.int(),             // executions with fallback_used
```

`AiModelUsageSchema` gains:

```ts
failedCalls: z.int(),
fallbackCalls: z.int(),
avgDurationMs: z.int().nullable(),
```

and its `model` is the served model when known (else the requested one). Still no content,
credential, teacher id or execution id (006 admin scan).

## `GET /ai/operations/agents`

`AiAgentOperationsViewSchema.modelConfigKey` is replaced by:

```ts
taskKey: z.string().nullable(),
primaryModelConfigKey: z.string().nullable(),
fallbackModelConfigKey: z.string().nullable(),
```
