---

description: "Task list for 008 — AI Gateway com OpenRouter: Roteamento por Tarefa e Fallback"
---

# Tasks: 008 — AI Gateway com OpenRouter: Roteamento por Tarefa e Fallback

**Input**: Design documents from `/specs/008-ai-gateway-openrouter/`
**Prerequisites**: plan.md, spec.md, research.md (G1–G20), data-model.md, contracts/
(gateway-routing, openrouter-provider, http-api, audit-events, configuration), quickstart.md

**Tests**: obrigatórios (Constituição VII; SC-001–SC-010).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 008 com prefixo (`008/US3-2`,
  `008/FR-013`, `008/SC-007`). `apps/api/test/traceability.spec.ts` passa a procurá-los na
  fase final (T062).
- Nenhum teste chama o OpenRouter real: a API usa o provedor simulado da 006
  (`test/fixtures/ai/fake-model-provider.ts`); o `OpenRouterProvider` é testado com `fetch`
  injetado; o E2E usa `apps/web/e2e/openrouter-mock.ts`.
- Os testes da 006 e da 007 continuam verdes em toda fase. Onde fixam detalhes que esta
  feature muda de propósito (versão 1 do agente, `modelConfigKey`, provedor `anthropic`), só
  esses detalhes são ajustados, nunca uma asserção de comportamento (SC-001).
- Cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `specs/006-ai-foundation/contracts/audit-events.md` (lista verificada por
  `audit-coverage.spec.ts`) e a emissão em `test/helpers/journey.ts`.

**Organization**: tarefas agrupadas por user story, na ordem das dependências reais.
- A Foundational entrega a migração, as tarefas no registro, a rota fixada na execução e o
  gateway/runner falando em rota e pernas (sem fallback ainda), com o Curriculum Agent v2
  roteado pela tarefa. Toda história precisa disso.
- US1 (OpenRouter no lugar da Anthropic, 007 igual) é o MVP.
- US2 (troca de modelo por configuração), US3 (fallback) e US4 (credencial e resiliência)
  completam o P1.
- US5 (observabilidade) e US6 (circuito e limite por agente) dependem da US3. US7 (reuso por
  novos agentes) depende da US3 e da US6.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US7)
- Caminhos relativos à raiz do repositório

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: configuração nova e redação de segredos, sem mudar comportamento.

- [X] T001 Acrescentar em `apps/api/src/platform/config/config.schema.ts` (contracts/configuration.md):
  - `OPENROUTER_API_KEY` (opcional; vazio = ausente), `OPENROUTER_BASE_URL` (opcional, URL
    http(s)), `OPENROUTER_DEFAULT_MODEL` (string, padrão `anthropic/claude-opus-5`, sem validar
    o formato aqui: a validação que deixa a tarefa indisponível é da T030),
    `OPENROUTER_FALLBACK_MODEL` (opcional), `OPENROUTER_TIMEOUT_MS` (`positiveInt(60000)`);
  - `AI_CIRCUIT_FAILURE_THRESHOLD` (`positiveInt(5)`), `AI_CIRCUIT_OPEN_SECONDS`
    (`positiveInt(60)`), `AI_AGENT_EXECUTIONS_PER_HOUR` (`positiveInt(100)`);
  - no `AppConfig`: `ai.openrouter { apiKey, baseUrl, defaultModel, fallbackModel, timeoutMs }`,
    `ai.circuit { failureThreshold, openSeconds }`, `rateLimit.aiAgentPerHour`.
  - Manter `ANTHROPIC_*` por enquanto (saem na T025).
- [X] T002 [P] Em `apps/api/src/platform/logging/logging.module.ts`, acrescentar o caminho de
  redação `*.openrouter` (o `*.anthropic` sai na T025).
- [X] T003 [P] Em `apps/api/test/helpers/test-app.ts` (`testConfig`), fixar
  `ai.openrouter.apiKey: null` e `baseUrl: null` qualquer que seja o ambiente, como já é feito
  para a Anthropic (006/SC-011).
- [X] T004 [P] Em `apps/api/.env.example`, documentar as variáveis da T001 no bloco de IA (comentário
  curto por variável, valores padrão comentados), trocar o placeholder solto
  `OPENROUTER_API_KEY=` por esse bloco e remover o placeholder `OPENAI_API_KEY=`
  (contracts/configuration.md).

**Checkpoint**: `pnpm --filter api check-types` e a suíte da API verdes; nada muda em comportamento.

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: tarefa como entidade do registro, rota fixada na execução, gateway e runner em
termos de rota e pernas, Curriculum Agent v2. Sem fallback nem circuito ainda.

### Tests for Foundational ⚠️

- [X] T005 [P] Criar `apps/api/test/integration/008-registry-tasks.spec.ts` (`008/FR-006`,
  `008/FR-007`):
  - o sync grava `ai_tasks` com principal, fallback, parâmetros, máximo de tokens e tempo
    limite; sincronizar duas vezes não muda nada;
  - uma versão de agente com `taskKey` grava `task_id` e `model_config_id` nulo; a v1 antiga
    continua com `model_config_id` (CHECK de exatamente um);
  - o CHECK recusa `fallback_model_config_id = primary_model_config_id` no banco;
  - a trigger de imutabilidade recusa mudar `task_id` de uma versão já usada.
- [X] T006 [P] Criar `apps/api/test/integration/008-execution-route.spec.ts` (`008/FR-006`):
  - `POST /ai/executions` de um agente de referência com tarefa grava `task_key`,
    `model_config_id` (principal) e `fallback_model_config_id`; o evento
    `ai_execution.requested` traz `taskKey` e `fallbackModelConfigKey`;
  - cada chamada ao modelo grava `served_model`, `is_fallback = false` e `cost_source`;
  - custo informado pelo provedor tem precedência sobre o preço (`cost_source = 'PROVIDER'`),
    sem ele vale o preço (`'PRICE'`), sem nenhum fica nulo (`008/FR-017`).
- [X] T007 [P] Criar `apps/api/src/modules/ai/gateway/model-gateway.spec.ts` (ou estender o
  existente) com o caso de uma rota sem fallback: resultado com uma perna (`isFallback:
  false`, tentativas, duração, uso, `servedModel`) e, na falha, `AiFailure` com a perna; os
  valores efetivos são `min(tarefa, config, limite)` para tokens e tempo e os parâmetros da
  tarefa (contracts/gateway-routing.md).

### Implementation for Foundational

- [X] T008 Migração `apps/api/prisma/migrations/<timestamp>_008_ai_tasks_fallback/migration.sql`
  e `apps/api/prisma/schema.prisma` (data-model.md):
  - tabela `ai_tasks` (FKs `RESTRICT`, UNIQUE `key`, CHECK fallback ≠ principal, CHECKs de
    `max_output_tokens`/`timeout_ms` > 0);
  - `ai_agent_versions.task_id` (FK nula), `model_config_id` nulo, CHECK de exatamente um;
    atualizar a função da trigger de imutabilidade da 006 para cobrir `task_id`;
  - `ai_executions.task_key`, `fallback_model_config_id` (FK nula), `fallback_used` (padrão
    `false`);
  - `ai_model_calls.served_model`, `is_fallback` (padrão `false`), `cost_source` com CHECK
    (`PROVIDER`, `PRICE`) e CHECK `cost_source IS NULL = estimated_cost IS NULL`;
  - rodar `pnpm --filter api prisma generate`.
- [X] T009 Em `apps/api/src/modules/ai/definitions/types.ts`:
  - `TaskDefinition` e `defineTask`; `AiDefinitions.tasks`;
  - `AgentDefinition.taskKey` no lugar de `modelConfigKey`;
  - `ModelConfigDefinition` sem `fallbackKeys`;
  - `ModelUsage.cost: { amount: string; currency: string } | null`;
    `ModelResponse.servedModel: string | null`.
- [X] T010 Em `apps/api/src/modules/ai/registry/ai-definitions.check.ts`: todo `taskKey` de
  agente existe; chaves de configuração de uma tarefa existem; fallback ≠ principal;
  parâmetros da tarefa só da lista `temperature`, `top_p`, `effort`; nenhum modelo `openrouter/*`.
  Uma chave que falta nas definições é erro de código e para a inicialização, como já acontece
  com os agentes; um modelo inválido vindo do ambiente não chega aqui: a T030 deixa a tarefa
  indisponível sem derrubar a API (FR-008).
- [X] T011 Em `apps/api/src/modules/ai/registry/ai-registry.sync.ts`: sincronizar tarefas
  (hash, criação, atualização) entre as configurações e os agentes; gravar `task_id` nas novas
  versões de agente; contar tarefas no evento `ai_registry.synced` (acrescentar `tasks` à
  metadata em `audit-event-types.ts` e no contrato de auditoria da 006).
- [X] T012 Criar `apps/api/src/modules/ai/registry/ai-task.registry.ts` (`AiTaskRegistry`):
  resolve a rota de um agente (`byAgentVersion(id)` → tarefa, configuração principal e de
  fallback como `RegisteredModelConfig`) e registrar no `apps/api/src/modules/ai/ai.module.ts`.
- [X] T013 Em `apps/api/src/modules/ai/execution/ai-executions.service.ts`: ao pedir, resolver
  a rota pela T012 e gravar `task_key`, `model_config_id` e `fallback_model_config_id`;
  metadata nova em `ai_execution.requested`; `availability` "AVAILABLE" quando o principal
  **ou** o fallback estiver habilitado e com provedor registrado (o circuito entra na T048).
- [X] T014 Em `apps/api/src/modules/ai/gateway/model-gateway.ts`: `GatewayCall.route` e
  `GatewayCall.task` no lugar de `config`; valores efetivos da perna; `GatewayResult.legs` e
  `AiFailure.legs` (contracts/gateway-routing.md). Só o principal é usado nesta fase.
- [X] T015 Em `apps/api/src/modules/ai/execution/ai-execution.runner.ts`: reautorização com a
  rota (principal desabilitado ou sem provedor e fallback usável → segue; nenhum →
  `AI_MODEL_UNAVAILABLE`); gravar uma linha de `ai_model_calls` por perna, na mesma transação
  que incrementa `model_calls`; log `ai.model_call` por perna com `task`, `configKey`,
  `servedModel`, `fallback`.
- [X] T016 [P] Em `apps/api/src/modules/ai/usage/ai-usage.recorder.ts` e `usage/cost.ts`:
  `served_model`, `is_fallback`, custo do provedor com precedência e `cost_source`
  (research G17).
- [X] T017 [P] Em `apps/api/test/fixtures/ai/fake-model-provider.ts`: `scriptFor(model,
  ...steps)` (passos por modelo, antes de `scriptWhen` e `script`), `fakeServedModel(model,
  step)` e `fakeCost(amount, step)`; `servedModel` padrão = o modelo pedido. Atualizar os
  agentes de referência de `apps/api/test/fixtures/ai/` para declarar tarefas (uma por
  configuração que usavam) e `createAiTestApp` para aceitar `tasks`.
- [X] T018 Em `apps/api/src/modules/curriculum-ai/definitions/curriculum-agent.ts` e
  `apps/api/src/modules/ai/definitions/index.ts`:
  - tarefa `curriculum-extraction` (parâmetros `{ effort: "low" }`, 16 000 tokens, 60 s) com
    principal `openrouter-default` e fallback `openrouter-fallback` quando configurado;
  - `curriculum-agent` versão 2 com `taskKey`; instruções v1, schema v1, ferramentas,
    limites e proposta iguais;
  - `productionAiDefinitions(config)` monta as configurações `openrouter-*` (provedor
    `openrouter`, modelo das variáveis, tempo limite `OPENROUTER_TIMEOUT_MS`, sem preço) e
    ainda não registra provedor (T020).
- [X] T019 Ajustar `apps/api/test/helpers/curriculum-ai.ts` (`createCurriculumAiApp` roteia a
  tarefa `curriculum-extraction` para configurações do provedor simulado) e os testes da 007
  que fixam versão 1, `modelConfigKey` ou o provedor `anthropic`
  (`test/integration/007-us6-versioning.spec.ts`, `006-registry-sync.spec.ts` e outros que o
  `pnpm test` apontar), sem mudar asserções de comportamento.

**Checkpoint**: T005–T007 verdes; 006 e 007 verdes com o Curriculum Agent v2 roteado pela tarefa.

---

## Phase 3: User Story 1 — "Preencher com IA" continua igual, agora através do OpenRouter (Priority: P1) 🎯 MVP

**Goal**: o OpenRouter é o único provedor real; o Curriculum Agent chega a ele só pela tarefa.

**Independent Test**: a suíte da 007 (API, segurança e E2E com `openrouter-mock.ts`) passa sem
mudar asserções de comportamento.

### Tests for User Story 1 ⚠️

- [X] T020 [P] [US1] Criar `apps/api/src/modules/ai/gateway/providers/openrouter.provider.spec.ts`
  com `fetch` injetado (contracts/openrouter-provider.md):
  - corpo: `system`, primeira mensagem `user` com contexto e blocos não confiáveis, histórico
    com `tool_calls`/`tool`, `max_tokens`, parâmetros permitidos, `tools` strict,
    `response_format` só em `generateStructured`, `provider` com `data_collection: "deny"`,
    `zdr: true`, `require_parameters: true`, `usage.include`, `stream: false`, e nunca
    `models`/`route`/`user` (`008/US4-5`, `008/FR-004`);
  - resposta: `tool_calls` com argumentos JSON (e argumento inválido → `undefined`), `stop`,
    `length`/`content_filter`/`error` → texto vazio, uso, custo, `servedModel`; modelo servido
    diferente do pedido → `ProviderError("UNKNOWN")`;
  - erros: a tabela de status → categoria, erro dentro de corpo 200, erro de rede; a mensagem
    do erro nunca contém a chave, o corpo nem o pedido (`008/FR-005`);
  - `healthCheck`: 200 em `GET /key` → `UP`, outro → `DOWN`;
  - cabeçalhos: `Authorization`, `X-Title`, sem `HTTP-Referer`.
- [X] T021 [P] [US1] Criar `apps/api/test/integration/008-us1-curriculum-openrouter.spec.ts`:
  - `008/US1-1`: a análise conclui com a mesma proposta da 007 e a execução registra tarefa,
    provedor, modelo servido e versão das instruções;
  - `008/US1-3`: varredura de `apps/api/src/modules/curriculum-ai/**` sem nome de provedor,
    id de modelo, host, credencial nem `fetch`.
- [X] T022 [P] [US1] Atualizar `apps/api/test/security/006-ai-no-real-provider.spec.ts`: a
  produção registra só `openrouter`, e só com a chave (`OpenRouterProvider`); `openrouter` é a
  única chave de provedor real no código; o E2E usa chave fictícia e `OPENROUTER_BASE_URL`
  local; `config.schema.ts` só declara `OPENROUTER_*` como credencial; nenhuma app de teste
  registra o provedor `openrouter` (a instância direta do `OpenRouterProvider` nos testes
  unitários e na T037 não é um registro) (`008/US1-2`).
- [X] T023 [P] [US1] Atualizar `apps/api/test/security/006-ai-boundary.spec.ts`: o host
  `openrouter.ai` entra em `PROVIDER_HOSTS` e só aparece em `gateway/providers/**`; a API não
  depende de nenhum SDK de provedor (`allowed` vazio para `apps/api/package.json`);
  `@anthropic-ai/*` continua proibido pelo lint (`008/FR-024`).

### Implementation for User Story 1

- [X] T024 [US1] Criar `apps/api/src/modules/ai/gateway/providers/openrouter.provider.ts`
  (research G10–G14): `fetch` nativo com o `AbortSignal` do gateway, URL base padrão como
  constante do arquivo, `sanitizeJsonSchema` para ferramentas e saída, mapeamento de resposta e
  erros, `healthCheck`. Registrar em `productionAiDefinitions` só com `OPENROUTER_API_KEY`.
- [X] T025 [US1] Remover a Anthropic (research G15):
  - apagar `apps/api/src/modules/ai/gateway/providers/anthropic.provider.ts` e o seu spec;
  - tirar `ANTHROPIC_API_KEY`/`ANTHROPIC_BASE_URL` de `config.schema.ts`, de `test-app.ts` e
    de `apps/api/.env.example`; trocar `*.anthropic` por nada em `logging.module.ts`;
  - `pnpm --filter api remove @anthropic-ai/sdk`; manter `@anthropic-ai/*` na lista proibida
    de `apps/api/eslint.config.mjs`;
  - atualizar `DEPENDENCIES.md` (remoção e motivo).
- [X] T026 [US1] E2E: criar `apps/web/e2e/openrouter-mock.ts` (servidor local de
  `/chat/completions` e `/key` no formato OpenAI, com as respostas gravadas do caso POO e
  `MOCK_PRIMARY_DOWN=1` para responder 503 ao modelo principal); apagar
  `apps/web/e2e/anthropic-mock.ts`; trocar as variáveis em `apps/web/e2e/.env.e2e`,
  `apps/web/e2e/env.ts` e `apps/web/e2e/playwright.config.ts`; ajustar
  `apps/web/e2e/curriculum-ai.spec.ts` e `apps/web/e2e/ai-operations.spec.ts` só no que cita
  o provedor.
- [X] T027 [US1] Avaliação sob demanda (research G20): `apps/api/test/eval/curriculum-agent.eval.ts`
  e `apps/api/vitest.eval.config.ts` passam a usar `OPENROUTER_API_KEY` e
  `OpenRouterProvider` contra `OPENROUTER_DEFAULT_MODEL` (o fallback entra na T036); atualizar
  `apps/api/test/fixtures/curriculum-agent/README.md` (`008/US1-4`, `008/FR-022`).

**Checkpoint**: US1 completa; `pnpm --filter web test:e2e` verde com o mock do OpenRouter.

---

## Phase 4: User Story 2 — O modelo de cada tarefa é trocado por configuração, sem tocar no agente (Priority: P1)

**Goal**: modelo por variável de ambiente, histórico auditado, política inválida sem derrubar a API.

**Independent Test**: trocar o modelo principal e reiniciar: novas execuções usam o novo, as
antigas continuam com o anterior; configuração inválida deixa a tarefa indisponível.

### Tests for User Story 2 ⚠️

- [X] T028 [P] [US2] Criar `apps/api/test/integration/008-us2-model-by-config.spec.ts`:
  - `008/US2-1`: duas apps sobre o mesmo banco com `OPENROUTER_DEFAULT_MODEL` A e depois B (e o
    provedor simulado sob a chave `openrouter`): a execução nova usa B, a antiga continua com A
    em `ai_model_calls`; um evento `ai_model_config.changed` com `previousModel` A e `model` B;
    zero mudança no código do agente (`008/SC-002`);
  - `008/US2-2`: modelo inválido (formato, `openrouter/auto`, fallback igual ao principal) →
    a app inicia, a disponibilidade é `MODEL_UNAVAILABLE`, o log `ai.task_unavailable` traz o
    `reason` e nenhum segredo, o fluxo manual da 004 funciona;
  - `008/US2-3`: `POST /syllabus-documents/:id/ai-analyses` e `POST /ai/executions` com
    `model`, `provider` ou `task` no corpo → `400 VALIDATION_ERROR`.

### Implementation for User Story 2

- [X] T029 [US2] Em `ai-registry.sync.ts`: ao mudar o modelo de uma configuração existente,
  gravar `ai_model_config.changed` (`configKey`, `provider`, `previousModel`, `model`) na
  transação do sync; novo tipo em `audit-event-types.ts`, no contrato de auditoria da 006 e
  emitido em `test/helpers/journey.ts` (contracts/audit-events.md).
- [X] T030 [US2] Em `apps/api/src/modules/ai/definitions/index.ts`: validar os modelos das
  variáveis (`^[a-z0-9-]+/[a-z0-9._:-]+$`, sem `openrouter/`, fallback ≠ principal); quando
  inválido, não registrar a configuração (a tarefa fica indisponível) e logar
  `ai.task_unavailable` com `reason` (`MODEL_INVALID`, `FALLBACK_EQUALS_PRIMARY`,
  `PROVIDER_NOT_REGISTERED`) uma vez na inicialização, sem valor de segredo
  (contracts/configuration.md).

**Checkpoint**: US2 completa.

---

## Phase 5: User Story 3 — Uma falha recuperável do modelo principal cai no modelo de fallback, com limite (Priority: P1)

**Goal**: fallback só para falhas recuperáveis, uma vez, dentro do prazo, auditado.

**Independent Test**: com o provedor simulado falhando o principal em cada categoria, o
fallback é usado só quando permitido e o total de chamadas nunca passa do limite.

### Tests for User Story 3 ⚠️

- [X] T031 [P] [US3] Em `apps/api/src/modules/ai/gateway/model-gateway.spec.ts`, a matriz de
  contracts/gateway-routing.md (`008/FR-010`, `008/FR-011`, `008/SC-003`):
  - `UNAVAILABLE`, `RATE_LIMITED` e `TIMEOUT` da chamada esgotam as novas tentativas do
    principal e chamam o fallback uma vez, com as suas tentativas; duas pernas no resultado;
  - `INVALID_REQUEST`, `AUTH` e `UNKNOWN` → sem fallback;
  - cancelamento e prazo da execução → sem fallback; fallback só se couber no prazo restante;
  - principal e fallback falhando → `AiFailure` com o código do fallback e duas pernas, sem
    voltar ao principal;
  - rota sem fallback → comportamento da 006.
- [X] T032 [P] [US3] Criar `apps/api/test/integration/008-us3-fallback.spec.ts` com o
  Curriculum Agent e o provedor simulado por modelo (`scriptFor`):
  - `008/SC-004`: 20 análises (documentos diferentes, limite por professor alto na
    configuração do teste) com o principal fora do ar e o fallback saudável → pelo menos 19
    terminam com proposta (com o simulado, espera-se 20);
  - `008/US3-1`: principal indisponível e fallback válido → proposta; `ai_model_calls` com a
    perna do principal (falha) e a do fallback (`is_fallback`), `fallback_used`, evento
    `ai_execution.fallback_used` com `reason: "PROVIDER_FAILURE"`;
  - `008/US3-2`: requisição inválida, autenticação e saída fora do schema no principal → sem
    chamada ao fallback, código normalizado da 006;
  - `008/US3-3`: os dois falham com erro recuperável → falha controlada, chamadas ≤ limite;
  - `008/US3-4`: prazo quase esgotado → sem fallback, `TIMED_OUT`;
  - `008/US3-5`: tarefa sem fallback → comportamento da 006;
  - `008/US3-6`: cancelamento durante o principal → fallback não é chamado;
  - `008/FR-012`: a resposta do fallback passa pela validação de saída e pela fundamentação
    da 007 (saída sem apoio no documento vira aviso, como na 007);
  - edge case: principal desabilitado pelo administrador → a execução usa o fallback direto.
- [X] T033 [P] [US3] Criar `apps/api/test/security/008-fallback-concurrency.spec.ts`: várias
  execuções simultâneas com o principal fora do ar → cada uma com no máximo duas pernas por
  chamada lógica, um evento de fallback por execução, nenhum laço (`008/SC-003`).

### Implementation for User Story 3

- [X] T034 [US3] Em `model-gateway.ts`: fallback depois do principal (research G6):
  categorias transitórias após as tentativas, mesmo prazo e sinal, nunca de volta ao
  principal; pernas com `isFallback`.
- [X] T035 [US3] Em `ai-execution.runner.ts`: gravar a perna do fallback com `is_fallback`,
  marcar `fallback_used` e registrar `ai_execution.fallback_used` (`primaryConfigKey`,
  `fallbackConfigKey`, `reason`, `primaryErrorCode`) na mesma transação; novo tipo em
  `audit-event-types.ts`, no contrato de auditoria da 006 e na `journey.ts`.
- [X] T036 [US3] Avaliação do fallback (research G20): `curriculum-agent.eval.ts` roda o
  conjunto de referência também contra `OPENROUTER_FALLBACK_MODEL` quando definido, como único
  modelo da rota, com os mesmos limiares (`008/SC-009`).

**Checkpoint**: US3 completa.

---

## Phase 6: User Story 4 — Credencial e conteúdo protegidos; OpenRouter fora do ar não derruba a API (Priority: P1)

**Goal**: chave só no servidor, nunca em registro nenhum; indisponibilidade contida.

**Independent Test**: varredura de segredos com a chave marcadora; API sem chave; OpenRouter
fora do ar durante uma análise.

### Tests for User Story 4 ⚠️

- [X] T037 [P] [US4] Chave marcadora `sk-or-teste-008-CHAVE-FALSA` em duas frentes, sem
  registrar o provedor `openrouter` em nenhuma app de teste (T022) (`008/US4-1`,
  `008/SC-005`):
  - em `apps/api/test/security/secret-leak-scan.spec.ts` e `apps/api/test/helpers/journey.ts`,
    a app da jornada recebe `ai.openrouter.apiKey` com a chave marcadora na configuração
    (as definições continuam as do provedor simulado); a chave não aparece em logs,
    auditoria, execuções, chamadas, respostas (inclusive as operacionais e de erro) nem em
    nenhuma tabela;
  - em `apps/api/test/security/008-openrouter-secret.spec.ts`, o `OpenRouterProvider` é
    instanciado direto (fora de qualquer app) com a chave marcadora e um `fetch` local que
    responde sucesso, 401, 429, 503, erro de rede e demora além do sinal; nenhum erro
    lançado, `String(error)`, `JSON.stringify(error)` nem saída capturada do processo
    contém a chave.
- [X] T038 [P] [US4] Criar `apps/api/test/integration/008-us4-resilience.spec.ts`:
  - `008/US4-2`: app sem `OPENROUTER_API_KEY` → inicia, "Preencher com IA" indisponível,
    preenchimento manual da 004 funciona;
  - `008/US4-3`, `008/SC-006`: provedor simulado sem responder (atraso maior que o prazo) →
    análise termina com erro controlado dentro do prazo, e rotas sem IA (`/health`, `/me`,
    lista de disciplinas) respondem normalmente durante a chamada.
- [X] T039 [P] [US4] Em `apps/api/test/security/006-ai-boundary.spec.ts`, `008/US4-4`: o web
  não tem host, chave nem chamada ao OpenRouter (varredura de `apps/web/**`, fora do mock do
  E2E) e o `.next` de produção não recebe variável `OPENROUTER_*`.

### Implementation for User Story 4

- [X] T040 [US4] Corrigir o que T037–T039 apontarem (redação, mensagens, variáveis do web); se
  nada falhar, registrar no PR que a US4 é garantida pelas T001–T027.
  Resultado (2026-09-26): nada falhou; a US4 é garantida pelas T001–T027 (provedor sem a chave
  em erro nem serialização, redação `*.openrouter`, chave só no servidor). Citar no PR.

**Checkpoint**: US4 completa.

---

## Phase 7: User Story 5 — O administrador vê tarefa, modelo servido, fallbacks e custo de cada execução (Priority: P2)

**Goal**: "Operação de IA" com tarefa, fallbacks e contadores por modelo; logs por perna.

**Independent Test**: execuções com e sem fallback e com falha produzem as métricas certas,
sem conteúdo nem identificadores.

### Tests for User Story 5 ⚠️

- [X] T041 [P] [US5] Criar `apps/api/test/integration/008-us5-observability.spec.ts`:
  - `008/US5-1`: `GET /ai/operations/metrics` traz, por agente, `taskKey` e `fallbacks`, e por
    modelo `calls`, tokens, `failedCalls`, `fallbackCalls`, `avgDurationMs` e custo, com o
    modelo servido;
  - `008/US5-2`, `008/SC-008`: o registro de cada execução tem agente, tarefa, provedor,
    modelo pedido e servido, versão das instruções, situação, tokens, latência, custo,
    fallback, código de erro, usuário e data;
  - `008/US5-3`: logs `ai.model_call` estruturados com `correlationId`, `task`, `servedModel`,
    `fallback` e sem conteúdo (usar `LogCapture`).
- [X] T042 [P] [US5] Estender a varredura administrativa da 006
  (`apps/api/test/security/006-ai-admin-scan.spec.ts`) às respostas novas:
  sem conteúdo, credencial, id de professor nem de execução (`008/FR-020`).
- [X] T043 [P] [US5] Em `apps/web/features/ai-operations/components/ai-operations-page.test.tsx`:
  as tabelas mostram tarefa, principal e fallback do agente, fallbacks por agente e falhas,
  fallbacks e duração média por modelo; axe e ordem de Tab (`008/US5-1`).

### Implementation for User Story 5

- [X] T044 [US5] Em `packages/contracts/src/ai/operations.ts` (contracts/http-api.md):
  `AiAgentMetricsSchema` + `taskKey`, `fallbacks`; `AiModelUsageSchema` + `failedCalls`,
  `fallbackCalls`, `avgDurationMs`; `AiAgentOperationsViewSchema` troca `modelConfigKey` por
  `taskKey`, `primaryModelConfigKey`, `fallbackModelConfigKey`.
- [X] T045 [US5] Em `apps/api/src/modules/ai/operations/ai-metrics.query.ts` e
  `ai-operations.service.ts`: as agregações novas (modelo servido quando houver) e a visão do
  agente com a rota.
- [X] T046 [US5] Em `apps/web/features/ai-operations/components/ai-agents-table.tsx`,
  `ai-metrics-table.tsx` e `ai-usage-table.tsx`: as colunas novas com componentes do design
  system; textos em português; estados sem depender só de cor.

**Checkpoint**: US5 completa.

---

## Phase 8: User Story 6 — Consumo protegido: circuito aberto e limite por agente (Priority: P2)

**Goal**: circuito por configuração de modelo e limite global por agente.

**Independent Test**: falhas seguidas abrem o circuito, o modelo não é chamado enquanto
aberto, a chamada de teste fecha; o limite global barra o professor seguinte.

### Tests for User Story 6 ⚠️

- [X] T047 [P] [US6] Criar `apps/api/src/modules/ai/gateway/circuit-breaker.spec.ts` com relógio
  injetado: abre no limite de falhas recuperáveis seguidas; sucesso zera; falha não
  recuperável não conta; aberto recusa até vencer; vencido, só o primeiro recebe `PROBE`;
  sucesso fecha, falha reabre (`008/FR-013`).
- [X] T048 [P] [US6] Criar `apps/api/test/integration/008-us6-circuit.spec.ts`:
  - `008/US6-1`, `008/SC-007`: cinco análises com o principal fora do ar abrem o circuito
    (`ai_circuit.opened` uma vez); a sexta vai direto ao fallback sem chamar o principal
    (`reason: "CIRCUIT_OPEN"`) e, sem fallback, falha `AI_MODEL_UNAVAILABLE` sem chamada;
  - `008/US6-2`: vencida a espera, uma chamada de teste; sucesso fecha (`ai_circuit.closed`),
    falha reabre;
  - `GET /ai/operations/health` mostra `circuit` de cada configuração; a disponibilidade da
    007 considera o circuito;
  - edge case: fallback também com circuito aberto → `AI_MODEL_UNAVAILABLE` sem chamada.
- [X] T049 [P] [US6] Criar `apps/api/test/integration/008-us6-agent-limit.spec.ts`:
  - `008/US6-3`: com `AI_AGENT_EXECUTIONS_PER_HOUR` baixo, professores diferentes esgotam o
    limite; o seguinte recebe `429 RATE_LIMITED` com `Retry-After`, nenhuma execução é criada
    e `ai_execution.rate_limited` tem `scope: "agent"`;
  - `008/US6-4`: pedidos repetidos e simultâneos do mesmo professor para o mesmo documento
    geram uma execução e contam uma vez.

### Implementation for User Story 6

- [X] T050 [US6] Criar `apps/api/src/modules/ai/gateway/circuit-breaker.ts` (research G8) com os
  limites de `ai.circuit`; auditar `ai_circuit.opened`/`ai_circuit.closed` em transação própria
  (ator SYSTEM, uma vez por transição); novos tipos em `audit-event-types.ts`, no contrato de
  auditoria da 006 e na `journey.ts`; registrar no `ai.module.ts`.
- [X] T051 [US6] Em `model-gateway.ts`: perguntar ao circuito antes de cada perna (`OPEN` → perna
  `SKIPPED_OPEN_CIRCUIT` e fallback direto), reportar o resultado final de cada perna; em
  `ai-executions.service.ts`, a disponibilidade considera o circuito.
- [X] T052 [US6] Em `packages/contracts/src/ai/operations.ts` (`AiCircuitStateSchema` e
  `circuit` em `AiHealthSchema.modelConfigs[]`), em `ai-operations.service.ts` e em
  `apps/web/features/ai-operations/components/ai-health-table.tsx` (coluna "Circuito" com texto
  e ícone, não só cor) e no seu teste.
- [X] T053 [US6] Em `ai-executions.service.ts`: limite global por agente com
  `RateLimitService.hit("ai-agent", agentKey, …)` depois dos limites por usuário e depois de
  responder a um pedido repetido; `429` com `Retry-After` e `ai_execution.rate_limited`
  (`scope: "agent"`) (research G9).

**Checkpoint**: US6 completa.

---

## Phase 9: User Story 7 — Um novo agente reaproveita o gateway sem implementar infraestrutura (Priority: P3)

**Goal**: provar que um agente só declara tarefa, instruções, schema e ferramentas.

**Independent Test**: um agente de referência com tarefa própria recebe fallback, circuito, uso
e auditoria sem código de infraestrutura.

### Tests for User Story 7 ⚠️

- [X] T054 [P] [US7] Criar `apps/api/test/integration/008-us7-reuse.spec.ts`:
  - `008/US7-1`, `008/SC-010`: agente de referência `reference-routed` (em
    `apps/api/test/fixtures/ai/`) com tarefa própria e fallback, principal falhando → usa o
    fallback, registra uso e auditoria, respeita limite do agente e circuito; o arquivo do
    agente não importa nada de `gateway/`, `usage/` nem `fetch`;
  - `008/US7-2`: todas as definições registradas nos testes usam provedores `fake*`.

### Implementation for User Story 7

- [X] T055 [US7] Criar o agente de referência `reference-routed` e a sua tarefa em
  `apps/api/test/fixtures/ai/` e documentar em `specs/006-ai-foundation/contracts/agent-runtime.md`
  (seção "Tarefas e fallback", apontando para `specs/008-ai-gateway-openrouter/contracts/gateway-routing.md`)
  como um novo agente declara a tarefa.

**Checkpoint**: todas as histórias completas.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T056 [P] `apps/api/CLAUDE.md`: provedor simulado por modelo (`scriptFor`,
  `fakeServedModel`, `fakeCost`), tarefas nos agentes de referência, circuito e limite por
  agente nos testes, `OPENROUTER_API_KEY` na avaliação.
- [X] T057 [P] `CLAUDE.md` da raiz: estado do projeto (008 implementada), comandos
  (`OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum`), arquitetura do módulo `ai`
  (tarefas, fallback, circuito, provedor OpenRouter) e guardas (fronteira, sem provedor real,
  varredura com a chave marcadora da 008, suíte `008-*`); tirar menções à Anthropic como
  provedor.
- [X] T058 [P] `README.md`: fase 008, variáveis `OPENROUTER_*`, `AI_CIRCUIT_*`,
  `AI_AGENT_EXECUTIONS_PER_HOUR`, comando de avaliação; tirar `ANTHROPIC_*`.
- [X] T059 [P] `DEPENDENCIES.md`: conferir a remoção do `@anthropic-ai/sdk` e que o lockfile não
  o contém mais (`pnpm install --frozen-lockfile`).
- [X] T060 Rodar o `quickstart.md` §1 inteiro e corrigir divergências entre ele e o código.
- [X] T061 [P] Revisar `apps/api/.env.example` e `apps/web/e2e/.env.e2e` contra
  contracts/configuration.md.
- [X] T062 Acrescentar a 008 ao `SPECS` de `apps/api/test/traceability.spec.ts`:
  `path: "specs/008-ai-gateway-openrouter/spec.md"`, `stories: 7`, `scenarios: 27`,
  `rows: 0` (a tabela "Rastreabilidade dos critérios de aceite do pedido" é informativa e
  fica fora de `### Acceptance Criteria Traceability`, como na 007), `rowsWithoutIds: []`,
  `successCriteria` com SC-001–SC-008 e SC-010 (SC-009 é a avaliação sob demanda, fora do
  CI, com comentário explicando). Cobrir os ids que faltarem nos títulos dos testes.
- [X] T063 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.
  Resultado (2026-09-26): tudo verde, E2E com 17 testes. O E2E revelou que a API compilada não
  subia: com `rewriteRelativeImportExtensions` (007) o gerador do Prisma escrevia imports `.ts`,
  que o swc mantém; corrigido com `importFileExtension = "js"` no `generator` do `schema.prisma`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende da Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational. É o MVP.
- **US2 (Phase 4)**: depende da Foundational (e da T024 para o provedor `openrouter` nas
  configurações; nos testes usa o simulado sob essa chave).
- **US3 (Phase 5)**: depende da Foundational; T036 depende da T027.
- **US4 (Phase 6)**: depende da US1 (provedor real para a varredura).
- **US5 (Phase 7)**: depende da US3 (fallbacks nas métricas).
- **US6 (Phase 8)**: depende da US3 (circuito leva ao fallback); T052 depende da T044.
- **US7 (Phase 9)**: depende da US3 e da US6.
- **Polish (Phase 10)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `model-gateway.ts` é tocado por T014, T034 e T051, e `ai-executions.service.ts` por T013,
  T051 e T053: essas tarefas são sequenciais.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.

### Parallel Opportunities

- Setup: T002–T004 em paralelo depois da T001.
- Foundational: T005–T007 em paralelo; T016 e T017 em paralelo depois da T009.
- US1: T020–T023 em paralelo; T026 e T027 em paralelo depois da T024.
- US3: T031–T033 em paralelo.
- US4: T037–T039 em paralelo.
- US5: T041–T043 em paralelo.
- US6: T047–T049 em paralelo.
- Polish: T056–T059 e T061 em paralelo.

---

## Parallel Example: User Story 1

```text
T020 openrouter.provider.spec.ts
T021 008-us1-curriculum-openrouter.spec.ts
T022 006-ai-no-real-provider.spec.ts
T023 006-ai-boundary.spec.ts
```

## Parallel Example: User Story 3

```text
T031 model-gateway.spec.ts (matriz de fallback)
T032 008-us3-fallback.spec.ts
T033 008-fallback-concurrency.spec.ts
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup e Foundational.
2. US1: OpenRouter no lugar da Anthropic, suíte da 007 verde, E2E com o mock.
3. Parar e validar: "Preencher com IA" funciona como antes, agora pelo OpenRouter.

### Incremental Delivery

1. MVP (US1) → US2 (troca de modelo) → US3 (fallback) → US4 (garantias de segredo e
   resiliência): P1 completo.
2. US5 (observabilidade) e US6 (circuito e limite por agente).
3. US7 (reuso) e Polish.

---

## Notes

- Nada de SDK de provedor: o OpenRouter é chamado com `fetch` nativo só em
  `gateway/providers/openrouter.provider.ts`.
- O Curriculum Agent não muda regras: só a versão (2) e a tarefa.
- O estado do circuito é por instância e não é persistido; o limite por agente vale entre
  instâncias (tabela de limites da 001).
- Commit ao fim de cada fase (ou grupo lógico), só quando pedido.
