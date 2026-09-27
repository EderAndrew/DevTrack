# Research: 009 — Política de Modelos de IA

Decisions H1–H16. Everything not listed here stays as in 006 (A1–A22), 007 (C1–C20) and 008
(G1–G20).

## H1. Evolve `modules/ai`; no parallel policy module

**Decision**: The policy lives inside `apps/api/src/modules/ai`: the catalog and the task
policies in `definitions/` (code, like agents and tasks since A4/G2), the pure selection in a
new `policy/` folder, persistence and sync in `registry/`, and the calls in `gateway/`. The
008 gateway, OpenRouter provider, prompt registry, output validation, fallback and circuit are
reused.

**Rationale**: the spec forbids recreating the infrastructure; the 006 folders by
responsibility (A3) already have a place for each piece; the 006/007/008 guards pin that
layout.

**Alternatives considered**: a separate `model-policy` Nest module (a second place that knows
model configs, with the risk of two sources of truth).

## H2. Catalog as reviewed code, synced into `ai_model_configs`

**Decision**: `definitions/model-catalog.ts` lists every approved model: key, family, OpenRouter
id, tier, mode (`GENERATION` | `DECISION`), lifecycle, reference price, context window,
capabilities (`structuredOutput`, `tools`, `vision`, `reasoning`), priority. `AiRegistrySync`
writes each entry to `ai_model_configs` (extended with those columns). Concrete ids appear only
in this file. The 008 environment variables `OPENROUTER_DEFAULT_MODEL` and
`OPENROUTER_FALLBACK_MODEL` are removed: models are no longer chosen by deploy variables.

**Rationale**: the catalog must be reviewable and versioned (spec Assumptions) and must be the
only source of models (FR-003); the registry sync already audits changes
(`ai_model_config.changed`, 008) and keeps history per call.

**Alternatives considered**: a catalog edited in the admin screen (free-form editing of models
is what the spec forbids for users and makes review harder); keep the environment variables as
an override (a second path around the catalog).

## H3. Families and modes

**Decision**: The allowlist is a closed list in code: `openai`, `anthropic`, `typesafe`. A
model's family is its OpenRouter vendor prefix, checked at startup against the allowlist. Mode
`DECISION` (Jev) and `GENERATION` (the others) are part of the catalog entry; a task declares
its mode; the selection never mixes them.

Rule: when the model id has a `/`, its prefix must equal the family (always true for
OpenRouter ids); an id without a prefix is accepted only for a family outside the production
allowlist (the tests' `fake`). The production allowlist is pinned by a test to exactly the three
families.

**Rationale**: FR-001, FR-001a; the prefix is how OpenRouter names the vendor, so a model can't
claim a family it doesn't belong to, and no exception by provider name can leak to production.

**Alternatives considered**: family as a free field (could disagree with the id).

## H4. Lifecycle and the 006 status

**Decision**: New column `lifecycle` (`CANDIDATE` | `EVALUATING` | `PRODUCTION` |
`DEPRECATED`), set in the catalog code and synced. The spec's `DISABLED` is the existing 006
`status = DISABLED` (the admin kill switch), which wins over any lifecycle. Promotion
(CANDIDATE → EVALUATING → PRODUCTION) is a code change reviewed in a PR; the sync audits each
lifecycle change as `ai_model_config.lifecycle_changed`. The admin keeps disabling/enabling
(006) and gains the per-task override (H11); no route promotes a model.

**Rationale**: FR-016, FR-018 (no automatic transition); keeps one kill switch instead of two;
promotion needs evidence (H6), which lives in the repository.

**Alternatives considered**: lifecycle editable by the admin (promotion without the evidence
file); a separate `DISABLED` lifecycle value (two ways to switch a model off).

## H5. Task policy replaces the task's fixed route

**Decision**: `TaskDefinition` keeps `key`, `parameters`, `maxOutputTokens`, `timeoutMs` and
replaces `primaryModelConfigKey`/`fallbackModelConfigKey` with: `mode`, `minimumTier`,
`preferredTier`, `maxTier` (escalation ceiling, default = preferred), `allowedFamilies`,
`requiredCapabilities`, `fallback` (`SAME_TIER` | `NONE`), `escalation` (`NONE` |
`ON_OUTPUT_INVALID`), `quality` (metric thresholds, e.g. `{ itemRecall: 0.9,
schemaValidity: 1 }`), `typicalUsage` (input/output tokens for cost estimates) and, for decision
tasks, `minConfidence`. `ai_tasks` stores the policy as JSON with its hash; the columns
`primary_model_config_id` and `fallback_model_config_id` are dropped (the route is chosen per
request, H7, and fixed on the execution as in 008 G5). Startup checks: `minimumTier ≤
preferredTier ≤ maxTier`, families in the allowlist, known capabilities and metrics.

**Rationale**: FR-006; tasks keep being code (G2); the route is a result of the policy, not a
declaration.

**Alternatives considered**: keep the fixed route plus the policy (two sources); per-tier task
variants (more tasks than policies).

## H6. Quality gate: approvals per model × task, backed by committed evaluation evidence

**Decision**: The catalog declares `approvals: [{ taskKey, metrics, evaluatedAt, evidence }]`
per model. `evidence` points at a committed file
`apps/api/test/fixtures/evaluations/<task>/<model-key>.json` written by the on-demand eval
(`EVAL_RECORD=1`), with the golden-set version, the model actually served, the metrics and the
cost. A model serves a task in production only when it is `PRODUCTION`, has an approval for
that task, and the approval's metrics meet the task's `quality` thresholds (checked at
startup; an approval below them is ignored and logged `ai.approval_rejected`). A CI guard
(`009-quality-gate.spec.ts`) checks that each approval matches its evidence file. Approvals are
synced into `ai_model_task_approvals` for the operations view.

**Rationale**: FR-017; the eval runs against the test database, so production can't read its
results from the database; a committed evidence file makes the approval reviewable and the gate
verifiable in CI (constitution XIX).

**Alternatives considered**: approvals stored only in the database by an admin route (no
evidence in production, bypassable); trusting the catalog's metrics without evidence.

## H7. Deterministic selection (`ModelPolicy`)

**Decision**: A pure function `selectRoute(policy, catalog, approvals, override, health)`:

1. models of the catalog whose family is in the allowlist and in the task's `allowedFamilies`,
   whose mode equals the task's, with every `requiredCapability`;
2. usable (status `ENABLED`, provider registered, not refused, circuit not blocking — 008);
3. `PRODUCTION` with a valid approval for the task (H6); `DEPRECATED` only when no
   `PRODUCTION` candidate remains (warned);
4. tier = `preferredTier` (never another tier here);
5. primary = the override if it is among the candidates, else the lowest estimated cost
   (`typicalUsage × reference price`; unknown price after known ones), then `priority`
   (higher first), then key;
6. fallback (when `fallback = SAME_TIER`) = the best remaining candidate of the same tier,
   preferring another family, else the next one.

The result carries a machine reason (`OVERRIDE`, `LOWEST_COST`, `ONLY_CANDIDATE`,
`DEPRECATED_ONLY`) recorded on the execution with the tier. No candidate → the task is
unavailable (`MODEL_UNAVAILABLE`). The same function answers availability (dry run, no probe
taken).

**Rationale**: FR-008–FR-010; quality before cost; determinism is testable and auditable.

**Alternatives considered**: cost only (forbidden); asking a model to choose (forbidden,
FR-011).

## H8. Fallback stays the 008 mechanism, now same-tier

**Decision**: The 008 `ModelGateway` fallback (after retries, once, same deadline, never back)
is unchanged; only the fallback config comes from H7 step 6, so it is always of the same tier
and an allowed family. A fallback to another tier is impossible by construction.

**Rationale**: FR-012; reuse of G6.

## H9. Escalation in the runner, once, on output validation failure

**Decision**: When the final output fails parsing or schema validation and the task's
`escalation = ON_OUTPUT_INVALID` and the current tier `< maxTier` and no escalation happened
and `maxModelCalls` still allows one more logical call, the runner selects a route for the next
tier (H7 with that tier) and repeats the **last logical call** (same request and history) on
it. It records `escalation_used`, `escalation_from_tier`, `escalation_to_tier`,
`escalation_reason = OUTPUT_INVALID` and the escalated config on the execution, marks the legs
(`is_escalation`, `tier`) and audits `ai_execution.escalated`. If the escalated output is also
invalid, the execution fails as in 006. ADVANCED is reachable only when `maxTier = ADVANCED` or
`preferredTier = ADVANCED`. A rejected proposal is not a trigger.

**Rationale**: FR-013–FR-015; one step, bounded by the existing limits; no BASIC → STANDARD →
ADVANCED chain.

**Alternatives considered**: repeating the whole conversation (more calls and tokens); an
LLM-judged quality check (a model deciding about models, FR-011).

## H10. Decision mode (Jev) through the same provider and gateway

**Decision**: `ModelProvider` gains an optional `decide(request, signal)`; `OpenRouterProvider`
implements it on `POST {origin}/api/alpha/decisions` (same key, headers and error mapping as
G13; `state` and `questions` of types `choice`/`score`/`noul`; response `answers`, `usage.cost`,
`model`). `ModelGateway.decide(call)` runs it with the same legs, retries, fallback, circuit and
usage records. Answers are validated against the asked questions (ids, types, options), and an
answer below the task's `minConfidence` (or a noul within the task's uncertainty band) is
returned as `UNDECIDED`. No production task uses decision mode in this feature (spec Q2), so
it is exercised with a reference decision task and the fake provider; Jev enters the catalog as
`CANDIDATE`/BASIC/`DECISION`.

**Rationale**: FR-001a, FR-001b; the provider boundary (006 A15) keeps OpenRouter's routes in
one adapter.

**Alternatives considered**: a separate Jev provider (a second adapter for the same account and
key); leaving decision mode out (the catalog could not hold Jev honestly).

## H11. Administrative override per task

**Decision**: Table `ai_task_overrides` (one row per task). `PUT
/ai/operations/tasks/:key/override` with `{ modelConfigKey }` and `DELETE` of the same path,
permission `ia.agentes.gerenciar`, audited `ai_task_override.set`/`removed`. Accepted only for a
model that H7 steps 1–4 would admit for the task (so never another tier, family or mode); an
override whose model stops qualifying is ignored with the reason recorded (spec US7-4).

**Rationale**: FR-024; operational control without opening model choice to users.

## H12. Initial catalog and the transition of the Curriculum Agent

**Decision**: Initial entries (ids and prices from OpenRouter's public list on 2026-09-27;
refreshed in the catalog, never in the spec):

| Family | Tier | Model | Lifecycle |
|--------|------|-------|-----------|
| anthropic | BASIC | `anthropic/claude-haiku-4.5` | CANDIDATE |
| anthropic | STANDARD | `anthropic/claude-sonnet-5` | CANDIDATE |
| anthropic | ADVANCED | `anthropic/claude-opus-5` | CANDIDATE (the 008 default; no recorded evaluation yet) |
| openai | BASIC | `openai/gpt-6-luna` | CANDIDATE |
| openai | STANDARD | `openai/gpt-6-sol` | CANDIDATE |
| openai | ADVANCED | `openai/gpt-6-astra` | CANDIDATE |
| typesafe | BASIC (decision) | `typesafe/jev-1.13` | CANDIDATE |

All entries start without approvals: the 007 `recorded.json` files hold the answers the fake
provider replays, not a record of which model produced them, so they are not evidence (FR-017,
constitution XIX). `curriculum-extraction` is BASIC (preferred and minimum) from the start,
`maxTier` STANDARD with `escalation = ON_OUTPUT_INVALID`, `fallback = SAME_TIER`. Until the
release gate, the analysis is unavailable in production-like runs of the branch (the automated
suites use the fake catalog), and the branch is not merged. Release gate (quickstart §2): the
on-demand eval runs for the BASIC candidates (the golden set is fictitious, so no private data
leaves; it costs cents and the user authorized it without further confirmation), their evidence is committed, and at least
one BASIC model is approved and promoted. If none meets the 007 thresholds, the STANDARD
candidates are evaluated and the task's `preferredTier` goes to STANDARD with the failing
evidence as justification (spec Assumptions), never silently.

**Rationale**: without an approved BASIC model the policy makes "Preencher com IA" unavailable
by design (edge case "catálogo sem modelo aprovado"); the gate turns that into an evidence step
before release instead of a production regression, and no approval is ever built from answers
without provenance.

**Alternatives considered**: an implicit "use a higher tier until BASIC is approved" rule (the
silent escalation the spec forbids).

## H13. The other seven Curriculum Agent policies

**Decision**: `curriculum-document-reading`, `curriculum-field-completion`,
`curriculum-simple-suggestions`, `curriculum-summary` (BASIC), `curriculum-pedagogical-review`,
`curriculum-restructuring` (STANDARD) and `curriculum-complex-comparison` (ADVANCED) are
registered tasks with no agent. They sync, show in "Operação de IA" as "sem agente" and are
covered by the policy tests; none runs.

**Rationale**: spec Q2 (A). The existing analysis (`curriculum-extraction`) keeps its key, so
the agent stays v2 plus a version bump only if its definition hash changes (the task key does
not).

## H14. Recording tier, family and escalation

**Decision**: `ai_executions` gains `tier`, `selection_reason`, `escalation_used`,
`escalation_from_tier`, `escalation_to_tier`, `escalation_reason`,
`escalation_model_config_id`; `ai_model_calls` gains `tier`, `family` and `is_escalation`. The
existing `model`/`served_model`, cost and fallback columns stay.

**Rationale**: FR-015, FR-020; each call row snapshots what an analysis by tier or family needs,
so later catalog changes don't rewrite history.

## H15. Cost observability

**Decision**: `GET /ai/operations/metrics` adds `byTask`, `byTier` and `byFamily` (calls,
tokens, avg latency, cost, fallbacks, escalations) and keeps `byAgent`/`byModel` (with the
model's tier and family). A new `GET /ai/operations/models` returns the catalog view: family,
tier, mode, lifecycle, status, capabilities, reference price and, per approved task, the quality
metrics next to the average real cost per execution in the period. A new `GET
/ai/operations/tasks` returns each policy, the model it would choose now (and why), the
override and whether an agent uses it.

**Rationale**: FR-020, FR-021, SC-008; all aggregate, no teacher or execution ids (FR-031 of
006).

## H16. Budgets observable only

**Decision**: Optional config `AI_BUDGET_DAILY_USD`, `AI_BUDGET_MONTHLY_USD`,
`AI_BUDGET_PER_USER_MONTHLY_USD`, `AI_BUDGET_PER_AGENT_MONTHLY_USD` (decimal USD; unset = no
budget). Consumption is summed from `ai_model_calls` cost (America/Sao_Paulo days and months).
After each recorded call the recorder checks the affected budgets; the first crossing in a
period writes `ai_budget.exceeded` (scope, period, limit, spent — never a user id) once, deduped
by a unique row in `ai_budget_alerts`. The metrics response carries `budgets` (limit, spent,
exceeded) and, per user, only how many users are over their budget. Nothing is blocked (spec
Q3).

**Rationale**: FR-022, FR-023; the per-execution, per-user and per-agent limits already stop
unbounded consumption.

**Alternatives considered**: blocking (deferred by the clarification); per-user amounts in the
view (would identify teachers).
