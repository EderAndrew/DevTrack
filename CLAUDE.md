# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Last updated: 2026-09-21

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs and UI copy are in
Portuguese). The repo is still at the **spec stage** of Phase 001: what exists today is the
create-turbo scaffold (`apps/web`, `apps/docs`, `packages/ui`, `packages/eslint-config`,
`packages/typescript-config`) plus the Spec Kit artifacts. `apps/api`, `docker-compose.yml`,
Prisma and the test setup do not exist yet — they are created by the tasks in
`specs/001-foundation-identity-access/tasks.md` (T001 removes `apps/docs`; `README.md` is still the
Turborepo starter README and is not authoritative).

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions R1–R23), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.

`.specify/memory/constitution.md` (v2.0.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

`.specify/scripts/bash/update-agent-context.sh` rewrites the `## Active Technologies` and
`## Recent Changes` sections of this file in place — keep those headings; everything else here is
hand-maintained.

## Active Technologies

- TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19 (001-foundation-identity-access)

## Stack notes

Monorepo: pnpm 11 workspaces + Turborepo; PostgreSQL 17; tests with Vitest (`unplugin-swc`),
`@nestjs/testing` + `supertest` against a real PostgreSQL, Testing Library + `vitest-axe` on web.
If TS 7 rejects Nest decorators, the documented fallback (R1) is pinning `typescript@~5.9` in
`apps/api` only.

## Commands

Available now:

```bash
pnpm dev | pnpm build | pnpm lint | pnpm check-types   # turbo across all workspaces
pnpm format                                             # prettier on ts/tsx/md
pnpm --filter web dev                                   # single app (web on :3000)
```

Planned by 001 (confirm once `apps/api` exists):

```bash
docker compose up -d postgres postgres-test mailpit     # dev DB :5432, test DB :5433, Mailpit UI :8025
pnpm --filter api prisma migrate deploy                 # also seeds roles/permissions
pnpm --filter api test                                  # unit + integration (postgres-test)
pnpm --filter api test -- test/integration/us1-signup.spec.ts   # single file (Vitest)
pnpm --filter api test:security                         # authz matrix, replay, concurrency, secret scan
pnpm --filter web test                                  # includes axe (WCAG 2.2 AA)
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs
```

The API must refuse to start when a required env var is missing (Zod-validated config).

## Architecture (as planned in 001)

- `apps/api` (NestJS, port 4000): `src/platform/` holds cross-cutting infra (config, database +
  transaction/advisory-lock helpers, http error filter + `ZodValidationPipe` + origin guard, logging
  with redaction, mail port, rate limit on PostgreSQL, crypto, maintenance, health);
  `src/modules/` holds capabilities (`identity`, `auth`, `access-control`, `provisioning`,
  `admin-bootstrap`, `accounts`, `retention`, `audit`); `src/cli/` holds operational commands run as
  a Nest application context without HTTP. Tests live in `test/{helpers,integration,security}` plus
  `test/traceability.spec.ts` mapping every spec criterion to a test.
- `apps/web` (Next.js App Router) calls the API through a same-origin rewrite `/api/* → API`;
  `proxy.ts` only redirects for UX and never authorizes. No shared web↔API package.
- Protected request pipeline: `OriginGuard → SessionGuard (401) → VerifiedGuard (403) →
  PermissionsGuard (403) → ZodValidationPipe (400) → controller → service (scoped queries → 404;
  rule violations → 409/422) → AuditService (same transaction)`. Guards are global and
  deny-by-default: every route needs `@Public()` or `@RequirePermissions()`/`@AllowUnverified()`,
  and a test enforces this.
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
- Layering: thin controllers → services → Prisma repositories; no Prisma imports in
  `*.controller.ts` (ESLint-enforced). No business rules in React components.
- Errors are always `{statusCode, code, message}` with no stack traces or internals.
- Schema changes only via Prisma migrations. Subjects/languages/technologies are data, never enums
  or conditionals in code.
- No Redis, queues, WebSockets or new dependencies without a spec that requires them.

## Recent Changes

- 001-foundation-identity-access: Added TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
