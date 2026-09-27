# Contract: decision mode on OpenRouter (Jev)

Research H10. `OpenRouterProvider.decide(request, signal)`; the host stays only in the adapter
(006 A15).

## Request

`POST {origin}/api/alpha/decisions` where `origin` is the origin of the configured base URL
(`https://openrouter.ai` in production; the local mock in E2E). Headers as G10.

```jsonc
{
  "model": "typesafe/jev-1.13",
  "state": "<text>" | { ... } | [ ... ],     // untrusted content, as-is
  "questions": {
    "<id>": { "type": "choice", "instructions": "…", "criteria": { "<option>": "<description>" } },
    "<id>": { "type": "score",  "instructions": "…", "criteria": ["<low>", "…", "<high>"] },   // 2–10 levels
    "<id>": { "type": "noul",   "instructions": "…", "criteria": { "true": "…", "false": "…" } }
  }
}
```

Never sent: `user`, `session_id`, `trace`, teacher identifiers.

## Response → `DecisionResponse`

```ts
{ answers: Record<string,
    | { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number }
    | { type: "score"; score: number; probabilities: Record<string, number>; confidence: number }
    | { type: "noul"; noul: number }>;
  usage: { inputTokens: number; outputTokens: number; cost: { amount: string; currency: "USD" } | null };
  servedModel: string }
```

Validation (gateway): every asked id present with the asked type; a `choice` among the asked
options; `score` within `[0, levels − 1]`; probabilities in `[0, 1]`. A failure is
`AI_OUTPUT_VALIDATION_FAILED`. Below the task's `minConfidence` → the answer becomes
`{ type, undecided: true }`.

Served model must start with the requested id (G12). Errors map as G13 (400/404/413/422 →
`INVALID_REQUEST`, 401/402/403 → `AUTH`, 408/524 → `TIMEOUT`, 429 → `RATE_LIMITED`,
500/502/503/529 → `UNAVAILABLE`).

## Limits known from the model (jev-1.13)

64k tokens per request (32k for state + the longest question), text only, English best, no
arithmetic, counting or date comparison, literal reading. Task authors keep those in code; the
catalog entry records `contextWindow: 64000`.
