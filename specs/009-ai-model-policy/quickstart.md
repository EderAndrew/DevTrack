# Quickstart: 009 — Política de Modelos de IA

## 1. Automated checks (no real provider)

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter api test                       # 006/007/008 suites still pass; 009 policy, catalog, escalation, override, budgets
pnpm --filter api test -t "009/"             # the 009 scenarios only (no `--`: with pnpm 11 it reaches vitest and drops the filter)
pnpm --filter web test                       # "Operação de IA": tasks, models, tiers, budgets
pnpm --filter web test:e2e                   # curriculum flow through the policy (openrouter-mock); resets devtrack_e2e
```

Before the release gate (§2) approves a model the production catalog has none, so two checks are
red: `009-quality-gate.spec.ts` "009/US3-1" (no approved model for the analysis's tier) and the E2E
`curriculum-ai.spec.ts` ("Preencher com IA" stays disabled). Since 2026-09-27 `openai-basic` is
approved and both are green.

Check that:

- `selectRoute` never returns a model of another tier, mode or family, a `CANDIDATE`/`EVALUATING`
  or disabled model, or one without a valid approval (`policy/select-route.spec.ts`);
- `009-quality-gate.spec.ts`: each approval matches its evidence file and its thresholds (all
  green once §2 approved a model);
- no production code outside `definitions/model-catalog.ts` names a concrete model id
  (`009-model-id-boundary.spec.ts`).

## 2. Release gate: approve a BASIC model for `curriculum-extraction` (costs money)

The golden set is fictitious, so nothing private leaves the machine. It spends OpenRouter
credits (a few cents per model); the user authorized running it without asking (2026-09-27).

```bash
OPENROUTER_API_KEY=... EVAL_MODEL=anthropic-basic EVAL_RECORD=1 pnpm --filter api eval:curriculum
OPENROUTER_API_KEY=... EVAL_MODEL=openai-basic    EVAL_RECORD=1 pnpm --filter api eval:curriculum
```

Until this gate, the catalog has no approvals and "Preencher com IA" is unavailable outside the
automated tests; the branch is not merged before it. Each run writes
`apps/api/test/fixtures/evaluations/curriculum-extraction/<modelKey>.json` with the served model
and the cost of the real run. For
each model that meets the thresholds: add the approval to its catalog entry, set
`lifecycle: "PRODUCTION"`, commit the evidence. If no BASIC model passes, raise
`curriculum-extraction.preferredTier` to STANDARD with the evidence as justification and repeat
for the STANDARD candidates.

## 3. Manual run (optional, costs money)

1. `pnpm dev`; the startup log has no `ai.task_unavailable` for `curriculum-extraction`.
2. As ADMIN, "Operação de IA" → **Tarefas**: `curriculum-extraction` is BASIC, shows the chosen
   model and the reason (`LOWEST_COST`), the fallback of another family, and seven tasks
   "sem agente". **Modelos**: the catalog with tiers, lifecycle, approvals and quality × cost.
3. As a teacher, "Preencher com IA" on a PDF with text: the proposal arrives as in 007; the
   execution shows tier BASIC in the metrics.
4. Fix another approved BASIC model as override for the task; the next analysis uses it; remove
   the override.
5. Set `AI_BUDGET_DAILY_USD=0.000001`, restart, run an analysis: it completes, "Operação de IA"
   shows the daily budget exceeded, and one `ai_budget.exceeded` event exists.
