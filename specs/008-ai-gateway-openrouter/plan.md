# Implementation Plan: 008 — AI Gateway com OpenRouter

**Branch**: `008-ai-gateway-openrouter` | **Date**: 2026-09-26 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/008-ai-gateway-openrouter/spec.md`

## Summary

Replace the direct Anthropic provider with OpenRouter as the only real provider, and make the
AI foundation route by **task**: an agent declares a task, a task points at a primary and an
optional fallback model config, and the 006 `ModelGateway` runs the fallback once when the
primary ends in a recoverable failure, behind a per-model circuit breaker. The Curriculum Agent
becomes v2 with the same prompt, schema and rules, pointing at the `curriculum-extraction`
task. Executions and model calls record the task, the served model, the fallback and the cost
source; "Operação de IA" shows them with the circuit state; a global per-agent hourly limit
joins the per-user ones. No new route, permission or dependency (one dependency removed).
The rest of the request (gateway, prompt registry, structured output, execution records,
audit, usage, per-user limits) already exists since 006 and is kept (research G1).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` built with SWC, type-checked with `tsc`)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); OpenRouter over Node's native `fetch` (no SDK); `@anthropic-ai/sdk` removed
**Storage**: PostgreSQL 17 — new table `ai_tasks`; new columns on `ai_agent_versions`, `ai_executions`, `ai_model_calls`; circuit state in memory
**Testing**: Vitest (`unplugin-swc`), `@nestjs/testing` + `supertest` against the test DB, the 006 fake provider (extended per model), Testing Library + `vitest-axe` on web, Playwright E2E with a local OpenRouter mock
**Target Platform**: Linux server (API), browser (web admin screen)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: the gateway adds no measurable latency to a call (in-memory circuit check); a fallback starts immediately after the primary's last failed attempt
**Constraints**: every call within the execution deadline (006); at most two legs per logical call; no content or credential in logs, audit, operations responses; API starts without the key
**Scale/Scope**: one task and one agent today; ~15 API files touched, 1 migration, 3 contract schemas, 1 web screen, E2E mock swap

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: provider responses and model output are untrusted and validated (G7, G12); OWASP: secrets server-only and redacted (A02/A05), SSRF not possible (base URL from server config only), no key in errors (G13)
- [x] **II. RBAC**: no new route or permission; existing `ia.*` / `ementas.*` checks and the runner's re-authorization unchanged
- [x] **III. Server authority**: routing, fallback, circuit and limits are server-side; the client can't pick model, provider or task (strict schemas)
- [x] **IV. Untrusted code**: N/A (no code execution)
- [x] **V. Data integrity**: one Prisma migration; FKs `RESTRICT`, CHECKs (fallback ≠ primary, one of task/config, `cost_source`), UNIQUE `ai_tasks.key`
- [x] **VI. Audit & logs**: new events `ai_execution.fallback_used`, `ai_circuit.opened/closed`, `ai_model_config.changed`; structured logs with correlation id; key redacted and scanned
- [x] **VII. Tests**: tests first for the fallback matrix, circuit, provider mapping, routing sync, agent limit, secret scan, 007 regression
- [x] **VIII. Layering**: provider only under `gateway/providers/**`; controllers untouched; the web shows data only
- [x] **IX. Simplicity**: no new infra or dependency (native `fetch`, in-memory circuit, existing rate-limit table); one dependency removed; no parallel gateway module (G1)
- [x] **X. Evidence**: N/A (no student evidence)
- [x] **XI. Human oversight**: unchanged — L2 proposal decided by the teacher
- [x] **XII. Determinism first**: fallback and circuit are deterministic rules; AI use unchanged
- [x] **XIII. Risk level**: L2 unchanged
- [x] **XIV–XV. AI governance**: OpenRouter asked for no retention/training (`data_collection: deny`, `zdr`); no student data sent; model output non-authoritative; grounding of 007 unchanged; fallback keeps the same tools and validations
- [x] **XVI. Explicit states**: circuit states `CLOSED/OPEN/HALF_OPEN`; execution and proposal states of 006 unchanged
- [x] **XVII. Idempotency**: fallback never creates another execution; the agent limit counts created executions only; circuit audit once per transition
- [x] **XVIII. Safe interruption**: deadline, cancellation and the 006 kill switch also bound the fallback; circuit open stops calls to a failing model
- [x] **XIX. AI evals**: golden set runs through OpenRouter for the primary and the fallback before release (G20); CI replay unchanged
- [x] **XX. Pedagogy**: N/A
- [x] **XXI. Configurable domain**: tasks and models are data/config; no subject hard-coded
- [x] **XXII. Personalization & accessibility**: N/A (no student data); admin screen keeps the 005 components and axe checks
- [x] **XXIII. Curricular traceability**: unchanged (007 grounding)
- [x] **XXIV. Academic isolation**: unchanged (execution scoped to the session teacher; tool reads only its document)
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: operations schemas changed in `packages/contracts/src/ai/operations.ts`; no duplicated types
- [x] **Frontend stack**: only the existing "Operação de IA" feature (`apps/web/features/ai-operations`) with design-system components

**Post-design re-check**: still all ✅. The migration makes `ai_agent_versions.model_config_id`
nullable behind a CHECK, which keeps V (integrity) without rewriting the used v1 row.

## Project Structure

### Documentation (this feature)

```text
specs/008-ai-gateway-openrouter/
├── plan.md
├── research.md          # G1–G20
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── gateway-routing.md
│   ├── openrouter-provider.md
│   ├── http-api.md
│   ├── audit-events.md
│   └── configuration.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/
│   ├── schema.prisma                                   # AiTask; new columns (data-model.md)
│   └── migrations/<ts>_008_ai_tasks_fallback/          # table, columns, CHECKs, trigger update
├── src/platform/config/config.schema.ts                # OPENROUTER_*, AI_CIRCUIT_*, AI_AGENT_EXECUTIONS_PER_HOUR; ANTHROPIC_* removed
├── src/platform/logging/logging.module.ts              # redact *.openrouter
├── src/modules/ai/
│   ├── definitions/{types.ts,index.ts}                 # TaskDefinition, taskKey, ModelUsage.cost, servedModel; production defs from env
│   ├── registry/{ai-registry.sync.ts,ai-definitions.check.ts,ai-task.registry.ts}
│   ├── gateway/{model-gateway.ts,circuit-breaker.ts}
│   ├── gateway/providers/openrouter.provider.ts        # anthropic.provider.ts deleted
│   ├── execution/{ai-executions.service.ts,ai-execution.runner.ts}
│   ├── usage/{ai-usage.recorder.ts,cost.ts}
│   └── operations/{ai-metrics.query.ts,ai-operations.service.ts}
├── src/modules/curriculum-ai/definitions/curriculum-agent.ts   # v2 + curriculum-extraction task
├── src/modules/audit/audit-event-types.ts
├── eslint.config.mjs
└── test/
    ├── fixtures/ai/fake-model-provider.ts              # per-model scripts, servedModel, cost
    ├── eval/curriculum-agent.eval.ts                   # OpenRouter, primary and fallback
    ├── integration/008-*.spec.ts
    ├── security/{006-ai-boundary,006-ai-no-real-provider,secret-leak-scan}.spec.ts, 008-*.spec.ts
    └── traceability.spec.ts                            # SPECS += 008
packages/contracts/src/ai/operations.ts                  # circuit, taskKey, fallbacks, per-model counters
apps/web/
├── features/ai-operations/components/*                 # task, fallbacks, circuit columns
└── e2e/{openrouter-mock.ts,.env.e2e,env.ts,playwright.config.ts}   # anthropic-mock.ts deleted
DEPENDENCIES.md, README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo layout; all backend work stays inside
`apps/api/src/modules/ai` (folders by responsibility, 006 research A3) and the curriculum
agent's definition. The request's `domain/application/infrastructure` split is not adopted
(research G1).

## Complexity Tracking

No constitution violation to justify.
