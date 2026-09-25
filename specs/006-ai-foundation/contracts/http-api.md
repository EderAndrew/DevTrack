# HTTP API Contract: 006 — AI Foundation

The conventions of 001–004 apply:
- base `/api`, JSON;
- an allowed `Origin` and `Content-Type: application/json` on unsafe methods;
- **strict** schemas: an unknown field → `400 VALIDATION_ERROR`, including `workspaceId`,
  `teacherId` and `ownerId` (US2-3);
- check order: origin → session (401) → verified e-mail (403) → permission (403) →
  validation (400) → context (404) → rule (409/422/503);
- errors are `{statusCode, code, message}`.

Every request and response is a schema in `packages/contracts/src/ai/` and has an entry in
`endpoints.ts`.

Context: teacher routes only see executions and proposals whose `workspace_id` is the
session user; anything else → `404 NOT_FOUND` (research A2). Operations routes return
only aggregates and configuration, never content, resources, prompts or outputs (FR-031,
FR-063).

## Shared types (`packages/contracts/src/ai/`)

| Schema | Shape |
|--------|-------|
| `AiRiskLevelSchema` | `"L1_READ_ONLY" \| "L2_PROPOSAL" \| "L3_ACTION"` |
| `AiAgentStatusSchema` | `"DRAFT" \| "ACTIVE" \| "DISABLED" \| "DEPRECATED"` |
| `AiModelConfigStatusSchema` | `"ENABLED" \| "DISABLED"` |
| `AiExecutionStatusSchema` | `"QUEUED" \| "RUNNING" \| "WAITING_TOOL" \| "VALIDATING_OUTPUT" \| "COMPLETED" \| "FAILED" \| "CANCELLED" \| "TIMED_OUT"` |
| `AI_FINAL_EXECUTION_STATUSES` | `["COMPLETED", "FAILED", "CANCELLED", "TIMED_OUT"]` |
| `AiProposalStatusSchema` | `"READY_FOR_REVIEW" \| "APPROVED" \| "PARTIALLY_APPROVED" \| "REJECTED" \| "EXPIRED"` |
| `AiErrorCodeSchema` | `"AI_AGENT_NOT_FOUND" \| "AI_AGENT_DISABLED" \| "AI_MODEL_UNAVAILABLE" \| "AI_PROVIDER_ERROR" \| "AI_TIMEOUT" \| "AI_RATE_LIMITED" \| "AI_TOOL_NOT_ALLOWED" \| "AI_TOOL_EXECUTION_FAILED" \| "AI_OUTPUT_PARSE_FAILED" \| "AI_OUTPUT_VALIDATION_FAILED" \| "AI_CONTEXT_ACCESS_DENIED" \| "AI_EXECUTION_CANCELLED" \| "AI_EXECUTION_LIMIT_EXCEEDED"` (FR-050) |
| `AiResourceRefSchema` | `{type: string /^[A-Z][A-Z_]{1,39}$/, id: uuid}` |
| `RequestAiExecutionRequestSchema` | `{agentKey: string(1–63), resource?: AiResourceRef, input?: Record<string, unknown>, idempotencyKey: uuid}`, strict |
| `AiExecutionViewSchema` | `{id, agent: {key, name, version}, status, riskLevel, resource: AiResourceRef\|null, errorCode: AiErrorCode\|null, cancelRequested: boolean, proposalId: uuid\|null, createdAt, startedAt: string\|null, completedAt: string\|null, failedAt: string\|null, durationMs: int\|null, transitions: {from: AiExecutionStatus\|null, to, at}[]}`: **never** provider, model, prompt, input, internal messages |
| `AiExecutionResultSchema` | `{executionId, schemaVersion: int, output: unknown}`: the validated output of an L1 agent |
| `AiExecutionListQuerySchema` | `{status?: AiExecutionStatus, agentKey?: string, cursor?: string(200)}` |
| `AiExecutionPageSchema` | `{items: AiExecutionView[] (without transitions), nextCursor: string\|null}` |
| `AiProposalViewSchema` | `{id, executionId, agent: {key, name, version}, proposalType, target: {type, id: uuid\|null}, status, nature: "SUGGESTION", content: unknown, itemIds: string[], acceptedItemIds: string[]\|null, expiresAt, decidedAt: string\|null, decision: {nature: "HUMAN_DECISION", byUserId}\|null, createdAt}` |
| `AiProposalSummarySchema` | `AiProposalView` without `content` |
| `AiProposalListQuerySchema` | `{status?: AiProposalStatus, cursor?: string(200)}` |
| `AiProposalPageSchema` | `{items: AiProposalSummary[], nextCursor}` |
| `DecideAiProposalRequestSchema` | `{decision: "APPROVE" \| "APPROVE_PARTIALLY" \| "REJECT", acceptedItemIds?: string[] (1–500, unique)}`; `acceptedItemIds` iff `APPROVE_PARTIALLY` (`superRefine`) |
| `AiHealthSchema` | `{checkedAt, modelConfigs: {key, provider, model, status: AiModelConfigStatus, providerStatus: "UP" \| "DOWN" \| "NOT_CONFIGURED"}[]}` |
| `AiMetricsQuerySchema` | `{period: "24h" \| "7d" \| "30d"}` (defaults to `7d`) |
| `AiMetricsSchema` | `{from, to, byAgent: AiAgentMetrics[], byModel: AiModelUsage[]}` |
| `AiAgentMetrics` | `{agentKey, agentVersion: int, promptVersion: int, provider, model, executions, completed, failed, timedOut, cancelled: int, avgDurationMs: int\|null, modelCalls, toolCalls: int}` |
| `AiModelUsage` | `{provider, model, calls: int, inputTokens: int\|null, outputTokens: int\|null, totalTokens: int\|null, estimatedCost: decimal string\|null, currency: string\|null}` |
| `AiAgentOperationsViewSchema` | `{key, name, description, status, version: int, riskLevel, modelConfigKey, promptVersion: int, outputSchemaVersion: int\|null, toolKeys: string[], queued: int, running: int}`: no prompt text, no permission internals |
| `AiModelConfigViewSchema` | `{key, provider, model, status, maxOutputTokens, timeoutMs, hasPrice: boolean, agentKeys: string[]}`: never a credential |
| `ChangeAiAgentStatusRequestSchema` | `{status: "ACTIVE" \| "DISABLED"}` |
| `ChangeAiModelConfigStatusRequestSchema` | `{status: AiModelConfigStatus}` |

## New error codes (`common/errors.ts` and `ErrorCatalog`)

| Code | HTTP | When |
|------|------|------|
| `AI_AGENT_NOT_FOUND` | 404 | unknown key, or an agent that is not `ACTIVE`/`DISABLED` (`DRAFT`, `DEPRECATED`) |
| `AI_AGENT_DISABLED` | 409 | agent `DISABLED` |
| `AI_MODEL_UNAVAILABLE` | 503 | config `DISABLED`, provider missing or without a credential (FR-019) |
| `AI_EXECUTION_LIMIT_EXCEEDED` | 422 | `input` above `AI_MAX_INPUT_KB` (US6-4) |
| `AI_IDEMPOTENCY_KEY_REUSED` | 409 | same `idempotencyKey` with a different request |
| `AI_PROPOSAL_ITEMS_INVALID` | 422 | `acceptedItemIds` empty, unknown or equal to every item |
| `AI_RESOURCE_TYPE_NOT_ACCEPTED` | 422 | `resource.type` not accepted by the agent |
| the other `AI_*` codes of `AiErrorCodeSchema` | — | only as `errorCode` of an execution, the tool result given to the model and logs |

Only the 7 codes above with an HTTP status go into `ErrorCodeSchema` (`common/errors.ts`)
and into the API's `ErrorCatalog`. `AiErrorCodeSchema` (`ai/enums.ts`) holds the 13 codes of
FR-050 used in `AiExecutionView.errorCode`; 4 codes appear in both. The web message catalog
covers the union.

The rate limit reuses `429 RATE_LIMITED` with `Retry-After`.

## Teacher routes

| Method | Path | Permission | Request | Response | Notes |
|--------|------|------------|---------|----------|-------|
| POST | `/ai/executions` | `ia.execucoes.visualizar` + the agent's `requiredPermission` (checked in the service → 403 `FORBIDDEN`) | `RequestAiExecutionRequest` | `202 AiExecutionView` (new) / `200` (same key) | rate limit `RATE_LIMIT_AI_EXECUTIONS_PER_MINUTE` per user, **before** validation; order: agent (404/409) → permission (403) → resource type (422) → resource ownership (404) → config (503) → input size (422) → idempotency (200/409). Never waits for the model (SC-006) |
| GET | `/ai/executions` | `ia.execucoes.visualizar` | `AiExecutionListQuery` | `AiExecutionPage` | own only, newest first, keyset |
| GET | `/ai/executions/:id` | `ia.execucoes.visualizar` | — | `AiExecutionView` | 404 outside the workspace |
| GET | `/ai/executions/:id/result` | `ia.execucoes.visualizar` | — | `AiExecutionResult` | only `COMPLETED` L1 → otherwise `409 INVALID_STATE_TRANSITION`; 404 outside the workspace |
| POST | `/ai/executions/:id/cancel` | `ia.execucoes.visualizar` | `{}` | `AiExecutionView` | `QUEUED` → `CANCELLED`; running → `cancelRequested: true`; already `CANCELLED` → same; other final → 409 |
| GET | `/ai/proposals` | `ia.propostas.revisar` | `AiProposalListQuery` | `AiProposalPage` | own only |
| GET | `/ai/proposals/:id` | `ia.propostas.revisar` | — | `AiProposalView` | 404 outside the workspace |
| POST | `/ai/proposals/:id/decision` | `ia.propostas.revisar` | `DecideAiProposalRequest` | `AiProposalView` | rate limit `RATE_LIMIT_AI_DECISIONS_PER_MINUTE`; same decision again → 200 same; different, expired or decided → 409 `INVALID_STATE_TRANSITION`; items → 422 |

## Operations routes (administrator)

| Method | Path | Permission | Request | Response |
|--------|------|------------|---------|----------|
| GET | `/ai/operations/health` | `ia.operacao.visualizar` | — | `AiHealth` (calls `healthCheck()` of each enabled config's provider, 5 s timeout each, in parallel) |
| GET | `/ai/operations/metrics` | `ia.operacao.visualizar` | `AiMetricsQuery` | `AiMetrics` |
| GET | `/ai/operations/agents` | `ia.operacao.visualizar` | — | `AiAgentOperationsView[]` |
| GET | `/ai/operations/model-configs` | `ia.operacao.visualizar` | — | `AiModelConfigView[]` |
| POST | `/ai/operations/agents/:key/status` | `ia.agentes.gerenciar` | `ChangeAiAgentStatusRequest` | `AiAgentOperationsView` (same status → 200 unchanged; `DRAFT`/`DEPRECATED` → 409; unknown → 404) |
| POST | `/ai/operations/model-configs/:key/status` | `ia.agentes.gerenciar` | `ChangeAiModelConfigStatusRequest` | `AiModelConfigView` |

Disabling an agent cancels its `QUEUED` executions in the same transaction
(`errorCode: AI_AGENT_DISABLED`). Disabling a config makes new requests to its agents
fail with `503 AI_MODEL_UNAVAILABLE`. Executions already queued fail at start with the
same code, without calling the model.

## What the API never returns

It never returns provider credentials (in any route), prompt text, the request `input`
(except to its owner, and even then not in this feature's views), provider error
messages, stack traces, or tool arguments or results. `AiExecutionView` also omits
`provider` and `model` (FR-026). The operations routes also omit `workspaceId`,
`resourceId` and user ids. `006-ai-admin-scan.spec.ts` checks this (SC-007).
