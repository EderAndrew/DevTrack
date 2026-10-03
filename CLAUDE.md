# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last updated: 2026-10-02 (011 implemented; 012 in progress)

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Features 001–011 in `specs/` are implemented; 012-student-portal
is the active feature (T001–T039 done: schema, contracts, pure status/snapshot/grading/view rules,
US1 the teacher applies, edits, closes and cancels an activity, US2 the student's dashboard and
"Minhas atividades", US3 the student starts, answers and saves with autosave, revisions and the
offline buffer; submitting comes next). Later work starts a new feature through
`/speckit-specify`.

- 001 foundation, identity and access; 002 the same behavior on the official stack (shared Zod
  contracts, web stack, Playwright E2E, GitHub Actions CI).
- 003 classes, class invitations by e-mail (the only way a student account is created),
  enrollments, "Minhas turmas".
- 004 subjects, syllabus upload/extraction/review, class calendar, class plan with manual topics
  and coverage; US9 (2026-09-24 amendment) marks a topic's class completed. A teacher lands on
  "Minhas disciplinas" after login.
- 005 design system and the Exam Mode visual contract; 012 built its NORMAL-mode subset in
  `apps/web/components/ui/assessment/` (timer, review flag and focus warnings wait for exams).
- 006 AI foundation with no domain agent and no real provider (tests use the reference agents and
  fake provider in `apps/api/test/fixtures/ai`).
- 007 Curriculum Agent ("Preencher com IA" → L2 proposal → `AI_ASSISTED` 004 draft); 008 OpenRouter
  as the only real provider, task routing, fallback, circuits; 009 model policy (catalog in code,
  cheapest approved model of the task's tier).
- 010 the teacher's private exercise bank, with "Criar com IA" through `exercise-generator`; the
  Curriculum Agent v3 also proposes the syllabus's programming language.
- 011 the teacher's private work bank, apart from the exercise bank: works of 1–10 questions on
  topics of one confirmed syllabus revision, the total grade split in exact hundredths, manual or
  "Criar trabalho com IA" through `work-generator` into a DRAFT the teacher approves, "Ver como
  aluno" without the answer key, and the grading strategies as domain rules for 012.

AI agents (`curriculum-agent`, `exercise-generator`, `work-generator`) are registered DISABLED until
the admin enables them. All three tasks are BASIC. `openai-basic` passed all three release gates and,
being the cheapest, is the primary of each; `anthropic-basic` passed `curriculum-extraction` and
`exercise-generation` on 2026-10-01 (the first run with OpenRouter credit) and is their same-tier
fallback, but failed `work-generation` (schema validity 0.6), which has no fallback. `deepseek-basic`
failed all three (2026-09-29 and 2026-10-01): called with tools its answers break the output schema
(rubric, explanation, alternatives) and once it skipped the read tool, although the same request
without tools passes. DeepSeek joined the family allowlist on 2026-09-29 (009 amendment).

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions R1–R23 in 001, S1–S19 in 002, D1–D16 in 003, E1–E23 in 004, V1–V20 in 005, A1–A22 in 006, C1–C20 in 007, G1–G20 in 008, H1–H16 in 009, X1–X20 in 010, W1–W22 in 011, P1–P24 in 012), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.

`.specify/memory/constitution.md` (v3.2.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

`docs/adr/` records architecture decisions (ADR-0001: the multi-model AI architecture of 006–009).
ADRs only describe what the constitution and the specs decide; they never change a rule, and when
they diverge the spec wins and the ADR is fixed.

`.specify/scripts/bash/update-agent-context.sh` rewrites the `## Active Technologies` and
`## Recent Changes` sections of this file in place — keep those headings; everything else here is
hand-maintained.

## Active Technologies

## Stack notes

If TS 7 rejects Nest decorators, the documented fallback (R1) is pinning `typescript@~5.9` in
`apps/api` only.

## Commands

Prerequisites: Node 24, pnpm 11 (`corepack enable`), Docker. Without `OPENROUTER_API_KEY` the API
still boots; the AI actions just show as unavailable and the manual flows keep working.

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
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:works
                                                        # 011 release gate of the work generator, same flags; evidence in
                                                        # test/fixtures/evaluations/work-generation/

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
`createTestApp`, audit/secret scans, 004–011 suites): see `apps/api/CLAUDE.md`, loaded when working
under `apps/api`.

Cross-cutting guards that fail when the spec and the code drift apart:
- `apps/api/test/traceability.spec.ts` parses the `spec.md` of each feature listed in its `SPECS`
  (001, 003, 004, 005, 006, 007, 008, 009, 010 and 011; the on-demand evals' `apps/api/test/eval/*.eval.ts` counts
  too). Every `USn-k` scenario, every traceability row and the listed SC ids must appear
  in a `describe`/`it`/`test` title (API, web unit and `apps/web/e2e`), so name new tests with
  their scenario or SC/FR id. 001 ids are bare; later features carry their number (`003/US1-1`,
  `003/SC-004`), which never covers the bare 001 id. A new feature is checked once it's added to
  `SPECS`.
- Per-feature API security and integration suites (004–011) and the endpoint catalog guard: see
  `apps/api/CLAUDE.md`.
- `apps/api/test/works-boundary.spec.ts` (011) keeps the work bank and the exercise bank apart in
  the API modules, the contracts and the web features (no imports either way), and forbids code
  execution, model choice and float arithmetic (`parseFloat`, `Number(`, `.toNumber()`) in
  `works`/`work-ai`.
- `apps/api/test/activities-boundary.spec.ts` (012) lets `activities`/`student-activities` (API
  and web) reach the banks only through their snapshot readers and the pure `works/grading` and
  `works/types`; no exercise/AI module imports, no code execution, AI calls or float arithmetic on
  grades, and students are answered only through the student-view allowlist.
- E2E AI flows (007 POO analysis, 010 `exercise-bank.spec.ts` and 011 `work-bank.spec.ts`, each
  replaying its generator's `sql-joins-sem-linguagem` case)
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
  `curriculum-ai.ts`, `exercises` for the 010 bank and its AI batches, and `works` for the 011
  bank, its generation requests, the exact grade helpers and the grading result shapes, and
  `activities` for the 012 teacher and student shapes of class activities), with
  types derived through `z.infer`
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
- API modules (003, 004, 006, 007, 009, 010, 011): see `apps/api/CLAUDE.md`, loaded when working
  under `apps/api`.
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
- 012-student-portal (planned): class activities — a teacher applies an approved work or 1–10 approved exercises to a class as a snapshot with deadline and late policy (taught-scope topics flagged); the student portal (dashboard, lists, answering with autosave and offline buffer, one idempotent submission, history) with statuses derived by the server clock; multiple choice graded by the 011 rules, the rest by the teacher, results visible only after release; no answer key ever in a student response
- 011-work-bank: private work bank apart from the exercise bank — works of 1–10 questions (open answer, multiple choice, code with test cases) linked to items of one confirmed syllabus revision, total grade split in exact hundredths (`numeric(5,2)`, integer cents in code), manual or AI (`work-generator` through the existing gateway and policy) into DRAFT works approved by the teacher; server-built student view without answer key; grading strategies (EXACT_MATCH, TEST_CASES, AI_REVIEW) as domain rules for 012
- 010-exercise-bank: private exercise bank — manual sets of 3–10 or single exercises (open answer, multiple choice, code; difficulty and cognitive objective), AI generation from a syllabus item through the existing gateway and model policy into DRAFT batches reviewed and approved by the teacher; student view never carries answers; syllabus language catalog, proposed by Curriculum Agent v3

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
