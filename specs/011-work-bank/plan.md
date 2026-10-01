# Implementation Plan: 011 — Banco de Trabalhos

**Branch**: `011-work-bank` | **Date**: 2026-09-30 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/011-work-bank/spec.md`

## Summary

A private work bank per teacher, apart from the exercise bank (new modules, tables, routes,
permissions and pages; the 010 code untouched). A work belongs to a subject, links 0–10 items of
one confirmed syllabus revision (composite foreign keys make that a database fact), and holds 1–10
questions of three types — open answer, multiple choice, code — each with its answer key from
creation (expected answer and rubric; the correct alternative; expected solution, language and
PUBLIC/PRIVATE test cases). The teacher sets only the total grade: values are exact decimals
(`numeric(5,2)` in PostgreSQL, integer hundredths in TypeScript, a `"0.50"` string on the wire),
split by position so that the sum is always the total (0,50/3 → 0,17 · 0,17 · 0,16), recalculated
on every change and checked by a deferred trigger. Works are DRAFT → APPROVED → ARCHIVED (restore
to the previous status), edited as one aggregate with an optimistic version.

AI generation reuses the 006–010 foundation with registrations only: a teacher's **work
generation request** (topics, difficulty, total grade, counts per type, trick questions, the
revision's language) runs the new L2 agent `work-generator` on the `work-generation` task whose
model the 009 policy chooses; a pure `proposal.build` validates the output against the request
(counts, types, tricks, language, answer keys, test cases, duplicates, 1–3 topic refs per
question within the selection and every topic covered); the existing `proposal.materialize` hook
writes the DRAFT work atomically. Only the teacher approves. A server-built student view
(allowlist) never carries the answer key; the teacher can preview it. Grading strategies
(`EXACT_MATCH`, `TEST_CASES`, `AI_REVIEW`) are stored per question and delivered as pure domain
rules with the student-grade rule, tested with simulated answers; 012 executes them.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui; no new dependency (decimals as integer hundredths, research W3)
**Storage**: PostgreSQL 17 — tables `works`, `work_topics`, `work_questions`, `work_question_alternatives`, `work_question_test_cases`, `work_question_topics`, `work_generation_requests`, `work_generation_request_topics`; 6 enums; `numeric(5,2)` grades; CHECKs, composite FKs and deferred constraint triggers
**Testing**: Vitest (pure rules, grade distribution with exhaustive/property tests, grading strategies with fake ports, integration against the test DB, security suite, contract tests), the fake AI provider (006), Testing Library + `vitest-axe`, Playwright with the OpenRouter mock (extended with a work-generation answer); golden set + on-demand eval for the generator
**Target Platform**: Linux server (API), browser (teacher screens)
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: first filtered page of a 1 000-work bank < 1 s (SC-009); a 10-question draft in < 2 min in 95% of requests (SC-002, bounded by the model, measured by the eval)
**Constraints**: the answer key never leaves the server in a student view; AI output never persisted unvalidated; grades never floats; the work modules never choose a model nor import the exercise modules; manual paths never touch AI; nothing executes code; request + work + questions atomic
**Scale/Scope**: ~13 routes, 1 migration, 2 new API modules, 1 agent + task + tool + resource, grading domain rules, 6 web pages, 1 eval

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: strict bodies (unknown fields, model/provider fields, free topic text refused); AI output validated by schema and against the request; syllabus text untrusted for the model; no answer key in the student view
- [x] **II. RBAC**: `trabalhos.visualizar/criar/editar/arquivar/aprovar`, `ia.trabalhos.gerar` (+ `ia.execucoes.visualizar`), TEACHER only; resource context = session teacher (404 otherwise); matrix rows for every route
- [x] **III. Server authority**: counts, distribution, values, language, topics, difficulty, states and the student view decided server-side; no answer entry in 011 (autosave belongs to 012's answers)
- [x] **IV. Untrusted code**: nothing executed; test cases and solutions are stored text; `TEST_CASES` grading only through a `CodeRunnerPort` whose only 011 implementation is "unavailable"; guard test against `child_process`/`vm`/`eval` in the new modules (W20)
- [x] **V. Data integrity**: one migration; FKs RESTRICT, composite FKs for the single revision and the question topics, UNIQUEs (positions, one correct, idempotency, execution, request → work), CHECKs per type, strategy ↔ type, grade range, deferred triggers for counts, alternatives and the grade sum
- [x] **VI. Audit & logs**: `work.*` and `work_generation.*` events (contracts/audit-events.md) with correlation id and execution id; no content in metadata or logs
- [x] **VII. Tests**: every boundary of spec §31–34 and every grading rule written first; grade calculation exhaustively tested (critical rule "cálculo de notas")
- [x] **VIII. Layering**: pure types/rules/views/grading; services with scoped Prisma queries; thin controllers; question types and grading strategies as registries (OCP); no rules in React
- [x] **IX. Simplicity**: no new dependency or infrastructure; no change to `modules/ai` (existing hook and metric names); one shared pure helper (`splitEvenly`)
- [x] **X. Evidence**: N/A (no student evidence in 011); grading results typed for 012
- [x] **XI. Human oversight**: approval, edits and archiving are HUMAN_DECISION; AI output SUGGESTION; validation, values, `EXACT_MATCH` and `TEST_CASES` RULE_RESULT; `AI_REVIEW` never final without the teacher
- [x] **XII. Determinism first**: values, distribution, validation, duplicates, multiple-choice and code grading deterministic; AI only drafts content and (012) suggests open-answer grades
- [x] **XIII. Risk level**: generator L2 (drafts only), DISABLED until the gate; the work's approval closes the proposal; no L3
- [x] **XIV–XV. AI governance**: one L1 read tool scoped to the execution's request; grounded on the chosen items; no title/grade sent; model choice by the 009 policy only
- [x] **XVI. Explicit states**: `work_status` with `archived_from_status`; request status derived from its execution and `generated_at`; grading statuses explicit
- [x] **XVII. Idempotency**: request idempotency key; approve/archive no-op when already there; optimistic `version`
- [x] **XVIII. Safe interruption**: 006 deadline, cancel and kill switches apply; failure writes nothing
- [x] **XIX. AI evals**: golden set, CI replay and release gate for `work-generation` (W17)
- [x] **XX. Pedagogy**: trick questions limited to legitimate patterns, flagged to the teacher, hidden from students
- [x] **XXI. Configurable domain**: languages from the data catalog; question types, difficulty and strategies are platform concepts (allowed)
- [x] **XXII. Personalization & accessibility**: no student data; pages with axe and keyboard tests
- [x] **XXIII. Curricular traceability**: bank generation under "Geração para os bancos do professor" (constitution v3.2.0, `constitution-amendment-3.2.0.md`): teacher-chosen items of one confirmed revision verified on the server, never extended by the AI, every generated question linked to 1–3 of them and every item covered, validated deterministically, DRAFT reviewed by the teacher; manual works may link topics; the work is a bank template, snapshotted when 012 applies it to a class (taught scope then)
- [x] **XXIV. Academic isolation**: private bank; horizontal access → 404 (security suite); no class resource in 011 — a bank work has no class because it is a template (XXIII v3.2.0, "Bancos do professor × atividade"); the class context starts when 012 applies it
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: `packages/contracts/src/works/*` (bodies, teacher and student views, grade helpers, grading shapes), endpoints catalog; the web previews values with the same `distributeGrade`
- [x] **Frontend stack**: `apps/web/features/works`, RHF field arrays, TanStack Query, design system

**Post-design re-check**: all ✅. The only touches outside the new modules are registrations
(audit event types, permissions seed, AI definitions list, endpoints catalog, menu, config
variable) and the shared pure `splitEvenly`. The language catalog is read by a works route of its
own (`GET /works/programming-languages`), so no 010 route changes.

## Project Structure

### Documentation (this feature)

```text
specs/011-work-bank/
├── plan.md
├── research.md          # W1–W22
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── work-generator.md
│   ├── grading.md
│   ├── audit-events.md
│   ├── permissions.md
│   ├── configuration.md
│   └── web-ui.md
├── constitution-amendment-3.2.0.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_work_bank/}
├── src/platform/config/config.schema.ts                      # RATE_LIMIT_WORK_AI_PER_HOUR
├── src/modules/works/                                         # the bank (no AI)
│   ├── types/{open-answer,multiple-choice,code,index}.ts      # registry (W5)
│   ├── rules/work-rules.ts                                    # pure
│   ├── grade/grade-values.ts                                   # applies distributeGrade to rows (W4)
│   ├── grading/{strategy,exact-match,test-cases,ai-review,decide,work-grade,registry}.ts  # W7
│   ├── views/{teacher-view,student-view}.ts                   # allowlist (W14)
│   ├── work.state-machine.ts
│   ├── works.{controller,service}.ts, work-query.ts, work-topics.ts, work-review.ts
│   └── works.module.ts
├── src/modules/work-ai/                                       # generation
│   ├── definitions/{work-generator,work-generation.prompt,read-work-generation-request.tool,request.ownership}.ts
│   ├── generation/{validate-generated-work,build-proposal,materialize,request-content}.ts
│   ├── work-proposal-closer.ts
│   ├── work-generation-requests.{controller,service}.ts
│   └── work-ai.module.ts
├── src/modules/ai/definitions/index.ts                         # + workAiDefinitions() (registration only)
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── fixtures/work-generation/                               # golden set, recorded.json, scorer
    ├── fixtures/evaluations/work-generation/*.json             # evidence (release gate)
    ├── eval/work-generator.eval.ts
    ├── integration/011-*.spec.ts
    ├── security/011-*.spec.ts, authorization-matrix.ts
    ├── works-boundary.spec.ts                                  # imports, no code execution, no tiers
    └── traceability.spec.ts                                    # SPECS += 011
packages/contracts/src/common/split-evenly.ts
packages/contracts/src/works/{enums,grade,works,work-generation,grading}.ts
apps/web/features/works/{api,components,hooks,schemas}/…
apps/web/app/(app)/trabalhos/…
apps/web/e2e/{work-bank.spec.ts, openrouter-mock.ts}
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo; the bank and the generation are two new modules
(`works`, `work-ai`) following the `exercises` / `exercise-ai` split, with no import between the
two banks (W1). The work AI definitions join `exerciseAiDefinitions()` in
`modules/ai/definitions/index.ts`.

## Complexity Tracking

No constitution violation to justify.
