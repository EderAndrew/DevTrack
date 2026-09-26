# Data Model: 008 — AI Gateway com OpenRouter

One new table (`ai_tasks`) and new columns on three 006 tables, in one Prisma migration. No
table is dropped; no data of 006/007 is rewritten except as noted. The circuit state is in
memory only (research G8).

## New table `ai_tasks` (research G2)

What an agent asks the gateway for, and how it is routed. Synced from code at startup under
the 006 advisory lock; the row is mutable (like model configs), its history is the audit trail.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | `gen_random_uuid()` |
| `key` | text | UNIQUE; `^[a-z0-9-]+$` (e.g. `curriculum-extraction`) |
| `primary_model_config_id` | uuid FK → `ai_model_configs` | NOT NULL, `ON DELETE RESTRICT` |
| `fallback_model_config_id` | uuid FK → `ai_model_configs` | NULL, `ON DELETE RESTRICT`; CHECK `<> primary_model_config_id` |
| `parameters` | jsonb | NOT NULL default `{}`; allowlist `temperature`, `top_p`, `effort` (sync validates) |
| `max_output_tokens` | int | NOT NULL, CHECK `> 0` |
| `timeout_ms` | int | NOT NULL, CHECK `> 0` |
| `definition_hash` | text | NOT NULL |
| `created_at`, `updated_at` | timestamptz | |

A task whose primary config is missing from the definitions, or whose model variable is
invalid, is still synced with the configs that exist; its unavailability is computed at
request time (spec FR-008), never by failing the sync.

## `ai_agent_versions` (research G4)

| Change | Rule |
|--------|------|
| + `task_id` uuid FK → `ai_tasks`, NULL, `ON DELETE RESTRICT` | set for versions that declare `taskKey` |
| `model_config_id` becomes NULL | kept for versions synced before 008 (curriculum-agent v1) |
| CHECK `(task_id IS NULL) <> (model_config_id IS NULL)` | exactly one |

The 006 immutability trigger (content frozen once `used_at` is set) also covers `task_id`.
`curriculum-agent` v2 is inserted by the sync with `task_id`; v1 is untouched.

## `ai_executions` (research G5, G18)

| Change | Rule |
|--------|------|
| + `task_key` text NULL | NULL for executions before 008 |
| + `fallback_model_config_id` uuid FK → `ai_model_configs` NULL, `ON DELETE RESTRICT` | route fixed at request |
| + `fallback_used` boolean NOT NULL default `false` | set in the transaction that records the fallback leg |
| `model_config_id` (existing, NOT NULL) | now "the primary of the route" |

## `ai_model_calls` (research G6, G12, G17)

| Change | Rule |
|--------|------|
| + `served_model` text NULL | from the provider's response; NULL on failure |
| + `is_fallback` boolean NOT NULL default `false` | leg of the fallback config |
| + `cost_source` text NULL, CHECK in (`PROVIDER`, `PRICE`) | NULL iff `estimated_cost` is NULL |

One row per leg: a call that falls back writes two rows (primary failed, fallback
succeeded/failed) with consecutive `sequence` values; `ai_executions.model_calls` counts rows,
as in 006.

## Definitions (code, `modules/ai/definitions/types.ts`)

- `TaskDefinition { key; primaryModelConfigKey; fallbackModelConfigKey?; parameters?;
  maxOutputTokens; timeoutMs }` (`defineTask`), and `AiDefinitions.tasks`.
- `AgentDefinition.taskKey` replaces `modelConfigKey`.
- `ModelConfigDefinition` loses `fallbackKeys` (the 006 placeholder); `parameters`,
  `maxOutputTokens` and `timeoutMs` stay (the columns are NOT NULL) and act as the model's
  ceiling: the call uses `min(task, config, execution limit)` for tokens and timeout, and the
  task's parameters.
- `ModelUsage.cost: { amount: string; currency: string } | null`; `ModelResponse` gains
  `servedModel: string | null`.
- Startup checks (`ai-definitions.check.ts`): every agent's `taskKey` exists; a task's config
  keys exist or are reported as unavailable; fallback ≠ primary; no model id starting with
  `openrouter/`.

## Circuit (in memory, research G8)

`Map<configKey, { state: CLOSED | OPEN | HALF_OPEN; failures: number; openUntil: Date | null;
probing: boolean }>` inside the singleton `CircuitBreaker`.

```text
CLOSED --(failures reach threshold)--> OPEN --(openUntil passes, first caller)--> HALF_OPEN
HALF_OPEN --(probe succeeds)--> CLOSED
HALF_OPEN --(probe fails)--> OPEN
CLOSED --(any success)--> CLOSED (failures = 0)
```

Only transient failures count; transitions to OPEN and to CLOSED are audited once each.

## Production data after the migration

- `curriculum-extraction-default` (provider `anthropic`) stays, unreferenced by new versions;
  no provider `anthropic` is registered, so it reads as unavailable in "Operação de IA".
- On first start: `openrouter-default` (and `openrouter-fallback` if set) configs, the
  `curriculum-extraction` task and `curriculum-agent` v2 are synced; the agent keeps its
  ACTIVE/DISABLED status.
