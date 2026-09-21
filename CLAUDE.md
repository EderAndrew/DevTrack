# devtrack Development Guidelines

Auto-generated from all feature plans. Last updated: 2026-09-21

## Active Technologies

- TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19 (001-foundation-identity-access)

## Project Structure

```text
apps/api/        # NestJS — src/platform (infra transversal), src/modules (capacidades), prisma/, test/
apps/web/        # Next.js App Router
packages/        # configs compartilhadas (eslint, typescript) e ui
specs/           # Spec Kit: spec, plan, research, data-model, contracts, tasks
.specify/memory/constitution.md   # Constituição (v2.0.0) — regras não negociáveis
```

## Commands

```bash
docker compose up -d postgres postgres-test mailpit
pnpm dev | pnpm build | pnpm lint | pnpm check-types
pnpm --filter api test
pnpm admin:bootstrap --email <email> [--print-link]
pnpm --filter api maintenance:run [--job <nome>]
```

## Code Style

TypeScript estrito. Controllers finos → services → repositórios Prisma. Guards globais
deny-by-default (`@Public()` explícito). Permissões explícitas (`recurso.acao`), nunca
checagem por nome de papel. Erros `{statusCode, code, message}`. Nunca logar senhas,
tokens, cookies ou secrets.

## Recent Changes

- 001-foundation-identity-access: Added TypeScript 7 sobre Node.js 24 LTS; `apps/api` compila com SWC e faz type-check com `tsc --noEmit` (R1) + NestJS 11 (Express), Prisma 7 + `@prisma/adapter-pg`, `argon2`, `zod`, `nestjs-pino`/`pino`, `nodemailer`, `cookie-parser`; web: Next.js 16, React 19

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
