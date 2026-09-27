# Audit Events Contract: 006 — AI Foundation

This adds types to the catalogs of 001, 003 and 004, under the same rules:
- written in the same transaction as the change;
- the table is append-only;
- `metadata` holds only the listed keys (allowlist in `audit-event-types.ts`).

`metadata` must **never** contain:
- prompt text, the request input, model output or proposal content;
- tool arguments or results;
- names or texts of resources;
- provider credentials or provider messages (FR-062).

`audit-coverage.spec.ts` reads this catalog.

The spec's names (FR-062) follow the project convention `entity.action`:

| `type` | Spec name | Actor | Target | `metadata` allowed |
|--------|-----------|-------|--------|--------------------|
| `ai_execution.requested` | `AI_EXECUTION_REQUESTED` | USER | AI_EXECUTION | `agentKey`, `agentVersion`, `promptVersion`, `modelConfigKey`, `taskKey`, `fallbackModelConfigKey` (008), `tier`, `selectionReason` (009), `resourceType`, `riskLevel` |
| `ai_execution.started` | `AI_EXECUTION_STARTED` | SYSTEM | AI_EXECUTION | `claim` |
| `ai_execution.completed` | `AI_EXECUTION_COMPLETED` | SYSTEM | AI_EXECUTION | `durationMs`, `modelCalls`, `toolCalls`, `proposalId` |
| `ai_execution.failed` | `AI_EXECUTION_FAILED` | SYSTEM | AI_EXECUTION | `status` (`FAILED`\|`TIMED_OUT`), `errorCode`, `durationMs`, `modelCalls`, `toolCalls` |
| `ai_execution.cancelled` | `AI_EXECUTION_CANCELLED` | USER \| SYSTEM | AI_EXECUTION | `from`, `errorCode` |
| `ai_execution.cancel_requested` | — | USER | AI_EXECUTION | `from` |
| `ai_tool.called` | `AI_TOOL_CALLED` | SYSTEM | AI_EXECUTION | `toolKey`, `sequence`, `durationMs` |
| `ai_tool.failed` | `AI_TOOL_FAILED` | SYSTEM | AI_EXECUTION | `toolKey`, `sequence`, `status` (`DENIED`\|`FAILED`\|`TIMED_OUT`), `errorCode` |
| `ai_proposal.created` | `AI_PROPOSAL_CREATED` | SYSTEM | AI_PROPOSAL | `executionId`, `agentKey`, `proposalType`, `itemCount` |
| `ai_proposal.approved` | `AI_PROPOSAL_APPROVED` | USER | AI_PROPOSAL | `itemCount` |
| `ai_proposal.partially_approved` | `AI_PROPOSAL_PARTIALLY_APPROVED` | USER | AI_PROPOSAL | `itemCount`, `acceptedCount` |
| `ai_proposal.rejected` | `AI_PROPOSAL_REJECTED` | USER | AI_PROPOSAL | `itemCount` |
| `ai_proposal.expired` | — | SYSTEM | AI_PROPOSAL | — |
| `ai_agent.enabled` | `AI_AGENT_ENABLED` | USER | AI_AGENT | `agentKey`, `version` |
| `ai_agent.disabled` | `AI_AGENT_DISABLED` | USER | AI_AGENT | `agentKey`, `version`, `cancelledExecutions` |
| `ai_model_config.enabled` | equivalent of the model config (FR-062) | USER | AI_MODEL_CONFIG | `configKey`, `provider`, `model` |
| `ai_model_config.disabled` | idem | USER | AI_MODEL_CONFIG | `configKey`, `provider`, `model` |
| `ai_model_config.changed` | — (008) | SYSTEM | AI_MODEL_CONFIG | `configKey`, `provider`, `previousModel`, `model` (registry sync, when a deploy changes the model of an existing config) |
| `ai_model_config.lifecycle_changed` | — (009) | SYSTEM | AI_MODEL_CONFIG | `configKey`, `from`, `to` (registry sync, when a catalog entry's lifecycle changes in code) |
| `ai_circuit.opened` | — (008) | SYSTEM | AI_MODEL_CONFIG | `configKey`, `provider`, `model`, `failures` (own transaction, once per CLOSED/HALF_OPEN → OPEN) |
| `ai_circuit.closed` | — (008) | SYSTEM | AI_MODEL_CONFIG | `configKey`, `provider`, `model` (own transaction, once per HALF_OPEN → CLOSED) |
| `ai_registry.synced` | — | SYSTEM | — | `agents`, `tools`, `modelConfigs`, `catalogModels` (009), `tasks` (008), `newVersions`, `deprecated` (only when something changed) |
| `ai_execution.rate_limited` | — | USER | — | `scope` |
| `ai_execution.fallback_used` | — (008) | SYSTEM | AI_EXECUTION | `primaryConfigKey`, `fallbackConfigKey`, `reason` (`PROVIDER_FAILURE` \| `CIRCUIT_OPEN`), `primaryErrorCode` (same transaction as the fallback leg's `ai_model_calls` row) |

Notes:
- `ai_execution.cancelled`: USER when the teacher cancels, SYSTEM when a disabled agent's queued
  executions are cancelled.
- `ai_execution.requested` is written in the request's transaction, and the worker's
  events in the transaction that changes the status.
- An idempotent repetition (same key, same decision, same status) writes no new event.
- Failed attempts to decide another teacher's proposal are 404 and are not audited, as in
  004 (they would reveal nothing and would only add noise).
