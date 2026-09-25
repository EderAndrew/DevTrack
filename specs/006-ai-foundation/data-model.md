# Data Model: 006 — AI Foundation

This extends the models of 001, 003 and 004. It adds one Prisma migration (`ai_foundation`)
plus SQL for `CHECK`s, partial indexes, immutability triggers and the new permissions. Every
table uses the `ai_` prefix (research A1). No existing table changes.

Models in the schema after this feature (pinned by `domain-boundary.spec.ts`):
- From 001, 003 and 004: unchanged.
- New in 006: **`AiModelConfig`**, **`AiAgent`**, **`AiAgentVersion`**, **`AiPromptVersion`**,
  **`AiOutputSchemaVersion`**, **`AiTool`**, **`AiAgentTool`**, **`AiExecution`**,
  **`AiExecutionTransition`**, **`AiExecutionOutput`**, **`AiModelCall`**, **`AiToolCall`**,
  **`AiProposal`**, **`AiEvaluationCase`**, **`AiEvaluationResult`**.

Pedagogical content lives in only three columns: `ai_execution_outputs.output`,
`ai_proposals.payload` and `ai_evaluation_cases.expected`. The prompt text
(`ai_prompt_versions.system_instructions`) comes from code and is never returned by an
endpoint. The operational queries (research A20) never select these columns.

## New enums

| Enum (Prisma → SQL) | Values |
|---------------------|--------|
| `AiAgentStatus` → `ai_agent_status` | `DRAFT`, `ACTIVE`, `DISABLED`, `DEPRECATED` |
| `AiRiskLevel` → `ai_risk_level` | `L1_READ_ONLY`, `L2_PROPOSAL`, `L3_ACTION` (L3 blocked by `CHECK`) |
| `AiExecutionMode` → `ai_execution_mode` | `ASYNC` |
| `AiPromptStatus` → `ai_prompt_status` | `DRAFT`, `ACTIVE`, `DEPRECATED` |
| `AiModelConfigStatus` → `ai_model_config_status` | `ENABLED`, `DISABLED` |
| `AiToolStatus` → `ai_tool_status` | `ENABLED`, `DISABLED` |
| `AiExecutionStatus` → `ai_execution_status` | `QUEUED`, `RUNNING`, `WAITING_TOOL`, `VALIDATING_OUTPUT`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT` |
| `AiExecutionStep` → `ai_execution_step` | `CONTEXT_RESOLVED`, `MODEL_CALL`, `TOOL_CALL`, `OUTPUT_VALIDATION`, `PROPOSAL_CREATED` |
| `AiCallStatus` → `ai_call_status` | `SUCCEEDED`, `DENIED`, `FAILED`, `TIMED_OUT` (`DENIED` only for tool calls) |
| `AiProposalStatus` → `ai_proposal_status` | `READY_FOR_REVIEW`, `APPROVED`, `PARTIALLY_APPROVED`, `REJECTED`, `EXPIRED` |
| `AiEvaluationCaseStatus` → `ai_evaluation_case_status` | `ACTIVE`, `RETIRED` |

The `error_code` columns are `text` with `CHECK (error_code ~ '^AI_[A-Z_]+$')`; the values
are the `AiErrorCode` list of [contracts/http-api.md](./contracts/http-api.md), enforced by
the contract schema. They are not a Prisma enum, because the list grows with each agent's
spec.

## AiModelConfig (`ai_model_configs`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `key` | text UNIQUE | `^[a-z0-9][a-z0-9-]{1,62}$`, from code |
| `provider` | text | provider key registered in `AI_DEFINITIONS.providers` |
| `model` | text | provider's model name |
| `status` | `AiModelConfigStatus` | initial value from code; afterwards changed only by `ia.agentes.gerenciar` |
| `parameters` | jsonb | generation parameters when supported (e.g. `temperature`); `{}` by default |
| `maxOutputTokens` | int | `CHECK > 0` |
| `timeoutMs` | int | `CHECK BETWEEN 1000 AND 600000` |
| `inputPricePerMTok`, `outputPricePerMTok` | numeric(12,6)? | both or neither (`CHECK`) |
| `currency` | char(3)? | required when a price is set (`CHECK`) |
| `definitionHash` | text | SHA-256 of the definition in code |
| `createdAt`, `updatedAt` | timestamptz | |

It never holds a credential (FR-018). A config's definition can change in code (model,
timeout, price) while `status` is kept. Executions keep `provider` and `model` in their own
columns (US8-1).

## AiAgent (`ai_agents`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `key` | text UNIQUE | stable identity, e.g. `curriculum-agent` (future) |
| `name`, `description` | text | name 1–120, description ≤ 1000 |
| `status` | `AiAgentStatus` | see transitions |
| `currentVersionId` | uuid FK → `ai_agent_versions` (Restrict), deferrable | the version new executions use |
| `createdAt`, `updatedAt` | timestamptz | |

## AiAgentVersion (`ai_agent_versions`)

Snapshot of a definition; insert-only for content.

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `agentId` | uuid FK → `ai_agents` (Restrict) | |
| `version` | int | `CHECK > 0`; `UNIQUE (agent_id, version)` |
| `riskLevel` | `AiRiskLevel` | `CHECK (risk_level <> 'L3_ACTION')` (FR-006) |
| `executionMode` | `AiExecutionMode` | `ASYNC` |
| `requiredPermission` | text FK → `permissions.key` (Restrict) | the permission that executes the agent |
| `promptVersionId` | uuid FK → `ai_prompt_versions` (Restrict) | |
| `outputSchemaVersionId` | uuid? FK → `ai_output_schema_versions` (Restrict) | required when `risk_level = 'L2_PROPOSAL'` (`CHECK`) |
| `modelConfigId` | uuid FK → `ai_model_configs` (Restrict) | reference config |
| `resourceTypes` | text[] | resource types accepted as target; may be empty |
| `proposalType` | text? | required iff L2 (`CHECK`) |
| `limits` | jsonb | only values lower than the global ones (checked at sync) |
| `onToolDenied` | text | `continue` \| `fail` (`CHECK`) |
| `definitionHash` | text | |
| `usedAt` | timestamptz? | set by the first execution; afterwards the content is immutable (trigger) |
| `createdAt` | timestamptz | |

## AiPromptVersion (`ai_prompt_versions`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `agentId` | uuid FK → `ai_agents` (Restrict) | |
| `key` | text | e.g. `reference-summary`; `UNIQUE (agent_id, key, version)` |
| `version` | int | `CHECK > 0` |
| `systemInstructions` | text | from code; never returned by any endpoint and never logged |
| `contentHash` | text | SHA-256 |
| `status` | `AiPromptStatus` | from code |
| `usedAt` | timestamptz? | trigger: with `used_at` set, `UPDATE` of `system_instructions`/`content_hash` raises (FR-010) |
| `createdAt`, `updatedAt` | timestamptz | |

## AiOutputSchemaVersion (`ai_output_schema_versions`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `agentId` | uuid FK → `ai_agents` (Restrict) | `UNIQUE (agent_id, version)` |
| `version` | int | `CHECK > 0` |
| `jsonSchema` | jsonb | `z.toJSONSchema` of the Zod schema in code; the Zod schema itself validates |
| `schemaHash` | text | |
| `usedAt` | timestamptz? | same immutability trigger |
| `createdAt` | timestamptz | |

## AiTool (`ai_tools`) and AiAgentTool (`ai_agent_tools`)

| `ai_tools` field | Type | Rules |
|------------------|------|-------|
| `id` | uuid PK | |
| `key` | text UNIQUE | |
| `name`, `description` | text | |
| `riskLevel` | `AiRiskLevel` | `CHECK (risk_level = 'L1_READ_ONLY')` in this feature |
| `timeoutMs` | int | `CHECK BETWEEN 100 AND 60000` |
| `status` | `AiToolStatus` | |
| `requiredPermission` | text FK → `permissions.key` | |
| `resourceType` | text? | the resource the tool reads |
| `inputJsonSchema` | jsonb | |
| `outputFields` | text[] | the minimal fields it returns (FR-036) |
| `definitionHash` | text | |
| `createdAt`, `updatedAt` | timestamptz | |

`ai_agent_tools (agent_version_id FK Restrict, tool_id FK Restrict)`, with PK on both
columns, is the allowlist of an agent version (FR-034). A tool outside it is denied, with
no wildcard.

## AiExecution (`ai_executions`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | the `executionId` |
| `workspaceId` | uuid FK → `users.id` (Restrict) | the session teacher (A2) |
| `requestedByUserId` | uuid FK → `users.id` (Restrict) | equals `workspace_id` in this feature (`CHECK`) |
| `agentVersionId` | uuid FK → `ai_agent_versions` (Restrict) | |
| `agentKey` | text | denormalized for metrics and logs |
| `agentVersion` | int | |
| `promptVersionId` | uuid FK → `ai_prompt_versions` (Restrict) | |
| `promptVersion` | int | |
| `outputSchemaVersionId` | uuid? FK | |
| `modelConfigId` | uuid FK → `ai_model_configs` (Restrict) | |
| `provider`, `model` | text | copied at request; the ones actually used (US8-3) |
| `riskLevel` | `AiRiskLevel` | copied from the version |
| `resourceType`, `resourceId` | text?, uuid? | both or neither (`CHECK`) |
| `input` | jsonb | the request input; ≤ `AI_MAX_INPUT_KB` (checked before insert); pedagogical, owner-only, never logged |
| `status` | `AiExecutionStatus` | defaults to `QUEUED` |
| `step` | `AiExecutionStep`? | diagnostic within `RUNNING` (A8) |
| `errorCode` | text? | `AI_*`; `NOT NULL` iff status ∈ {FAILED, TIMED_OUT, CANCELLED} |
| `modelCalls`, `toolCalls`, `claims` | int | defaults to 0; `claims` = times the worker took the execution (retries of a model call are in `ai_model_calls.attempts`) |
| `claimToken` | uuid? | current claim (A6) |
| `leaseExpiresAt` | timestamptz? | |
| `deadlineAt` | timestamptz | `created_at + total timeout` (A9) |
| `cancelRequestedAt` | timestamptz? | cancellation request while running (A10) |
| `correlationId` | text | request id of the HTTP request |
| `idempotencyKey` | uuid | `UNIQUE (requested_by_user_id, idempotency_key)` |
| `requestHash` | text | SHA-256 of the canonical request (A11) |
| `createdAt` | timestamptz | = queued at |
| `startedAt` | timestamptz? | first `RUNNING` |
| `finishedAt` | timestamptz? | `NOT NULL` iff final status (`CHECK`) |
| `durationMs` | int? | `finished_at − created_at`, set with `finished_at` |

Indexes:
- `(status, created_at) WHERE status = 'QUEUED'`: claim;
- `(deadline_at) WHERE status NOT IN (finals)`: deadline sweep;
- `(workspace_id, created_at DESC, id)`: the teacher's list;
- `(agent_version_id, created_at)` and `(created_at)`: metrics;
- `(finished_at) WHERE finished_at IS NOT NULL`: retention.

## AiExecutionTransition (`ai_execution_transitions`)

`id bigserial`, `execution_id` (FK Cascade), `from_status` (`AiExecutionStatus`?, `NULL`
for the creation row), `to_status`, `occurred_at`. Insert-only (US1-2). Index
`(execution_id, id)`.

## AiExecutionOutput (`ai_execution_outputs`)

`execution_id` uuid PK (FK Cascade), `output_schema_version_id` (FK), `output` jsonb (the
validated result of an **L1** agent), `created_at`. Written in the same transaction as
`COMPLETED`. Owner-only. For L2 agents the result lives in the proposal instead.

## AiModelCall (`ai_model_calls`)

The "Uso de IA" of the spec: one row per call to the model (A16).

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `executionId` | uuid FK (Cascade) | `UNIQUE (execution_id, sequence)` |
| `sequence` | int | 1.. `AI_MAX_MODEL_CALLS` |
| `modelConfigId` | uuid FK | |
| `provider`, `model` | text | |
| `status` | `AiCallStatus` | `SUCCEEDED`, `FAILED`, `TIMED_OUT` |
| `attempts` | int | `CHECK BETWEEN 1 AND 1 + max retries` |
| `errorCode` | text? | AI_* |
| `startedAt` | timestamptz | = `recordedAt` |
| `durationMs` | int | |
| `inputTokens`, `outputTokens`, `totalTokens` | int? | only if reported by the provider |
| `estimatedCost` | numeric(14,6)? | only with tokens and a price |
| `currency` | char(3)? | with `estimated_cost` |

Index `(started_at)` for the usage metrics.

## AiToolCall (`ai_tool_calls`)

`id` uuid PK, `execution_id` (FK Cascade), `sequence` int (`UNIQUE (execution_id,
sequence)`), `tool_key` text (the requested key, even if unknown), `tool_id` uuid? FK (null
if unknown), `status` (`AiCallStatus`), `error_code` text?, `started_at`, `completed_at`,
`duration_ms`. **No arguments and no result** (FR-037).

## AiProposal (`ai_proposals`)

| Field | Type | Rules |
|-------|------|-------|
| `id` | uuid PK | |
| `workspaceId` | uuid FK → `users.id` (Restrict) | |
| `executionId` | uuid FK → `ai_executions` (Cascade) UNIQUE | one proposal per execution |
| `agentVersionId` | uuid FK | |
| `agentKey` | text | |
| `proposalType` | text | from the agent version |
| `targetResourceType`, `targetResourceId` | text, uuid? | type required |
| `payload` | jsonb | validated output; immutable (trigger, FR-047) |
| `itemIds` | text[] | ids that the agent's schema defines, for partial approval |
| `acceptedItemIds` | text[]? | `NOT NULL` iff `PARTIALLY_APPROVED` (`CHECK`) |
| `status` | `AiProposalStatus` | defaults to `READY_FOR_REVIEW` |
| `expiresAt` | timestamptz | `created_at + AI_PROPOSAL_TTL_DAYS` |
| `decidedAt` | timestamptz? | `NOT NULL` iff status ∈ {APPROVED, PARTIALLY_APPROVED, REJECTED, EXPIRED} |
| `decidedByUserId` | uuid? FK → `users.id` | `NOT NULL` iff APPROVED, PARTIALLY_APPROVED or REJECTED |
| `createdAt`, `updatedAt` | timestamptz | |

Indexes:
- `(workspace_id, status, created_at DESC, id)`: list;
- `(expires_at) WHERE status = 'READY_FOR_REVIEW'`: expiry.

## AiEvaluationCase (`ai_evaluation_cases`) and AiEvaluationResult (`ai_evaluation_results`)

**`ai_evaluation_cases`:**
- `id`;
- `agent_id` (FK Restrict);
- `key` and `version`, with `UNIQUE (agent_id, key, version)`;
- `input_ref` text: a fixture path or an id, never content copied from a teacher;
- `expected` jsonb: the expected characteristics;
- `status` (`AiEvaluationCaseStatus`);
- `created_at`.

**`ai_evaluation_results`:**
- `id`;
- `case_id` (FK Restrict);
- `agent_version_id`, `prompt_version_id` and `model_config_id` (FKs Restrict);
- `provider` and `model`;
- `passed` boolean;
- `metrics` jsonb: numbers only, validated by Zod `record<string, number>`;
- `ran_at`.

Both tables are insert-only. Written through `AiEvaluationStore` (FR-064); there are no
endpoints.

## State transitions

```text
Execution (ai-execution.state-machine.ts; 409 INVALID_STATE_TRANSITION through the API):
  QUEUED            → RUNNING | CANCELLED | TIMED_OUT
  RUNNING           → WAITING_TOOL | VALIDATING_OUTPUT | FAILED | CANCELLED | TIMED_OUT
  WAITING_TOOL      → RUNNING | FAILED | CANCELLED | TIMED_OUT
  VALIDATING_OUTPUT → COMPLETED | FAILED | CANCELLED | TIMED_OUT
  COMPLETED, FAILED, CANCELLED, TIMED_OUT: final

Proposal (ai-proposal.state-machine.ts):
  READY_FOR_REVIEW → APPROVED | PARTIALLY_APPROVED | REJECTED | EXPIRED
  others: final

Agent: DRAFT → ACTIVE ⇄ DISABLED;  any → DEPRECATED (code only)
  API (ia.agentes.gerenciar): only ACTIVE ⇄ DISABLED; others → 409
Model config: ENABLED ⇄ DISABLED
Prompt: DRAFT → ACTIVE → DEPRECATED (code only)
```

## Invariants

1. Only the foundation writes to `ai_*`, and no `ai_*` code writes to a domain table
   (FR-044). `006-ai-boundary.spec.ts` checks that `modules/ai` never calls
   `create/update/delete` on non-`ai` Prisma models.
2. An execution's `workspace_id` equals its `requested_by_user_id` and its proposal's
   `workspace_id` (`CHECK` + trigger on proposal insert).
3. `COMPLETED` of an L2 execution ⇔ exactly one proposal. `FAILED`, `TIMED_OUT` or
   `CANCELLED` ⇒ no proposal and no output (SC-003). Both are written in the same
   transaction as the status change, conditional on the claim.
4. A version used by an execution (`used_at` set) never changes content (FR-010).
5. Disabling an agent cancels its `QUEUED` executions in the same transaction (FR-051).
6. No column of `ai_executions`, `ai_model_calls`, `ai_tool_calls`, `ai_model_configs` or
   the audit metadata holds a credential, a prompt text or model output.

## Migration

`<ts>_ai_foundation`:
- 11 enums and 15 tables;
- `CHECK`s, the partial indexes above;
- triggers `ai_version_immutable()` (prompt, output schema and agent version) and
  `ai_proposal_payload_immutable()`, plus an append-only trigger on
  `ai_execution_transitions`;
- data: permissions `ia.execucoes.visualizar` and `ia.propostas.revisar` → TEACHER,
  `ia.operacao.visualizar` and `ia.agentes.gerenciar` → ADMIN, with `INSERT … ON CONFLICT DO
  NOTHING` as in 004.

The reference agents of the tests require permissions that already exist
(`ia.execucoes.visualizar`, and `ia.agentes.gerenciar` for the 403 case). No test creates
permissions or changes roles. `resetDb` also empties the registry tables, so AI tests
re-sync them with `resetAiDb` (research A4).
