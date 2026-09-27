# Data Model: 009 — Política de Modelos de IA

One Prisma migration (`<ts>_ai_model_policy`). Everything not listed keeps its 006–008 shape.

## Enums (new)

| Enum | Values |
|------|--------|
| `ai_model_tier` | `BASIC`, `STANDARD`, `ADVANCED` (ordered) |
| `ai_model_mode` | `GENERATION`, `DECISION` |
| `ai_model_lifecycle` | `CANDIDATE`, `EVALUATING`, `PRODUCTION`, `DEPRECATED` |
| `ai_selection_reason` | `OVERRIDE`, `LOWEST_COST`, `ONLY_CANDIDATE`, `DEPRECATED_ONLY` |

The spec's lifecycle state `DISABLED` is the existing `ai_model_configs.status = DISABLED`
(research H4).

## `ai_model_configs` (changed)

New columns, synced from `definitions/model-catalog.ts`:

| Column | Type | Rules |
|--------|------|-------|
| `family` | text | one of the allowlist (`openai`, `anthropic`, `typesafe`); equals the model id's vendor prefix whenever the id has one (research H3) |
| `tier` | `ai_model_tier` | NOT NULL for catalog entries; NULL only for legacy rows no longer in the catalog |
| `mode` | `ai_model_mode` | default `GENERATION` |
| `lifecycle` | `ai_model_lifecycle` | default `CANDIDATE`; changes audited (`ai_model_config.lifecycle_changed`) |
| `context_window` | int | > 0 |
| `capabilities` | jsonb | `{ structuredOutput, tools, vision, reasoning }` booleans |
| `priority` | int | default 0; higher first on ties |

Legacy rows (e.g. `curriculum-extraction-default`, 007; `openrouter-default`/`openrouter-fallback`,
008) stay for history (FKs from past executions and calls) and are no longer in the catalog, so
the policy never selects them.

CHECK: `mode = 'DECISION'` ⇒ `capabilities->>'structuredOutput' = 'false'` and tools false (a
decision model generates nothing). UNIQUE (`model`) among catalog rows (one tier per model,
spec edge case).

## `ai_tasks` (changed)

| Change | Details |
|--------|---------|
| dropped | `primary_model_config_id`, `fallback_model_config_id` and their CHECK |
| added `policy` | jsonb: `mode`, `minimumTier`, `preferredTier`, `maxTier`, `allowedFamilies`, `requiredCapabilities`, `fallback`, `escalation`, `quality`, `typicalUsage`, `minConfidence?` |
| added `preferred_tier` | `ai_model_tier`, copy of `policy.preferredTier` for queries |

`definition_hash` now covers the policy. Startup checks (research H5) refuse an inconsistent
policy only for that task (task unavailable, `ai.task_unavailable` with reason
`POLICY_INVALID`), never stopping the API (FR-027).

## `ai_model_task_approvals` (new)

Synced from the catalog's `approvals` (research H6); read-only for the application.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `model_config_id` | uuid FK → `ai_model_configs` RESTRICT | |
| `task_id` | uuid FK → `ai_tasks` RESTRICT | |
| `metrics` | jsonb | metric → value, as in the evidence file |
| `evaluated_at` | timestamptz | |
| `evidence` | text | repository path of the evidence file |
| `valid` | boolean | metrics meet the task's `quality` thresholds (computed at sync) |
| `synced_at` | timestamptz | |

UNIQUE (`model_config_id`, `task_id`). A removed approval is deleted by the sync (it holds no
history of its own; the catalog file's git history and the audit event
`ai_model_config.lifecycle_changed` do).

## `ai_task_overrides` (new)

| Column | Type | Rules |
|--------|------|-------|
| `task_id` | uuid PK, FK → `ai_tasks` RESTRICT | one override per task |
| `model_config_id` | uuid FK → `ai_model_configs` RESTRICT | must qualify for the task (research H11) |
| `set_by_user_id` | uuid FK → `users` | ADMIN with `ia.agentes.gerenciar` |
| `set_at` | timestamptz | |

## `ai_executions` (changed)

| Column | Type | Rules |
|--------|------|-------|
| `tier` | `ai_model_tier` NULL | NULL for pre-009 rows |
| `selection_reason` | `ai_selection_reason` NULL | |
| `escalation_used` | boolean default false | |
| `escalation_from_tier`, `escalation_to_tier` | `ai_model_tier` NULL | both set iff `escalation_used`; `to > from` |
| `escalation_reason` | text NULL | `OUTPUT_INVALID` (only value for now) |
| `escalation_model_config_id` | uuid FK NULL | the escalated primary |

CHECK: `escalation_used` ⇔ from/to/reason/config all NOT NULL.

## `ai_model_calls` (changed)

| Column | Type | Rules |
|--------|------|-------|
| `tier` | `ai_model_tier` NULL | tier of the config the leg called |
| `family` | text NULL | family of that config |
| `is_escalation` | boolean default false | the leg belongs to the escalated call |

## `ai_budget_alerts` (new)

| Column | Type | Rules |
|--------|------|-------|
| `scope` | text | `DAILY`, `MONTHLY`, `PER_AGENT:<agentKey>`, `PER_USER` |
| `period_start` | date | São Paulo day or month start |
| `subject_hash` | text | HMAC of the user or agent (never the id in clear); `-` for system scopes |
| `created_at` | timestamptz | |

PK (`scope`, `period_start`, `subject_hash`): the first crossing writes the row and the audit
event in one transaction; later crossings in the period find the row and write nothing.

## Definitions (code, `modules/ai/definitions/`)

```ts
type ModelTier = "BASIC" | "STANDARD" | "ADVANCED";

interface CatalogModel {                       // model-catalog.ts
  key: string; family: "openai" | "anthropic" | "typesafe"; model: string;
  tier: ModelTier; mode: "GENERATION" | "DECISION"; lifecycle: Lifecycle;
  price?: { inputPerMTok: string; outputPerMTok: string; currency: "USD" };
  contextWindow: number; capabilities: Capabilities; priority?: number;
  maxOutputTokens: number; timeoutMs: number;
  approvals?: { taskKey: string; metrics: Record<string, number>; evaluatedAt: string; evidence: string }[];
}

interface TaskDefinition {                     // replaces the 008 route fields
  key: string; mode: "GENERATION" | "DECISION";
  minimumTier: ModelTier; preferredTier: ModelTier; maxTier?: ModelTier;
  allowedFamilies: Family[]; requiredCapabilities: (keyof Capabilities)[];
  fallback: "SAME_TIER" | "NONE"; escalation: "NONE" | "ON_OUTPUT_INVALID";
  quality: Record<string, number>; typicalUsage: { inputTokens: number; outputTokens: number };
  minConfidence?: number;                      // DECISION only
  parameters?: Record<string, number | string | boolean>; maxOutputTokens: number; timeoutMs: number;
}
```

`AgentDefinition` is unchanged (it names only `taskKey`).

## Production data after the migration

- The 008 rows `openrouter-default`/`openrouter-fallback` stay unreferenced by new executions.
- The catalog's seven entries (research H12) are synced, all `CANDIDATE` and without approvals
  until the release gate records real evaluations and promotes at least one BASIC model for
  `curriculum-extraction` (before the merge).
- Eight curriculum tasks are synced; only `curriculum-extraction` has an agent.
- Existing executions keep `tier` NULL and their recorded model; the metrics show them under
  "sem nível".
