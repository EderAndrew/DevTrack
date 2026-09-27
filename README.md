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
A **fase 005 — design system** trouxe os tokens de design, Inter e JetBrains Mono, os componentes
base com variantes e estados, o AppShell e o layout do aluno, o catálogo `/design-system`, a
documentação em `apps/web/design-system/` e o contrato visual do Modo Prova. A **fase 006 —
fundação de IA** trouxe o registro de agentes, prompts, schemas de saída, ferramentas e
configurações de modelo, o gateway independente de provedor, ferramentas negadas por padrão,
saída estruturada validada, propostas revisadas pelo professor, execução assíncrona com limites,
uso e custo, auditoria e a tela "Operação de IA" do administrador. A **fase 007 — agente de
ementa** trouxe o "Preencher com IA" numa ementa com texto: o `curriculum-agent` propõe o conteúdo
com base no documento, o professor aceita campos e grupos e a aplicação cria um rascunho da
ementa (`AI_ASSISTED`) que ele edita e confirma como sempre. Ela também trouxe o primeiro provedor
real e a avaliação com um conjunto de referência. A **fase 008 — gateway de IA com OpenRouter**
trocou esse provedor pelo OpenRouter, o único provedor real, chamado só pelo servidor. Cada agente
declara a tarefa que executa, e a tarefa aponta para um modelo principal e um de fallback
escolhidos por configuração. O gateway usa o fallback uma vez depois de uma falha recuperável,
um circuito por modelo evita chamar um modelo fora do ar, e um limite por agente protege o
consumo. O "Preencher com IA" continua igual para o professor, e "Operação de IA" passou a
mostrar a tarefa, o modelo servido, os fallbacks e os circuitos. A **fase 009 — política de
modelos de IA** tirou a escolha do modelo das variáveis de ambiente: um catálogo em código lista
os modelos permitidos por família (OpenAI, Anthropic e TypeSafe, esta só para decisões), com nível
de capacidade (básico, padrão, avançado), modo, ciclo de vida e preço de referência. Cada tarefa
declara seu nível, e a política escolhe, entre os modelos aprovados para ela por uma avaliação
registrada no repositório, o de menor custo; o fallback fica no mesmo nível, e subir de nível só
acontece por regra explícita da tarefa, uma vez, quando a saída é inválida. A análise do
"Preencher com IA" é de nível básico e só fica disponível depois da etapa de liberação, que avalia
os modelos reais e aprova os que atingem os limiares. O
administrador pode fixar um modelo aprovado para uma tarefa, e "Operação de IA" mostra o custo
por tarefa, nível, família e modelo, o catálogo com qualidade ao lado do custo e o consumo em
relação a orçamentos configuráveis, que avisam sem bloquear. Banco de questões, atividades e
avaliações vêm nas próximas fases.

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
| `specs/004-syllabus-planning/` | O mesmo para a fase 004 (disciplinas, ementa, calendário e planejamento; decisões E1–E23) |
| `specs/005-design-system/` | O mesmo para a fase 005 (design system; decisões V1–V20) |
| `specs/006-ai-foundation/` | O mesmo para a fase 006 (fundação de IA; decisões A1–A22) |
| `specs/007-curriculum-agent/` | O mesmo para a fase 007 (agente de ementa; decisões C1–C20) |
| `specs/008-ai-gateway-openrouter/` | O mesmo para a fase 008 (gateway de IA com OpenRouter; decisões G1–G20) |
| `apps/web/design-system/` | Tokens (`tokens.css`) e documentação do design system: tokens, componentes, layouts, Modo Prova e exceções |
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
[`specs/004-syllabus-planning/quickstart.md`](specs/004-syllabus-planning/quickstart.md). As
fases 003, 005, 006, 007 e 008 também têm o seu `quickstart.md` na pasta da spec; os da 007 e da
008 incluem o roteiro manual com o provedor real (opcional, tem custo).

## Comandos

```bash
pnpm dev | pnpm build | pnpm lint | pnpm check-types | pnpm test   # todos os workspaces (Turborepo)
pnpm format                                                         # Prettier

pnpm --filter api test                          # unitários, integração e segurança (usa postgres-test)
pnpm --filter api test test/integration/003-us6-enrollments.spec.ts   # um arquivo (sem `--`)
pnpm --filter api test:security                 # matriz de autorização, replay, concorrência, segredos
pnpm --filter web test                          # componentes, axe (WCAG 2.2 AA) e teclado
pnpm --filter @repo/contracts test              # guardas de fronteira, duplicação e versão única de Zod
pnpm --filter api maintenance:run [--job <nome>] # jobs de retenção (executam apps/api/dist)
pnpm --filter api fixtures:syllabus             # recria os arquivos de teste de ementa (004)
pnpm --filter api fixtures:curriculum           # recria os documentos do conjunto de referência (007)
OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum  # avaliação dos modelos candidatos da tarefa (custa centavos)
OPENROUTER_API_KEY=... EVAL_MODEL=anthropic-basic EVAL_RECORD=1 pnpm --filter api eval:curriculum
                                                # etapa de liberação (009): grava a evidência de um modelo do catálogo
                                                # em test/fixtures/evaluations/; EVAL_REPLAY=1 regrava recorded.json

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
- IA (006): as variáveis `AI_*` são:
  - `AI_EXECUTION_INTERVAL_SECONDS` (5; `0` desliga todo processamento de IA);
  - os limites por execução: `AI_EXECUTION_TOTAL_TIMEOUT_SECONDS` (120),
    `AI_MODEL_CALL_TIMEOUT_SECONDS` (60), `AI_TOOL_TIMEOUT_SECONDS` (10), `AI_MAX_MODEL_CALLS`
    (5), `AI_MAX_TOOL_CALLS` (10), `AI_MAX_RETRIES` (2), `AI_MAX_INPUT_KB` (200) e
    `AI_MAX_OUTPUT_KB` (200);
  - a validade das propostas, `AI_PROPOSAL_TTL_DAYS` (30);
  - a retenção das execuções, `AI_RECORD_RETENTION_DAYS` (365), aplicada pelo job
    `ai-records`.

  Os limites de pedidos são `RATE_LIMIT_AI_EXECUTIONS_PER_MINUTE` (10) e
  `RATE_LIMIT_AI_DECISIONS_PER_MINUTE` (30).
- Provedor de IA (008): o OpenRouter só é registrado com `OPENROUTER_API_KEY`. Vazia, a API sobe
  normalmente, o "Preencher com IA" aparece como indisponível e o fluxo manual segue funcionando.
  A chave fica só na API, nunca no browser, e nunca vai para os logs. Desde a 009 os modelos vêm
  do catálogo em código (`apps/api/src/modules/ai/definitions/model-catalog.ts`), não de
  variáveis: `OPENROUTER_DEFAULT_MODEL` e `OPENROUTER_FALLBACK_MODEL` são ignoradas (com um aviso
  `ai.config_ignored` no log). Um modelo só atende uma tarefa em `PRODUCTION` e com aprovação
  baseada numa evidência de avaliação versionada; sem modelo aprovado, a tarefa fica indisponível
  sem derrubar a API (`ai.task_unavailable`). Trocar um modelo é uma mudança revisada do catálogo,
  e a mudança de ciclo de vida fica auditada. `OPENROUTER_TIMEOUT_MS` (60000) é o teto
  de cada chamada; `OPENROUTER_BASE_URL` serve só para o E2E local, que aponta para um simulador.
  O circuito de cada modelo abre depois de `AI_CIRCUIT_FAILURE_THRESHOLD` (5) falhas recuperáveis
  seguidas e fica aberto por `AI_CIRCUIT_OPEN_SECONDS` (60); `AI_AGENT_EXECUTIONS_PER_HOUR` (100)
  limita as execuções de cada agente somando todos os professores.
- Orçamentos de IA (009), opcionais, em dólares: `AI_BUDGET_DAILY_USD` e `AI_BUDGET_MONTHLY_USD`
  (sistema), `AI_BUDGET_PER_AGENT_MONTHLY_USD` e `AI_BUDGET_PER_USER_MONTHLY_USD`. Atingir um
  orçamento só avisa em "Operação de IA" e gera um evento de auditoria por período; nada é
  bloqueado, e os limites por execução, por usuário e por agente continuam valendo.
- Agente de ementa (007): o `curriculum-agent` é registrado desativado: o administrador o ativa em
  "Operação de IA" depois da etapa de liberação, que aprova um modelo do catálogo para a tarefa.
  `RATE_LIMIT_CURRICULUM_AI_PER_HOUR` (10) limita os pedidos por professor.
- Testes: [`apps/api/.env.test.example`](apps/api/.env.test.example); os testes recusam rodar
  fora de um banco cujo nome contenha `test`.

## Como o projeto evolui

O desenvolvimento segue o fluxo Spec Kit — `SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS →
REVIEW` — e a [constituição](.specify/memory/constitution.md), que prevalece sobre qualquer
outra orientação. Mudança de comportamento começa pela spec da fase em `specs/`.
