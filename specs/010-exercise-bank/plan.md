# Implementation Plan: 010 — Banco de Exercícios

**Branch**: `010-exercise-bank` | **Date**: 2026-09-27 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/010-exercise-bank/spec.md`

## Summary

A private exercise bank per teacher (the constitution's question bank): three types (open
answer, multiple choice, code) stored relationally with database-enforced invariants, three
pedagogical difficulties and five cognitive objectives, origin, explicit states (DRAFT →
APPROVED → ARCHIVED) and review metadata. Teachers create sets of 3–10 or single exercises by
hand without any AI. AI generation goes through the existing foundation only: a teacher's
request becomes a **generation batch** (topic = item of a confirmed syllabus revision, counts
per type, trick questions, the syllabus' language), the new L2 agent `exercise-generator` runs
the `exercise-generation` task whose model the 009 policy chooses, a pure `proposal.build`
validates the output against the batch, and a new generic foundation hook materializes the
proposal as DRAFT exercises in the same transaction. The teacher reviews, edits, deletes and
approves; the proposal is closed by that review. A server-built student view (allowlist) never
contains answers. The syllabus revision gains a language from a seeded catalog, and the
Curriculum Agent v3 proposes it from the document.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui; no new dependency
**Storage**: PostgreSQL 17 — tables `programming_languages` (seeded), `exercises`, `exercise_alternatives`, `exercise_generation_batches`; column `syllabus_revisions.language_id`; 5 enums; CHECKs, partial unique index and a deferred constraint trigger
**Testing**: Vitest (pure rules and distribution, integration against the test DB, security suite, contract tests), the fake provider (006), Testing Library + `vitest-axe`, Playwright with the OpenRouter mock (extended with an exercise-generation answer); golden set + on-demand eval for the generator
**Target Platform**: Linux server (API), browser (teacher screens)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: first filtered page of a 1 000-exercise bank < 1 s (SC-008); lot of 10 in < 2 min (SC-002, bounded by the model)
**Constraints**: answers never leave the server in a student view; AI output never persisted unvalidated; the exercise modules never choose a model; manual paths never touch AI; batch + exercises + alternatives atomic
**Scale/Scope**: ~16 routes, 1 migration, 2 new API modules, 1 foundation hook, 1 agent + task + tool, curriculum agent v3, ~7 web pages, 2 evals

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies; AI output validated by schema and against the batch; syllabus text is untrusted for the model; no answer in the student view
- [x] **II. RBAC**: `questoes.visualizar/criar/editar/aprovar`, `ia.exercicios.gerar` (+ `ia.execucoes.visualizar`); resource context = session teacher (404 otherwise); matrix rows for every route
- [x] **III. Server authority**: counts, distribution, language, topic, difficulty and states decided server-side; the student view built on the server
- [x] **IV. Untrusted code**: nothing executed; the expected solution is stored text (no Code Runner)
- [x] **V. Data integrity**: one migration; FKs RESTRICT, UNIQUEs (position, one correct, idempotency, execution), CHECKs per type and per batch, deferred trigger for 3–5 alternatives / exactly one correct
- [x] **VI. Audit & logs**: `exercise.*` and `exercise_batch.*` events (contracts/audit-events.md); no content in metadata or logs
- [x] **VII. Tests**: every invariant of spec §31 as a test, written first
- [x] **VIII. Layering**: pure rules/types/views; services with scoped Prisma queries; thin controllers; no rules in React
- [x] **IX. Simplicity**: no new dependency or infrastructure; one generic foundation hook (X8) instead of an ingest worker
- [x] **X. Evidence**: N/A (no student evidence)
- [x] **XI. Human oversight**: approval, edits, deletion and archiving are HUMAN_DECISION; AI output is SUGGESTION; validation is RULE_RESULT
- [x] **XII. Determinism first**: distribution, validation and duplicate detection are deterministic; AI only drafts content
- [x] **XIII. Risk level**: generator is L2 (drafts only); the review closes the proposal (X15)
- [x] **XIV–XV. AI governance**: one read tool scoped to the execution's batch; grounded on the chosen syllabus item; model choice by the 009 policy
- [x] **XVI. Explicit states**: `exercise_status`; batch status derived from its execution and `generated_at`
- [x] **XVII. Idempotency**: batch idempotency key; repeated approve/archive no-op; optimistic `version`
- [x] **XVIII. Safe interruption**: 006 deadline, cancel and kill switches apply; failure leaves no partial batch
- [x] **XIX. AI evals**: golden set, CI replay and release gate for `exercise-generation`; the curriculum gate re-runs for v3
- [x] **XX. Pedagogy**: trick questions constrained to legitimate patterns; teacher decides
- [x] **XXI. Configurable domain**: languages are a seeded data catalog; difficulty and cognitive objective are platform concepts (allowed)
- [x] **XXII. Personalization & accessibility**: no student data; pages with axe and keyboard tests
- [x] **XXIII. Curricular traceability**: generated exercises linked to the syllabus item; manual ones may link; bank ≠ class activity (snapshot later)
- [x] **XXIV. Academic isolation**: private bank; horizontal access → 404 (security suite)
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: `packages/contracts/src/exercises/*`, endpoints catalog, teacher and student view schemas
- [x] **Frontend stack**: `apps/web/features/exercises`, RHF field arrays, TanStack Query, design system

**Post-design re-check**: all ✅. The foundation hook (X8) is the only change to `modules/ai`
and is generic (any L2 agent may materialize drafts in its domain).

## Project Structure

### Documentation (this feature)

```text
specs/010-exercise-bank/
├── plan.md
├── research.md          # X1–X20
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── exercise-generator.md
│   ├── audit-events.md
│   ├── permissions.md
│   ├── configuration.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_exercise_bank/}
├── src/platform/config/config.schema.ts                     # RATE_LIMIT_EXERCISE_AI_PER_HOUR
├── src/modules/exercises/                                    # the bank (no AI)
│   ├── types/{open-answer,multiple-choice,code,index}.ts     # registry (X3)
│   ├── rules/{exercise-rules,set-rules}.ts                   # pure
│   ├── views/{teacher-view,student-view}.ts                  # allowlist (X12)
│   ├── exercise.state-machine.ts
│   ├── exercises.{controller,service}.ts, exercise-query.ts
│   └── programming-languages.{controller,service}.ts
├── src/modules/exercise-ai/                                  # generation
│   ├── definitions/{exercise-generator,exercise-generation.prompt,read-exercise-generation-request.tool,batch.ownership}.ts
│   ├── generation/{validate-generated-batch,build-proposal,materialize}.ts
│   ├── exercise-batches.{controller,service}.ts
│   └── exercise-ai.module.ts
├── src/modules/ai/definitions/types.ts, execution/ai-execution.runner.ts   # proposal.materialize hook
├── src/modules/curriculum-ai/…                               # v3: language (X18)
├── src/modules/syllabus/…                                    # revision language
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── fixtures/exercise-generation/                          # golden set, recorded.json, scorer
    ├── fixtures/evaluations/exercise-generation/*.json        # evidence (release gate)
    ├── eval/exercise-generator.eval.ts
    ├── integration/010-*.spec.ts
    ├── security/010-*.spec.ts, authorization-matrix.ts
    └── traceability.spec.ts                                   # SPECS += 010
packages/contracts/src/exercises/{exercises,exercise-batches,programming-languages,distribution}.ts
apps/web/features/exercises/…, apps/web/features/syllabus/…, apps/web/features/curriculum-ai/…
apps/web/e2e/{exercise-bank.spec.ts, openrouter-mock.ts}
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo; the bank and the generation are two modules
(`exercises`, `exercise-ai`) following the `syllabus` / `curriculum-ai` split (X1).

## Complexity Tracking

No constitution violation to justify.
