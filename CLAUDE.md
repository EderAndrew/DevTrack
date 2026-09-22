# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last updated: 2026-09-22

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Phase 001 (`specs/001-foundation-identity-access`) is fully
implemented: all 110 tasks in `tasks.md` are checked, US1–US8 plus the Polish phase. New work
starts a new feature through `/speckit-specify`.

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions R1–R23), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.

`.specify/memory/constitution.md` (v2.1.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

`.specify/scripts/bash/update-agent-context.sh` rewrites the `## Active Technologies` and
`## Recent Changes` sections of this file in place — keep those headings; everything else here is
hand-maintained.

## Active Technologies

- `@repo/contracts` (Zod 4 via pnpm catalog, ESM built with `tsc`); web: Tailwind CSS 4, shadcn/ui (Radix), Lucide, TanStack Query 5, React Hook Form 7 + `@hookform/resolvers`; E2E: Playwright; CI: GitHub Actions (002-stack-alignment)
- TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19 (001-foundation-identity-access)

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

# apps/api (port 4000) — copy .env.example to .env first
pnpm --filter api prisma generate                       # client -> src/generated/prisma (gitignored); also runs on `pnpm install`
pnpm --filter api prisma migrate deploy                 # migrations also seed roles/permissions; prisma.config.ts loads apps/api/.env
pnpm --filter api dev                                   # swc watch into dist/ + node --watch
pnpm --filter api test                                  # all unit + integration + security (needs postgres-test up)
pnpm --filter api test -- test/integration/us1-signup.spec.ts   # single file
pnpm --filter api test -- -t "<test name>"                       # single test
pnpm --filter api test:security                         # test/security only
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN (runs dist/, build first)
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs (runs dist/)

# apps/web (port 3000) — API_ORIGIN (default http://localhost:4000) is the rewrite target
pnpm --filter web dev
pnpm --filter web test                                  # Vitest + jsdom + Testing Library + vitest-axe
```

The API builds with SWC into `dist/`; `tsc` only type-checks (`check-types`). The CLI scripts run
compiled code, so run `pnpm --filter api build` before them.

API tests (`apps/api/vitest.config.mts`): the global setup loads `.env.test` (falling back to
`.env.test.example`), generates the Prisma client if it's missing, and runs `migrate deploy` on the
test DB. They refuse to run unless `NODE_ENV=test` and the DB name contains `test`. Test files run
serially against one shared DB. Specs call `resetDb(t.prisma)` in `beforeEach`, which truncates
everything except the seeded roles/permissions and bypasses the append-only audit trigger only
inside that transaction. Build the app with `createTestApp()` from `test/helpers/test-app.ts`. It listens on
127.0.0.1, swaps in an `InMemoryMailer` (`flushMail()` waits for after-commit emails), and lets you
override config and providers. Use `test/helpers/factories.ts` for fixtures. The permission matrix
lives in `test/security/authorization-matrix.ts`, and `route-declarations.spec.ts` fails for any
route that has no access declaration.

Cross-cutting guards that fail when the spec and the code drift apart:
- `test/traceability.spec.ts` parses `spec.md`. Every `USn-k` scenario and every traceability row
  must appear in a `describe`/`it` title, so name new tests with their scenario or SC/FR id.
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/no-academic-domain.spec.ts` pins the Prisma models to the `data-model.md` list.
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced.
- Web: `apps/web/test/keyboard.ts` (`expectTabOrder`, `tabTo`, `expectFieldErrorLinked`) backs
  the `SC-012` keyboard tests in each page's test file.

Unsafe HTTP methods need both an allowed `Origin` and `Content-Type: application/json` (send
`{}` if there's no body), even from curl or scripts. Otherwise the API returns
`403 ORIGIN_NOT_ALLOWED` (`OriginGuard`, R6).

Transitive vulnerabilities are patched via `overrides` in `pnpm-workspace.yaml`. The reasons and
the removal conditions are in `apps/api/DEPENDENCIES.md`.

## Architecture

- `apps/api` (NestJS): `src/platform/` holds cross-cutting infra (config, database +
  transaction/advisory-lock helpers, http error filter + `ZodValidationPipe` + origin guard, logging
  with redaction, mail port, rate limit on PostgreSQL, crypto, maintenance, health);
  `src/modules/` holds capabilities (`identity`, `auth`, `access-control`, `provisioning`,
  `admin-bootstrap`, `accounts`, `retention`, `audit`); `src/cli/` holds operational commands run as
  a Nest application context without HTTP. `AppModule.forRoot(config, …)` is built from the
  Zod-validated config (`src/platform/config`); `app.setup.ts` applies the HTTP setup shared by
  `main.ts` and the tests.
- `apps/web` (Next.js App Router) calls the API through a same-origin rewrite `/api/* → API`
  (`next.config.js`, which also sets `Referrer-Policy: no-referrer` on token-bearing pages).
  `proxy.ts` only redirects for UX and never authorizes. API calls live in `lib/*-api.ts`. There's
  no shared web↔API package yet (see the target stack below).
- Target stack (constitution v2.1.0, principle XXVI and "Stack oficial do frontend"), which Phase
  001 predates. A dedicated refactor feature, run before Phase 002, migrates the code to it; until
  then, new code must not extend the old patterns:
  - `packages/contracts` holds every API↔web contract as Zod schemas, with types derived through
    `z.infer`. It contains no Prisma, service or UI-state types and no user-facing messages. One
    Zod version comes from the pnpm catalog, and the API still validates every input.
  - Web: Tailwind + shadcn/ui + Lucide; TanStack Query for server state; Redux Toolkit only for
    real global client state, never authoritative over exam rules; React Hook Form +
    `@hookform/resolvers`; native `fetch`; Playwright for E2E.
  - Web code goes in `apps/web/features/<feature>/{api,components,hooks,schemas,store,types}`,
    with `app/` kept at the root (no `src/`).
- Protected request pipeline: `OriginGuard → SessionGuard (401) → VerifiedGuard (403) →
  PermissionsGuard (403) → ZodValidationPipe (400) → controller → service (scoped queries → 404;
  rule violations → 409/422) → AuditService (same transaction)`. Guards are global and
  deny-by-default: every route needs `@Public()` or `@RequirePermissions()`/`@AllowUnverified()`.
- Auth is opaque, revocable server-side sessions (cookie `__Host-devtrack_session`), not JWT. All
  session revocation goes through `SessionService.revokeAllForUser(userId, reason, tx)`.

## Rules that are easy to get wrong

- Authorization = explicit permission (`recurso.acao`, e.g. `professores.convidar`) **and**
  resource context. Never check role names or `isAdmin`-style flags. Missing capability → `403`;
  has capability but resource outside the user's context → `404` (don't reveal existence).
- One `User` identity with many roles via `User → UserRole → Role → RolePermission → Permission`;
  never a `users.role` column. Public signup only ever creates `STUDENT` and rejects role fields.
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

## Recent Changes

- 002-stack-alignment: Added `@repo/contracts` shared Zod contracts, official frontend stack (Tailwind, shadcn/ui, TanStack Query, React Hook Form), Playwright E2E and GitHub Actions CI
- 001-foundation-identity-access: Added TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
