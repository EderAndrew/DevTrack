---

description: "Task list for 010 — Banco de Exercícios: criação manual e geração com IA revisada pelo professor"
---

# Tasks: 010 — Banco de Exercícios

**Input**: Design documents from `/specs/010-exercise-bank/`
**Prerequisites**: plan.md, spec.md, research.md (X1–X20), data-model.md, contracts/
(http-api, exercise-generator, audit-events, permissions, configuration, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; spec §31 do pedido e SC-001–SC-012).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 010 com prefixo (`010/US2-4`, `010/FR-029`,
  `010/SC-006`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`010/US1-1`…`010/US1-6`), cada cenário ganha o seu `it`. A traceability passa a procurá-los na
  fase final (T060).
- Nenhum teste chama modelo real: provedor simulado da 006 (`t.provider.script…`) e, no E2E, o
  `apps/web/e2e/openrouter-mock.ts`. Filtros de teste sem `--` (`pnpm --filter api test <arquivo>`).
- As suítes 001–009 continuam verdes em toda fase; cada fase termina com
  `pnpm lint && pnpm check-types && pnpm test` verde.
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `specs/010-exercise-bank/contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige entrada em `packages/contracts/src/endpoints.ts`, linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` e em `route-declarations.spec.ts`.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.

**Organization**: por user story, na ordem das dependências reais.
- A Foundational entrega a migração, as permissões, os contratos comuns, as regras puras e o
  registro de tipos. Toda história precisa disso.
- US1 (criação manual), US6 (visão do aluno), US2 (pedido à IA), US3 (validação da resposta) e
  US4 (revisão) são P1; US1 é o MVP (banco sem IA).
- US7 (linguagem da ementa) é P2 mas **precede a US2** no código de exercícios (a linguagem do
  lote vem da ementa); a parte do "Preencher com IA" (Curriculum Agent v3) fica na mesma fase.
- US5 (consulta e manutenção) é P2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história da tarefa (US1…US7)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: vocabulário, configuração e contratos que todas as histórias usam.

- [X] T001 Criar `packages/contracts/src/exercises/enums.ts` com `ExerciseTypeSchema`,
  `ExerciseDifficultySchema`, `CognitiveObjectiveSchema`, `ExerciseOriginSchema`,
  `ExerciseStatusSchema`, `ExerciseBatchStatusSchema` e exportá-los em
  `packages/contracts/src/index.ts`; teste em `packages/contracts/test/exercises.spec.ts`
  (valores exatos; nenhum valor comum com `AiModelTierSchema` é tratado como o mesmo tipo —
  `010/FR-007`).
- [X] T002 [P] Acrescentar `RATE_LIMIT_EXERCISE_AI_PER_HOUR` (padrão 10, int ≥ 1) em
  `apps/api/src/platform/config/config.schema.ts` (`rateLimit.exerciseAiPerHour`) e
  `apps/api/.env.example` (o `.env.test.example` não lista limites; vale o padrão); teste em
  `apps/api/test/integration/platform.spec.ts`, onde ficam os testes da configuração.
- [X] T003 [P] Acrescentar os códigos de erro `EXERCISE_VERSION_CONFLICT` (409),
  `SUBJECT_ARCHIVED` (409) e `SYLLABUS_LANGUAGE_REQUIRED` (422) em
  `packages/contracts/src/common/errors.ts`, `apps/api/src/platform/http/errors.ts`,
  `apps/web/lib/messages/error-messages.ts`, com o teste do catálogo de mensagens
  (`apps/web/lib/messages/error-messages.test.ts`, contagem de códigos).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, permissões, regras puras e registro de tipos; sem rota ainda.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [ ] T004 Migração `apps/api/prisma/migrations/<ts>_exercise_bank/migration.sql` e
  `apps/api/prisma/schema.prisma` conforme `data-model.md`: enums; `programming_languages` com a
  carga das 13 entradas (key, name, aliases); `syllabus_revisions.language_id`; `exercises`
  (CHECKs por tipo, `origin` imutável por trigger, índices); `exercise_alternatives` (UNIQUE
  posição, índice parcial de uma correta, trigger `DEFERRABLE INITIALLY DEFERRED` de 3–5
  alternativas, exatamente uma correta e textos distintos); `exercise_generation_batches`
  (CHECKs de quantidade, soma, pegadinhas, linguagem; UNIQUE (teacher, idempotency_key) e
  `ai_execution_id`); permissões `questoes.visualizar/criar/editar/aprovar` e
  `ia.exercicios.gerar` concedidas a TEACHER; atualizar a lista de modelos de
  `apps/api/test/security/domain-boundary.spec.ts` e `data-model.md` se necessário.
- [ ] T005 [P] Teste do banco em `apps/api/test/integration/010-schema.spec.ts`: as CHECKs e o
  trigger recusam, por SQL direto, Múltipla escolha com 2 e 6 alternativas, com 0 e 2 corretas,
  código sem linguagem, AI_GENERATED sem lote/tópico, mudança de `origin`, lote com soma
  diferente do total e pegadinhas acima da Múltipla escolha (`010/FR-004`, `010/FR-009`,
  `010/FR-016`).
- [ ] T006 [P] Atualizar `apps/api/test/security/authorization-matrix.ts` (`ROLE_PERMISSIONS`
  de TEACHER com as 5 permissões novas) e `us7-matrix-completeness.spec.ts` se preciso.
- [ ] T007 [P] Contratos em `packages/contracts/src/exercises/exercises.ts`:
  `ExerciseInputSchema` (união discriminada por tipo com as refinações: 3–5 alternativas,
  textos distintos, exatamente uma correta, campos por tipo), `ExerciseSetRequestSchema` (3–10),
  `ExerciseTeacherViewSchema`, `ExerciseStudentViewSchema` (estrito, lista fechada),
  `ExerciseListQuerySchema` e página por cursor; `programming-languages.ts`
  (`ProgrammingLanguageViewSchema`); testes de fronteira em
  `packages/contracts/test/exercises.spec.ts` com os casos do spec §31 (2/3/5/6 alternativas;
  0/1/2 corretas; 2/3/10/11 exercícios — `010/SC-003`).
- [ ] T008 [P] `packages/contracts/src/exercises/distribution.ts`: `distributeExercises(total,
  types)` (research X6) e `ExerciseBatchRequestSchema` (tópico por ids, dificuldade, total 3–10,
  tipos 1–3 distintos, distribuição AUTO/MANUAL com soma = total e cada tipo ≥ 1, pegadinhas
  0–3 e ≤ Múltipla escolha, sem linguagem, `idempotencyKey`, `regeneratedFromId?`); testes: 10
  em 3 tipos → 4/3/3, 5 em 2 → 3/2, determinístico; 5 MC + 3 pegadinhas aceito, 2 MC + 3 e 4
  pegadinhas recusados, pegadinha sem MC recusada (`010/FR-019`, `010/FR-020`).
- [ ] T009 Registro de tipos em `apps/api/src/modules/exercises/types/{open-answer,
  multiple-choice,code,index}.ts` (research X3): regras puras, mapeamento para linhas e
  alternativas, visão do professor e visão do aluno por lista de campos permitidos
  (`views/{teacher-view,student-view}.ts`); `rules/exercise-rules.ts` reaproveitando as
  refinações do contrato; testes unitários em `apps/api/src/modules/exercises/types/*.spec.ts`.
- [ ] T010 Máquina de estados `apps/api/src/modules/exercises/exercise.state-machine.ts`
  (DRAFT→APPROVED, DRAFT→ARCHIVED, APPROVED→ARCHIVED, ARCHIVED→anterior; resto →
  `INVALID_STATE_TRANSITION`) com teste unitário (`010/FR-010`).
- [ ] T011 Módulo `apps/api/src/modules/exercises/exercises.module.ts` registrado em
  `AppModule`; fábricas de teste em `apps/api/test/helpers/exercises.ts`
  (`createExercise`, `createConfirmedTopic` com disciplina, documento, revisão confirmada,
  grupo e item, `languageId`).

**Checkpoint**: migração aplicada, regras e contratos testados; nenhuma rota nova.

---

## Phase 3: User Story 1 — Criar exercícios manualmente (Priority: P1) 🎯 MVP

**Goal**: conjuntos de 3–10 e exercícios avulsos, sem IA.

**Independent Test**: um conjunto com um exercício de cada tipo entra no banco com origem
MANUAL e nenhuma execução de IA existe.

### Tests for User Story 1 ⚠️

- [ ] T012 [P] [US1] `apps/api/test/integration/010-us1-manual.spec.ts`: conjunto de 3 e de 10
  aceitos, de 2 e 11 recusados sem gravar nada; Múltipla escolha 2/6 alternativas e 0/2
  corretas recusam o conjunto inteiro, com a indicação do exercício; código sem linguagem ou com
  linguagem inativa recusado; tópico de outro professor ou de revisão em rascunho → 404/422;
  salvar como DRAFT ou APPROVED; exercício avulso aceito (US5-6 também); zero linhas em
  `ai_executions` e `ai_model_calls` depois de tudo; auditoria `exercise.created` por exercício
  (`010/US1-1`…`010/US1-6`, `010/SC-001`).
- [ ] T013 [P] [US1] Linhas do `MATRIX` e de `route-declarations.spec.ts` para
  `POST /exercises/sets`, `POST /exercises`, `GET /exercises/:id`, `GET /programming-languages`.

### Implementation for User Story 1

- [ ] T014 [US1] `apps/api/src/modules/exercises/exercises.service.ts`: `createSet` e
  `createOne` numa transação (resolução do tópico por consulta escopada ao professor,
  linguagem ativa, linhas + alternativas, `statement_search_key`), auditoria
  `exercise.created` (tipo novo + contrato + jornada); `programming-languages.service.ts`.
- [ ] T015 [US1] Rotas em `exercises.controller.ts` e `programming-languages.controller.ts`,
  entradas em `packages/contracts/src/endpoints.ts`.
- [ ] T016 [P] [US1] Web: `apps/web/features/exercises/{api,hooks}` e a página
  `/exercicios/novo` (React Hook Form com `useFieldArray` de 3–10 cartões, campos por tipo,
  alternativas com uma correta, tópico opcional por Disciplina → Ementa → Tópico, linguagem do
  catálogo; ao ligar um cartão de código a um tópico, a linguagem da ementa vem pré-selecionada
  e o professor pode trocá-la; pegadinha marcável na Múltipla escolha) e `/exercicios/novo/avulso`, em `apps/web/app/(app)/exercicios/…` e
  `apps/web/features/exercises/components/*`; item de menu "Banco de Exercícios"
  (`questoes.visualizar`).
- [ ] T017 [P] [US1] Testes web em `apps/web/features/exercises/components/*.test.tsx`: erros
  por campo ligados (`expectFieldErrorLinked`), limites 3/10 no formulário, linguagem sugerida pela ementa e troca
  manual (`010/FR-040`), axe, ordem de Tab (padrão de teclado `SC-012` da 001).

**Checkpoint**: banco manual funcionando (MVP).

---

## Phase 4: User Story 6 — A visão do aluno nunca contém a resposta (Priority: P1)

**Goal**: visão de aluno montada no servidor por lista de campos permitidos.

**Independent Test**: para cada tipo, a visão serializada não contém nenhum marcador de
resposta, correta, solução ou explicação.

- [ ] T018 [P] [US6] `apps/api/test/security/010-student-view.spec.ts`: exercícios com
  marcadores (`MARCADOR-RESPOSTA-010`, `MARCADOR-SOLUCAO-010`, `MARCADOR-EXPLICACAO-010`) nos
  campos sensíveis; a visão de aluno de cada tipo passa em `ExerciseStudentViewSchema` estrito e
  o JSON não contém nenhum marcador nem as chaves `isCorrect`, `expectedAnswer`,
  `expectedSolution`, `explanation`, `isTrickQuestion`, `origin`; acrescentar um campo novo ao
  exercício não o faz aparecer (projeção por lista) (`010/US6-1`…`010/US6-5`, `010/SC-006`).
- [ ] T019 [US6] Ajustar `views/student-view.ts` e o contrato até o teste passar; documentar em
  `apps/api/CLAUDE.md` que rotas futuras de aluno usam só essa visão.

---

## Phase 5: User Story 7 — A ementa declara a linguagem (Priority: P2, pré-requisito da US2)

**Goal**: linguagem na revisão da ementa; o "Preencher com IA" a propõe.

**Independent Test**: definir Java numa revisão, confirmá-la; propor linguagem pelo agente v3.

### Tests for User Story 7 ⚠️

- [ ] T020 [P] [US7] `apps/api/test/integration/010-us7-syllabus-language.spec.ts`: salvar a
  revisão em rascunho com `languageId`; valor desconhecido ou inativo → 422; revisão confirmada
  imutável; revisões antigas sem linguagem continuam válidas; `GET /programming-languages` em
  ordem alfabética com as 13 entradas (`010/US7-1`…`010/US7-5`, `010/FR-038`, `010/FR-039`).
- [ ] T021 [P] [US7] `apps/api/test/integration/010-us7-curriculum-language.spec.ts` com o
  agente v3 e o provedor simulado: documento que descreve Java → proposta com `language` Java;
  documento sem linguagem ou com uma fora do catálogo → `null`; linguagem proposta ausente do
  texto → sinalizada `UNSUPPORTED_CONTENT`; aceitar o campo na aplicação grava `language_id` no
  rascunho (`010/US7-6`…`010/US7-8`, `010/FR-041`).

### Implementation for User Story 7

- [ ] T022 [US7] 004: `SaveSyllabusRevisionRequestSchema` e `SyllabusRevisionViewSchema` com a
  linguagem (`packages/contracts/src/curriculum/*`), serviço de revisão
  (`apps/api/src/modules/syllabus/…`) validando linguagem ativa; auditoria do save com
  `languageId` na lista de campos.
- [ ] T023 [US7] Curriculum Agent v3 (`apps/api/src/modules/curriculum-ai/…`): a ferramenta de
  leitura devolve o catálogo ativo; esquema de saída v2 com `languageKey`; prompt v2; `build`
  mantém só chave do catálogo e marca sem apoio pelo nome/aliases no texto (research X18);
  contrato da proposta e do apply (`"language"` aceito); `CURRICULUM_AGENT` versão 3.
- [ ] T024 [US7] Conjunto de referência da 007: `languageKey` esperado em cada
  `test/fixtures/curriculum-agent/golden/*/expected.json`, métrica `languageMatch` no scorer,
  `recorded.json` ajustados para a saída v2; `007-us6-evaluation.spec.ts` verde (`010/SC-012`).
- [ ] T025 [P] [US7] Web: select "Linguagem" na revisão da ementa
  (`apps/web/features/syllabus/…`) e campo "Linguagem" aceitável na página da proposta
  (`apps/web/features/curriculum-ai/…`), com aviso de conteúdo sem apoio; testes com axe.
- [ ] T026 [US7] **Etapa de liberação da 007 v3 (custo de centavos; autorizada)**:
  `EVAL_MODEL=openai-basic EVAL_RECORD=1 pnpm --filter api eval:curriculum`; atualizar a
  aprovação do catálogo e a evidência; se o crédito faltar, registrar e seguir (a análise fica
  indisponível até a nova evidência).

---

## Phase 6: User Story 2 — Pedir exercícios à IA a partir de um tópico (Priority: P1)

**Goal**: lote registrado, execução pela infraestrutura existente, rascunhos materializados.

**Independent Test**: 10 exercícios mistos para um tópico → lote GENERATED com a distribuição
pedida, todos DRAFT e AI_GENERATED.

### Tests for User Story 2 ⚠️

- [ ] T027 [P] [US2] `apps/api/test/integration/010-us2-generation.spec.ts` (provedor simulado
  com uma resposta válida de fixture): pedido válido → 202, lote PENDING, execução com recurso
  `EXERCISE_GENERATION_BATCH`, depois do worker GENERATED com 10 DRAFT AI_GENERATED ligados ao
  tópico e com a linguagem da ementa; sem tópico, tópico inexistente, de outra revisão, de outro
  professor → recusado sem chamada (404, sem revelar); revisão em rascunho → 422; disciplina
  arquivada → 409; código sem linguagem na ementa → 422 `SYLLABUS_LANGUAGE_REQUIRED`; campos
  `model`/`tier`/`task`/texto livre → 400; distribuição AUTO 4/3/3 registrada; pegadinhas
  inválidas → 400; mesma chave → mesmo lote, outra configuração com a mesma chave → 409; limite
  por hora → 429; indisponível → 503 e o manual continua (`010/US2-1`…`010/US2-8`,
  `010/FR-017`…`010/FR-025`).
- [ ] T028 [P] [US2] `apps/api/test/security/010-no-model-choice.spec.ts`: varredura de
  `src/modules/exercise-ai` e `src/modules/exercises` sem referência a `AiModelTier`,
  `routeFor`, `MODEL_CATALOG`, famílias, `openrouter` ou chaves do catálogo; a escolha de modelo
  é a mesma para BASIC, INTERMEDIATE e ADVANCED (`010/FR-007`, `010/SC-009`).
- [ ] T028a [P] [US2] `apps/api/test/security/010-tool-scope.spec.ts`: a ferramenta
  `read-exercise-generation-request` devolve só o item, o grupo, o título, a competência e a
  linguagem da revisão do lote da própria execução e a configuração do pedido; recusa o lote de
  outra execução ou de outro professor (`AI_CONTEXT_ACCESS_DENIED`); a requisição ao modelo não
  contém nome da disciplina, outras ementas, ids de usuário, dados de turma ou de aluno
  (`010/FR-026`).
- [ ] T029 [P] [US2] Linhas do `MATRIX`/`route-declarations` para `POST /exercise-batches`,
  `GET /exercise-batches`, `GET /exercise-batches/:id`, `GET /exercise-generation/availability`.

### Implementation for User Story 2

- [ ] T030 [US2] Gancho genérico `proposal.materialize(tx, context)` em
  `apps/api/src/modules/ai/definitions/types.ts` e chamada em
  `apps/api/src/modules/ai/execution/ai-execution.runner.ts` na transação que cria a proposta
  (erro → rollback e FAILED); teste unitário/integração com um agente de referência em
  `apps/api/test/fixtures/ai/` (`010/FR-032`).
- [ ] T031 [US2] `apps/api/src/modules/exercise-ai/definitions/`: tarefa `exercise-generation`
  (research X7), agente `exercise-generator` v1 (DISABLED), prompt v1, esquema de saída
  `GeneratedExerciseBatchSchema` (contratos em `packages/contracts/src/exercises/exercise-ai.ts`),
  ferramenta `read-exercise-generation-request` e ownership `EXERCISE_GENERATION_BATCH`;
  registrados em `productionAiDefinitions`.
- [ ] T032 [US2] `exercise-batches.service.ts`: validação do tópico (research X9), linguagem da
  revisão, distribuição, gravação do lote e pedido da execução na mesma transação
  (`AiExecutionsService.request` com `onCreated`), limite por hora, idempotência, regeneração;
  auditoria `exercise_batch.requested`; status derivado (research X13); rotas e contratos
  (`exercise-batches.ts`, `endpoints.ts`).
- [ ] T033 [US2] `generation/build-proposal.ts` (conteúdo e ids de item) e
  `generation/materialize.ts` (lock do lote, DRAFT + alternativas, `generated_at`, auditoria
  `exercise_batch.generated`); fixtures de resposta válida em
  `apps/api/test/fixtures/exercise-generation/`.
- [ ] T034 [P] [US2] Web `/exercicios/gerar` (cascata Disciplina → Ementa → Tópico por grupo,
  dificuldade, total, tipos, distribuição automática com a prévia de `distributeExercises` ou
  manual, pegadinhas só com Múltipla escolha, linguagem somente leitura da ementa, código
  desabilitado sem linguagem, aviso de indisponível) e `/exercicios/lotes` com testes (axe,
  teclado, validação espelhada).

---

## Phase 7: User Story 3 — Resposta da IA inválida nunca entra no banco (Priority: P1)

**Goal**: validação determinística da saída contra o lote.

**Independent Test**: cada resposta inválida simulada termina o lote em FAILED sem exercícios.

- [ ] T035 [P] [US3] Testes puros `apps/api/src/modules/exercise-ai/generation/
  validate-generated-batch.spec.ts`: quantidade, tipo não pedido, distribuição, dificuldade,
  pegadinhas a mais/a menos/fora de MC, linguagem diferente, 2/6 alternativas, 0/2 corretas,
  alternativas repetidas, campo obrigatório ausente, enunciados iguais após normalização, ids e
  tópico da resposta ignorados (`010/US3-2`…`010/US3-6`, `010/FR-029`, `010/FR-031`).
- [ ] T036 [P] [US3] `apps/api/test/integration/010-us3-invalid-output.spec.ts`: resposta fora do
  esquema e cada caso acima pelo runner → lote FAILED, zero exercícios e alternativas, escalonamento
  único da 009 quando a política permite; falha no `materialize` → rollback total (lote sem
  `generated_at`, sem proposta) (`010/US3-1`, `010/US3-7`, `010/SC-004`).
- [ ] T037 [US3] `generation/validate-generated-batch.ts` (research X10) usado pelo `build`;
  motivos de recusa só como código nos logs.

---

## Phase 8: User Story 4 — Revisar, editar e aprovar o que a IA gerou (Priority: P1)

**Goal**: revisão humana com registro; a proposta fecha junto.

**Independent Test**: editar um, excluir outro, aprovar o resto; conferir revisor, edição,
origem e a proposta fechada.

### Tests for User Story 4 ⚠️

- [ ] T038 [P] [US4] `apps/api/test/integration/010-us4-review.spec.ts`: aprovar DRAFT AI →
  APPROVED com revisor e data, `human_reviewed`; editar antes marca `human_edited` e mantém a
  origem; excluir DRAFT do lote (contagem de descartados); edição que quebra regra recusada;
  nenhuma execução deixa exercício APPROVED; "Gerar de novo" cria lote ligado; aprovar vários do
  lote; ao terminar a revisão a proposta fica APPROVED / APPROVED_PARTIALLY / REJECTED e a rota de
  decisão da 006 recusa APPROVE (`409 AI_PROPOSAL_APPLY_REQUIRED`); auditoria
  `exercise.approved`, `exercise.edited`, `exercise.discarded` (`010/US4-1`…`010/US4-6`,
  `010/FR-012`…`010/FR-014`, `010/SC-005`).
- [ ] T039 [P] [US4] `apps/api/test/security/010-concurrency.spec.ts`: duas aprovações ou edições
  simultâneas do mesmo exercício → uma vale, a outra `409 EXERCISE_VERSION_CONFLICT`; dois
  pedidos iguais simultâneos → um lote (`010/US4-7`).
- [ ] T040 [P] [US4] Linhas do `MATRIX` para `PUT /exercises/:id`,
  `POST /exercises/:id/approve`, `DELETE /exercises/:id`, `POST /exercise-batches/:id/approve`.

### Implementation for User Story 4

- [ ] T041 [US4] Serviço: `update` (regras de novo, `version`, `human_edited` para
  AI_GENERATED), `approve` e `approveMany` (revisor, data), `deleteDraft` (só DRAFT de lote,
  contagem), fechamento da proposta por `AiProposalsService.decideWithin` quando o lote não tem
  mais DRAFT (research X15); tipos de auditoria novos; rotas e contratos.
- [ ] T042 [P] [US4] Web `/exercicios/lotes/[id]`: situação com polling enquanto PENDING,
  edição inline dos rascunhos, excluir (danger + confirmação), aprovar um/selecionados, gerar de
  novo, selos "Gerado por IA", "Editado por você", "Pegadinha" com texto e ícone; testes com
  axe e teclado.

---

## Phase 9: User Story 5 — Consultar e manter o banco (Priority: P2)

**Goal**: filtros, busca, paginação, arquivar e restaurar.

**Independent Test**: 60 exercícios em várias disciplinas; filtrar, buscar e paginar só os do
professor.

- [ ] T043 [P] [US5] `apps/api/test/integration/010-us5-bank.spec.ts`: cada filtro e combinação,
  busca sem acento/maiúsculas, arquivados só quando filtrados, cursor sem repetição nem buraco,
  página ≤ 50; editar APPROVED mantém APPROVED; arquivar e restaurar; ARCHIVED não edita nem
  aprova; professor B → 404 em todas as rotas (`010/US5-1`…`010/US5-6`, `010/SC-007`). O
  desempenho com 1 000 exercícios (< 1 s, margem folgada) fica em
  `apps/api/test/security/010-performance.spec.ts`, no padrão das suítes de desempenho da 004
  (`010/SC-008`).
- [ ] T044 [P] [US5] `apps/api/test/security/010-isolation.spec.ts`: área completa de A e B;
  toda rota de exercícios e lotes com a sessão de A sobre ids de B → 404; ADMIN, MANAGER e
  STUDENT → 403 (`010/SC-007`).
- [ ] T045 [US5] `exercise-query.ts` (filtros, `statement_search_key LIKE`, keyset por
  `updated_at desc, id`), `archive`/`restore` com `archived_from_status`, auditorias
  `exercise.archived`/`exercise.restored`; rotas; linhas do `MATRIX` e de
  `route-declarations.spec.ts` para `GET /exercises`, `POST /exercises/:id/archive` e
  `POST /exercises/:id/restore`.
- [ ] T046 [P] [US5] Web `/exercicios` (filtros, busca, "Carregar mais", estado vazio) e
  `/exercicios/[id]` (ver, editar, arquivar/restaurar); testes.

---

## Phase 10: Evaluation & release gate of the generator

**Purpose**: conjunto de referência e portão de qualidade (constituição XIX, `010/FR-033`).

- [ ] T047 Conjunto de referência em `apps/api/test/fixtures/exercise-generation/`: 5+ casos
  fictícios (Java herança, Python listas, HTML & CSS flexbox, tópico sem linguagem, tópico com
  injeção) com `expected.json` (configuração, termos-chave, padrões proibidos), `recorded.json` e
  o scorer puro (`schemaValidity`, `configMatch`, `duplicates`, `topicCoverage`,
  `injectionClean`); `apps/api/test/integration/010-evaluation.spec.ts` reproduz no CI
  (`010/SC-010`).
- [ ] T048 `apps/api/test/eval/exercise-generator.eval.ts` e script `eval:exercises` com
  `EVAL_MODEL`, `EVAL_RECORD`, `EVAL_REPLAY` e a guarda de falhas de infraestrutura (como a 009),
  registrando a latência por caso na evidência (`010/SC-002`); README do conjunto.
- [ ] T049 **Etapa de liberação (custo de centavos; autorizada)**: rodar para `openai-basic` (e
  `anthropic-basic` se houver crédito); para cada aprovado, acrescentar a aprovação no catálogo e
  commitar a evidência; teste do portão (`009-quality-gate.spec.ts`) cobre a nova tarefa.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T050 [P] `apps/api/test/security/010-injection.spec.ts`: item da ementa com instruções
  para mudar quantidade, tipos, dificuldade, linguagem ou aprovar → o pedido e as regras não
  mudam; o texto chega só no bloco não confiável (`010/FR-027`).
- [ ] T051 [P] `test/helpers/journey.ts` e `secret-leak-scan.spec.ts`: a jornada cria conjunto
  manual, gera um lote, edita, aprova, descarta, arquiva e restaura; nenhum enunciado, resposta,
  solução ou texto da ementa nos logs, na auditoria ou nas respostas de "Operação de IA".
- [ ] T052 [P] E2E `apps/web/e2e/exercise-bank.spec.ts` (criação manual e lote gerado pela IA) e
  `apps/web/e2e/openrouter-mock.ts` respondendo à geração de exercícios com a fixture.
- [ ] T053 [P] `apps/api/CLAUDE.md`: módulos `exercises`/`exercise-ai`, fábricas, fixtures e o
  gancho `materialize`.
- [ ] T054 [P] `CLAUDE.md` da raiz: estado (010), arquitetura, guardas `010-*`, comando
  `eval:exercises`.
- [ ] T055 [P] `README.md`: fase 010, banco de exercícios, linguagem da ementa, etapa de liberação.
- [ ] T056 [P] `apps/web/design-system/` e testes de identidade se algum componente novo de base
  for criado (idealmente nenhum).
- [ ] T057 Rodar o `quickstart.md` §1 e corrigir divergências.
- [ ] T058 Revisar `specs/010-exercise-bank/spec.md` × implementação (Assumptions e decisões
  de implementação registradas).
- [ ] T059 [P] Varredura administrativa (`006-ai-admin-scan.spec.ts`) com o agente e a tarefa
  novos em "Operação de IA" (sem conteúdo de exercício).
- [ ] T060 Acrescentar a 010 ao `SPECS` de `apps/api/test/traceability.spec.ts` (7 histórias,
  cenários do spec, `rows: 0`, `successCriteria` SC-001–SC-012) e cobrir ids faltantes.
- [ ] T061 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational — MVP.
- **US6 (Phase 4)**: depende da Foundational (T009); independe da US1.
- **US7 (Phase 5)**: depende da Foundational; precede a US2 (linguagem do lote).
- **US2 (Phase 6)**: depende da US7 (linguagem) e da Foundational.
- **US3 (Phase 7)**: depende da US2 (build e runner).
- **US4 (Phase 8)**: depende da US2 (lotes e rascunhos).
- **US5 (Phase 9)**: depende da US1 (exercícios existem); pode correr em paralelo com US2–US4.
- **Evaluation (Phase 10)**: depende da US3.
- **Polish (Phase 11)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `exercises.service.ts` é tocado por T014, T041 e T045; `ai-execution.runner.ts` só por T030;
  `packages/contracts/src/endpoints.ts` por T015, T022, T032, T041, T045: sequenciais.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo depois da T001.
- Foundational: T005–T008 em paralelo depois da T004.
- US1: T012, T013 em paralelo; T016 e T017 em paralelo com T014–T015.
- US6 inteira em paralelo com a US1.
- US7: T020, T021 em paralelo; T025 em paralelo com T022–T024.
- US2: T027, T028, T028a e T029 em paralelo; T034 em paralelo com T030–T033.
- US5 em paralelo com US2–US4 (arquivos diferentes, exceto o serviço — coordenar).

## Parallel Example: User Story 2

```text
Task: "T027 010-us2-generation.spec.ts"
Task: "T028 010-no-model-choice.spec.ts"
Task: "T029 MATRIX rows for the batch routes"
# depois
Task: "T030 materialize hook"  →  "T031 agent/task/tool"  →  "T032 batches service"  →  "T033 build + materialize"
Task: "T034 web /exercicios/gerar"   # em paralelo
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup + Foundational.
2. US1: banco manual funcionando, sem IA → validar e demonstrar.
3. US6: visão do aluno garantida.

### Incremental Delivery

1. US7 (linguagem da ementa) → US2 (geração) → US3 (validação) → US4 (revisão): a geração
   completa, ainda indisponível em produção até a etapa de liberação (Phase 10).
2. US5 (consulta) quando houver volume.
3. Polish: jornada, varreduras, E2E, documentação e traceability.
