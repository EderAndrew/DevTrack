# DevTrack

Plataforma de ensino e avaliação configurável por professor. Este repositório está na
**fase 001 — Foundation, Identity & Access**: identidade única com múltiplos papéis
(`STUDENT`, `TEACHER`, `MANAGER`, `ADMIN`), verificação de e-mail,
sessões revogáveis, bootstrap seguro do primeiro administrador, convites de gestores e
professores, recuperação de senha, autorização por permissão explícita + contexto, trilha
de auditoria e retenção de dados. A **fase 002 — alinhamento de stack** refatorou essa base
sem mudar o comportamento: contratos API↔web compartilhados em `packages/contracts`, stack
oficial do frontend (Tailwind, shadcn/ui, TanStack Query, React Hook Form), E2E com Playwright
e CI no GitHub Actions. A **fase 003 — turmas, convites e matrículas** trouxe as turmas do
professor, o convite de aluno por e-mail (com envio em segundo plano e novas tentativas), o
aceite que cria a conta ou usa a conta existente, as matrículas e a tela "Minhas turmas" do
aluno. O autocadastro público de alunos foi removido: conta de aluno só nasce de convite de
turma. A **fase 004 — ementa e planejamento** trouxe a área privada do professor: disciplinas,
turmas como oferta da disciplina (período e datas), envio da ementa em PDF, DOCX, PNG ou JPG com
validação do arquivo e extração de texto em segundo plano (sem OCR), revisão e confirmação do
conteúdo, calendário de aulas da turma e planejamento com tópicos manuais ligados aos itens da
ementa (juntar, dividir, arquivar, reordenar), cobertura da ementa e situações do planejamento.
Banco de questões, atividades e avaliações vêm nas próximas fases.

## Pré-requisitos

- Node.js 24 LTS
- pnpm 11 (`corepack enable`)
- Docker (PostgreSQL 17 e Mailpit)

## Estrutura

| Caminho | Conteúdo |
|---------|----------|
| `apps/api` | API NestJS 11 (porta 4000): Prisma 7 + PostgreSQL, sessões opacas em cookie, CLI operacional |
| `apps/web` | Next.js 16 / React 19 (porta 3000); chama a API pelo rewrite same-origin `/api/*`. Código por domínio em `features/<feature>/{api,components,hooks,schemas}`; E2E em `e2e/` |
| `packages/contracts` | `@repo/contracts`: todo contrato API↔web como schema Zod, com tipos derivados por `z.infer` |
| `packages/eslint-config`, `packages/typescript-config` | Configurações compartilhadas de ESLint e TypeScript |
| `specs/001-foundation-identity-access/` | Spec, plano, decisões (R1–R23), modelo de dados, contratos e tarefas da fase 001 |
| `specs/002-stack-alignment/` | O mesmo para a fase 002 (decisões S1–S19) |
| `specs/003-class-invitations-enrollment/` | O mesmo para a fase 003 (turmas, convites de turma e matrículas) |
| `specs/004-syllabus-planning/` | O mesmo para a fase 004 (disciplinas, ementa, calendário e planejamento; decisões E1–E22) |
| `.github/workflows/ci.yml` | CI: lint, tipos, build e testes a cada push e pull request |
| `DEPENDENCIES.md` | Auditoria de vulnerabilidades e licenças e justificativa de cada dependência direta |
| `.specify/` | Constituição do projeto e scripts do fluxo Spec Kit |

## Primeiros passos

```bash
docker compose up -d postgres postgres-test mailpit   # banco :5432, banco de testes :5433, Mailpit :8025
cp apps/api/.env.example apps/api/.env                # preencher APP_HMAC_SECRET (openssl rand -base64 48)
cp apps/web/.env.example apps/web/.env.local
pnpm install                                          # também gera o Prisma Client
pnpm build                                            # compila packages/contracts (api e web importam o dist/)
pnpm --filter api prisma migrate deploy               # tabelas + papéis/permissões de referência
pnpm dev                                              # web em http://localhost:3000
pnpm admin:bootstrap --email <e-mail> --print-link    # único jeito de criar o primeiro ADMIN
```

Portas ocupadas no host podem ser trocadas com `POSTGRES_PORT`, `POSTGRES_TEST_PORT`,
`MAILPIT_SMTP_PORT` e `MAILPIT_UI_PORT` no `docker compose` (ajuste `apps/api/.env` junto).
Os e-mails de desenvolvimento ficam no Mailpit: <http://localhost:8025>.

O roteiro completo, com a validação ponta a ponta de cada fluxo, está em
[`specs/001-foundation-identity-access/quickstart.md`](specs/001-foundation-identity-access/quickstart.md);
o da refatoração, em [`specs/002-stack-alignment/quickstart.md`](specs/002-stack-alignment/quickstart.md); o da
área do professor (disciplina → ementa → calendário → planejamento), em
[`specs/004-syllabus-planning/quickstart.md`](specs/004-syllabus-planning/quickstart.md).

## Comandos

```bash
pnpm dev | pnpm build | pnpm lint | pnpm check-types | pnpm test   # todos os workspaces (Turborepo)
pnpm format                                                         # Prettier

pnpm --filter api test                          # unitários, integração e segurança (usa postgres-test)
pnpm --filter api test -- test/integration/003-us6-enrollments.spec.ts
pnpm --filter api test:security                 # matriz de autorização, replay, concorrência, segredos
pnpm --filter web test                          # componentes, axe (WCAG 2.2 AA) e teclado
pnpm --filter @repo/contracts test              # guardas de fronteira, duplicação e versão única de Zod
pnpm --filter api maintenance:run [--job <nome>] # jobs de retenção (executam apps/api/dist)

# E2E (Playwright): banco devtrack_e2e recriado a cada execução, portas 3100/4100
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter web exec playwright install chromium   # só na primeira vez
pnpm --filter web test:e2e
```

`pnpm check-types` e `pnpm test` pela raiz compilam `packages/contracts` antes (Turborepo).
Ao rodar um workspace isolado (`pnpm --filter api check-types`), rode `pnpm build` antes:
api e web importam o `dist/` do pacote de contratos.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) roda `pnpm lint`, `pnpm check-types`,
`pnpm build` e `pnpm test` (com PostgreSQL 17 de serviço) a cada push e pull request. As
actions são fixadas por SHA. O E2E roda localmente (`pnpm --filter web test:e2e`).

## Configuração

- API: [`apps/api/.env.example`](apps/api/.env.example). A API **não sobe** se faltar uma
  variável obrigatória.
- Web: [`apps/web/.env.example`](apps/web/.env.example) (`API_ORIGIN`, destino do rewrite).
- Ementas (004): tamanho máximo do arquivo (`SYLLABUS_MAX_FILE_MB`, 10), intervalo do
  processamento em segundo plano (`SYLLABUS_PROCESSING_INTERVAL_SECONDS`; `0` desliga) e limites
  por professor de envios e novas tentativas por hora; o arquivo original fica no próprio banco.
- Testes: [`apps/api/.env.test.example`](apps/api/.env.test.example); os testes recusam rodar
  fora de um banco cujo nome contenha `test`.

## Como o projeto evolui

O desenvolvimento segue o fluxo Spec Kit — `SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS →
REVIEW` — e a [constituição](.specify/memory/constitution.md), que prevalece sobre qualquer
outra orientação. Mudança de comportamento começa pela spec da fase em `specs/`.
