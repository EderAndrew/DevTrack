# Implementation Plan: 009 — Política de Modelos de IA

**Branch**: `009-ai-model-policy` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/009-ai-model-policy/spec.md`

## Summary

Put an explicit model policy in front of the 008 gateway. A reviewed **catalog** in code lists
the approved models (families OpenAI, Anthropic and TypeSafe; tier BASIC/STANDARD/ADVANCED;
mode generation or decision; lifecycle; price; capabilities) and their **approvals per task**,
each backed by a committed evaluation evidence file. Each **task** declares a policy (tiers,
families, capabilities, fallback, escalation, quality thresholds). A pure, deterministic
`selectRoute` picks, at request time, the cheapest approved model of the preferred tier and a
same-tier fallback (another family when possible); the choice is fixed on the execution with
its reason. The 008 fallback and circuit are reused; **escalation** is new: once, to the next
tier, only on output validation failure and only when the task allows it. The admin can pin an
approved model per task. "Operação de IA" gains cost by task, tier and family, a models view
with quality × cost, a tasks view with the current choice, and observable budgets. The
OpenRouter provider gains the decisions route for Jev (decision mode), used by no production
task yet. The Curriculum Agent's analysis moves to BASIC through a release gate that evaluates
the BASIC candidates first; seven more curriculum task policies are registered without agents.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` built with SWC, type-checked with `tsc`)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); OpenRouter over native `fetch` (008), now also its decisions route; no new dependency
**Storage**: PostgreSQL 17 — new tables `ai_model_task_approvals`, `ai_task_overrides`, `ai_budget_alerts`; new columns on `ai_model_configs`, `ai_tasks` (policy; route columns dropped), `ai_executions`, `ai_model_calls`; 4 enums
**Testing**: Vitest (unit for the pure policy, integration against the test DB, security guards), the fake provider (extended with `decide`), Testing Library + `vitest-axe` on web, Playwright E2E with the OpenRouter mock
**Target Platform**: Linux server (API), browser (admin screen)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: selection is in-memory over ≤ a few dozen catalog entries (negligible next to a model call); availability answers without a model call
**Constraints**: deterministic selection; no concrete model id outside the catalog file; no content, credential or teacher id in logs, audit or operations responses; API starts with an invalid catalog or policy; every call within the execution deadline (006)
**Scale/Scope**: 7 catalog entries, 8 curriculum task policies (1 active), 3 new operations routes, 1 migration, ~20 API files, 3 web components, 1 eval change

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: model output and decision answers untrusted and validated; OWASP: no new input surface for teachers (strict bodies), admin override validated against the catalog; key server-only (008)
- [x] **II. RBAC**: new routes use existing permissions — `ia.operacao.visualizar` (views), `ia.agentes.gerenciar` (override); added to the 006 authorization matrix
- [x] **III. Server authority**: tier, family, model, fallback, escalation and budgets decided server-side; the client can't pick any of them
- [x] **IV. Untrusted code**: N/A
- [x] **V. Data integrity**: one Prisma migration; FKs `RESTRICT`, UNIQUEs (approval per model × task, one override per task, one model per catalog entry), CHECKs (escalation fields together, decision mode without generation capabilities)
- [x] **VI. Audit & logs**: `ai_execution.escalated`, `ai_model_config.lifecycle_changed`, `ai_task_override.set/removed`, `ai_budget.exceeded`; selection recorded on the execution; logs without secrets
- [x] **VII. Tests**: tests first for the policy invariants (spec §19 list), quality gate, escalation, override, budgets, decision mode, 007/008 regression
- [x] **VIII. Layering**: policy pure in `modules/ai/policy`; provider routes only in `gateway/providers/**`; controllers thin
- [x] **IX. Simplicity**: no new dependency or infrastructure; the catalog is code; budgets reuse `ai_model_calls` costs; no parallel module (H1)
- [x] **X. Evidence**: N/A (no student evidence); model approvals require evaluation evidence (H6)
- [x] **XI. Human oversight**: promotion to production is a reviewed code change with evidence; override is an admin decision; the L2 proposal flow is unchanged
- [x] **XII. Determinism first**: model choice is a deterministic rule, never an LLM decision
- [x] **XIII. Risk level**: L2 unchanged for the Curriculum Agent
- [x] **XIV–XV. AI governance**: allowlist of families; no automatic entry of new models; grounding (007) applies to escalated outputs too
- [x] **XVI. Explicit states**: lifecycle enum; escalation fields; `UNDECIDED` decision answers
- [x] **XVII. Idempotency**: same override twice = no change; budget alert once per scope and period (PK); selection fixed per execution
- [x] **XVIII. Safe interruption**: escalation bounded by `maxModelCalls` and the deadline; 006/008 kill switches and circuit unchanged
- [x] **XIX. AI evals**: approvals require committed evidence meeting task thresholds; release gate evaluates BASIC candidates (H12)
- [x] **XX. Pedagogy**: the Curriculum Agent's pedagogical behavior is unchanged
- [x] **XXI. Configurable domain**: tiers, families, models and policies are data
- [x] **XXII. Accessibility**: admin screen with design-system components, axe and keyboard tests
- [x] **XXIII–XXIV**: unchanged (007 grounding; execution scoped to the session teacher)
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: operations schemas in `packages/contracts/src/ai/operations.ts`; endpoints catalog updated
- [x] **Frontend stack**: only `apps/web/features/ai-operations`

**Post-design re-check**: still all ✅. The release gate (H12) is a process step with a cost;
it keeps FR-009/"never escalate silently" intact instead of relaxing the policy.

## Project Structure

### Documentation (this feature)

```text
specs/009-ai-model-policy/
├── plan.md
├── research.md          # H1–H16
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── model-policy.md
│   ├── catalog-and-quality-gate.md
│   ├── decisions-provider.md
│   ├── http-api.md
│   ├── audit-events.md
│   └── configuration.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_ai_model_policy/}
├── src/platform/config/config.schema.ts                 # AI_BUDGET_*; OPENROUTER_*_MODEL removed
├── src/modules/ai/
│   ├── definitions/{types.ts,index.ts,model-catalog.ts,model-families.ts}
│   ├── policy/{select-route.ts,tiers.ts,estimate-cost.ts}           # pure
│   ├── registry/{ai-registry.sync.ts,ai-definitions.check.ts,ai-task.registry.ts,ai-model-config.registry.ts}
│   ├── gateway/{model-gateway.ts}                                    # decide()
│   ├── gateway/providers/openrouter.provider.ts                      # decide() on /api/alpha/decisions
│   ├── execution/{ai-executions.service.ts,ai-execution.runner.ts}   # selection at request, escalation
│   ├── usage/{ai-usage.recorder.ts,ai-budget.monitor.ts}
│   └── operations/{ai-operations.controller.ts,ai-operations.service.ts,ai-metrics.query.ts}
├── src/modules/curriculum-ai/definitions/curriculum-agent.ts        # 8 task policies
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── fixtures/ai/{fake-model-provider.ts,catalog.ts}               # decide(); test catalog and approvals
    ├── fixtures/evaluations/curriculum-extraction/*.json             # evidence (release gate)
    ├── eval/curriculum-agent.eval.ts                                 # EVAL_MODEL, evidence files
    ├── integration/009-*.spec.ts
    ├── security/{006-ai-authorization-matrix.ts,006-ai-admin-scan.spec.ts,secret-leak-scan.spec.ts,009-*.spec.ts}
    └── traceability.spec.ts                                          # SPECS += 009
packages/contracts/src/ai/operations.ts                                # metrics, models, tasks, override
apps/web/features/ai-operations/components/*                          # tasks, models, tiers, budgets
apps/web/e2e/openrouter-mock.ts                                        # decisions route (for the reference decision test)
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo layout; the policy stays inside
`apps/api/src/modules/ai` (H1), with a new pure `policy/` folder next to `definitions/`,
`registry/` and `gateway/`.

## Complexity Tracking

No constitution violation to justify.
