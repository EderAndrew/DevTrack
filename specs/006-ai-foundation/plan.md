# Implementation Plan: 006 — AI Foundation: Fundação para Agentes de IA

**Branch**: `006-ai-foundation` | **Date**: 2026-09-25 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-ai-foundation/spec.md`

## Summary

Esta feature cria o módulo `modules/ai` da API. É a única porta para modelos de IA
(FR-001): uma regra de ESLint e uma guarda de teste impedem que outro módulo importe SDK
de provedor.

- **Definições.** Agentes, instruções, esquemas de saída, ferramentas, configurações de
  modelo e provedores são definidos em código. A inicialização os sincroniza no banco em
  versões imutáveis depois de usadas (A4, A5).
- **Produção.** O registro começa vazio: nenhum agente e nenhum provedor real (FR-016).
- **Testes.** Um agente de referência (L1 e L2), uma ferramenta de leitura e um provedor
  simulado programável, todos em `test/fixtures/ai`, exercitam a fundação de ponta a
  ponta (A4, A12).
- **Pedido.** O pedido de execução fixa a área do professor pela sessão (A2), confere o
  agente, a permissão, o recurso, o tamanho e a idempotência (A11) e responde `202` na
  hora.
- **Worker.** Um worker no processo da API, no padrão da 004 (tabela como fila, `SKIP
  LOCKED`, lease, `runOnce`), executa o ciclo:
  1. reautorização e contexto congelado (A7);
  2. gateway com tempo limite, novas tentativas e uso (A12, A16);
  3. ferramentas com allowlist, permissão, esquema, posse e tempo limite (A14);
  4. validação estruturada da saída (A18);
  5. conclusão atômica, com resultado (L1) ou proposta (L2) (A13).
- **Garantias.** Prazo total, varredura e cancelamento garantem estado final conhecido
  (A9, A10).
- **Administração.** O administrador opera saúde, indicadores, uso, custo e as chaves
  liga/desliga pela API e pela tela "Operação de IA", sem nenhum conteúdo pedagógico
  (A20, A22).
- **Web.** O frontend ganha componentes de estado de IA no catálogo e hooks para as
  telas dos agentes futuros.
- **Sem dependências novas.**

## Technical Context

**Language/Version**: TypeScript 7 sobre Node.js 24 LTS (API com SWC; `tsc --noEmit` para tipos)
**Primary Dependencies**:
- API: NestJS 11, Prisma 7 + `@prisma/adapter-pg`, `nestjs-pino`;
- contratos: `@repo/contracts` (Zod 4, com `z.toJSONSchema` para os esquemas de saída);
- web: Next.js 16, React 19, Tailwind CSS 4, shadcn/ui, Lucide, TanStack Query 5;
- **nenhuma dependência nova** e nenhum SDK de provedor (FR-016, A12).

**Storage**: PostgreSQL 17, com 15 tabelas `ai_*`, 11 enums, `CHECK`s de estado,
triggers de imutabilidade (versões usadas, conteúdo da proposta, transições append-only)
e 4 permissões por migração de dados ([data-model.md](./data-model.md)).
**Testing**:
- Vitest + `@nestjs/testing` + `supertest` contra PostgreSQL real, com o agente de
  referência e o provedor simulado e o worker por `runOnce(now)`: integração por história,
  matriz de autorização, isolamento, concorrência, resiliência, fronteira de provedores e
  varredura operacional;
- guardas existentes ampliadas;
- web: Vitest + RTL + `vitest-axe` + teclado;
- Playwright: uma jornada da tela de operação.

**Target Platform**: servidor Linux (API em contêiner) e navegadores atuais; CI GitHub Actions
**Project Type**: monorepo web (API NestJS + web Next.js + pacote de contratos)
**Performance Goals**:
- pedido de execução < 1 s, independente do modelo (SC-006);
- estado final ≤ prazo total + 1 min, mesmo após reinício (SC-005);
- indicadores de 30 dias com 100 mil execuções em ≤ 1 s (índices por data e versão).

**Constraints**:
- nenhum conteúdo pedagógico, instrução, saída do modelo ou credencial em logs, auditoria
  ou respostas operacionais (SC-007);
- nenhuma chamada a provedor real nos testes (SC-011);
- sem fila externa, Redis, WebSocket ou SDK;
- WCAG 2.2 AA.

**Scale/Scope**:
- 9 histórias e 67 requisitos;
- 14 rotas novas, 1 tela nova e 5 componentes de estado;
- 15 tabelas e 19 tipos de auditoria.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**:
  - pedidos com schema estrito (campos de área, professor ou dono recusados);
  - argumentos de ferramenta e saída do modelo validados por esquema;
  - limites de tamanho e taxa;
  - conteúdo enviado tratado como dado (A19);
  - IDOR: tudo buscado pela área da sessão (A2);
  - credenciais só no servidor (FR-018);
  - OWASP LLM Top 10 considerado: injeção de instruções, agência excessiva, consumo
    ilimitado e vazamento de dados sensíveis ✅
- [x] **II. RBAC**: `ia.execucoes.visualizar`, `ia.propostas.revisar`, `ia.operacao.visualizar`, `ia.agentes.gerenciar` + permissão declarada por agente, conferida no serviço; contexto 404 ([contracts/permissions.md](./contracts/permissions.md)) ✅
- [x] **III. Server authority**: estados, prazos, expiração e limites decididos no servidor, com o relógio do servidor ✅
- [x] **IV. Untrusted code**: nenhum código executado; o modelo não tem terminal, banco livre, arquivos nem rede (FR-056) ✅
- [x] **V. Data integrity**: migração Prisma; FKs `Restrict`; `UNIQUE` (versões, idempotência, proposta por execução); `CHECK`s que tornam estados impossíveis irrepresentáveis; triggers de imutabilidade ✅
- [x] **VI. Audit & logs**:
  - 19 tipos de auditoria na mesma transação, só com ids, versões, códigos e números
    ([contracts/audit-events.md](./contracts/audit-events.md));
  - logs com campos numa allowlist (A20);
  - varredura de segredos e conteúdo ampliada ✅
- [x] **VII. Tests**: cada história, matriz, isolamento (SC-001), fronteira (SC-002), saídas inválidas (SC-003), ferramentas (SC-004), prazos (SC-005), latência (SC-006), varredura (SC-007), versões (SC-008), resiliência (SC-009), idempotência (SC-010), provedor simulado (SC-011), axe/teclado (SC-012) ✅
- [x] **VIII. Layering**:
  - controllers finos → serviços;
  - gateway, executor de ferramentas, validador e máquinas de estado são classes puras
    testáveis;
  - domínio só usa `AiExecutionService` e `AiProposalService`;
  - nenhuma regra em React ✅
- [x] **IX. Simplicity**:
  - a constituição exige spec aprovada para IA, e esta é a spec;
  - sem dependência, fila, Redis, OpenTelemetry nem biblioteca de agentes;
  - reusa worker, limite de taxa, auditoria e manutenção;
  - sem tabela de área (A2), sem motor de grafos (A8), sem retomada no meio (A9), sem
    endpoints de avaliação ✅
- [x] **X. Evidence**: uso, tempos e falhas registrados como fatos (`ai_model_calls`, `ai_tool_calls`, transições) ✅
- [x] **XI. Human oversight**: saída de agente = `SUGGESTION`; decisão do professor = `HUMAN_DECISION`; a fundação nunca aplica proposta (FR-044) ✅
- [x] **XII. Determinism first**: a fundação não usa IA para nenhuma regra; autorização, limites e validação são determinísticos (FR-058) ✅
- [x] **XIII. Risk level**: L1 e L2 apenas; L3 recusado na sincronização, no `CHECK` e na execução (FR-006) ✅
- [x] **XIV–XV. AI governance**:
  - IA não autoritativa;
  - ferramentas com allowlist, esquema de entrada e saída mínima, autorização, tempo
    limite e auditoria (A14);
  - contexto minimizado (FR-057);
  - fontes identificáveis por `executionId`, `resourceType` e `resourceId` ✅
- [x] **XVI. Explicit states**: execução, proposta, agente, configuração e instruções com enums e máquinas de estado; `409 INVALID_STATE_TRANSITION` ✅
- [x] **XVII. Idempotency**: chave de idempotência no pedido; `SKIP LOCKED` + `claim_token`; proposta única por execução; decisão condicional com vencedor único; cancelamento repetido sem efeito ✅
- [x] **XVIII. Safe interruption**:
  - prazo total com varredura;
  - tempo por chamada e ferramenta;
  - cancelamento entre etapas;
  - kill switch por agente e por configuração (API) e global
    (`AI_EXECUTION_INTERVAL_SECONDS=0`);
  - estado final sempre conhecido ✅
- [x] **XIX. AI evals**: tabelas e serviço de casos e resultados ligados às versões (FR-064); prompts e esquemas versionados em código; cada agente traz os casos antes de produção ✅
- [x] **XX. Pedagogy**: N/A — nenhum monitoramento de aluno
- [x] **XXI. Configurable domain**: nenhuma disciplina, linguagem ou tecnologia no código; tipos de recurso e agentes são dados registrados ✅
- [x] **XXII. Personalization & accessibility**:
  - nenhuma necessidade individual tratada;
  - dados de alunos não vão ao modelo sem necessidade (FR-057);
  - tela e componentes WCAG 2.2 AA ✅
- [x] **XXIII. Curricular traceability**: N/A nesta feature; cada agente define as fontes e liga ao resultado (execução → recurso-alvo) ✅
- [x] **XXIV. Academic isolation**: toda rota confere permissão **e** área; ferramentas conferem posse do recurso; fora do contexto → 404; ADMIN, MANAGER e STUDENT → 403 nas rotas pedagógicas ✅
- [x] **XXV. Privileged provisioning**: N/A — nenhum papel ou conta alterado
- [x] **XXVI. Shared contracts**: pedidos, respostas, enums e erros em `packages/contracts/src/ai/` + catálogo; mensagens no web; a API valida com os mesmos schemas ✅
- [x] **Frontend stack**: Tailwind + shadcn/ui (`Table`, `Select`, `AlertDialog`, `Checkbox`, `Alert`, `Badge`) + Lucide, TanStack Query (`refetchInterval` para o estado da execução), `fetch` só em `lib/api/client.ts`, sem Redux; `features/ai`, `features/ai-operations` e `components/shared/ai` ✅

**Resultado**: sem violações. *Complexity Tracking* vazio.

**Re-check pós-design** (depois de research, data-model e contracts): mantido. Pontos
revistos:

- **IX**: 15 tabelas é o mínimo para as entidades da spec, com versões imutáveis separadas
  da identidade do agente e a trilha de transições pedida em US1-2. O uso fica na própria
  linha da chamada ao modelo (A16), sem tabela 1:1. Avaliação só tem serviço, sem rotas.
- **I/XIV**: a separação system/context/untrusted (A19) é defesa em profundidade; as
  garantias reais são allowlist, posse, limites e validação do servidor.
- **XXIV**: a matriz de [permissions.md](./contracts/permissions.md) cobre 401/403/404, e
  `006-ai-isolation.spec.ts` cobre a ferramenta sobre recurso de outra área.
- **FR-035**: ajustada na spec para a ordem implementável (argumentos validados antes do
  acesso a dados), sem mudar a intenção.

## Project Structure

### Documentation (this feature)

```text
specs/006-ai-foundation/
├── plan.md                  # este arquivo
├── research.md              # A1–A22 + retenção
├── data-model.md            # 15 tabelas, enums, transições, invariantes
├── quickstart.md            # roteiro de validação
├── contracts/
│   ├── http-api.md          # rotas, schemas, erros
│   ├── permissions.md       # ia.* e matriz
│   ├── audit-events.md      # 19 tipos novos
│   ├── agent-runtime.md     # como declarar agentes, ferramentas, modelos e provedores; ciclo
│   └── web-ui.md            # tela "Operação de IA", componentes de estado, mensagens
├── checklists/requirements.md
└── tasks.md                 # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── ai/
│   ├── enums.ts              # AiRiskLevel, AiAgentStatus, AiExecutionStatus, AiProposalStatus, AiModelConfigStatus, AiErrorCode
│   ├── executions.ts         # RequestAiExecutionRequest, AiExecutionView/Page/ListQuery/Result
│   ├── proposals.ts          # AiProposalView/Summary/Page/ListQuery, DecideAiProposalRequest
│   └── operations.ts         # AiHealth, AiMetrics(Query), AiAgentOperationsView, AiModelConfigView, Change*Status
├── common/errors.ts          # + AI_* e 3 códigos de regra
└── endpoints.ts              # + 14 rotas

apps/api/
├── prisma/
│   ├── schema.prisma                                  # + 15 modelos Ai*
│   └── migrations/<ts>_ai_foundation/                 # tabelas, CHECKs, triggers, permissões ia.*
├── src/modules/ai/
│   ├── ai.module.ts
│   ├── definitions/          # types.ts (defineAgent/defineTool/defineModelConfig), index.ts (produção: vazio), AI_DEFINITIONS
│   ├── registry/             # ai-registry.sync.ts, agent/tool/model-config registries
│   ├── gateway/              # model-provider.ts, model-gateway.ts, provider-errors.ts, retry-policy.ts, providers/ (vazio)
│   ├── tools/                # ai-tool-executor.ts
│   ├── output/               # structured-output.validator.ts
│   ├── execution/            # ai-executions.controller/service, ai-execution.worker, ai-execution.runner,
│   │                         # ai-execution.state-machine, ai-execution-context, prompt-envelope, ai-log
│   ├── proposals/            # ai-proposals.controller/service, ai-proposal.state-machine
│   ├── usage/                # ai-usage.recorder, cost
│   ├── operations/           # ai-operations.controller/service, ai-metrics.query
│   ├── evaluation/           # ai-evaluation.store
│   └── retention/            # ai-records.job (MAINTENANCE_JOB_NAMES)
├── src/modules/audit/audit-event-types.ts            # + tipos 006
├── src/modules/access-control/permissions.ts         # + ia.*
├── src/platform/config/config.schema.ts              # + AI_*, RATE_LIMIT_AI_*
├── src/platform/database/transaction.ts              # + LockKey.AI_REGISTRY
├── eslint.config.*                                   # + fronteira de provedores (A15)
└── test/
    ├── fixtures/ai/          # reference-agent(s), reference.read-subject tool, model configs, fake-model-provider, definitions
    ├── helpers/ai.ts         # createAiTestApp, runExecution(now), fake script builders
    ├── integration/006-us{1..8}-*.spec.ts
    ├── unit (ao lado do código): state machines, retry, validator, envelope, cost, sync, tool executor
    └── security/006-ai-{authorization-matrix,isolation,boundary,concurrency,resilience,no-real-provider,admin-scan}.spec.ts
                 + domain-boundary, audit-coverage, secret-leak-scan, route-declarations, authorization-matrix, traceability

apps/web/
├── app/(app)/admin/ia/page.tsx                        # "Operação de IA"
├── features/ai/{api,hooks}/                           # execuções e propostas para telas futuras
├── features/ai-operations/{api,components,hooks}/     # saúde, indicadores, uso, agentes, configurações
├── components/shared/ai/                              # AiExecutionStatus, AiProposalStatus, AiProcessingIndicator, AiErrorState, AiProposalReview
├── features/design-system/{registry.ts,components/ai-showcase.tsx}   # grupo "Inteligência artificial"
├── design-system/components.md                        # + 5 seções
├── lib/navigation.ts                                  # + Operação de IA, STAFF_AREA_PERMISSIONS, AREAS
├── components/shared/app-sidebar.tsx                  # + item
├── lib/messages/error-messages.ts                     # + códigos AI_*
└── e2e/ai-operations.spec.ts
```

**Structure Decision**:
- Mantém o monorepo.
- Um módulo Nest `ai` com subpastas por responsabilidade (A3).
- Um diretório de contratos `ai/`.
- Duas features web (`ai` para as telas dos agentes futuros e `ai-operations` para o
  administrador) e componentes de estado em `components/shared/ai`.
- O agente de referência e o provedor simulado ficam só em `apps/api/test/fixtures/ai`.

## Impacto em artefatos existentes

- **Specs 001–005**: nenhum comportamento muda (FR-067). O menu ganha um item só para quem
  tem `ia.operacao.visualizar`. `STAFF_AREA_PERMISSIONS` ganha a permissão, e o
  administrador já estava no AppShell.
- **Guardas**:
  - `domain-boundary.spec.ts` (modelos `Ai*`);
  - `audit-coverage.spec.ts` (catálogo 006);
  - `secret-leak-scan.spec.ts` (marcadores de conteúdo, saída e credencial falsa);
  - `endpoint-catalog.spec.ts`;
  - `authorization-matrix.ts` e `route-declarations.spec.ts`;
  - `traceability.spec.ts` (`SPECS` + 006);
  - catálogo e `docs.test.ts` do Design System (5 componentes novos);
  - `lint-boundaries.test.ts` do web, se a camada `components/shared/ai` exigir ajuste.
- **`testConfig`** desliga o timer do worker de IA (`AI_EXECUTION_INTERVAL_SECONDS=0`).
- **Manutenção**: job `ai-records` em `contracts/maintenance-jobs.md` da 001.
- **Docs** na fase de Polish:
  - `CLAUDE.md`: módulo `ai`, fronteira, fixtures, decisões A1–A22;
  - `.env.example`: variáveis `AI_*`;
  - `DEPENDENCIES.md`: nada novo, com nota de que nenhum SDK de provedor foi adicionado.

## Complexity Tracking

Sem violações da constituição a justificar.
