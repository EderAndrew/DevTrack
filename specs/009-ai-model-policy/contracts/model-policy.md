# Contract: model policy (selection, fallback, escalation)

Extends `specs/008-ai-gateway-openrouter/contracts/gateway-routing.md`. Research H5–H9.

## Selection (`policy/select-route.ts`, pure)

```ts
selectRoute(input: {
  task: TaskPolicy; tier: ModelTier;          // the preferred tier, or the escalation target
  catalog: CatalogEntry[];                    // with status, lifecycle, approvals (valid flag)
  override: string | null;                    // model config key fixed by the admin
  usable(key: string): boolean;               // 008: ENABLED, provider registered, not refused, circuit not blocking
}): { primary: CatalogEntry; fallback: CatalogEntry | null; reason: SelectionReason } | { unavailable: UnavailableReason }
```

Filter, in order: family ∈ allowlist ∩ `task.allowedFamilies` → `mode === task.mode` → every
`task.requiredCapabilities` → `lifecycle = PRODUCTION` with a **valid** approval for the task
(`DEPRECATED` only if nothing else remains) → `tier === input.tier`.

Order the candidates: override first (if present among them and usable now: an override naming
a disabled model or one behind an open circuit is ignored, `overrideIgnored`; decided during
implementation, 2026-09-27), then estimated cost
`(typicalUsage.inputTokens × in + typicalUsage.outputTokens × out) / 1e6` ascending (entries
without price after those with price), then `priority` descending, then `key`.

`primary` = first. `fallback` (only when `task.fallback = "SAME_TIER"`) = first remaining
**usable** candidate of another family, else the next usable candidate, else null.

The health (`usable`: enabled, provider registered, circuit not blocking) never reorders the
candidates (decided during implementation, 2026-09-27): an unusable primary stays the primary
and the 008 gateway goes straight to the fallback, recorded as a fallback leg with its trigger
(`CIRCUIT_OPEN`, or `PROVIDER_FAILURE` + `AI_MODEL_UNAVAILABLE` for a disabled primary), exactly
as in 008 (research H8, 008 G6). The task is unavailable when neither the primary nor a
fallback is usable.

`UnavailableReason`: `NO_APPROVED_MODEL`, `POLICY_INVALID`, `PROVIDER_NOT_REGISTERED`,
`ALL_BLOCKED` (disabled or circuit open). Availability of a task = `selectRoute` for its
preferred tier without taking a circuit probe.

Invariants (tested):

- a BASIC task never gets a STANDARD/ADVANCED model from selection;
- a `CANDIDATE`, `EVALUATING` or disabled model, a model without a valid approval for the task,
  a family outside the allowlist or the task, and a model of the other mode are never returned;
- among qualifying models the cheapest is returned; same input → same output.

## Request time

`AiExecutionsService.request` calls `selectRoute` once; the execution stores the primary
(`model_config_id`), the fallback, the `tier` and the `selection_reason` (008 G5: fixed at
request). The runner re-reads them at start (008) and fails `AI_MODEL_UNAVAILABLE` when neither
is usable.

## Fallback

The 008 `ModelGateway` fallback, unchanged (after retries, once, same deadline, never back to
the primary, circuit per config). The fallback config comes from `selectRoute`, so it is always
the same tier and an allowed family.

## Escalation (runner)

Trigger: the final output fails parsing or schema validation (`AI_OUTPUT_PARSE_FAILED` /
`AI_OUTPUT_VALIDATION_FAILED`) and all of:

- `task.escalation = "ON_OUTPUT_INVALID"`;
- `execution.tier < (task.maxTier ?? task.preferredTier)`;
- no escalation yet in this execution;
- one more logical call fits `maxModelCalls`.

Action: `selectRoute` with `tier = next(execution.tier)`; if unavailable, fail with the original
code. Otherwise repeat the last logical call (same request and history) on that route; its legs
carry `is_escalation = true` and `tier = next`. Record `escalation_used`, from/to tier, reason
`OUTPUT_INVALID`, the escalated config; audit `ai_execution.escalated`. The escalated output is
validated and grounded as usual; if invalid, the execution fails as in 006. A proposal rejected
by the teacher never triggers escalation.

## Decision mode

`ModelGateway.decide(call)` = the same legs, retries, fallback, circuit and usage as `call`, on
the provider's `decide`. Answers are validated against the asked questions; an answer with
`confidence < task.minConfidence` (choice/score) or a noul within `[1 - minConfidence,
minConfidence]` becomes `UNDECIDED`. `minConfidence` must be in `(0.5, 1]` (policy check). See
decisions-provider.md.
