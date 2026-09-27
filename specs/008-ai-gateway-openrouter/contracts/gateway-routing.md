# Contract: task routing, fallback and circuit (agent runtime delta)

Extends `specs/006-ai-foundation/contracts/agent-runtime.md`. Everything not listed here is
unchanged.

## Declaring a task (research G2)

```ts
export const CURRICULUM_EXTRACTION_TASK = defineTask({
  key: "curriculum-extraction",
  primaryModelConfigKey: "openrouter-default",
  fallbackModelConfigKey: "openrouter-fallback", // omitted when OPENROUTER_FALLBACK_MODEL is unset
  parameters: { effort: "low" },
  maxOutputTokens: 16_000,
  timeoutMs: 60_000,
});

export const CURRICULUM_AGENT = defineAgent({
  key: "curriculum-agent",
  version: 2,
  taskKey: CURRICULUM_EXTRACTION_TASK.key, // replaces modelConfigKey
  // prompt v1, output v1, tools, limits, proposal: unchanged from v1
});
```

An agent never names a model config, provider or model. `productionAiDefinitions(config)`
builds the `openrouter-*` model configs from the environment (research G3).

## Gateway call

```ts
interface GatewayRoute { primary: GatewayModelConfig; fallback: GatewayModelConfig | null }

interface GatewayCall {
  route: GatewayRoute;          // replaces `config`
  task: { parameters; maxOutputTokens; timeoutMs };
  request; limits; deadline; signal; structuredSchema?;   // unchanged
}

interface GatewayLeg {
  config: GatewayModelConfig;
  isFallback: boolean;
  status: "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "SKIPPED_OPEN_CIRCUIT";
  attempts: number;
  durationMs: number;
  errorCode: AiErrorCode | null;
  usage: ModelUsage | null;
  servedModel: string | null;
}

interface GatewayResult { response: ModelResponse; legs: GatewayLeg[]; attempts: number; durationMs: number }
// On failure: AiFailure(code, attempts, durationMs) carrying `legs` as well.
```

`SKIPPED_OPEN_CIRCUIT` legs are not written to `ai_model_calls` (no call happened); they only
set `reason: "CIRCUIT_OPEN"` on the fallback audit event.

## Fallback matrix (spec FR-010, FR-011; research G6, G7)

| Primary outcome (after its retries) | Fallback configured and usable | Result |
|---|---|---|
| success | — | primary response |
| `UNAVAILABLE`, `RATE_LIMITED`, call `TIMEOUT` | yes, time left | fallback leg (own retries), then its result |
| same | no / disabled / circuit open / no time left | `AiFailure` with the primary's code (circuit open on both → `AI_MODEL_UNAVAILABLE`) |
| circuit open | yes | fallback leg directly, `reason: "CIRCUIT_OPEN"` |
| `INVALID_REQUEST`, `AUTH`, `UNKNOWN` | any | `AiFailure`, no fallback |
| cancellation | any | `AI_EXECUTION_CANCELLED`, no fallback |
| execution deadline | any | `AI_TIMEOUT`, no fallback |
| response returned but output invalid (runner) | any | `AI_OUTPUT_VALIDATION_FAILED`, no fallback |

At most two legs per logical call; never primary → fallback → primary. Each leg's retries
follow 006 (`maxRetries`, backoff, deadline). The runner's `maxModelCalls` counts logical
calls, as in 006.

## Effective values of a leg

- max output tokens: `min(task.maxOutputTokens, config.maxOutputTokens)`
- per-call timeout: `min(task.timeoutMs, config.timeoutMs, limits.modelCallTimeoutMs)`, and
  never past the execution deadline
- parameters: the task's (the provider ignores keys it doesn't support)

## Circuit (research G8)

`CircuitBreaker.allow(configKey): "CALL" | "PROBE" | "OPEN"`, `recordSuccess(key)`,
`recordTransientFailure(key)`, `state(key)`. The gateway asks `allow` before each leg and
reports the leg's final outcome (not each attempt). Clock and thresholds injected
(`AI_CIRCUIT_FAILURE_THRESHOLD`, `AI_CIRCUIT_OPEN_SECONDS`).

## Recording (runner)

For each written leg, in one transaction: an `ai_model_calls` row (`is_fallback`,
`served_model`, `cost_source`), `ai_executions.model_calls + 1`, and for a fallback leg
`ai_executions.fallback_used = true` plus the `ai_execution.fallback_used` audit event.
