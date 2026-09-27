---

description: "Task list for 009 — Política de Modelos de IA: Catálogo, Níveis de Capacidade e Custo"
---

# Tasks: 009 — Política de Modelos de IA: Catálogo, Níveis de Capacidade e Custo

**Input**: Design documents from `/specs/009-ai-model-policy/`
**Prerequisites**: plan.md, spec.md, research.md (H1–H16), data-model.md, contracts/
(model-policy, catalog-and-quality-gate, decisions-provider, http-api, audit-events,
configuration), quickstart.md

**Tests**: obrigatórios (Constituição VII; spec §19 e SC-001–SC-010).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 009 com prefixo (`009/US2-3`, `009/FR-012`,
  `009/SC-004`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`009/US2-1`…`009/US2-6`), cada cenário da faixa ganha o seu `it` com o id no título. `apps/api/test/traceability.spec.ts` passa a procurá-los na fase final (T056).
- Nenhum teste chama modelo real: provedor simulado da 006 (estendido com `decide`), o
  `OpenRouterProvider` com `fetch` injetado, e o E2E com `apps/web/e2e/openrouter-mock.ts`.
- As suítes da 006, 007 e 008 continuam verdes em toda fase. Onde fixam detalhes que esta
  feature muda de propósito (rota fixa da tarefa, variáveis `OPENROUTER_*_MODEL`), só esses
  detalhes são ajustados, nunca uma asserção de comportamento (SC-005).
- Cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `specs/006-ai-foundation/contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige entrada em `packages/contracts/src/endpoints.ts`, linha na matriz de
  autorização da 006 (`test/security/006-ai-authorization-matrix.ts`) e a varredura
  administrativa (`006-ai-admin-scan.spec.ts`).

**Organization**: tarefas por user story, na ordem das dependências reais.
- A Foundational entrega a migração, o catálogo e as políticas como definições sincronizadas e
  a seleção pura no caminho do pedido (sem override, escalonamento nem visões). Toda história
  precisa disso.
- US1 (allowlist e catálogo, incluindo o modo decisão do Jev), US2 (nível e custo), US3
  (Curriculum Agent em BASIC, com a etapa de liberação) e US4 (fallback no nível e
  escalonamento) formam o P1; US3 é o MVP visível.
- US5 (ciclo de vida e quality gate), US6 (custo), US7 (override) são P2; US8 (orçamentos) é P3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US8)
- Caminhos relativos à raiz do repositório

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: configuração e enums, sem mudar comportamento.

- [X] T001 Em `apps/api/src/platform/config/config.schema.ts` (contracts/configuration.md):
  acrescentar `AI_BUDGET_DAILY_USD`, `AI_BUDGET_MONTHLY_USD`, `AI_BUDGET_PER_USER_MONTHLY_USD`,
  `AI_BUDGET_PER_AGENT_MONTHLY_USD` (decimais opcionais > 0; vazio = ausente) em
  `AppConfig.ai.budgets`; manter `OPENROUTER_DEFAULT_MODEL`/`OPENROUTER_FALLBACK_MODEL` até a
  T013 (que os remove). `apps/api/test/helpers/test-app.ts`: orçamentos nulos por padrão.
- [X] T002 [P] `apps/api/.env.example`: bloco comentado dos orçamentos (só avisam, spec Q3).
- [X] T003 [P] Criar `apps/api/src/modules/ai/definitions/model-families.ts`: allowlist
  fechada `["openai", "anthropic", "typesafe"]`, tipos `ModelTier` (ordenado, com
  `nextTier`/`compareTiers`), `ModelMode`, `ModelLifecycle`, `ModelCapabilities`
  (`structuredOutput`, `tools`, `vision`, `reasoning`) (`009/FR-005`).

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: dados, definições, sync e seleção pura no pedido. Ao fim, a 006/007/008 passa com
as tarefas escolhendo modelos pela política.

- [X] T004 Migração `apps/api/prisma/migrations/<ts>_ai_model_policy/migration.sql` e
  `apps/api/prisma/schema.prisma` (data-model.md): enums `ai_model_tier`, `ai_model_mode`,
  `ai_model_lifecycle`, `ai_selection_reason`; colunas novas de `ai_model_configs` (`family`,
  `tier`, `mode`, `lifecycle`, `context_window`, `capabilities`, `priority`) com CHECK do modo
  decisão; `ai_tasks`: `policy` jsonb e `preferred_tier`, remover
  `primary_model_config_id`/`fallback_model_config_id` e o CHECK entre eles; tabelas
  `ai_model_task_approvals`, `ai_task_overrides`, `ai_budget_alerts`; colunas de
  `ai_executions` (`tier`, `selection_reason`, `escalation_*`) com CHECK "tudo ou nada" e de
  `ai_model_calls` (`tier`, `family`, `is_escalation`). Conferir com `prisma migrate diff` que o
  schema e a migração batem.
- [X] T005 Em `apps/api/src/modules/ai/definitions/types.ts`: `CatalogModel` (ex-
  `ModelConfigDefinition` + família, nível, modo, ciclo de vida, janela, capacidades, prioridade,
  aprovações), `TaskDefinition` com a política (research H5) no lugar de
  `primaryModelConfigKey`/`fallbackModelConfigKey`, `AiDefinitions.families` (allowlist em
  vigor; produção = as três, testes = as mesmas mais `fake`), `ModelProvider.decide?` e os
  tipos de decisão (contracts/decisions-provider.md).
- [X] T006 Em `apps/api/src/modules/ai/registry/ai-definitions.check.ts`: checagens do catálogo
  (contracts/catalog-and-quality-gate.md; uma entrada inválida é ignorada e logada
  `ai.catalog_entry_rejected`, sem derrubar a API) e da política (H5; tarefa inválida fica
  indisponível com `POLICY_INVALID`; `minConfidence` só em `(0.5, 1]`) (`009/FR-006`, `009/FR-027`). Regra da
  família (research H3): quando o id tem `/`, o prefixo é a família; id sem prefixo só para
  família fora da allowlist de produção (a `fake` dos testes). Um teste fixa a allowlist de
  produção em exatamente `openai`, `anthropic` e `typesafe` (`009/FR-001`).
- [X] T007 Criar `apps/api/src/modules/ai/policy/{tiers.ts,estimate-cost.ts,select-route.ts}`
  (contracts/model-policy.md): `selectRoute` pura com filtros, ordem (override, custo estimado,
  prioridade, chave), fallback do mesmo nível preferindo outra família, motivos e
  indisponibilidade. Só lê o que recebe; sem Prisma nem Nest.
- [X] T008 Em `apps/api/src/modules/ai/registry/ai-registry.sync.ts`: sincronizar o catálogo
  em `ai_model_configs` (colunas novas; `ai_model_config.lifecycle_changed` ao mudar o ciclo de
  vida — tipo novo, com contrato 006 e jornada), as políticas em `ai_tasks`, e as aprovações em
  `ai_model_task_approvals` com `valid` calculado pelos limiares da tarefa (aprovação abaixo →
  `ai.approval_rejected`); `ai_registry.synced` ganha `catalogModels`.
- [X] T009 Criar `apps/api/src/modules/ai/registry/ai-policy.registry.ts`: lê do banco catálogo
  (com status e circuito via `ModelGateway.isUsable`), aprovações válidas, política e override
  de uma tarefa e chama `selectRoute`; `availability(taskKey)` sem tomar sonda de circuito.
  Substitui `AiTaskRegistry.routeOf`.
- [X] T010 Em `apps/api/src/modules/ai/execution/ai-executions.service.ts`: a rota vem da
  `AiPolicyRegistry` no pedido; a execução grava principal, fallback, `tier` e
  `selection_reason`; `ai_execution.requested` ganha `tier` e `selectionReason` (contrato 006).
  A disponibilidade do agente usa a mesma seleção.
- [X] T011 Em `apps/api/src/modules/ai/execution/ai-execution.runner.ts` e
  `apps/api/src/modules/ai/usage/ai-usage.recorder.ts`: cada perna grava `tier` e `family` da
  configuração; o runner relê a rota fixada (008) sem mudança de comportamento.
- [X] T012 Criar `apps/api/src/modules/ai/definitions/model-catalog.ts` com as sete entradas
  (research H12), **todas CANDIDATE e sem aprovações** — nenhuma evidência é montada a partir
  do `recorded.json` da 007, que não registra o modelo que respondeu (`009/FR-002`,
  `009/FR-017`) — e `apps/api/src/modules/curriculum-ai/definitions/curriculum-agent.ts` com as
  oito políticas (research H13, `009/FR-026`): `curriculum-extraction` já em BASIC
  (preferido e mínimo), `maxTier` STANDARD, `escalation: "ON_OUTPUT_INVALID"`,
  `fallback: "SAME_TIER"`; as outras sete com os níveis da spec. Consequência esperada: fora dos
  testes (que usam o catálogo simulado), a análise fica indisponível na branch até a T030, e a
  branch não é mergeada antes dela.
- [X] T013 Em `apps/api/src/modules/ai/definitions/index.ts`: `productionAiDefinitions` passa a
  usar o catálogo e as famílias; remover `openRouterModelConfigs` e as variáveis
  `OPENROUTER_DEFAULT_MODEL`/`OPENROUTER_FALLBACK_MODEL` de `config.schema.ts`,
  `.env.example` e `test-app.ts` (um valor ainda definido é ignorado e logado
  `ai.config_ignored`, só o nome); a validação de modelos da 008 (T030 dela) passa para a
  checagem do catálogo.
- [X] T014 Fixtures e ajustes de testes (só detalhes que a feature muda de propósito):
  - `apps/api/test/fixtures/ai/model-configs.ts` vira o catálogo de teste: `fake-default`,
    `fake-alt`, `fake-no-price` com família `fake`, nível BASIC, modo geração, PRODUCTION,
    `fake-default` com prioridade maior; aprovados para as tarefas de referência;
  - `apps/api/test/fixtures/ai/tasks.ts` e `reference-routed.ts`: políticas com
    `typicalUsage` zerado (o desempate vai à prioridade, e os modelos das suítes 006/008 ficam
    os mesmos), `allowedFamilies: ["fake"]`, `fallback` conforme cada suíte;
  - `apps/api/test/helpers/curriculum-ai.ts`: a configuração do Curriculum Agent de teste vira
    entrada de catálogo aprovada para `curriculum-extraction`;
  - suítes 008 que declaram rota fixa (`008-execution-route`, `008-us3-fallback`,
    `008-us6-circuit`, `008-fallback-concurrency`, `008-us5-observability`, `006-ai-admin-scan`,
    `008-registry-tasks`, `008-us2-model-by-config`) passam a declarar a política equivalente;
    a `008-us2-model-by-config` troca "modelo por variável" por "modelo por catálogo";
  - `test/security/domain-boundary.spec.ts`: modelos `AiModelTaskApproval`, `AiTaskOverride`,
    `AiBudgetAlert`.
- [X] T015 [P] Criar `apps/api/test/integration/009-registry-catalog.spec.ts`: o sync grava
  catálogo, políticas e aprovações; mudança de ciclo de vida audita uma vez; entrada ou
  política inválida não derruba a API e fica indisponível com o motivo no log.

**Checkpoint**: a suíte inteira verde com a seleção pela política.

---

## Phase 3: User Story 1 — Só famílias e modelos aprovados são usados (Priority: P1)

**Goal**: nada fora do catálogo e da allowlist chega ao provedor; o modo decisão (Jev) existe e
nunca atende geração.

**Independent Test**: modelos fora do catálogo, de família não autorizada ou de outro modo
nunca são chamados; o Jev responde por `decide` com validação e certeza.

### Tests for User Story 1 ⚠️

- [X] T016 [P] [US1] Criar `apps/api/src/modules/ai/policy/select-route.spec.ts` (parte
  allowlist): família fora da allowlist ou da tarefa, modelo fora do catálogo, modo diferente
  e capacidade ausente nunca são escolhidos (`009/US1-1`, `009/US1-2`, `009/FR-003`,
  `009/FR-001a`).
- [X] T017 [P] [US1] Criar `apps/api/test/security/009-model-id-boundary.spec.ts`: nenhum
  arquivo de `apps/api/src` fora de `definitions/model-catalog.ts` (e do adaptador) contém id
  concreto de modelo; o agente só nomeia a tarefa (`009/US3-3`, `009/FR-007`); nenhuma entrada
  nova entra sem estar no arquivo (`009/US1-3`, `009/FR-004`).
- [X] T018 [P] [US1] Em `apps/api/src/modules/ai/gateway/providers/openrouter.provider.spec.ts`:
  `decide` monta `POST {origin}/api/alpha/decisions` com `model`, `state`, `questions`, sem
  `user`/`session_id`/`trace`; mapeia respostas `choice`/`score`/`noul`, custo, modelo servido,
  e a tabela de erros; a chave nunca aparece (`009/FR-001a`, `009/US1-4`).
- [X] T019 [P] [US1] Em `apps/api/src/modules/ai/gateway/model-gateway.spec.ts`: `decide`
  valida ids, tipos e opções; resposta fora do pedido → `AI_OUTPUT_VALIDATION_FAILED`; abaixo
  de `minConfidence` → `UNDECIDED`; fallback e circuito como em `call` (`009/FR-001b`).
- [X] T020 [P] [US1] Criar `apps/api/test/integration/009-us1-allowlist.spec.ts`: uma tarefa de
  referência de decisão roda pelo provedor simulado; modelo de decisão nunca escolhido para
  tarefa de geração e vice-versa; configuração de modelo fora do catálogo no banco nunca é
  chamada (`009/US1-1`, `009/SC-001`).

### Implementation for User Story 1

- [X] T021 [US1] `apps/api/src/modules/ai/gateway/providers/openrouter.provider.ts`: `decide`
  (contracts/decisions-provider.md); `apps/api/test/fixtures/ai/fake-model-provider.ts`:
  `decide` com roteiro (`fakeDecision`).
- [X] T022 [US1] `apps/api/src/modules/ai/gateway/model-gateway.ts`: `decide(call)` com pernas,
  tentativas, fallback, circuito e validação das respostas.
- [X] T023 [US1] `apps/web/e2e/openrouter-mock.ts`: rota de decisões (para o teste de
  referência de decisão rodar pelo adaptador real no E2E, se usado).

**Checkpoint**: US1 completa.

---

## Phase 4: User Story 2 — Nível certo pelo menor custo que atende (Priority: P1)

**Goal**: seleção determinística no nível preferido, custo depois de qualidade.

**Independent Test**: com vários modelos no catálogo, a escolha é sempre a mesma, do nível
certo e a mais barata entre os aprovados.

### Tests for User Story 2 ⚠️

- [X] T024 [P] [US2] Em `apps/api/src/modules/ai/policy/select-route.spec.ts`: tarefa BASIC
  nunca recebe STANDARD/ADVANCED; o mais barato entre os aprovados; empate por prioridade e
  chave; reprovado mais barato ignorado; sem preço depois dos com preço; saída estruturada
  exigida; sem candidato → indisponível; mesma entrada → mesma saída (`009/US2-1`…`009/US2-6`,
  `009/FR-008`, `009/FR-009`, `009/SC-002`, `009/SC-003`, `009/SC-004`).
- [X] T025 [P] [US2] Criar `apps/api/test/integration/009-us2-selection.spec.ts`: a execução
  grava nível, modelo e motivo; a disponibilidade da 007 fica `MODEL_UNAVAILABLE` sem candidato
  e o fluxo manual funciona (`009/US2-5`, `009/FR-010`, `009/SC-010`).

### Implementation for User Story 2

- [X] T026 [US2] Completar `select-route.ts`/`ai-policy.registry.ts` com o que os testes
  apontarem (preço desconhecido, DEPRECATED só na falta, motivos) e o log
  `ai.task_unavailable` com os motivos novos.

**Checkpoint**: US2 completa.

---

## Phase 5: User Story 3 — Curriculum Agent em BASIC (Priority: P1) 🎯 MVP

**Goal**: a análise de "Preencher com IA" usa um modelo BASIC aprovado, sem mudar nada para o
professor.

**Independent Test**: suíte 007/008 verde com a análise roteada a BASIC; a etapa de liberação
gera a evidência dos candidatos BASIC.

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] Criar `apps/api/test/integration/009-us3-curriculum-basic.spec.ts`: com o
  catálogo de teste de um BASIC aprovado, a análise usa BASIC e o registro mostra tarefa,
  nível, família e modelo (`009/US3-1`, `009/SC-005`); a suíte da 007 roda sem mudança de
  comportamento com a análise pela política (`009/US3-2`); o agente não nomeia nível, família
  nem modelo (`009/US3-3`).
- [ ] T028 [P] [US3] Criar `apps/api/test/security/009-quality-gate.spec.ts`: toda aprovação do
  catálogo de produção bate com o arquivo de evidência, que registra o modelo servido e o custo
  de uma execução real, e atinge os limiares da tarefa; nenhum PRODUCTION sem aprovação
  (contracts/catalog-and-quality-gate.md, `009/FR-017`).

### Implementation for User Story 3

- [ ] T029 [US3] `apps/api/test/eval/curriculum-agent.eval.ts`: `EVAL_MODEL=<chave do
  catálogo>` roda o conjunto de referência só nesse modelo; com `EVAL_RECORD=1` grava
  `apps/api/test/fixtures/evaluations/curriculum-extraction/<chave>.json` (formato do contrato);
  README do conjunto de referência atualizado.
- [ ] T030 [US3] **Etapa de liberação (custo de centavos; autorizada pelo usuário, roda sem perguntar)**: rodar a
  avaliação para `anthropic-basic` e `openai-basic`; commitar as evidências; para cada BASIC que
  atingir os limiares, acrescentar a aprovação e `lifecycle: "PRODUCTION"` no catálogo (a
  política de `curriculum-extraction` já é BASIC desde a T012). Se nenhum BASIC passar,
  avaliar os STANDARD e subir a política para STANDARD com a evidência reprovada como
  justificativa (spec Assumptions, research H12). Ao fim, a análise volta a ficar disponível e
  o `009-quality-gate.spec.ts` passa com as aprovações reais.
- [ ] T031 [US3] E2E: `apps/web/e2e/curriculum-ai.spec.ts` e `ai-operations.spec.ts` passam com
  a análise pela política (o mock responde a qualquer modelo pedido); ajustar só o que cita a
  configuração `openrouter-default`.

**Checkpoint**: US3 completa; `pnpm --filter web test:e2e` verde.

---

## Phase 6: User Story 4 — Fallback no nível; escalonamento só por regra (Priority: P1)

**Goal**: fallback do mesmo nível; escalonamento uma vez, ao nível seguinte, só quando a tarefa
permite.

**Independent Test**: falhas técnicas e de validação em tarefas com e sem escalonamento
produzem o nível, as chamadas e o registro esperados.

### Tests for User Story 4 ⚠️

- [ ] T032 [P] [US4] Em `select-route.spec.ts`: fallback sempre do mesmo nível, de outra
  família quando existe; nunca de família não permitida (`009/US4-1`, `009/US4-2`,
  `009/FR-012`).
- [ ] T033 [P] [US4] Criar `apps/api/test/integration/009-us4-escalation.spec.ts`:
  - saída inválida com escalonamento permitido → uma chamada a mais no nível seguinte,
    `escalation_used`, níveis e motivo, evento `ai_execution.escalated` (`009/US4-3`);
  - sem permissão → falha como na 006 (`009/US4-4`);
  - escalonada também inválida → falha, sem segundo escalonamento; nunca além de `maxTier`;
    ADVANCED só com política explícita; sem folga em `maxModelCalls` → não escala
    (`009/US4-5`, `009/FR-013`, `009/FR-014`, `009/SC-006`);
  - rejeição da proposta e novo pedido → mesmo nível (`009/US4-6`);
  - fallback + escalonamento na mesma execução registrados separadamente (`009/FR-015`).

### Implementation for User Story 4

- [ ] T034 [US4] `apps/api/src/modules/ai/execution/ai-execution.runner.ts`: escalonamento
  (contracts/model-policy.md) com registro na execução, pernas `is_escalation`, auditoria
  `ai_execution.escalated` (tipo novo: catálogo, contrato 006, jornada) e respeito a
  `maxModelCalls` e ao prazo.

**Checkpoint**: US4 completa.

---

## Phase 7: User Story 5 — Ciclo de vida e quality gate (Priority: P2)

**Goal**: CANDIDATE/EVALUATING nunca em produção; aprovação por modelo × tarefa; versão nova só
no catálogo.

**Independent Test**: promover, reprovar, depreciar e desabilitar modelos e ver a seleção
reagir.

### Tests for User Story 5 ⚠️

- [ ] T035 [P] [US5] Criar `apps/api/test/integration/009-us5-lifecycle.spec.ts`: CANDIDATE e
  EVALUATING nunca escolhidos; aprovação abaixo dos limiares ignorada e logada; DISABLED nunca
  (nem fallback, nem override); DEPRECATED só na falta de outro, com aviso; nova versão no
  catálogo muda a escolha sem tocar em agente ou política, e as execuções antigas mantêm o
  modelo (`009/US5-1`…`009/US5-5`, `009/FR-016`, `009/FR-017`, `009/FR-018`, `009/FR-019`,
  `009/SC-007`).

### Implementation for User Story 5

- [ ] T036 [US5] Completar sync e seleção com o que os testes apontarem (aviso de DEPRECATED
  em `ai.model_deprecated_in_use`, transições inválidas do ciclo de vida recusadas na
  checagem do catálogo).

**Checkpoint**: US5 completa.

---

## Phase 8: User Story 6 — Custo por agente, tarefa, nível, família e modelo (Priority: P2)

**Goal**: visões de custo e de qualidade × custo em "Operação de IA", sem conteúdo nem ids.

**Independent Test**: execuções em vários níveis, com fallback e escalonamento, respondem às
perguntas do pedido.

### Tests for User Story 6 ⚠️

- [ ] T037 [P] [US6] Criar `apps/api/test/integration/009-us6-cost.spec.ts`: `byTask`,
  `byTier`, `byFamily`, `byAgent.escalations`, `byModel.tier/family`; `GET
  /ai/operations/models` com aprovações, métricas e custo real por execução; `GET
  /ai/operations/tasks` com a escolha atual e o motivo (`009/US6-1`…`009/US6-3`,
  `009/FR-020`, `009/FR-021`, `009/SC-008`).
- [ ] T038 [P] [US6] `apps/api/test/security/006-ai-admin-scan.spec.ts` e
  `006-ai-authorization-matrix.ts`: as rotas novas sem conteúdo, credencial nem ids
  (`009/US6-4`, `009/SC-009`).
- [ ] T039 [P] [US6] `apps/web/features/ai-operations/components/ai-operations-page.test.tsx`:
  seções "Tarefas" e "Modelos", custo por nível e família; axe e Tab.

### Implementation for User Story 6

- [ ] T040 [US6] `packages/contracts/src/ai/operations.ts` e `packages/contracts/src/endpoints.ts`
  (contracts/http-api.md): métricas novas, `AiModelCatalogViewSchema`, `AiTaskPolicyViewSchema`.
- [ ] T041 [US6] `apps/api/src/modules/ai/operations/{ai-metrics.query.ts,ai-operations.service.ts,ai-operations.controller.ts}`:
  agregações por tarefa, nível e família; rotas `GET /ai/operations/models` e
  `GET /ai/operations/tasks`, com o aviso de modelo DEPRECATED em uso por tarefa (`009/US5-4`).
- [ ] T042 [US6] `apps/web/features/ai-operations/`: hooks e componentes das seções "Tarefas" e
  "Modelos" e as colunas de nível e família, com componentes do design system, textos em
  português e estados sem depender só de cor; modelo sem preço aparece como "custo
  desconhecido" e modelo DEPRECATED em uso como aviso com texto e ícone.

**Checkpoint**: US6 completa.

---

## Phase 9: User Story 7 — Override só administrativo (Priority: P2)

**Goal**: o administrador fixa um modelo aprovado por tarefa; o professor nunca escolhe.

**Independent Test**: fixar um aprovado muda a escolha; fixar um fora da política é recusado.

### Tests for User Story 7 ⚠️

- [ ] T043 [P] [US7] Criar `apps/api/test/integration/009-us7-override.spec.ts`: `PUT` com
  aprovado → novas execuções o usam (motivo `OVERRIDE`) e auditoria; outro nível, família,
  modo, não aprovado ou desabilitado → `409 AI_OVERRIDE_NOT_ALLOWED`; repetir não gera evento;
  `DELETE`; override que deixa de valer é ignorado com o motivo; professor sem acesso; campos de
  modelo/família/nível/tarefa no corpo dos pedidos → 400 (`009/US7-1`…`009/US7-4`,
  `009/FR-024`, `009/FR-025`).
- [ ] T044 [P] [US7] Matriz de autorização da 006 com `PUT`/`DELETE
  /ai/operations/tasks/:key/override`.

### Implementation for User Story 7

- [ ] T045 [US7] Contratos (`TaskOverrideRequestSchema`, endpoints), serviço e rotas do
  override em `ai-operations.*`; auditoria `ai_task_override.set`/`removed` (tipos novos,
  alvo `AI_TASK`, contrato 006, jornada); código `AI_OVERRIDE_NOT_ALLOWED` no catálogo de erros
  e na mensagem do web.
- [ ] T046 [US7] Web: na seção "Tarefas", fixar/remover o override com confirmação, só com
  `ia.agentes.gerenciar`, listando apenas os modelos elegíveis da tarefa.

**Checkpoint**: US7 completa.

---

## Phase 10: User Story 8 — Orçamentos configuráveis e visíveis (Priority: P3)

**Goal**: consumo contra orçamentos, aviso e auditoria, sem bloqueio.

**Independent Test**: orçamentos baixos ultrapassados geram um aviso por período, sem bloquear.

### Tests for User Story 8 ⚠️

- [ ] T047 [P] [US8] Criar `apps/api/test/integration/009-us8-budgets.spec.ts`: consumo diário,
  mensal, por agente e por usuário (só a contagem de usuários acima); primeira ultrapassagem
  gera `ai_budget.exceeded` uma vez por escopo e período, mesmo com execuções simultâneas; o
  pedido segue normalmente; os limites por execução continuam valendo (`009/US8-1`…`009/US8-3`,
  `009/FR-022`, `009/FR-023`).

### Implementation for User Story 8

- [ ] T048 [US8] Criar `apps/api/src/modules/ai/usage/ai-budget.monitor.ts`: soma de custos
  por período (America/Sao_Paulo), checagem depois de cada chamada gravada, alerta único por
  `ai_budget_alerts` e auditoria `ai_budget.exceeded` (tipo novo, contrato 006, jornada).
- [ ] T049 [US8] Métricas `budgets` (contrato e consulta) e a seção de orçamentos no web.

**Checkpoint**: todas as histórias completas.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T050 [P] `apps/api/test/security/secret-leak-scan.spec.ts` e `journey.ts`: a jornada
  cobre escalonamento, override, ciclo de vida e orçamento; nenhuma credencial ou conteúdo nos
  eventos novos.
- [ ] T051 [P] `apps/api/test/security/009-policy-injection.spec.ts`: documento com instruções
  para usar outro modelo ou nível não muda a política; a saída do modelo não altera nível,
  modelo nem orçamento (`009/FR-011`).
- [ ] T052 [P] `apps/api/CLAUDE.md`: catálogo de teste, políticas das fixtures (`typicalUsage`
  zerado e prioridade), `fakeDecision`, `EVAL_MODEL`, evidências.
- [ ] T053 [P] `CLAUDE.md` da raiz: estado (009), arquitetura (`policy/`, catálogo, aprovações,
  escalonamento, override, orçamentos, modo decisão), guardas (`009-*`), comandos da etapa de
  liberação.
- [ ] T054 [P] `README.md`: fase 009, catálogo e níveis, etapa de liberação, orçamentos.
- [ ] T055 Rodar o `quickstart.md` §1 e corrigir divergências.
- [ ] T056 Acrescentar a 009 ao `SPECS` de `apps/api/test/traceability.spec.ts` (8 histórias,
  cenários do spec, `rows: 0`, `successCriteria` SC-001–SC-010) e cobrir os ids que faltarem.
- [ ] T057 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)** e **US2 (Phase 4)**: dependem da Foundational; independentes entre si.
- **US3 (Phase 5)**: depende da US2 (seleção completa); a T030 depende da T029.
- **US4 (Phase 6)**: depende da US2 (seleção por nível para o escalonamento).
- **US5 (Phase 7)**: depende da Foundational (sync) e da US2.
- **US6 (Phase 8)**: depende da US4 (escalonamentos nas métricas).
- **US7 (Phase 9)**: depende da US2 e da US6 (visão de tarefas).
- **US8 (Phase 10)**: depende da Foundational (custos por chamada).
- **Polish (Phase 11)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `ai-execution.runner.ts` é tocado por T011 e T034; `select-route.ts` por T007, T026 e T036;
  `ai-operations.*` por T041 e T045: sequenciais.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo depois da T001.
- US1: T016–T020 em paralelo.
- US2: T024 e T025 em paralelo.
- US3: T027 e T028 em paralelo.
- US6: T037–T039 em paralelo.
- US7: T043 e T044 em paralelo.
- Polish: T050–T054 em paralelo.

---

## Parallel Example: User Story 1

```text
T016 select-route.spec.ts (allowlist)
T017 009-model-id-boundary.spec.ts
T018 openrouter.provider.spec.ts (decide)
T019 model-gateway.spec.ts (decide)
T020 009-us1-allowlist.spec.ts
```

---

## Implementation Strategy

### MVP First

1. Setup + Foundational: a política escolhe os modelos; a análise do Curriculum Agent já é
   BASIC e, sem aprovações reais ainda, fica indisponível fora dos testes (catálogo simulado).
2. US1 + US2: allowlist, modos e seleção por nível e custo.
3. US3 com a etapa de liberação: a análise passa a BASIC com evidência. **Parar e validar**
   (E2E e suíte 007/008).

### Incremental Delivery

- US4 (fallback no nível e escalonamento) completa o P1.
- US5, US6, US7 (P2) e US8 (P3) em seguida, cada uma testável sozinha.

### Notes

- A etapa de liberação (T030) gasta créditos do OpenRouter e envia o conjunto de referência
  (fictício) ao provedor; o usuário autorizou rodar sem perguntar (2026-09-27).
- O Jev é modelo **do sistema** (entrada de catálogo, modo decisão): não é usado como
  ferramenta no trabalho de desenvolvimento desta feature.
- Commit/push só quando o usuário pedir.
