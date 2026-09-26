# Research: 008 — AI Gateway com OpenRouter

Decisions G1–G20. Each one: **Decision**, **Rationale**, **Alternatives considered**. The
006 decisions (A1–A22) and the 007 decisions (C1–C20) still hold unless a G decision replaces
one explicitly.

## G1. Evolve `modules/ai`; no parallel "AI Gateway" module

**Decision**: The "AI Gateway" of the request is the existing 006 pipeline: `ModelGateway`
(provider, timeout, retries, error normalization) driven by `AiExecutionRunner` (limits, tools,
structured output, usage, audit). This feature extends those classes; it does not add a
`domain/application/infrastructure` module nor an `AiGateway.generate()` facade.

**Rationale**: every responsibility listed in the request (§1) already has one owner in
`modules/ai` (research A3: folders by responsibility). A second entry point would duplicate
the registry, the limits and the audit, and the 006 boundary guard already keeps providers
under `gateway/providers/**`. Agents already never call a provider (006 FR-012).

**Alternatives considered**: a new Clean-Architecture module wrapping the 006 one (two
gateways, constitution IX); rewriting `modules/ai` into layers (large churn with no behavior
gain, and the 006/007 suites pin the current structure).

## G2. Task as a registry entity (`ai_tasks`)

**Decision**: A new definition kind, `TaskDefinition { key, primaryModelConfigKey,
fallbackModelConfigKey?, parameters, maxOutputTokens, timeoutMs }`, lives in code next to the
agents and is synced by `AiRegistrySync` into a new table `ai_tasks`. `AgentDefinition` replaces
`modelConfigKey` with `taskKey`. Model configs keep only what a model is: provider, model,
status, price.

**Rationale**: the request (§4) puts generation settings on the task and lets the agent state
only the task; keeping tasks as code follows research A4 (definitions are code, reviewed and
versioned) and keeps the sync, the hash and the startup checks in one place.

**Alternatives considered**: routing table in environment variables only (no history, no
review); `fallbackKeys` on the model config (the 006 placeholder: it ties fallback to a model
instead of a task, so two tasks sharing a model could not differ).

## G3. Models chosen by environment; configs are generic per provider

**Decision**: Production registers two model configs built from the environment:
`openrouter-default` (`OPENROUTER_DEFAULT_MODEL`) and, when set, `openrouter-fallback`
(`OPENROUTER_FALLBACK_MODEL`). The `curriculum-extraction` task points at them. Changing a
model = changing the variable and restarting (spec FR-007). The sync updates the config row in
place (model configs are mutable, 006) and writes a new audit type `ai_model_config.changed`
(`configKey`, `provider`, `previousModel`, `model`) whenever the model of an existing config
changes; each `ai_model_calls` row already snapshots provider and model.

**Rationale**: FR-007 asks for model changes without code changes; one task today does not
justify a routing file. The audit row plus the per-call snapshot give the "new version"
history of FR-007 without making configs immutable (which would stop the startup on every
model change, as used agent versions do).

**Alternatives considered**: per-task variables (`AI_TASK_<KEY>_MODEL`: premature with one
task); config versions table (more schema for the same history).

## G4. Curriculum Agent v2, same behavior

**Decision**: `curriculum-agent` goes to version 2: same prompt v1, same output schema v1,
same tools, limits and proposal hook; only `modelConfigKey` → `taskKey:
"curriculum-extraction"`. `ai_agent_versions` gains `task_id` (nullable FK) and
`model_config_id` becomes nullable, with a CHECK that exactly one is set (v1 keeps its model
config; v2 has a task). The agent's operational status (ACTIVE/DISABLED) is per agent and is
kept.

**Rationale**: the used v1 is immutable (006 trigger); a changed definition must be a new
version (006 FR-007, FR-010). The prompt and schema versions don't change, so 007's rules and
the golden set stay the same (spec FR-021).

**Alternatives considered**: excluding the routing from the agent hash (hides a behavior
change from the version history); keeping `modelConfigKey` and deriving the task (the agent
would still name a model config).

## G5. The execution fixes its route when requested

**Decision**: `POST /ai/executions` (and the 007 request, which goes through it) resolves the
agent's task and stores on the execution: `task_key`, `model_config_id` (the primary, existing
column) and `fallback_model_config_id` (new, nullable). The runner re-checks both at start (006
FR-032): a disabled or unregistered primary is skipped in favor of an enabled fallback; with
neither, `AI_MODEL_UNAVAILABLE`. Availability (007 `availability`) is "AVAILABLE" when the
primary **or** the fallback is usable and its circuit allows a call.

**Rationale**: matches 006, where the agent version and model config are fixed at request
(006 US8-1); the spec edge case was aligned with this (Clarifications, plan).

**Alternatives considered**: resolve at start (a restart between request and start would
silently change the model of a queued execution).

## G6. Fallback lives in `ModelGateway.call`

**Decision**: `GatewayCall` takes a `route: { primary, fallback | null }` instead of one
config. The gateway runs the primary with the current retry loop; if it ends in a transient
category (`UNAVAILABLE`, `RATE_LIMITED`, `TIMEOUT` of the call) after its retries, or the
primary's circuit is open, it runs the fallback once, with the same retry loop, under the same
deadline and signal. It never returns to the primary. It returns a `GatewayResult` with the
response and `legs: GatewayLeg[]` (config, status, attempts, durationMs, errorCode, usage,
servedModel, isFallback), one per config tried. Non-transient categories (`INVALID_REQUEST`,
`AUTH`, `UNKNOWN`), cancellation and the execution deadline end the call with no fallback.

**Rationale**: spec FR-010/FR-011; the retry policy (`isTransient`) is already the definition
of "recoverable". Returning legs keeps recording in the runner (one `ai_model_calls` row per
leg, 006 FR-059) and keeps the gateway free of database access.

**Alternatives considered**: fallback in the runner (spreads provider-failure logic across two
classes); OpenRouter's own `models: [...]` fallback (the gateway could not record, audit or
bound it; forbidden by spec FR-004).

## G7. Structured-output failures never fall back

**Decision**: Output validation stays in the runner, after the gateway returns. An invalid
output from either model ends the execution `AI_OUTPUT_VALIDATION_FAILED` (006). A truncated
answer (`finish_reason: "length"`) or a refusal/`content_filter` becomes an empty output, which
the validator fails, as the Anthropic adapter did (007 research C3).

**Rationale**: spec FR-010 and edge case 1; retrying the same input on another model would
spend tokens on an input that may be adversarial.

**Alternatives considered**: fallback on invalid output (unbounded cost with prompt injection;
explicitly excluded by the request §5).

## G8. Circuit breaker: in-process, per model config

**Decision**: `CircuitBreaker` (in `gateway/`, pure, injectable clock) keeps per model-config
key: `state` (`CLOSED` | `OPEN` | `HALF_OPEN`), consecutive transient failures, `openUntil`.
A leg that ends in a transient failure (after its retries) counts one failure; any success
resets. At `AI_CIRCUIT_FAILURE_THRESHOLD` (default 5) it opens for
`AI_CIRCUIT_OPEN_SECONDS` (default 60). After that, the first caller gets the only probe
(`HALF_OPEN`); success closes, failure reopens. Non-transient failures don't count. Transitions
emit `ai_circuit.opened` / `ai_circuit.closed` audit events (actor SYSTEM, own transaction,
metadata `configKey`, `provider`, `model`, `failures`), written once per transition. State is
not persisted and is per API instance.

**Rationale**: spec FR-013, SC-007; no new infrastructure (constitution IX, "no Redis"). An
open circuit with a fallback turns a slow failing call into an immediate fallback.

**Alternatives considered**: persisted circuit in PostgreSQL (shared, but a DB write on every
failure and a hot row); an npm circuit-breaker library (a dependency for ~60 lines).

## G9. Global per-agent limit on the existing rate-limit table

**Decision**: `AiExecutionsService.request` calls `RateLimitService.hit("ai-agent", agentKey,
{ limit: AI_AGENT_EXECUTIONS_PER_HOUR (default 100), windowSec: 3600 })` after the per-user
limits and before creating the execution. When blocked: `429 RATE_LIMITED` with
`Retry-After`, and the existing `ai_execution.rate_limited` audit event with `scope:
"agent"`. A replayed request (same idempotency key, or the 007 "one active per document") is
answered before the hit, so it doesn't count.

**Rationale**: spec FR-015; `RateLimitService` is already PostgreSQL-backed, so the limit holds
across instances. Reusing the audit type keeps the audit contract small.

**Alternatives considered**: a token budget per agent (needs the cost before the call; the
per-execution token and call limits of 006 already bound one execution).

## G10. OpenRouter provider over native `fetch`

**Decision**: `OpenRouterProvider implements ModelProvider` in
`gateway/providers/openrouter.provider.ts`, calling `POST {baseUrl}/chat/completions` with
Node's `fetch` (no SDK, no new dependency). Default base URL
`https://openrouter.ai/api/v1`, a constant in that file (the 006 boundary scan allows provider
hosts only under `providers/**`). Headers: `Authorization: Bearer <key>`, `Content-Type`,
`X-Title: DevTrack`. No `HTTP-Referer`. The key is held in a private field and never
serialized.

**Rationale**: OpenRouter's API is OpenAI-compatible HTTP; the SDKs add a dependency and
their own retries. `fetch` with the gateway's `AbortSignal` gives the timeouts of 006.

**Alternatives considered**: `openai` SDK pointed at OpenRouter (dependency, hidden retries,
and the boundary guard lists it as a provider SDK); `@openrouter/*` SDK (same).

## G11. Request body

**Decision**: `model`; `messages`: `system`, then one `user` message with the context JSON
and the untrusted blocks (the 006 envelope, unchanged), then per history entry an `assistant`
message with `tool_calls` (`id: call_<n>`, `type: "function"`, `function.arguments` as JSON
string) and one `tool` message per result (`tool_call_id`); `max_tokens`; allowlisted
parameters from the task (`temperature`, `top_p`, `reasoning.effort`); `tools` as
`{ type: "function", function: { name, description, parameters, strict: true } }` with the
006 JSON Schema sanitized for strict mode (reuse `json-schema-sanitize.ts`), `tool_choice:
"auto"`; for structured output `response_format: { type: "json_schema", json_schema: { name:
"output", strict: true, schema } }`; `provider: { data_collection: "deny", zdr: true,
require_parameters: true }`; `usage: { include: true }`; `stream: false`. Never `models`,
`route`, or a model id starting with `openrouter/` (config rejected at startup, spec FR-008).

**Rationale**: `data_collection: "deny"` and `zdr` implement spec FR-004 (no retention or
training); `require_parameters` makes OpenRouter route only to endpoints that support
`response_format` and `tools` (spec FR-008); OpenRouter may still switch between *endpoints of
the same model*, which is not a model change.

**Alternatives considered**: `allow_fallbacks: false` (pins one upstream endpoint and lowers
availability without protecting anything the other flags don't).

## G12. Response mapping and served model

**Decision**: `choices[0].finish_reason`: `tool_calls` → `{kind: "tool_calls"}` with each
call's `arguments` parsed from JSON (unparseable → `undefined`, which the tool executor's
strict schema refuses); `stop` → text output; `length`, `content_filter`, `error` → empty
output (G7). `usage.prompt_tokens`/`completion_tokens`/`total_tokens` → `ModelUsage`;
`usage.cost` (USD) → `ModelUsage.cost`. `model` → `servedModel`. A served model that doesn't
start with the requested id is `ProviderError("UNKNOWN")` (not transient, no fallback, spec
edge case).

**Rationale**: the 006 `ModelResponse` stays provider-independent; the prefix check tolerates
OpenRouter's dated suffixes (`vendor/model-2026-…`) without accepting another model.

**Alternatives considered**: strict equality (false failures on suffixes); ignore the served
model (spec FR-004 asks to record it).

## G13. Error mapping

**Decision**: HTTP status (or the `error.code` of a 200 body carrying `error`): 400, 404, 413,
422 → `INVALID_REQUEST`; 401, 402 (no credits), 403 (key without access) → `AUTH`; 403 with a
moderation `error.metadata` → `INVALID_REQUEST` (policy); 408 → `TIMEOUT`; 429 → `RATE_LIMITED`;
500, 502, 503, 504, 529 → `UNAVAILABLE`; `fetch` network errors → `UNAVAILABLE`; anything else
→ `UNKNOWN`. Only the status and the numeric code are read; the body text never leaves the
function.

**Rationale**: spec FR-005; 402 and invalid keys are configuration problems a fallback on the
same account can't fix.

**Alternatives considered**: 402 as transient (would burn the fallback's retries on a billing
problem).

## G14. Health check

**Decision**: `healthCheck` calls `GET {baseUrl}/key` (key status, no tokens spent): 200 →
`UP`, anything else → `DOWN`. Without the key the provider is not registered → `NOT_CONFIGURED`
(006).

**Rationale**: cheap, verifies the credential, and needs no model id.

**Alternatives considered**: `GET /models` (public, doesn't verify the key).

## G15. Remove the Anthropic provider

**Decision**: Delete `anthropic.provider.ts` and its spec, `ANTHROPIC_API_KEY` and
`ANTHROPIC_BASE_URL` from `config.schema.ts`, `.env.example`, `apps/web/e2e/.env.e2e`, the
`@anthropic-ai/sdk` dependency, the `*.anthropic` redact path (replaced by `*.openrouter`), the
Anthropic rows of `DEPENDENCIES.md`, and `apps/web/e2e/anthropic-mock.ts`. The boundary guard
keeps `@anthropic-ai/*` in its forbidden SDK list and allows no provider SDK in `apps/api`. The
old `curriculum-extraction-default` model config stays in the database (FK from v1 and past
calls) but is no longer in the definitions, so it is unavailable.

**Rationale**: spec Clarifications (Q1). Removing the dependency also shrinks the attack
surface (constitution IX).

**Alternatives considered**: keep the adapter unused (dead code under a boundary exception).

## G16. Configuration

**Decision**: New variables in `config.schema.ts`: `OPENROUTER_API_KEY` (optional; absent →
provider not registered), `OPENROUTER_BASE_URL` (optional, http(s); only for the E2E mock),
`OPENROUTER_DEFAULT_MODEL` (default `anthropic/claude-opus-5`), `OPENROUTER_FALLBACK_MODEL`
(optional), `OPENROUTER_TIMEOUT_MS` (default 60000), `AI_CIRCUIT_FAILURE_THRESHOLD` (5),
`AI_CIRCUIT_OPEN_SECONDS` (60), `AI_AGENT_EXECUTIONS_PER_HOUR` (100). A model id must match
`^[a-z0-9-]+/[a-z0-9._:-]+$` and not start with `openrouter/`; a fallback equal to the default
is refused. An invalid *model* variable doesn't stop the API: the task is unavailable and the
startup logs `ai.task_unavailable` with the reason code (spec FR-008). An invalid number
fails the config parse as every other variable does.

**Rationale**: the four variables of the request plus the fallback and the new limits, all
server-side. `OPENROUTER_API_KEY` is optional so the API starts without AI (spec FR-003).

**Alternatives considered**: required key (API wouldn't start without AI, contradicting
spec FR-003 and 007 FR-043).

## G17. Cost

**Decision**: `ModelUsage` gains `cost: { amount: string; currency: "USD" } | null`.
`AiUsageRecorder` stores the provider's cost when present (`cost_source = 'PROVIDER'`), else
`estimateCost` with the config price (`'PRICE'`), else nulls. The OpenRouter configs carry no
price by default (the model is chosen at deploy time).

**Rationale**: spec FR-017; OpenRouter reports the charged amount, which is more accurate than
a reference price that must follow every model change.

**Alternatives considered**: prices in environment variables (drift with every model change).

## G18. Observability

**Decision**: `ai_executions` gains `task_key` and `fallback_used`; `ai_model_calls` gains
`served_model`, `is_fallback` and `cost_source`. The runner logs `ai.model_call` per leg with
`task`, `configKey`, `provider`, `model`, `servedModel`, `fallback`, `attempts`, `durationMs`,
tokens and `errorCode`, plus `correlationId` (existing base). `GET /ai/operations/metrics`
adds per agent `taskKey` and `fallbacks`, and per model `failedCalls`, `fallbackCalls` and
`avgDurationMs`; `GET /ai/operations/health` adds per model config `circuit` (`CLOSED` |
`OPEN` | `HALF_OPEN`, of the instance that answers). A fallback use writes
`ai_execution.fallback_used` (`primaryConfigKey`, `fallbackConfigKey`, `reason`) in the
transaction that records the fallback leg.

**Rationale**: spec FR-016, FR-018–FR-020; the admin views keep the 006 rule (no content, no
teacher ids).

**Alternatives considered**: a per-execution admin endpoint (006 keeps executions out of the
admin area on purpose).

## G19. Tests

**Decision**: The fake provider (`test/fixtures/ai/fake-model-provider.ts`) gains
`scriptFor(model, ...)` so primary and fallback can answer differently, `fakeServedModel`, and
`fakeCost`. Unit specs: `openrouter.provider.spec.ts` (body, mapping, errors, no key in
errors, health) with `fetch` stubbed; `model-gateway.spec.ts` (fallback matrix, legs, deadline,
cancellation); `circuit-breaker.spec.ts`; registry sync of tasks. Integration and security
specs named `008/USn-k` / `008/FR-0nn`; `SPECS` in `traceability.spec.ts` gains 008. The secret
scan adds a marker key `sk-or-teste-008-CHAVE-FALSA`. `006-ai-no-real-provider.spec.ts` now
asserts that production registers `openrouter` only with its key and that no test registers
it. The E2E replaces `anthropic-mock.ts` with `openrouter-mock.ts` (OpenAI-format replies of
the POO case).

**Rationale**: spec FR-023, FR-024; the existing guards stay the source of truth.

**Alternatives considered**: MSW or nock for the provider unit test (a dependency for what a
`fetch` stub does).

## G20. Evaluation through OpenRouter

**Decision**: `test/eval/curriculum-agent.eval.ts` builds `OpenRouterProvider` from
`OPENROUTER_API_KEY` and runs the golden set against `OPENROUTER_DEFAULT_MODEL` and, when set,
`OPENROUTER_FALLBACK_MODEL` (each as the only model of the route, so the fallback is evaluated
on its own). Same thresholds (007 SC-005, SC-006). `EVAL_RECORD=1` still rewrites the recorded
runs, which remain `ModelResponse` steps; the CI replay is unchanged.

**Rationale**: spec FR-022, SC-009; constitution XIX.

**Alternatives considered**: evaluate only the primary (a fallback that fails the golden set
would still serve teachers during an outage).
