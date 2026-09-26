# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last updated: 2026-09-25 (006 implemented)

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Phase 001 (`specs/001-foundation-identity-access`) is fully
implemented: all 110 tasks in `tasks.md` are checked, US1–US8 plus the Polish phase. Phase 002
(`specs/002-stack-alignment`) refactored it onto the official stack without changing behavior:
shared Zod contracts, the frontend stack, Playwright E2E and GitHub Actions CI. Phase 003
(`specs/003-class-invitations-enrollment`) is implemented: teachers' classes, class invitations
by e-mail (the only way a student account is created), enrollments and "Minhas turmas". Phase 004
(`specs/004-syllabus-planning`) is implemented: all tasks in `tasks.md` are checked: subjects,
syllabus upload and extraction, syllabus review, the class calendar, the class plan with manual
topics and coverage, topic editing, plan status (US1–US7), the isolation of the teacher's area
(US8), the Polish phase and the 2026-09-24 amendment US9 (a topic's class marked completed). A teacher starts on "Minhas disciplinas" after login. Phase 005 (`specs/005-design-system`) is
implemented: design tokens, Inter + JetBrains Mono, the foundational components with standard
variants and states, the AppShell and the student layout, the `/design-system` catalog, the
documentation in `apps/web/design-system/` and the Exam Mode visual contract (exam components are
specified only, built by the assessments feature). Phase 006 (`specs/006-ai-foundation`) is
implemented: the AI foundation (US1–US9 plus the Polish phase), with the registry of agents,
prompts, output schemas, tools and model configs synced from code, the provider-independent
gateway, deny-by-default tools, validated structured output, L2 proposals reviewed by the
teacher, bounded async execution with usage and cost, audit, the admin "Operação de IA" screen
and the AI state components of the design system. It ships no domain agent and no real
provider: production registers nothing, and the tests use the reference agents and the fake
provider of `apps/api/test/fixtures/ai`. Later work starts a new feature through
`/speckit-specify`.

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions R1–R23 in 001, S1–S19 in 002, E1–E23 in 004, V1–V20 in 005, A1–A22 in 006), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.

`.specify/memory/constitution.md` (v3.0.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

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
- New dep `@anthropic-ai/sdk` (api, only under `src/modules/ai/gateway/providers/**`; first real provider, `claude-opus-5`, registered only with `ANTHROPIC_API_KEY`); module `modules/curriculum-ai` (agent `curriculum-agent`, tool `read-curriculum-document`, grounding check, apply into a 004 draft); `syllabus_revision_source` + `AI_ASSISTED`, `syllabus_revisions.ai_proposal_id`; no new table or permission (007-curriculum-agent)

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
pnpm --filter api test -- test/integration/003-us6-enrollments.spec.ts   # single file
pnpm --filter api test -- -t "<test name>"                       # single test
pnpm --filter api test:security                         # test/security only
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN (runs dist/, build first)
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs (runs dist/)
pnpm --filter api fixtures:syllabus                     # rebuild test/fixtures/syllabus/* (004 upload/extraction fixtures)
pnpm --filter api fixtures:curriculum                   # rebuild test/fixtures/curriculum-agent/golden/*/document.* (007)
ANTHROPIC_API_KEY=... pnpm --filter api eval:curriculum  # on-demand golden-set eval against the real provider (EVAL_RECORD=1 rewrites recorded.json)

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

API test harness and API-only guards (test DB setup, `resetDb`, `createTestApp`, audit/secret
scans): see `apps/api/CLAUDE.md`, loaded when working under `apps/api`.

Cross-cutting guards that fail when the spec and the code drift apart:
- `apps/api/test/traceability.spec.ts` parses the `spec.md` of each feature listed in its `SPECS`
  (001, 003, 004, 005 and 006). Every `USn-k` scenario, every traceability row and the listed SC ids must appear
  in a `describe`/`it`/`test` title (API, web unit and `apps/web/e2e`), so name new tests with
  their scenario or SC/FR id. 001 ids are bare; later features carry their number (`003/US1-1`,
  `003/SC-004`), which never covers the bare 001 id. A new feature is checked once it's added to
  `SPECS`.
- 004 security suite (`apps/api/test/security/004-*`): the curriculum authorization matrix
  (`004-curriculum-authorization-matrix.ts` builds a complete teacher area; a new 004 route needs a
  `VALID_BODY` entry and a `MATRIX` row), cross links, server-controlled fields, rate limits,
  immutability of originals and confirmed revisions, concurrency and performance. The journey
  (`test/helpers/journey.ts`) also returns the 004 pedagogical `content`, which the secret scan keeps
  out of logs and audit metadata.
- 006 security suite (`apps/api/test/security/006-*`): the AI authorization matrix
  (`006-ai-authorization-matrix.ts`: teachers A and B and an ADMIN over every AI route), the
  provider boundary (`006-ai-boundary.spec.ts`: provider SDKs and provider hosts only under
  `src/modules/ai/gateway/providers/**`, enforced by ESLint and a scan of api and web), concurrency,
  resilience, the admin scan (no teacher content, credential or ids in the operations responses) and
  `006-ai-no-real-provider.spec.ts` (production registers no provider, the tests only `fake*` ones).
  The journey also runs the 006 flows, and the secret scan looks for the instructions, input and
  output markers and the fake provider's credential in logs, audit and operations responses.
- Web: `apps/web/test/keyboard.ts` (`expectTabOrder`, `tabTo`, `expectFieldErrorLinked`) backs
  the `SC-012` keyboard tests in each page's test file.
- Contracts (`packages/contracts/test/`): `boundary.spec.ts` (no Prisma/Nest/React imports and no
  user-facing text in the package), `duplication.spec.ts` (no contract type redefined in api or
  web), `zod-version.spec.ts` (one Zod version in the lockfile; every workspace uses `catalog:`).
- API: `test/contracts/endpoint-catalog.spec.ts` (every Nest route has exactly one entry in
  `endpoints.ts` and vice versa), and `ContractConformanceInterceptor`
  (`test/helpers/contract-conformance.interceptor.ts`), installed by `createTestApp()`, which turns a
  response that doesn't parse against its contract into a 500, so the test fails on its status
  assertion. A new route needs a catalog entry.
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
  enrollments and "Minhas turmas", and `curriculum` for 004 subjects, syllabus, class meetings and
  class plans), with types derived through `z.infer`
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
  `definitions` (agents, prompts, output schemas, tools and model configs are code, research A4;
  `productionAiDefinitions(config)` registers the 007 `curriculum-agent`, DISABLED until the admin
  enables it), `registry` (`AiRegistrySync`
  writes them to the `ai_*` tables at startup under an advisory lock; a used version (`used_at`)
  whose content changed stops the startup, and a trigger refuses the update: publish a new
  version), `gateway` (`ModelGateway` picks the provider by the model config, applies the timeout,
  retries only transient failures and normalizes errors; real providers will live in
  `gateway/providers/**`, the only place a provider SDK may be imported), `tools`
  (`AiToolExecutor`: allowlist, enabled, permission, strict input, resource owned by the workspace,
  timeout, strict output), `output` (structured output validated by the agent's Zod schema),
  `execution` (`POST /ai/executions` queues; `AiExecutionWorker` claims `QUEUED` rows with
  `SKIP LOCKED` every `AI_EXECUTION_INTERVAL_SECONDS`, `0` = global kill switch; the runner
  re-authorizes at start and checks cancellation between steps; the workspace is always the
  session user), `proposals` (L2 output becomes a proposal the teacher approves, partially
  approves or rejects; approving never writes domain data), `usage` (tokens and cost in
  `ai_model_calls`), `operations` (admin health, metrics, agents and configs, never content),
  `evaluation` (`AiEvaluationStore`, no routes) and `retention` (maintenance job `ai-records`).
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
- 007-curriculum-agent: Curriculum Agent — "Preencher com IA" on a syllabus document with text: L2 proposal grounded in the document (read tool, deterministic grounding check, source refs), teacher accepts fields/groups and applying creates an `AI_ASSISTED` 004 draft; first real provider (Anthropic); golden-set eval in CI (recorded) and on demand
- 006-ai-foundation: AI foundation — agent/prompt/schema/tool/model-config registry, provider-independent gateway, deny-by-default tools, validated structured output, L2 proposals with teacher review, bounded async execution, usage/cost, audit and the admin "Operação de IA" screen; no domain agent, no real provider
- 005-design-system: design system and visual identity — tokens, typography, base components, AppShell/student layouts, in-app catalog, docs and guards; exam components specified only

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
