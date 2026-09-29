# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last updated: 2026-09-29 (010 implemented)

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Features 001–010 in `specs/` are all implemented; later work starts
a new feature through `/speckit-specify`.

- 001 foundation, identity and access; 002 the same behavior on the official stack (shared Zod
  contracts, web stack, Playwright E2E, GitHub Actions CI).
- 003 classes, class invitations by e-mail (the only way a student account is created),
  enrollments, "Minhas turmas".
- 004 subjects, syllabus upload/extraction/review, class calendar, class plan with manual topics
  and coverage; US9 (2026-09-24 amendment) marks a topic's class completed. A teacher lands on
  "Minhas disciplinas" after login.
- 005 design system and the Exam Mode visual contract (exam components are specified only; the
  assessments feature builds them).
- 006 AI foundation with no domain agent and no real provider (tests use the reference agents and
  fake provider in `apps/api/test/fixtures/ai`).
- 007 Curriculum Agent ("Preencher com IA" → L2 proposal → `AI_ASSISTED` 004 draft); 008 OpenRouter
  as the only real provider, task routing, fallback, circuits; 009 model policy (catalog in code,
  cheapest approved model of the task's tier).
- 010 the teacher's private exercise bank, with "Criar com IA" through `exercise-generator`; the
  Curriculum Agent v3 also proposes the syllabus's programming language.

AI agents (`curriculum-agent`, `exercise-generator`) are registered DISABLED until the admin enables
them. Both tasks are BASIC and served by `openai-basic`, the only model that passed their release
gates (`anthropic-basic` was never evaluated: OpenRouter answered 402, no credit; `deepseek-basic`
failed both on 2026-09-29, schema validity 0 and 0.17), so they have no same-tier fallback until a
second BASIC model is approved. DeepSeek joined the family allowlist on 2026-09-29 (009 amendment).

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions R1–R23 in 001, S1–S19 in 002, D1–D16 in 003, E1–E23 in 004, V1–V20 in 005, A1–A22 in 006, C1–C20 in 007, G1–G20 in 008, H1–H16 in 009, X1–X20 in 010), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.

`.specify/memory/constitution.md` (v3.1.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

`docs/adr/` records architecture decisions (ADR-0001: the multi-model AI architecture of 006–009).
ADRs only describe what the constitution and the specs decide; they never change a rule, and when
they diverge the spec wins and the ADR is fixed.

`.specify/scripts/bash/update-agent-context.sh` rewrites the `## Active Technologies` and
`## Recent Changes` sections of this file in place — keep those headings; everything else here is
hand-maintained.

## Active Technologies
- No new dependencies; PostgreSQL tables `classes`, `class_invitations`, `class_invitation_deliveries` (mail outbox + in-process retry worker), `enrollments`; `student_profiles.ra`/`status`; `turmas.*` permissions (003-class-invitations-enrollment)
- `@repo/contracts` (Zod 4 via pnpm catalog, ESM built with `tsc`); web: Tailwind CSS 4, shadcn/ui (Radix), Lucide, TanStack Query 5, React Hook Form 7 + `@hookform/resolvers`; E2E: Playwright; CI: GitHub Actions (002-stack-alignment)
- TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19 (001-foundation-identity-access)
- New deps `pdfjs-dist`, `fflate`, `fast-xml-parser` (api) and `react-day-picker` (web, shadcn Calendar); PostgreSQL tables `subjects`, `stored_files` (bytea), `syllabus_documents` (processing queue + in-process worker, extraction in `worker_threads`), `syllabus_revisions`/`groups`/`items`, `class_meetings`, `class_plans`, `topics`, `topic_syllabus_items`; `classes.subject_id`/`starts_on`/`ends_on`; `disciplinas.*`, `ementas.*`, `calendario.gerenciar`, `planejamento.*` permissions (004-syllabus-planning)
- No new dependencies; design tokens in `apps/web/design-system/tokens.css` (Tailwind 4 default scales reset), Inter + JetBrains Mono as local fonts (Geist removed), new shadcn components from the installed `radix-ui`; no API, schema or contract changes (005-design-system)
- No new dependencies and no provider SDK; `modules/ai` (registry synced from code, model gateway, tool executor, structured output, proposals, worker on the `ai_executions` table); 15 `ai_*` PostgreSQL tables; `ia.*` permissions; reference agent and fake provider only in `apps/api/test/fixtures/ai` (006-ai-foundation)
- New dep `@anthropic-ai/sdk` (removed in 008; api, only under `src/modules/ai/gateway/providers/**`; first real provider, `claude-opus-5`, registered only with `ANTHROPIC_API_KEY`); module `modules/curriculum-ai` (agent `curriculum-agent`, tool `read-curriculum-document`, grounding check, apply into a 004 draft); `syllabus_revision_source` + `AI_ASSISTED`, `syllabus_revisions.ai_proposal_id`; no new table or permission (007-curriculum-agent)
- No new dependency, `@anthropic-ai/sdk` removed: OpenRouter is the only real provider, over Node's native `fetch` (`gateway/providers/openrouter.provider.ts`, registered only with `OPENROUTER_API_KEY`); task routing (`ai_tasks`: primary + fallback model config), fallback in `ModelGateway`, in-memory circuit breaker, per-agent hourly limit; new columns on `ai_agent_versions`, `ai_executions`, `ai_model_calls` (008-ai-gateway-openrouter)
- No new dependency: model catalog in code (`definitions/model-catalog.ts`: families OpenAI/Anthropic/TypeSafe/DeepSeek, tier BASIC/STANDARD/ADVANCED, mode generation/decision, lifecycle, approvals backed by committed eval evidence), pure `selectRoute` in `modules/ai/policy`, same-tier fallback and one-step escalation; OpenRouter decisions route for Jev; tables `ai_model_task_approvals`, `ai_task_overrides`, `ai_budget_alerts` (009-ai-model-policy)
- No new dependency: exercise bank (`modules/exercises`: tables `exercises`, `exercise_alternatives` with DB-enforced 3–5 alternatives / one correct, types as a registry, teacher × student views by allowlist) and AI generation (`modules/exercise-ai`: `exercise_generation_batches`, L2 agent `exercise-generator` on task `exercise-generation`, drafts materialized by a `proposal.materialize` foundation hook); `programming_languages` catalog (seeded) and `syllabus_revisions.language_id`; `questoes.*`, `ia.exercicios.gerar` permissions (010-exercise-bank)

## Stack notes

Monorepo: pnpm 11 workspaces + Turborepo; PostgreSQL 17; tests with Vitest (`unplugin-swc`),
`@nestjs/testing` + `supertest` against a real PostgreSQL, Testing Library + `vitest-axe` on web.
If TS 7 rejects Nest decorators, the documented fallback (R1) is pinning `typescript@~5.9` in
`apps/api` only.

## Commands

```bash
docker compose up -d postgres postgres-test mailpit     # dev DB :5432, test DB :5433 (tmpfs), Mailpit SMTP :1025 / UI :8025
                                                        # ports overridable: POSTGRES_PORT, POSTGRES_TEST_PORT, MAILPIT_*_PORT
pnpm dev | pnpm build | pnpm lint | pnpm check-types | pnpm test   # turbo across workspaces
pnpm format                                             # prettier on ts/tsx/md

# apps/api (port 4000) — copy .env.example to .env first (fill APP_HMAC_SECRET: openssl rand -base64 48;
# the API refuses to start if a required var is missing); tests use .env.test.example and refuse
# any DB whose name lacks "test". Web: copy apps/web/.env.example to .env.local
pnpm --filter api prisma generate                       # client -> src/generated/prisma (gitignored); also runs on `pnpm install`
pnpm --filter api prisma migrate deploy                 # migrations also seed roles/permissions; prisma.config.ts loads apps/api/.env
pnpm --filter api dev                                   # swc watch into dist/ + node --watch
pnpm --filter api test                                  # all unit + integration + security (needs postgres-test up)
pnpm --filter api test test/integration/003-us6-enrollments.spec.ts      # single file (no `--`: pnpm 11 passes it on and vitest drops the filter)
pnpm --filter api test -t "<test name>"                          # single test, or an id prefix such as "009/"
pnpm --filter api test:security                         # test/security only
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN (runs dist/, build first)
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs (runs dist/)
pnpm --filter api fixtures:syllabus                     # rebuild test/fixtures/syllabus/* (004 upload/extraction fixtures)
pnpm --filter api fixtures:curriculum                   # rebuild test/fixtures/curriculum-agent/golden/*/document.* (007)
OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum  # on-demand golden-set eval of the catalog candidates of the analysis's tier (costs cents)
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:curriculum
                                                        # 009 release gate: one catalog entry; writes test/fixtures/evaluations/<task>/<key>.json
                                                        # (skipped when a case failed for infrastructure); EVAL_REPLAY=1 rewrites recorded.json
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:exercises
                                                        # 010 release gate of the exercise generator, same flags; evidence in
                                                        # test/fixtures/evaluations/exercise-generation/, with each case's latency

# apps/web (port 3000) — API_ORIGIN (default http://localhost:4000) is the rewrite target
pnpm --filter web dev
pnpm --filter web test                                  # Vitest + jsdom + Testing Library + vitest-axe

# packages/contracts
pnpm --filter @repo/contracts build                     # tsc -> dist/ (api and web import it)
pnpm --filter @repo/contracts test                      # boundary, duplication, zod-version guards

# E2E (Playwright): own API :4100 + web :3100, DB devtrack_e2e reset each run, emails via Mailpit
docker compose up -d postgres-test mailpit
pnpm build                                              # the E2E API runs apps/api/dist
pnpm --filter web exec playwright install chromium      # first time only
pnpm --filter web test:e2e
```

The API builds with SWC into `dist/`; `tsc` only type-checks (`check-types`). The CLI scripts run
compiled code, so run `pnpm --filter api build` before them. Root `pnpm check-types`/`pnpm test`
build `packages/contracts` first (turbo `^build`); a filtered run (`pnpm --filter api check-types`)
needs `pnpm build` beforehand.

CI (`.github/workflows/ci.yml`, actions pinned by SHA) runs `pnpm lint`, `check-types`, `build` and
`test` against a PostgreSQL 17 service on every push and pull request. E2E runs locally only.
`prisma migrate reset` (used by the E2E `e2e/prepare-db.ts`) refuses to run under an AI agent
unless the user consents; the E2E aborts unless the DB name contains `e2e`.

API test harness, API-only guards and the per-feature security suites (test DB setup, `resetDb`,
`createTestApp`, audit/secret scans, 004–010 suites): see `apps/api/CLAUDE.md`, loaded when working
under `apps/api`.

Cross-cutting guards that fail when the spec and the code drift apart:
- `apps/api/test/traceability.spec.ts` parses the `spec.md` of each feature listed in its `SPECS`
  (001, 003, 004, 005, 006, 007, 008, 009 and 010; the on-demand evals' `apps/api/test/eval/*.eval.ts` counts
  too). Every `USn-k` scenario, every traceability row and the listed SC ids must appear
  in a `describe`/`it`/`test` title (API, web unit and `apps/web/e2e`), so name new tests with
  their scenario or SC/FR id. 001 ids are bare; later features carry their number (`003/US1-1`,
  `003/SC-004`), which never covers the bare 001 id. A new feature is checked once it's added to
  `SPECS`.
- Per-feature API security and integration suites (004–010) and the endpoint catalog guard: see
  `apps/api/CLAUDE.md`.
- E2E AI flows (007 POO analysis, 010 `exercise-bank.spec.ts` replaying `sql-joins-sem-linguagem`)
  run against `apps/web/e2e/openrouter-mock.ts`, the local mock of OpenRouter's chat completions
  that the E2E API's `OPENROUTER_BASE_URL` points to (`MOCK_PRIMARY_DOWN=1` answers 503 to the
  primary model; `MOCK_PRIMARY_MODEL` defaults to the catalog's cheapest BASIC id).
- Web: `apps/web/test/keyboard.ts` (`expectTabOrder`, `tabTo`, `expectFieldErrorLinked`) backs
  the `SC-012` keyboard tests in each page's test file.
- Contracts (`packages/contracts/test/`): `boundary.spec.ts` (no Prisma/Nest/React imports and no
  user-facing text in the package), `duplication.spec.ts` (no contract type redefined in api or
  web), `zod-version.spec.ts` (one Zod version in the lockfile; every workspace uses `catalog:`).
- Web: `test/lint-boundaries.test.ts` runs the real ESLint config to pin the layer rules, and
  `test/contrast.test.ts` checks the token pairs of `tokens.css` for WCAG AA in both themes.
- Web design system (`apps/web/test/design-system/`): `token-usage.test.ts` fails with file:line
  on any color, font size, spacing step, radius, shadow, font family, breakpoint or icon size
  outside the tokens (rule `valores`) and on a `<button>`, `<select>`, `<textarea>`, `<table>`,
  checkbox or radio recreated outside `components/ui` (rule `controles`), and keeps the
  `ds-exception` markers equal to `exceptions.md`; `identity.test.ts` pins fonts and icons (Lucide
  only, `font-mono` only in `components/ui`); `docs.test.ts` checks that every token, catalog
  entry and Exam Mode component is documented; `features/design-system/components/catalog.test.tsx`
  runs axe and Tab over the whole catalog. A new foundational component needs a registry entry,
  a showcase and a `components.md` section.

Unsafe HTTP methods need both an allowed `Origin` and `Content-Type: application/json` (send
`{}` if there's no body), even from curl or scripts. Otherwise the API returns
`403 ORIGIN_NOT_ALLOWED` (`OriginGuard`, R6).

Transitive vulnerabilities are patched via `overrides` in `pnpm-workspace.yaml`. The reasons and
the removal conditions are in `DEPENDENCIES.md`.

## Architecture

- `apps/api` (NestJS): `AppModule.forRoot(config, …)` is built from the
  Zod-validated config (`src/platform/config`); `app.setup.ts` applies the HTTP setup shared by
  `main.ts` and the tests.
- `apps/web` (Next.js App Router) calls the API through a same-origin rewrite `/api/* → API`
  (`next.config.js`, which also sets `Referrer-Policy: no-referrer` on token-bearing pages, and
  raises the rewrite's body limit, `experimental.proxyClientMaxBodySize`, so a 10 MB syllabus
  upload is not cut; the API enforces the real limit).
  `proxy.ts` only redirects for UX and never authorizes.
- `packages/contracts` (`@repo/contracts`, constitution principle XXVI) holds every API↔web
  contract as Zod schemas, one directory per API domain (`common`, `auth`, `me`, `accounts`,
  `provisioning`, `admin-activation`, `health`, `classes` for classes, class invitations,
  enrollments and "Minhas turmas", `ai` for the 006 executions, proposals and operations,
  `curriculum` for 004 subjects, syllabus, class meetings and class plans plus the 007
  `curriculum-ai.ts`, and `exercises` for the 010 bank and its AI batches), with types derived through `z.infer`
  (`XxxSchema` / `Xxx`). `endpoints.ts` catalogs every route with its request and response
  schemas. Responses describe the JSON on the wire (dates are ISO strings). The package holds no
  Prisma, service or UI-state types and no user-facing messages. One Zod version comes from the
  pnpm catalog. API controllers validate input with the contract schemas and services return the
  contract types. The package builds to `dist/`, which api and web import.
- Web design system (005): every visual value comes from `apps/web/design-system/tokens.css`
  (semantic colors with light and dark values, type scale, radii, shadows, layers, breakpoints,
  motion, focus); the Tailwind default scales are reset there, so `bg-red-500`, `text-2xl` or
  `shadow-lg` generate no CSS. Layers: tokens → `components/ui` (foundational components) →
  `components/layout` → `features` → `app` (ESLint-enforced). `components/layout` holds `AppShell`
  (side menu, `Topbar`, `main#conteudo`), `PageHeader` (every page's `<h1>`), `StudentLayout` and
  `accountLayoutFor`. Route groups only choose the frame, never the URL: `app/(app)` AppShell,
  `app/(student)` student layout, `app/(account)` either one by `STAFF_AREA_PERMISSIONS` (menu
  permissions, never role names), `app/(catalog)/design-system` the visual catalog (built from
  `features/design-system/registry.ts`; `notFound()` in production). Docs: `README.md`,
  `tokens.md`, `components.md`, `layouts.md`, `exam-mode.md` and `exceptions.md` in
  `apps/web/design-system/`.
- Web (official stack): Tailwind + shadcn/ui (`components/ui`) + Lucide; TanStack Query for
  server state; React Hook Form + `@hookform/resolvers`; native `fetch` only in
  `lib/api/client.ts`. Redux Toolkit is not installed: add it only with the first spec that has
  real global client state, and never make it authoritative over exam rules. Code goes in
  `apps/web/features/<feature>/{api,components,hooks,schemas,store,types}`, with `app/` at the
  root (no `src/`). Components call hooks, hooks call `features/*/api`, and only that layer
  touches `lib/api` (ESLint-enforced). User-facing error text comes from the catalog in
  `lib/messages/error-messages.ts`, keyed by the API error `code`.
- Protected request pipeline: `OriginGuard → SessionGuard (401) → VerifiedGuard (403) →
  PermissionsGuard (403) → ZodValidationPipe (400) → controller → service (scoped queries → 404;
  rule violations → 409/422) → AuditService (same transaction)`. Guards are global and
  deny-by-default: every route needs `@Public()` or `@RequirePermissions()`/`@AllowUnverified()`.
- 003 modules (`apps/api/src/modules`): `classes` (`ClassContextPolicy` scopes every lookup to the
  session teacher's own classes → 404 otherwise), `class-invitations` (invite, list, resend, cancel;
  public preview/accept through `RoleGrantAcceptance`, which grants `STUDENT` and creates the
  enrollment) and `enrollments` (the teacher's student list and removal, plus the student's
  `GET /me/classes`). Invitation e-mails go through the `class_invitation_deliveries` outbox: the
  first attempt runs after the commit, then the in-process `ClassInvitationDeliveryWorker` (`FOR
  UPDATE SKIP LOCKED`) retries every `MAIL_RETRY_INTERVAL_SECONDS` (0 disables the timer; tests
  call `runOnce(now)`) with waits of 1 min to 6 h, FAILED after 7 attempts; a retry issues a
  fresh token and supersedes the old link.
- 004 modules: `subjects` (`SubjectContextPolicy`, same 404 scoping as classes; syllabus documents
  and revisions are reached through their subject), `syllabus` (multipart upload through
  `SyllabusFileInterceptor` in `platform/http/upload.ts`, on routes marked `@AcceptsMultipart()` so
  `OriginGuard` lets `multipart/form-data` through; the file is inspected in a worker thread before
  anything is written, then the original goes into `stored_files` (bytea, immutable by trigger)
  through `FileStorage` in `platform/storage`; `SyllabusProcessingWorker` claims `UPLOADED`
  documents every `SYLLABUS_PROCESSING_INTERVAL_SECONDS` (0 disables the timer) with a lease and
  runs extraction in a `worker_threads` worker via `SyllabusWorkerRunner`, with the state machine in
  `syllabus-processing.state-machine.ts`; confirmed revisions are immutable by trigger; worker test
  setup is in `apps/api/CLAUDE.md`) and
  `class-plans` (the class calendar, where the meeting number comes from `row_number()` and is never
  stored; plan and topic state machines; `bumpRevision` in `plan-revision.guard.ts` starts every plan
  write, and `TopicMutations` holds the move/merge/archive operations that both the calendar and the
  topics use; a `COMPLETED` topic (US9) is locked except for archive and "Reabrir aula", can't be
  restored once archived, and "today" comes from `planning-date.ts`, America/Sao_Paulo).
- 006 module `ai` (`apps/api/src/modules/ai`, folders by responsibility, research A3):
  `definitions` (agents, prompts, output schemas, tools, tasks and model configs are code, research A4;
  `productionAiDefinitions(config)` registers the 007 `curriculum-agent`, DISABLED until the admin
  enables it, its `curriculum-extraction` task and, since 009, the model catalog of
  `model-catalog.ts` (008's `openrouter-default`/`openrouter-fallback` configs built from the
  environment are gone); a task with no usable approved model is unavailable and logs
  `ai.task_unavailable` instead of stopping the API, and a changed model is audited as
  `ai_model_config.changed`), `registry` (`AiRegistrySync`
  writes them to the `ai_*` tables at startup under an advisory lock; a used version (`used_at`)
  whose content changed stops the startup, and a trigger refuses the update: publish a new
  version), `gateway` (`ModelGateway` runs the task's route fixed on the execution: the primary with
  its timeout and retries of transient failures, then, after a recoverable failure or an open
  circuit, the fallback once, never back to the primary, each leg written to `ai_model_calls`
  with the served model and the provider's cost; `CircuitBreaker` per model config, in memory,
  audited `ai_circuit.opened`/`closed`; errors normalized; real providers live in
  `gateway/providers/**`, the only place a provider SDK or host may appear: `OpenRouterProvider`,
  008, over native `fetch`),
  `tools` (`AiToolExecutor`: allowlist, enabled, permission, strict input, resource owned by the
  workspace, timeout, strict output, and a result within the model's input limit), `output` (structured output validated by the agent's Zod schema),
  `execution` (`POST /ai/executions` queues, after the per-user limits and, since 008, the
  per-agent hourly limit `AI_AGENT_EXECUTIONS_PER_HOUR`; `AiExecutionWorker` claims `QUEUED` rows with
  `SKIP LOCKED` every `AI_EXECUTION_INTERVAL_SECONDS`, `0` = global kill switch; the runner
  re-authorizes at start and checks cancellation between steps; the workspace is always the
  session user), `proposals` (L2 output becomes a proposal the teacher approves, partially
  approves or rejects; approving never writes domain data), `usage` (tokens and cost in
  `ai_model_calls`), `operations` (admin health, metrics, agents and configs, never content),
  `evaluation` (`AiEvaluationStore`, no routes) and `retention` (maintenance job `ai-records`).
  An agent whose proposal has `approveThroughDomain` (007) is approved only by its domain's apply
  flow through `AiProposalsService.decideWithin`; the 006 decision route accepts only REJECT.
- 009 model policy (`apps/api/src/modules/ai`): `definitions/model-families.ts` (allowlist, tiers,
  modes, lifecycle and its transitions), `definitions/model-catalog.ts` (the only concrete model ids;
  entries with price, capabilities and approvals that point at committed evidence), task policies
  on `ai_tasks` (`policy/task-policy.ts`: minimum, preferred and max tier, families, capabilities,
  fallback, escalation, quality thresholds, typical usage). `policy/select-route.ts` is pure: filter
  (family, mode, capabilities, PRODUCTION with a valid approval, DEPRECATED only when nothing else,
  tier), order (override if usable, estimated cost, unknown price last, priority, key), fallback of
  the same tier preferring another family; health never reorders. `AiPolicyRegistry` feeds it from
  the synced tables (`ai_model_task_approvals`, `ai_task_overrides`) and fixes the route on the
  execution with its tier and reason. The runner escalates once, to the next tier, after an invalid
  output when the task says so. `AiRegistrySync` refuses an invalid lifecycle transition (the entry
  leaves the catalog) and audits `ai_model_config.lifecycle_changed`. The admin override
  (`PUT/DELETE /ai/operations/tasks/:key/override`) accepts only a model the policy admits;
  `usage/ai-budget.monitor.ts` checks the budgets after each recorded call and audits
  `ai_budget.exceeded` once per period (`ai_budget_alerts`). Decision-mode models (TypeSafe's Jev)
  answer through `ModelGateway.decide` (OpenRouter decisions, `contracts/decisions-provider.md`).
- 007 module `curriculum-ai` (`apps/api/src/modules/curriculum-ai`, research C1): the
  `curriculum-agent` definition, its prompt and output schema, the `read-curriculum-document` tool
  (only the execution's own document, normalized by the 004 readers in the worker thread) and the
  `SYLLABUS_DOCUMENT` ownership; `proposal/` (pure: item ids, deterministic grounding check that
  flags `UNSUPPORTED_CONTENT`, source refs kept only when the block has the text);
  `CurriculumAiRequestService` (status and request: per-teacher hourly limit, one active analysis
  per document by a derived idempotency key, a pending proposal discarded only when the teacher
  confirms) and `CurriculumAiApplyService` (locks the document, the proposal and the draft, checks
  the source hash, validates the accepted content as a 004 draft, creates or replaces the draft
  and approves the proposal in one transaction; idempotent). The AI module never writes syllabus
  data.
- 010 modules: `exercises` (the bank: types as a registry, pure rules, teacher and student views
  (`toStudentView` copies an allowlist), `ExercisesService` with optimistic `version` under a row
  lock, keyset list in `exercise-query.ts`, archive/restore, `ExerciseBatchReview` hook; never
  imports AI code) and `exercise-ai` (batches: request with the idempotency key and the execution in
  one transaction; the `exercise-generator` definition, prompt and `read-exercise-generation-request`
  tool; `validate-generated-batch` refuses an answer that doesn't match the request; the
  `proposal.materialize` foundation hook writes the DRAFT exercises in the runner's transaction;
  `ExerciseProposalCloser` decides the proposal once no draft is left). The OpenRouter adapter's
  `sanitizeJsonSchema` writes `oneOf` as `anyOf` (strict structured output refuses `oneOf`).
- Auth is opaque, revocable server-side sessions (cookie `__Host-devtrack_session`), not JWT. All
  session revocation goes through `SessionService.revokeAllForUser(userId, reason, tx)`.

## Rules that are easy to get wrong

- Authorization = explicit permission (`recurso.acao`, e.g. `professores.convidar`) **and**
  resource context. Never check role names or `isAdmin`-style flags. Missing capability → `403`;
  has capability but resource outside the user's context → `404` (don't reveal existence).
- One `User` identity with many roles via `User → UserRole → Role → RolePermission → Permission`;
  never a `users.role` column. No public self-signup (constitution 3.0.0): student accounts come only from
  accepting a teacher's class invitation (spec 003); `POST /auth/signup` and `/cadastro` are gone (FR-048).
  `TEACHER`/`MANAGER` come only from invitations; the first `ADMIN` only from the CLI (no endpoint,
  seed, default password or env credentials). The last active `ADMIN` can't be removed.
- Workflows use explicit state enums, not boolean flags; invalid transitions → `409
  INVALID_STATE_TRANSITION`. Critical operations must be idempotent and concurrency-safe
  (unique/partial indexes, `SELECT … FOR UPDATE`, `pg_advisory_xact_lock`, conditional `UPDATE …
  RETURNING`).
- Anti-enumeration: auth flows return identical responses for existing/non-existing emails; emails
  are sent after commit, off the response path.
- Audit events are written in the same transaction and the table is append-only (DB trigger).
  Never log passwords, tokens, cookies or secrets; tokens are stored only as hashes.
- Layering: thin controllers → services → Prisma repositories. `*.controller.ts` can't import
  Prisma, `PrismaService` or the transaction helpers (ESLint-enforced). No business rules in
  React components.
- Errors are always `{statusCode, code, message}` with no stack traces or internals.
- Schema changes only via Prisma migrations. Subjects/languages/technologies are data, never enums
  or conditionals in code.
- No Redis, queues, WebSockets or new dependencies without a spec that requires them.
- UI only with Design System tokens and components: no literal colors, sizes, spacing steps,
  radii, shadows or fonts, and no recreated controls. An exception needs a
  `ds-exception: <reason>` marker on (or just above) the line and a row in
  `apps/web/design-system/exceptions.md`. Destructive actions use `variant="danger"` with explicit
  text; states never rely on color alone.

## Recent Changes
- 010-exercise-bank: private exercise bank — manual sets of 3–10 or single exercises (open answer, multiple choice, code; difficulty and cognitive objective), AI generation from a syllabus item through the existing gateway and model policy into DRAFT batches reviewed and approved by the teacher; student view never carries answers; syllabus language catalog, proposed by Curriculum Agent v3
- 009-ai-model-policy: model policy over the 008 gateway — approved catalog per family and tier, task policies, cheapest approved model of the task's tier, same-tier fallback, escalation only by explicit rule, admin override, cost by task/tier/family, observable budgets; Curriculum Agent analysis to BASIC after a release-gate eval
- 008-ai-gateway-openrouter: OpenRouter replaces the direct Anthropic provider; agents declare a task, the gateway routes it to a primary and a fallback model with a circuit breaker; Curriculum Agent v2 with unchanged rules

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
