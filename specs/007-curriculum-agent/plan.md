# Implementation Plan: 007 — Curriculum Agent: Leitura e Preenchimento Assistido da Ementa

**Branch**: `007-curriculum-agent` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-curriculum-agent/spec.md`

## Summary

This is the first domain agent on the AI Foundation. A new Nest module, `curriculum-ai`,
registers `curriculum-agent` v1 (L2, a single tool) and three routes: status, request an
analysis, and apply a proposal.

- **Request.** The request resolves the teacher's document. It requires `PROCESSED` + `TEXT`
  (no images, Clarification Q1). It collapses duplicates through a derived idempotency key
  (C13) and queues a 006 execution.
- **Execution.**
  1. The worker calls `claude-opus-5` through the first real provider (`anthropic`, the
     official SDK confined to `gateway/providers`, C2–C3).
  2. The model reads the document only through `read-curriculum-document`: normalized
     blocks from the 004 readers in the worker thread, with page or paragraph references
     (C7, C11).
  3. It returns a strict structured output (C5).
  4. The foundation hook `proposal.build` runs a deterministic grounding check, filters the
     source references and stamps the document checksum (C6, C8, C9).
  5. The result becomes a `CURRICULUM_EXTRACTION` proposal, or no proposal when nothing was
     found.
- **Review.** The teacher reviews it read-only, next to the original, and accepts fields and
  groups.
- **Apply.** "Aplicar à ementa" runs one domain transaction (C10): it checks the checksum,
  validates the content as a 004 draft, creates (or, when confirmed, rewrites) the single
  draft with source `AI_ASSISTED` linked to the proposal, and approves the proposal through
  the new `decideWithin`. The teacher then edits and confirms in the unchanged 004 editor
  (Clarification Q2).
- **Evaluation.** A golden set runs in CI on recorded responses and on demand against the
  real model, as the release gate (C17).

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (API built with SWC; `tsc --noEmit`)
**Primary Dependencies**:
- API: NestJS 11, Prisma 7, `nestjs-pino`, and **new: `@anthropic-ai/sdk`** (only under
  `src/modules/ai/gateway/providers/**`, FR-042);
- contracts: `@repo/contracts` (Zod 4);
- web: Next.js 16, React 19, Tailwind 4, shadcn/ui, Lucide, TanStack Query 5.

**Storage**: PostgreSQL 17. One migration: the enum value `AI_ASSISTED` and
`syllabus_revisions.ai_proposal_id` (FK, `UNIQUE`, `CHECK`). No new table. It writes
rows to the 006 `ai_*` tables ([data-model.md](./data-model.md)).
**Testing**:
- Vitest + `@nestjs/testing` + `supertest` against real PostgreSQL, with the 006 fake provider
  (`createAiTestApp`, `drain`) and the real curriculum definitions. It covers integration per
  story (`007-us1…us7`), the golden-set evaluation (`007-us6-evaluation`), the security
  suite (`007-*`: authorization, isolation, injection, concurrency, resilience) and the
  scans;
- pure unit tests: grounding, refs, build, output schema, provider mapping against a local
  HTTP mock;
- web: Vitest + RTL + `vitest-axe` + keyboard;
- Playwright: a local journey against a mock of the Messages API.

**Target Platform**: Linux server (API in a container) and current browsers; CI on GitHub
Actions (no real provider).
**Project Type**: web monorepo (NestJS API + Next.js web + contracts package)
**Performance Goals**:
- request answers in < 1 s;
- analysis of a 10-page ementa reaches a final state in ≤ 2 min p95 (SC-008);
- the tool's normalization of a 10-page PDF runs in < 3 s, inside the 10 s tool limit;
- apply in < 1 s.

**Constraints**:
- no document, proposal, prompt or output content in logs, audit or admin responses
  (SC-009);
- CI makes no real-provider calls;
- no image analysis or OCR;
- no new queue, Redis or WebSocket;
- WCAG 2.2 AA.

**Scale/Scope**:
- 7 stories and 51 FRs;
- 3 new routes and 3 changed contracts;
- 1 new page and 1 new panel;
- 2 audit types;
- 1 migration;
- 7 small generic foundation changes (C12).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**:
  - strict schemas on the three routes (workspace, agent, tools and risk fields refused);
  - the tool argument is checked against the execution's resource and ownership;
  - the model output is validated by the strict schema and then by the domain schema;
  - rate limits (10/h per teacher plus 006);
  - document text travels in `untrusted` (006 A19) and is rendered as text only;
  - OWASP LLM Top 10:
    - prompt injection: data/instruction separation, one tool, and `continue` on denial;
    - excessive agency: L2, no write tool;
    - insecure output handling: text-only rendering, domain revalidation;
    - unbounded consumption: 006 limits plus the agent's lower limits;
    - sensitive information disclosure: minimized context, no teacher name ✅
- [x] **II. RBAC**: `ementas.visualizar`/`ementas.revisar` + `ia.execucoes.visualizar`/`ia.propostas.revisar` per route; agent `requiredPermission = ementas.revisar`; context 404 by subject ownership ([contracts/permissions.md](./contracts/permissions.md)) ✅
- [x] **III. Server authority**: availability, active-execution dedupe, checksum, proposal state and draft slot are all decided on the server ✅
- [x] **IV. Untrusted code**: no code is executed; the model has no terminal, database, files or network ✅
- [x] **V. Data integrity**: Prisma migration; FK `Restrict`; `UNIQUE (ai_proposal_id)`; `CHECK` source ↔ proposal; 004 draft partial index and confirmed-revision trigger kept ✅
- [x] **VI. Audit & logs**: 2 domain audit types + the mapped 006 types, same transaction, ids and counts only ([contracts/audit-events.md](./contracts/audit-events.md)); logs use the 006 allowlist; the content marker is added to the scans ✅
- [x] **VII. Tests**: every `007/USn-k` and SC is in a test title; matrices; isolation (SC-002); failure and injection with no change (SC-003); double apply (SC-004); golden set (SC-005/006); manual flow without AI (SC-007); latency (SC-008); scans (SC-009); axe and keyboard ✅
- [x] **VIII. Layering**:
  - thin controller → `CurriculumAiRequestService` / `CurriculumAiApplyService` →
    repositories;
  - grounding, refs, build and sanitize are pure functions;
  - the provider is an adapter;
  - `curriculum-ai` uses only `AiExecutionsService`/`AiProposalsService` from `ai`, plus the
    syllabus services and repositories ✅
- [x] **IX. Simplicity**:
  - one dependency, which the spec requires;
  - no new table;
  - reuses the 004 draft/editor/confirm and the 006 components;
  - dedupe by derived idempotency key instead of a lock;
  - normalization on demand instead of storage and backfill;
  - no proposal editor (Q2) ✅
- [x] **X. Evidence**: usage, tokens, cost, durations and tool calls are recorded as facts (006); grounding is recorded as `RULE_RESULT` in the proposal ✅
- [x] **XI. Human oversight**: output = `SUGGESTION`; apply requires the teacher's explicit decision and still produces only a draft that the teacher confirms (`HUMAN_DECISION`) ✅
- [x] **XII. Determinism first**: the 004 deterministic extraction stays the default path; the AI is optional; grounding, checksum, limits and validation are deterministic; no OCR ✅
- [x] **XIII. Risk level**: agent L2, tool L1; the proposal is approved only by the domain flow (`approveThroughDomain`); no L3 ✅
- [x] **XIV–XV. AI governance**:
  - the model is not authoritative;
  - one allowlisted tool with a schema, authorization, timeout and audit;
  - minimized context (FR-011);
  - fully grounded: sources by page or paragraph, checksum, execution id;
  - the model's memory is never a source (prompt + grounding check) ✅
- [x] **XVI. Explicit states**: 006 execution and proposal machines; 004 revision machine; `409 INVALID_STATE_TRANSITION` ✅
- [x] **XVII. Idempotency**: derived idempotency key; `UNIQUE (ai_proposal_id)`; conditional decision; replay returns the same draft ✅
- [x] **XVIII. Safe interruption**: 006 deadlines, cancel between steps, per-agent and global kill switches; the provider can't be configured → disabled, while the manual flow works ✅
- [x] **XIX. AI evals**: versioned golden set (8 cases), scorer, CI mode on recorded responses and on-demand real-model gate before production; prompt and schema versioned ✅
- [x] **XX. Pedagogy**: N/A, no student monitoring
- [x] **XXI. Configurable domain**: no subject, language or technology in code, prompt or grounding; the POO case is test data ✅
- [x] **XXII. Personalization & accessibility**: no student data; WCAG 2.2 AA pages ✅
- [x] **XXIII. Curricular traceability**: every proposed item carries its document source when available; the draft links to the proposal, the proposal to the execution and the document ✅
- [x] **XXIV. Academic isolation**: document, execution, proposal and tool are scoped to the teacher; the ADMIN sees aggregates only ✅
- [x] **XXV. Privileged provisioning**: N/A
- [x] **XXVI. Shared contracts**: `curriculum/curriculum-ai.ts` (requests, responses, output schema, proposal content, warning codes) in `@repo/contracts`; the API validates with it; the web parses the proposal content with it ✅
- [x] **Frontend stack**: Tailwind + shadcn/ui (`Checkbox`, `AlertDialog`, `Alert`, `Tabs`, `Badge`) + Lucide; TanStack Query (polling); `fetch` only in `lib/api/client.ts`; no Redux ✅

**Result**: no violations. *Complexity Tracking* is empty.

**Post-design re-check** (after research, data-model and contracts): it still holds. Points
reviewed:

- **IX**: the seven foundation changes (C12) are generic, and each one is needed by a spec
  requirement:
  - `build` → FR-017/FR-021;
  - `decideWithin` + `approveThroughDomain` → FR-031/FR-036;
  - `availability` → FR-040;
  - derived key → FR-014;
  - metrics → FR-048;
  - production definitions → FR-042/FR-043.
- **I/XIV**: `onToolDenied: "continue"` is safe because a denied call returns no data and
  the allowlist has a single read tool.
- **Spec adjustments made during planning** (the spec was updated first, per CLAUDE.md):
  - FR-038: the pending proposal is **rejected** (a teacher decision) before the new
    execution, not in the same transaction;
  - FR-045: the spec events map to the 006 events instead of being duplicated.
- **FR-036 "erros por campo"**: the API error body has no field paths (project convention),
  so the web validates the selection with the same contract schema and flags the field; the
  API's `422 CURRICULUM_PROPOSAL_INVALID` is the guard.

## Project Structure

### Documentation (this feature)

```text
specs/007-curriculum-agent/
├── plan.md                    # this file
├── research.md                # C1–C20
├── data-model.md              # enum value, column, proposal content, invariants
├── quickstart.md              # validation script and release gate
├── contracts/
│   ├── http-api.md            # 3 routes, changed schemas, error codes
│   ├── curriculum-agent.md    # agent, tool, prompt v1, proposal build, Anthropic provider mapping
│   ├── permissions.md         # reused permissions and matrix rows
│   ├── audit-events.md        # 2 new types + mapping to 006
│   └── web-ui.md              # panel, proposal page, editor notice, admin columns
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── curriculum/curriculum-ai.ts   # CurriculumExtractionOutputSchema, CurriculumWarningCode, CurriculumProposalContentSchema,
│                                 # CurriculumAiStatus, RequestCurriculumAnalysis*, ApplyCurriculumProposal*
├── curriculum/syllabus.ts        # + AI_ASSISTED, aiProposalId
├── ai/operations.ts              # + agent metrics fields
├── common/errors.ts              # + 5 codes
└── endpoints.ts                  # + 3 routes

apps/api/
├── package.json                                   # + @anthropic-ai/sdk, script eval:curriculum
├── prisma/schema.prisma + migrations/<ts>_curriculum_agent/
├── src/modules/ai/
│   ├── definitions/{types.ts (+build, approveThroughDomain), index.ts → productionAiDefinitions(config)}
│   ├── gateway/providers/{anthropic.provider.ts, json-schema-sanitize.ts}      # the only SDK import
│   ├── execution/{ai-execution.runner.ts (build hook, no-proposal completion), ai-executions.service.ts (+availability, derived key)}
│   ├── proposals/ai-proposals.service.ts          # + decideWithin, getForUpdate, approveThroughDomain check
│   └── operations/ai-metrics.query.ts             # + proposal, validation, token and cost aggregates
├── src/modules/curriculum-ai/
│   ├── curriculum-ai.module.ts, curriculum-ai.controller.ts
│   ├── curriculum-ai-request.service.ts           # status, request (C13, C14)
│   ├── curriculum-ai-apply.service.ts             # apply (C10)
│   ├── definitions/{curriculum-agent.ts, curriculum-extraction.prompt.ts, read-curriculum-document.tool.ts, syllabus-document.ownership.ts}
│   └── proposal/{grounding.ts, source-refs.ts, build-proposal.ts, item-ids.ts, derived-uuid.ts} (+ .spec.ts)
├── src/modules/syllabus/
│   ├── extraction/{source-line.ts (+ref), pdf-lines.ts, docx-lines.ts, normalize.ts, extract.worker.ts (+normalize message)}
│   ├── syllabus-worker-runner.ts                  # + normalize()
│   ├── syllabus-revisions.service.ts              # refuse AI_ASSISTED on create; view + aiProposalId
│   └── syllabus-revision-drafts.ts                # shared "write draft content" used by save and apply
├── src/modules/audit/audit-event-types.ts         # + 2 types
├── src/platform/config/config.schema.ts           # + ANTHROPIC_API_KEY?, ANTHROPIC_BASE_URL?, RATE_LIMIT_CURRICULUM_AI_PER_HOUR
├── scripts/eval-curriculum.ts                     # on-demand eval (compiled)
└── test/
    ├── fixtures/curriculum-agent/{golden/<case>/{document, expected.json, recorded.json}, build-golden.ts, README.md}
    ├── helpers/curriculum-ai.ts                   # createCurriculumAiApp (real curriculum definitions + fake provider), script helpers
    ├── integration/007-us{1..7}-*.spec.ts, 007-us6-evaluation.spec.ts
    └── security/007-curriculum-ai-{authorization,isolation,injection,concurrency,resilience}.spec.ts
                 + updates: authorization-matrix, 004/006 matrices, audit-coverage, domain-boundary, secret-leak-scan,
                   006-ai-no-real-provider, 006-ai-boundary, endpoint-catalog, traceability (SPECS + 007), journey

apps/web/
├── app/(app)/disciplinas/[id]/ementa/[documentId]/proposta/[proposalId]/page.tsx
├── features/curriculum-ai/{api,hooks,components}/ # CurriculumAiPanel, CurriculumProposalReview, CurriculumWarning, SourceRef
├── features/syllabus/components/{syllabus-document-detail.tsx (+panel), syllabus-revision-editor.tsx (+AI notice), syllabus-versions-list.tsx (+label)}
├── features/ai-operations/components/…            # + metrics columns
├── lib/messages/error-messages.ts                 # + codes and availability/warning texts
└── e2e/{curriculum-ai.spec.ts, anthropic-mock.ts}
```

**Structure Decision**:
- A domain module, `curriculum-ai` (C1), sits between `syllabus` (which owns the data) and
  `ai` (which owns execution).
- The provider sits inside the 006 boundary.
- The web gets one new feature folder and one route.
- The test fixtures for the golden set sit next to the 004 syllabus fixtures.

## Impact on existing artifacts

- **Spec 004**:
  - new revision source `AI_ASSISTED`, which the create route refuses;
  - the draft write is extracted into a shared helper (behavior unchanged; the 004 tests
    must stay green);
  - the worker thread gains a `normalize` message; extraction and `EXTRACTOR_VERSION` are
    unchanged.
- **Spec 006**:
  - the C12 changes are backward-compatible for the reference agents (no `build` → old
    behavior);
  - `006-ai-no-real-provider.spec.ts` changes: production registers the provider only with a
    key; the tests stay fake-only;
  - `006-ai-boundary.spec.ts` must see `@anthropic-ai/sdk` only under `gateway/providers`.
- **Guards**:
  - `traceability.spec.ts` gets `SPECS` + 007;
  - `audit-coverage.spec.ts` gets the 007 catalog;
  - `domain-boundary.spec.ts` gets a 007 entry;
  - `endpoint-catalog`, the authorization matrices and `route-declarations` get the 3 routes;
  - `secret-leak-scan` gets the 007 marker and the fake key;
  - the contracts `duplication.spec.ts` needs no new types in api/web.
- **Config**:
  - `.env.example`: `ANTHROPIC_API_KEY=` (empty = AI disabled),
    `RATE_LIMIT_CURRICULUM_AI_PER_HOUR=10`;
  - `.env.test.example`: no key.
- **Docs** (Polish phase):
  - `DEPENDENCIES.md`: `@anthropic-ai/sdk` and why;
  - `CLAUDE.md`: the `curriculum-ai` module, the provider, the eval command and decisions
    C1–C20;
  - `apps/api/CLAUDE.md`: `createCurriculumAiApp` and the golden fixtures.

## Complexity Tracking

No constitution violations to justify.
