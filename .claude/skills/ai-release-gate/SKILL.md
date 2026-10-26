---
name: ai-release-gate
description: Run or interpret the on-demand AI golden-set evals (eval:curriculum/exercises/works/help/exams) that back the 009 model-catalog approvals, and the current release-gate results per model. Use when approving a model for a task, re-running a release gate, or asking which model is approved/why.
---

# AI release gate (009)

Real models through `OpenRouterProvider`, cost cents. Running them is pre-authorized by the user;
`vitest.eval.config.ts` holds only `test/eval/**/*.eval.ts` (one script per file), never part of `pnpm test`.
Each runs its golden set against the catalog candidates of its task's tier, or only `EVAL_MODEL`.

```bash
OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum  # golden-set eval of the catalog candidates of the analysis's tier
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:curriculum
                                                        # release gate: one catalog entry; writes test/fixtures/evaluations/<task>/<key>.json
                                                        # (skipped when a case failed for infrastructure); EVAL_REPLAY=1 rewrites recorded.json
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:exercises
                                                        # 010 exercise generator, same flags; evidence in
                                                        # test/fixtures/evaluations/exercise-generation/, with each case's latency
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:works
                                                        # 011 work generator; evidence in test/fixtures/evaluations/work-generation/
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:help
                                                        # 015 AI help (work-helper); evidence in
                                                        # test/fixtures/evaluations/work-help/, with each case's latency
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:exams
                                                        # 018 exam generator; evidence in test/fixtures/evaluations/exam-generation/
```

`009-quality-gate.spec.ts` checks that every catalog approval equals its committed evidence and meets the task's
thresholds; the `0NN-evaluation.spec.ts` suites replay each golden set in CI.

Golden sets: `test/fixtures/curriculum-agent/` (007), `test/fixtures/exercise-generation/` (010, research X16:
`golden/<case>/expected.json` + `recorded.json`, pure `score.ts`, `load-golden.ts`, `run-case.ts`; `topicCoverage` is
judged over the set), `test/fixtures/work-generation/` (011/SC-012, `schemaValidity`, `configMatch`, `duplicates`,
`topicCoverage`, `injectionClean`), `test/fixtures/work-help/` (015, 25 cases; `score.ts` scores the model's own output
before the server's check), `test/fixtures/exam-generator/` (018, recorded ids as `{{requestId}}`, `{{topic:n}}`,
`{{languageId}}`).

## Current results (moved from apps/api/CLAUDE.md)

All five tasks are BASIC. `openai-basic` passed every release gate and, being the cheapest, is
the primary of each; `exam-generation` (018, 2026-10-14) was met in full by `openai-basic` and
`anthropic-basic`, its same-tier fallback; `anthropic-basic` passed `curriculum-extraction` and `exercise-generation` on
2026-10-01 (the first run with OpenRouter credit) and is their same-tier fallback, but failed
`work-generation` (schema validity 0.6), which has no fallback. `deepseek-basic` failed all three
(2026-09-29 and 2026-10-01): called with tools its answers break the output schema (rubric,
explanation, alternatives) and once it skipped the read tool, although the same request without
tools passes. DeepSeek joined the family allowlist on 2026-09-29 (009 amendment). On 2026-10-26 both
DeepSeek entries failed every gate again: `deepseek-basic` schema validity 0.3 (curriculum), 0.5 (exercises),
0.75 (exams), 0.72 with relevance 0.38 (help), and `work-generation` timed out on one case (no evidence);
`deepseek-standard` (V4 Pro) 0 on the four generation tasks (every answer `AI_OUTPUT_VALIDATION_FAILED`) and,
on `work-help`, schema validity 1 but relevance 0. Before that day only `eval:help` moved the task to the tier
of an `EVAL_MODEL` of another tier; the other four evals now do too, so a STANDARD entry got no route (503).

`work-help` (015) is approved for `openai-basic` only (2026-10-08, no same-tier fallback). The first gate
(2026-10-08, prompt v1) failed both candidates on leaks: "pilha de pratos" for the alternative "Pilha",
"log₂(n)" or eliminating "O(1)", which the leak check then missed for alternatives under 12 characters.
After that, research F8/F10 were amended: prompt v2 (no word of an alternative, even in an analogy; no
meaning of an alternative; no answering term) and the leak check protects short alternatives by their
distinctive words or symbolic text; golden set v2 matches `mustMention` by stem, with three synonyms
reviewed by a person. Latest runs (evidence in `test/fixtures/evaluations/work-help/`): `openai-basic`
leakFree 1, injectionClean 1, scopeAccuracy 0.92, relevance 0.8 (< 0.9; the cases that miss change from
run to run), p95 13 s; read by a person (F16 amendment) 18 of 20 pertinent (0.9), approved; `anthropic-basic` (prompt v2, golden v1) leakFree 0.88, injectionClean 0.75,
scopeAccuracy 0.88, relevance 0.56 — its leaks are now blocked by the server.
