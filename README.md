# DevTrack

Plataforma de ensino e avaliação configurável por professor. Este repositório está na
**fase 001 — Foundation, Identity & Access**: identidade única com múltiplos papéis
(`STUDENT`, `TEACHER`, `MANAGER`, `ADMIN`), cadastro de alunos com verificação de e-mail,
sessões revogáveis, bootstrap seguro do primeiro administrador, convites de gestores e
professores, recuperação de senha, autorização por permissão explícita + contexto, trilha
de auditoria e retenção de dados. Ainda não há domínio acadêmico (disciplinas, turmas,
atividades) — ele vem nas próximas fases.

## Pré-requisitos

- Node.js 24 LTS
- pnpm 11 (`corepack enable`)
- Docker (PostgreSQL 17 e Mailpit)

## Estrutura

| Caminho | Conteúdo |
|---------|----------|
| `apps/api` | API NestJS 11 (porta 4000): Prisma 7 + PostgreSQL, sessões opacas em cookie, CLI operacional |
| `apps/web` | Next.js 16 / React 19 (porta 3000); chama a API pelo rewrite same-origin `/api/*` |
| `packages/*` | Configurações compartilhadas de ESLint e TypeScript e componentes de UI |
| `specs/001-foundation-identity-access/` | Spec, plano, decisões (R1–R23), modelo de dados, contratos e tarefas da fase |
| `.specify/` | Constituição do projeto e scripts do fluxo Spec Kit |

## Primeiros passos

```bash
docker compose up -d postgres postgres-test mailpit   # banco :5432, banco de testes :5433, Mailpit :8025
cp apps/api/.env.example apps/api/.env                # preencher APP_HMAC_SECRET (openssl rand -base64 48)
cp apps/web/.env.example apps/web/.env.local
pnpm install                                          # também gera o Prisma Client
pnpm --filter api prisma migrate deploy               # tabelas + papéis/permissões de referência
pnpm dev                                              # web em http://localhost:3000
pnpm admin:bootstrap --email <e-mail> --print-link    # único jeito de criar o primeiro ADMIN
```

Portas ocupadas no host podem ser trocadas com `POSTGRES_PORT`, `POSTGRES_TEST_PORT`,
`MAILPIT_SMTP_PORT` e `MAILPIT_UI_PORT` no `docker compose` (ajuste `apps/api/.env` junto).
Os e-mails de desenvolvimento ficam no Mailpit: <http://localhost:8025>.

O roteiro completo, com a validação ponta a ponta de cada fluxo, está em
[`specs/001-foundation-identity-access/quickstart.md`](specs/001-foundation-identity-access/quickstart.md).

## Comandos

```bash
pnpm dev | pnpm build | pnpm lint | pnpm check-types | pnpm test   # todos os workspaces (Turborepo)
pnpm format                                                         # Prettier

pnpm --filter api test                          # unitários, integração e segurança (usa postgres-test)
pnpm --filter api test -- test/integration/us1-signup.spec.ts
pnpm --filter api test:security                 # matriz de autorização, replay, concorrência, segredos
pnpm --filter web test                          # componentes, axe (WCAG 2.2 AA) e teclado
pnpm --filter api maintenance:run [--job <nome>] # jobs de retenção (executam apps/api/dist)
```

## Configuração

- API: [`apps/api/.env.example`](apps/api/.env.example). A API **não sobe** se faltar uma
  variável obrigatória.
- Web: [`apps/web/.env.example`](apps/web/.env.example) (`API_ORIGIN`, destino do rewrite).
- Testes: [`apps/api/.env.test.example`](apps/api/.env.test.example); os testes recusam rodar
  fora de um banco cujo nome contenha `test`.

## Como o projeto evolui

O desenvolvimento segue o fluxo Spec Kit — `SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS →
REVIEW` — e a [constituição](.specify/memory/constitution.md), que prevalece sobre qualquer
outra orientação. Mudança de comportamento começa pela spec da fase em `specs/`.
