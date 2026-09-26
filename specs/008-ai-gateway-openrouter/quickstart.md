# Quickstart: 008 — AI Gateway com OpenRouter

## 1. Automated checks (no real provider)

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter api test                     # 006/007 suites still pass; 008 unit, integration and security specs
pnpm --filter api test:security            # boundary (no provider SDK, OpenRouter host only in providers/), secret scan with the 008 marker key
pnpm --filter web test                     # "Operação de IA" shows task, fallbacks and circuit
pnpm --filter web test:e2e                 # curriculum-ai.spec.ts through e2e/openrouter-mock.ts
```

Check that:

- `pnpm --filter api test -- -t "008/"` covers the fallback matrix (`008/US3-*`), the circuit
  (`008/US6-*`), the agent limit and the provider mapping;
- no test registers the `openrouter` provider (`006-ai-no-real-provider.spec.ts`);
- `git grep -n "@anthropic-ai\|ANTHROPIC_"` finds only the boundary guard's forbidden list and
  specs of 006/007.

## 2. Manual run with OpenRouter (optional, costs money)

```bash
# apps/api/.env
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_DEFAULT_MODEL=anthropic/claude-opus-5
OPENROUTER_FALLBACK_MODEL=openai/gpt-5.5        # any model that passed the eval
```

0. Run the eval for both models (step 3) before enabling the agent.
1. `pnpm build && pnpm dev`; the startup log has no `ai.task_unavailable`.
2. As ADMIN, "Operação de IA": the agent shows task `curriculum-extraction`, primary
   `openrouter-default`, fallback `openrouter-fallback`; health `UP`, circuits `CLOSED`.
3. As a teacher, "Preencher com IA" on a PDF with text: a proposal arrives as in 007.
4. No fallback on a permanent error: set `OPENROUTER_DEFAULT_MODEL` to a model id that
   doesn't exist and restart; the next analysis fails `AI_PROVIDER_ERROR` (404 →
   `INVALID_REQUEST`) without calling the fallback.
5. Fallback on a recoverable error: point `OPENROUTER_BASE_URL` at the E2E mock started with
   `MOCK_PRIMARY_DOWN=1` (the primary answers 503); the analysis completes through the
   fallback, and after 5 analyses the primary's circuit reads `OPEN`.
6. In "Operação de IA", metrics show the fallback count and the model served.
7. Remove `OPENROUTER_API_KEY` and restart: the API starts, "Preencher com IA" is
   unavailable, the manual syllabus flow works.

## 3. On-demand evaluation

```bash
OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum                 # default and fallback models
OPENROUTER_API_KEY=... EVAL_RECORD=1 pnpm --filter api eval:curriculum   # also rewrites the recorded runs
```

Both models must meet the 007 thresholds (SC-005, SC-006) before they are configured in
production.
