---

description: "Task list for 011 — Banco de Trabalhos: criação manual e geração com IA, gabarito protegido e correção por estratégia"
---

# Tasks: 011 — Banco de Trabalhos

**Input**: Design documents from `/specs/011-work-bank/`
**Prerequisites**: plan.md, spec.md, research.md (W1–W22), data-model.md, contracts/
(http-api, work-generator, grading, audit-events, permissions, configuration, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; §31–34 do pedido e SC-001–SC-013).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 011 com prefixo (`011/US2-3`, `011/FR-027`,
  `011/SC-004`), **um id literal por cenário**: onde uma tarefa cita uma faixa
  (`011/US1-1`…`011/US1-6`), cada cenário ganha o seu `it`. A traceability passa a procurá-los na
  fase final (T067).
- Nenhum teste chama modelo real: provedor simulado da 006 (`t.provider.script…`) e, no E2E, o
  `apps/web/e2e/openrouter-mock.ts`. Filtros de teste sem `--` (`pnpm --filter api test <arquivo>`).
- As suítes 001–010 continuam verdes **sem alteração** em toda fase (SC-013); cada fase termina com
  `pnpm lint && pnpm check-types && pnpm test` verde.
- Nenhum arquivo de `apps/api/src/modules/exercises`, `apps/api/src/modules/exercise-ai`,
  `packages/contracts/src/exercises` ou `apps/web/features/exercises` é alterado (research W1).
- Um tipo de auditoria novo exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `specs/011-work-bank/contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- Uma rota nova exige entrada em `packages/contracts/src/endpoints.ts`, linha no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` e em `route-declarations.spec.ts`.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- Notas nunca em ponto flutuante: centésimos inteiros no código, `numeric(5,2)` no banco, string
  `"0.50"` na rede (research W3).

**Organization**: por user story, na ordem das dependências reais.
- A Foundational entrega a migração, as permissões, os contratos, as regras puras de nota e
  estrutura, o registro de tipos e a máquina de estados. Toda história precisa disso.
- US1 (criação manual) é o MVP; US2 (nota e valores) vem logo depois porque os valores já são
  gravados na criação; US6 (visão do aluno) só depende da Foundational.
- US3 (pedido à IA) → US4 (resposta inválida) → US5 (revisão e aprovação, inclusive dos trabalhos
  gerados). O cenário `011/US2-4` (recalcular ao editar) é testado na US5, onde a edição existe.
- US7 (consulta, arquivar, restaurar) é P2 e depende só da US1.
- US8 (estratégias de correção e nota do aluno) é P2, pura, sem rota: pode correr em paralelo com
  qualquer história depois da Foundational.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história da tarefa (US1…US8)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: vocabulário, configuração, códigos de erro e os helpers puros que todas as histórias
usam.

- [X] T001 Criar `packages/contracts/src/works/enums.ts` com `WorkQuestionTypeSchema`,
  `WorkGradingStrategySchema`, `WorkDifficultySchema`, `WorkOriginSchema`, `WorkStatusSchema`,
  `TestCaseVisibilitySchema` e `WorkGenerationRequestStatusSchema`, exportados em
  `packages/contracts/src/index.ts`; teste em `packages/contracts/test/works.spec.ts` (valores
  exatos; nenhum reaproveita `ExerciseDifficultySchema` nem `AiModelTierSchema` — `011/FR-009`).
- [X] T002 [P] `packages/contracts/src/common/split-evenly.ts`: `splitEvenly(total, k)` puro
  (`floor(total / k)` para todos e +1 para os primeiros `total mod k`), exportado; teste em
  `packages/contracts/test/split-evenly.spec.ts` (10/3 → 4,3,3; 5/2 → 3,2; 50/3 → 17,17,16;
  determinístico; `k = 0` → `[]`). A `distributeExercises` da 010 não muda.
- [X] T003 [P] `packages/contracts/src/works/grade.ts` (research W3, W4): `GradeStringSchema`
  (entrada `/^\d{1,3}(\.\d{1,2})?$/`, 0.01–100.00) e `GradeOutputSchema` (saída sempre com
  duas casas), `gradeToCents`, `centsToGrade`,
  `distributeGrade(totalCents, count)` sobre `splitEvenly`; testes em
  `packages/contracts/test/work-grade.spec.ts`: 0,50/10 → 5×10; 1,00/10 → 10×10; 0,50/5 →
  10×5; 0,50/3 → 17,17,16 na ordem de posição; `"0.5"` e `"1"` aceitos como 50 e 100;
  recusa de `"0.505"`, `"-1.00"`, `"0.00"`, `"100.01"`, vírgula; `centsToGrade(50)` → `"0.50"`; propriedade exaustiva de 1 a 1 000 centésimos × 1–10 questões e
  amostrada até 10 000: soma = total, máx − mín ≤ 1, não crescente por posição
  (`011/US2-1`…`011/US2-3`, `011/US2-5`, `011/US2-6`, `011/SC-004`).
- [X] T004 [P] Acrescentar `RATE_LIMIT_WORK_AI_PER_HOUR` (padrão 10, int ≥ 1) em
  `apps/api/src/platform/config/config.schema.ts` (`rateLimit.workAiPerHour`) e
  `apps/api/.env.example`; teste em `apps/api/test/integration/platform.spec.ts`.
- [X] T005 [P] Acrescentar o código de erro `WORK_VERSION_CONFLICT` (409) em
  `packages/contracts/src/common/errors.ts`, `apps/api/src/platform/http/errors.ts` e
  `apps/web/lib/messages/error-messages.ts` ("Este trabalho mudou em outra aba. Recarregue para
  ver a versão atual."), com o teste do catálogo (`apps/web/lib/messages/error-messages.test.ts`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: esquema, permissões, contratos, regras puras, registro de tipos e estados; sem rota
ainda.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

- [X] T006 Migração `apps/api/prisma/migrations/<ts>_work_bank/migration.sql` e
  `apps/api/prisma/schema.prisma` conforme `data-model.md`: os 6 enums; `works` (CHECKs de nota
  0.01–100.00 e ≥ 0,01 por questão, `question_count` 1–10, `archived_from_status`, AI ⇒
  revisão, dificuldade e pedido, AI APPROVED ⇒ revisor; UNIQUE `(id, syllabus_revision_id)`;
  trigger que recusa mudar `origin`; índices); `work_topics` com as duas FKs compostas;
  `work_questions` (CHECKs por tipo, estratégia ↔ tipo, `value ≥ 0.01`, pegadinha só em MC;
  UNIQUE `(id, work_id)`; UNIQUE (work, position) adiável; trigger que recusa mudar `type`);
  `work_question_alternatives` (UNIQUE posição adiável, índice parcial de uma correta);
  `work_question_test_cases`; `work_question_topics` com as FKs compostas;
  `work_generation_requests` (CHECKs de quantidade, soma, pegadinhas, linguagem, distribuição,
  nota; UNIQUE (teacher, idempotency_key), `ai_execution_id`, `(id, syllabus_revision_id)`);
  `work_generation_request_topics` com as FKs compostas; os triggers `DEFERRABLE INITIALLY
  DEFERRED`: questões contíguas = `question_count` e `SUM(value) = total_grade`; 3–5
  alternativas distintas com exatamente uma correta só em MC; casos de teste só em CODE e ≤ 20;
  ≤ 10 tópicos por trabalho; ≤ 3 tópicos por questão; 1–10 tópicos e ≤ 3 × quantidade por
  pedido; permissões `trabalhos.visualizar/criar/editar/arquivar/aprovar` e `ia.trabalhos.gerar`
  concedidas a TEACHER; atualizar a lista de modelos de
  `apps/api/test/security/domain-boundary.spec.ts`; `resetDb` limpa as tabelas novas.
- [X] T007 [P] Teste do banco em `apps/api/test/integration/011-schema.spec.ts`: por SQL direto,
  recusam no commit: soma dos valores ≠ nota total; 0 e 11 questões; posições com buraco; MC com
  2 e 6 alternativas, 0 e 2 corretas, textos repetidos; alternativa em questão aberta; caso de
  teste em MC; estratégia trocada (MC com `AI_REVIEW`); tópico de outra revisão no trabalho;
  tópico de questão que não é do trabalho; 4 tópicos numa questão; 11 tópicos num trabalho;
  mudança de `origin` e de `type`; AI_GENERATED sem dificuldade ou sem pedido; nota 0.00 e
  100.01; pedido com soma ≠ total e pegadinhas acima da MC (`011/FR-002`, `011/FR-003`,
  `011/FR-006`, `011/FR-011`, `011/FR-036`).
- [X] T008 [P] Atualizar `apps/api/test/security/authorization-matrix.ts` (`ROLE_PERMISSIONS` de
  TEACHER com as 6 permissões novas) e `us7-matrix-completeness.spec.ts` se preciso.
- [X] T009 [P] Contratos em `packages/contracts/src/works/works.ts` (contracts/http-api.md):
  `WorkQuestionInputSchema` (união discriminada por tipo; 3–5 alternativas distintas com
  exatamente uma correta; pegadinha só em MC; gabarito obrigatório por tipo; 0–20 casos de teste;
  0–3 `topicItemIds`), `WorkTopicsInputSchema`, `CreateWorkRequestSchema` (1–10 questões, nota ≥
  0,01 × quantidade, tópicos das questões ⊆ tópicos do trabalho, `status` DRAFT | APPROVED),
  `UpdateWorkRequestSchema` (+ `version`, `id` opcional por questão), `WorkVersionRequestSchema`,
  `WorkTeacherViewSchema`, `WorkStudentViewSchema` (estrito, lista fechada), `WorkSummarySchema`,
  `WorkListQuerySchema` e página por cursor; testes de fronteira em
  `packages/contracts/test/works.spec.ts`: 0/1/10/11 questões; 2/3/5/6 alternativas; 0/1/2
  corretas; nota 0,05 para 10 questões recusada; campos `teacherId`, `origin`, `value`,
  `gradingStrategy` e `model` recusados (`011/SC-003`, `011/FR-008`).
- [X] T010 [P] `packages/contracts/src/works/work-generation.ts`: `distributeWorkQuestions(total,
  types)` sobre `splitEvenly` (ordem fixa OPEN_ANSWER, MULTIPLE_CHOICE, CODE),
  `WorkGenerationRequestSchema` (disciplina, revisão, 1–10 itens distintos, tópicos ≤ 3 × total,
  título, descrição, dificuldade obrigatória, nota, total 1–10, tipos 1–3 distintos, distribuição
  AUTO com total ≥ tipos ou MANUAL com soma = total e cada tipo ≥ 1, pegadinhas 0–3 e ≤ MC, 0 sem
  MC, sem linguagem nem campo de modelo, `idempotencyKey`, `regeneratedFromId?`),
  `WorkGenerationRequestViewSchema`, `GeneratedWorkSchema` (saída da IA, estrita, sem título,
  nota, valores, ids nem situação); testes: 10 em 3 tipos → 4/3/3; 6 MC + 3 pegadinhas aceito; 2
  MC + 3, 4 pegadinhas e pegadinha sem MC recusados; 7 tópicos e 2 questões recusado; sem
  dificuldade ou sem tópico recusado; campos `model`/`provider`/`tier`/`family`/`task`/
  `instructions` recusados (`011/US3-2`, `011/US3-4`…`011/US3-6`, `011/FR-018`…`011/FR-022`).
- [X] T011 Registro de tipos em `apps/api/src/modules/works/types/{open-answer,multiple-choice,
  code,index}.ts` (research W5): regras puras, estratégia fixa do tipo, gabarito completo,
  mapeamento para linhas (questão, alternativas, casos de teste), visão do professor e visão do
  aluno por lista de campos permitidos (`views/{teacher-view,student-view}.ts`, só leitura das
  linhas); `rules/work-rules.ts` (reaproveita as refinações do contrato, enunciados repetidos por
  `searchKey`, aviso `CODE_QUESTION_WITHOUT_TEST_CASES`); `grade/grade-values.ts` (aplica
  `distributeGrade` às questões ordenadas); testes unitários em
  `apps/api/src/modules/works/types/*.spec.ts` e `rules/*.spec.ts`.
- [X] T012 [P] Máquina de estados `apps/api/src/modules/works/work.state-machine.ts`
  (DRAFT→APPROVED, DRAFT→ARCHIVED, APPROVED→ARCHIVED, ARCHIVED→anterior; editar só em DRAFT e
  APPROVED; resto → `INVALID_STATE_TRANSITION`) com teste unitário (`011/FR-013`, `011/FR-016`).
- [X] T013 Módulo `apps/api/src/modules/works/works.module.ts` registrado em `AppModule`;
  `work-topics.ts` com a consulta escopada que resolve disciplina, revisão confirmada e itens do
  professor (research W11: faltando → 404, rascunho → `422 REVISION_NOT_CONFIRMED`); fábricas de
  teste em `apps/api/test/helpers/works.ts` (`createWork`, `createConfirmedSyllabus` com
  disciplina, documento, revisão confirmada com linguagem, grupos e vários itens).
- [X] T014 [P] `apps/api/test/works-boundary.spec.ts` (research W1, W8, W20): nenhum import entre
  `src/modules/{works,work-ai}` e `src/modules/{exercises,exercise-ai}` nos dois sentidos, nem
  entre `packages/contracts/src/works` e `src/exercises`, nem entre `features/works` e
  `features/exercises`; nenhum `child_process`, `vm`, `eval(`, `new Function` ou
  `worker_threads` em `works`/`work-ai`; nenhuma referência a `AiModelTier`, `routeFor`,
  `MODEL_CATALOG`, famílias, `openrouter` ou chaves do catálogo em `work-ai` e `works`
  (`011/FR-001`, `011/FR-024`, `011/FR-038`).

**Checkpoint**: migração aplicada, regras, nota e contratos testados; nenhuma rota nova.

---

## Phase 3: User Story 1 — Criar um trabalho manualmente (Priority: P1) 🎯 MVP

**Goal**: trabalho de 1–10 questões dos três tipos, com gabarito, sem IA.

**Independent Test**: um trabalho manual com uma questão de cada tipo entra no banco com origem
MANUAL, valores calculados e nenhuma execução de IA.

### Tests for User Story 1 ⚠️

- [X] T015 [P] [US1] `apps/api/test/integration/011-us1-manual.spec.ts`: 3 questões válidas →
  201, MANUAL, auditado `work.created`; 0 e 11 recusados sem gravar nada, 1 e 10 aceitos; MC com
  2/6 alternativas, repetidas, 0/2 corretas recusa o trabalho inteiro com a indicação da questão;
  aberta sem resposta esperada, código sem solução, sem linguagem ou com linguagem inativa
  recusados; sem dificuldade e sem tópicos aceito; tópico de outra disciplina, de outro
  professor, de revisão em rascunho → 404/422 sem revelar; salvar DRAFT e APPROVED (revisor
  registrado); caso de teste com entrada e saída vazias aceito; zero linhas em `ai_executions` e `ai_model_calls` depois de tudo
  (`011/US1-1`…`011/US1-6`, `011/SC-001`).
- [X] T016 [P] [US1] Linhas do `MATRIX` e de `route-declarations.spec.ts` para `POST /works`,
  `GET /works/:id` e `GET /works/programming-languages`.

### Implementation for User Story 1

- [X] T017 [US1] `apps/api/src/modules/works/works.service.ts`: `create` numa transação
  (disciplina e tópicos por `work-topics.ts`, linguagem ativa, valores por `grade-values.ts`,
  linhas de trabalho, tópicos, questões, alternativas, casos de teste, tópicos das questões,
  `title_search_key` e `statement_search_key`, `human_reviewed`/revisor quando APPROVED),
  `getForTeacher` (404 fora do professor) e a leitura do catálogo de linguagens ativas;
  auditoria `work.created` (tipo novo + contrato + jornada); conversão `Prisma.Decimal` ↔
  centésimos só na borda do repositório.
- [X] T018 [US1] Rotas em `apps/api/src/modules/works/works.controller.ts` (`POST /works`,
  `GET /works/:id`, `GET /works/programming-languages`) e entradas em
  `packages/contracts/src/endpoints.ts`.
- [X] T019 [P] [US1] Web: `apps/web/features/works/{api,hooks,schemas}` e a página
  `/trabalhos/novo` em `apps/web/app/(app)/trabalhos/novo/page.tsx` com os componentes de
  `apps/web/features/works/components/` (contracts/web-ui.md): disciplina, título, descrição,
  nota ("0,50" → `"0.50"`), dificuldade opcional, tópicos (Ementa confirmada → itens por grupo),
  `useFieldArray` de 1–10 cartões com tipo, campos do tipo, alternativas com uma correta e
  "Pegadinha", casos de teste Pública/Privada, tópicos da questão, "Salvar como rascunho" /
  "Salvar e aprovar"; item de menu "Banco de Trabalhos" (`trabalhos.visualizar`).
- [X] T020 [P] [US1] Testes web em `apps/web/features/works/components/*.test.tsx`: erros por campo
  ligados (`expectFieldErrorLinked`), limites 1/10 no formulário, nota com vírgula, axe, ordem de
  Tab (padrão de teclado `SC-012` da 001).

**Checkpoint**: banco manual funcionando (MVP).

---

## Phase 4: User Story 2 — Nota total e valor das questões com soma exata (Priority: P1)

**Goal**: o professor informa só a nota total; o sistema grava valores em centésimos com soma
exata e mostra cada valor.

**Independent Test**: criar trabalhos com 0,50/10, 1,00/10, 0,50/5 e 0,50/3 e conferir cada
valor e a soma.

- [ ] T021 [P] [US2] `apps/api/test/integration/011-us2-grade.spec.ts`: pela rota de criação,
  0,50/10 → 0,05 cada; 1,00/10 → 0,10; 0,50/5 → 0,10; 0,50/3 → 0,17 · 0,17 · 0,16 na ordem; a
  soma lida do banco (`SUM(value)`) é igual à nota em todos; nota com três casas, negativa, zero,
  acima de 100,00 ou 0,05 para 10 questões → 400 sem arredondar; a visão do professor traz
  `"0.17"` como string (`011/US2-1`…`011/US2-3`, `011/US2-5`, `011/US2-6`, `011/SC-004`,
  `011/FR-011`).
- [ ] T022 [US2] Ajustar `grade-values.ts`, `works.service.ts` e as visões até o teste passar
  (teste de varredura em `works-boundary.spec.ts` que proíbe `parseFloat`, `Number(` e
  `.toNumber()` nos módulos `works` e `work-ai`).
- [ ] T023 [P] [US2] Web: cada cartão de `/trabalhos/novo` mostra "Vale 0,17" com
  `distributeGrade` e atualiza ao mudar a nota, acrescentar, remover ou reordenar; teste em
  `apps/web/features/works/components/work-form.test.tsx`.

---

## Phase 5: User Story 6 — Visão do aluno sem gabarito (Priority: P1)

**Goal**: visão de aluno montada no servidor por lista de campos permitidos; prévia para o
professor.

**Independent Test**: para cada tipo, a prévia serializada não contém nenhum marcador de gabarito.

- [ ] T024 [P] [US6] `apps/api/test/security/011-student-view.spec.ts`: trabalho com marcadores
  (`MARCADOR-RESPOSTA-011`, `MARCADOR-RUBRICA-011`, `MARCADOR-SOLUCAO-011`,
  `MARCADOR-PRIVADO-011`, `MARCADOR-EXPLICACAO-011`) nos campos sensíveis; `GET
  /works/:id/student-preview` passa em `WorkStudentViewSchema` estrito e o JSON não contém nenhum
  marcador nem as chaves `isCorrect`, `expectedAnswer`, `rubric`, `expectedSolution`,
  `explanation`, `isTrickQuestion`, `origin`, `gradingStrategy`, `humanReviewed`; casos
  `PUBLIC` presentes, `PRIVATE` ausentes; alternativas na ordem; uma coluna nova na linha de
  fixture não aparece (projeção por lista); STUDENT, ADMIN e MANAGER → 403 nas rotas do professor
  com o id do trabalho (`011/US6-1`…`011/US6-5`, `011/SC-007`, `011/FR-034`, `011/FR-035`).
- [ ] T025 [US6] Rota `GET /works/:id/student-preview` em `works.controller.ts`, entrada em
  `endpoints.ts`, linhas do `MATRIX`/`route-declarations`; ajustar `views/student-view.ts` até o
  teste passar; documentar em `apps/api/CLAUDE.md` que a rota de aluno da 012 usa só esse
  builder.
- [ ] T026 [P] [US6] Web: "Ver como aluno" (somente leitura) em
  `apps/web/features/works/components/student-preview.tsx`, com teste (axe, nenhum campo de
  gabarito renderizado).

---

## Phase 6: User Story 3 — Pedir um trabalho à IA a partir de um ou mais tópicos (Priority: P1)

**Goal**: pedido registrado, execução pela infraestrutura existente, trabalho DRAFT materializado.

**Independent Test**: 10 questões mistas sobre 3 tópicos → pedido GENERATED e um trabalho DRAFT,
AI_GENERATED, com a distribuição, os 3 tópicos, o título e a nota do pedido.

### Tests for User Story 3 ⚠️

- [ ] T027 [P] [US3] `apps/api/test/integration/011-us3-generation.spec.ts` (provedor simulado
  com uma resposta válida de fixture): herança, polimorfismo e classes abstratas numa ementa Java,
  Intermediário, nota 2,00, 3/4/3 e 2 pegadinhas → 202, pedido PENDING, execução com recurso
  `WORK_GENERATION_REQUEST`; depois do worker, GENERATED com um trabalho DRAFT AI_GENERATED com a
  distribuição, os 3 tópicos, título, nota e valores calculados, cada questão com 1–3 tópicos;
  sem dificuldade ou sem tópico → 400 sem chamada; tópico inexistente, de outra disciplina, de
  revisão em rascunho, de revisões diferentes, de outro professor → 404/422 sem chamada e sem
  revelar; campos de modelo → 400; AUTO 4/3/3 registrado; pegadinhas inválidas → 400; código com
  revisão sem linguagem → 422 `SYLLABUS_LANGUAGE_REQUIRED`; disciplina arquivada → 409; mesma
  chave → mesmo pedido e um só trabalho, outra configuração com a mesma chave → 409; limite por
  hora → 429; agente desabilitado ou sem modelo → 409/503 e a criação manual continua; "pedir
  de novo" com `regeneratedFromId` cria outro pedido ligado ao original, com a mesma configuração
  e outro trabalho; `regeneratedFromId` de outro professor → 404; execução cancelada antes de
  terminar → pedido CANCELLED, sem trabalho, e o professor pode pedir de novo
  (`011/US3-1`…`011/US3-9`, `011/FR-018`…`011/FR-025`, `011/FR-032`).
- [ ] T028 [P] [US3] `apps/api/test/security/011-no-model-choice.spec.ts`: a rota da tarefa
  `work-generation` pela política da 009 é a mesma para BASIC, INTERMEDIATE e ADVANCED; o pedido
  registrado não guarda campo de modelo (`011/US3-7`, `011/SC-010`, `011/FR-009`).
- [ ] T029 [P] [US3] `apps/api/test/security/011-tool-scope.spec.ts`: a ferramenta
  `read-work-generation-request` devolve só os itens do pedido (com `ref` T1…), os títulos dos
  grupos, título, competência e linguagem da revisão e a configuração; nunca título, descrição ou
  nota do trabalho; recusa o pedido de outra execução ou de outro professor
  (`AI_CONTEXT_ACCESS_DENIED`); a requisição ao modelo não contém nome da disciplina, outras
  ementas, ids de usuário, dados de turma ou de aluno (`011/FR-025`, `011/FR-026`).
- [ ] T030 [P] [US3] Linhas do `MATRIX`/`route-declarations` para `POST /work-generation-requests`,
  `GET /work-generation-requests`, `GET /work-generation-requests/:id` e
  `GET /work-generation/availability`.

### Implementation for User Story 3

- [ ] T031 [US3] `apps/api/src/modules/work-ai/definitions/`: tarefa `work-generation` (research
  W9), agente `work-generator` v1 (DISABLED, L2), prompt `work-generation` v1 (regras de tipo,
  tópicos por `ref`, cobertura, pegadinhas aceitáveis e proibidas, linguagem, casos de teste),
  ferramenta `read-work-generation-request`, ownership `WORK_GENERATION_REQUEST`;
  `workAiDefinitions()` registrado em `apps/api/src/modules/ai/definitions/index.ts` junto de
  `exerciseAiDefinitions()` (registro apenas).
- [ ] T032 [US3] `apps/api/src/modules/work-ai/work-generation-requests.service.ts`: validação de
  disciplina e tópicos (`work-topics.ts`), linguagem da revisão, distribuição, gravação do pedido
  e dos tópicos e pedido da execução na mesma transação (`AiExecutionsService.request` com
  `onCreated`), limite por hora, idempotência, regeneração; auditoria `work_generation.requested`;
  status derivado; `work-generation-requests.controller.ts` e disponibilidade;
  `work-ai.module.ts`; entradas em `endpoints.ts`.
- [ ] T033 [US3] `generation/build-proposal.ts` (mapeia `ref` → item, ids de item por posição) e
  `generation/materialize.ts` (lock do pedido, trabalho DRAFT com dados do pedido, tópicos,
  questões com estratégia do registro e valores de `distributeGrade`, alternativas, casos de
  teste, tópicos das questões, `generated_at`, auditoria `work_generation.generated`); fixtures de
  resposta válida em `apps/api/test/fixtures/work-generation/`.
- [ ] T034 [P] [US3] Web `/trabalhos/gerar` (Disciplina → Ementa → Tópicos por grupo, 1–10;
  título, descrição, dificuldade, nota, quantidade, tipos, distribuição automática com a prévia de
  `distributeWorkQuestions` ou manual, pegadinhas só com MC, linguagem somente leitura, Código
  desabilitado sem linguagem, aviso "até 3 tópicos por questão", indisponível com link para o
  manual), `/trabalhos/pedidos` e `/trabalhos/pedidos/[id]` (polling enquanto PENDING, link para
  o trabalho, "Tentar de novo"); testes com axe, teclado e validação espelhada.

---

## Phase 7: User Story 4 — Resposta da IA inválida nunca vira trabalho (Priority: P1)

**Goal**: validação determinística da saída contra o pedido.

**Independent Test**: cada resposta inválida simulada termina o pedido em FAILED sem trabalho.

- [ ] T035 [P] [US4] Testes puros `apps/api/src/modules/work-ai/generation/
  validate-generated-work.spec.ts`: quantidade, tipo não pedido, distribuição, dificuldade,
  pegadinhas a mais/a menos/fora de MC, linguagem diferente, questão sem gabarito, MC fora das
  regras, código sem caso de teste, enunciados iguais após normalização, `ref` fora da seleção,
  questão sem tópico ou com 4, tópico selecionado sem questão; motivo de recusa exato para cada
  (`011/US4-2`…`011/US4-4`, `011/US4-6`, `011/FR-027`).
- [ ] T036 [P] [US4] `apps/api/test/integration/011-us4-invalid-output.spec.ts`: resposta fora do
  esquema e cada caso acima pelo runner → pedido FAILED, zero linhas nas tabelas de trabalho,
  escalonamento único da 009 quando a política permite; resposta com nota, valores, título,
  tópicos, ids ou situação → recusada pelo esquema estrito ou ignorada, e o trabalho usa os do
  pedido; falha no `materialize` → rollback total (pedido sem `generated_at`, sem proposta, sem
  trabalho) (`011/US4-1`, `011/US4-5`, `011/US4-7`, `011/SC-005`, `011/FR-028`, `011/FR-029`).
- [ ] T037 [US4] `generation/validate-generated-work.ts` (research W13) usado pelo `build`;
  motivos de recusa só como código nos logs.

---

## Phase 8: User Story 5 — Revisar, editar e aprovar o trabalho (Priority: P1)

**Goal**: edição do trabalho inteiro com versão, recálculo dos valores, aprovação só por pessoa.

**Independent Test**: gerar um trabalho, editar uma questão, remover outra, acrescentar uma e
aprovar; conferir valores, revisor, edição por pessoa e origem.

### Tests for User Story 5 ⚠️

- [ ] T038 [P] [US5] `apps/api/test/integration/011-us5-review.spec.ts`: aprovar DRAFT AI →
  APPROVED com revisor e data, `human_reviewed`, proposta fechada APPROVE e a rota de decisão da
  006 recusa APPROVE (`409 AI_PROPOSAL_APPLY_REQUIRED`); editar antes marca `human_edited` e mantém
  a origem; acrescentar a 11ª e remover a última recusados; edição que quebra regra recusada e o
  trabalho fica como estava; editar APPROVED revalida, audita e continua APPROVED; ARCHIVED não
  edita nem aprova (409); aprovação com código sem casos de teste devolve o aviso na visão;
  nenhuma execução deixa trabalho APPROVED; questão com linguagem desativada depois continua
  editável sem trocar a linguagem; nova revisão da ementa confirmada não muda os tópicos do
  trabalho; a proposta fecha APPROVE sem questão gerada removida e APPROVE_PARTIALLY com os itens
  que sobraram; auditoria `work.edited` (campos, contagem mudou,
  reordenado) e `work.approved` (`011/US5-1`…`011/US5-5`, `011/US5-7`, `011/FR-014`…`011/FR-017`,
  `011/SC-006`).
- [ ] T039 [P] [US5] `apps/api/test/integration/011-us2-recalculation.spec.ts`: trabalho de 0,50
  com 3 questões; acrescentar a 4ª (0,13 · 0,13 · 0,12 · 0,12), remover uma (0,25 · 0,25),
  reordenar (o centésimo extra segue a posição) e mudar a nota → valores regravados e soma igual à
  nota (`011/US2-4`, `011/FR-012`).
- [ ] T039a [P] [US5] `apps/api/test/integration/011-sc003-boundaries.spec.ts`: a tabela de
  fronteiras de SC-003 repetida pelos três caminhos — `POST /works`, `PUT /works/:id` e a resposta
  simulada da IA: 0/1/10/11 questões; 2/3/5/6 alternativas; 0/1/2 corretas; 0/3/4 pegadinhas e
  pegadinhas acima da MC (só IA); tópico inexistente, de outra disciplina ou de outro professor;
  cada recusa sem gravar nada e, na edição, o trabalho fica como estava (`011/SC-003`).
- [ ] T040 [P] [US5] `apps/api/test/security/011-concurrency.spec.ts`: duas edições ou aprovações
  simultâneas do mesmo trabalho → uma vale, a outra `409 WORK_VERSION_CONFLICT`; dois pedidos de
  geração iguais simultâneos → um pedido e um trabalho (`011/US5-6`).
- [ ] T041 [P] [US5] Linhas do `MATRIX`/`route-declarations` para `PUT /works/:id` e
  `POST /works/:id/approve`.

### Implementation for User Story 5

- [ ] T042 [US5] `works.service.ts`: `update` (trabalho inteiro: diff de questões por `id`, tipo
  imutável, reescrita de posições, tópicos, valores; `version`; `human_edited` em AI_GENERATED;
  ARCHIVED → 409) e `approve` (gabarito completo, revisor, data, no-op se já APPROVED);
  `apps/api/src/modules/work-ai/work-proposal-closer.ts` fecha a proposta por
  `AiProposalsService.decideWithin` na mesma transação, registrado no gancho
  `works/work-review.ts` (`WorkReview.register`, espelhando o `ExerciseBatchReview` da 010: a
  dependência vai de `work-ai` para `works`, nunca o contrário); auditorias `work.edited` e
  `work.approved`; rotas e `endpoints.ts`.
- [ ] T043 [P] [US5] Web `/trabalhos/[id]` (mesmo formulário carregado, selos "Gerado por IA",
  "Editado por você", "Pegadinha" com texto e ícone, "Aprovar" com a confirmação que lista os
  avisos, conflito de versão com mensagem e recarga); testes com axe e teclado.

---

## Phase 9: User Story 7 — Consultar e manter o Banco de Trabalhos (Priority: P2)

**Goal**: filtros, busca, paginação, arquivar e restaurar.

**Independent Test**: 60 trabalhos em várias disciplinas; filtrar por tópico e situação, buscar e
paginar só os do professor.

- [ ] T044 [P] [US7] `apps/api/test/integration/011-us7-bank.spec.ts`: cada filtro (disciplina,
  ementa, tópico, origem, situação, dificuldade, período) e combinações; "heranca" encontra
  "Herança"; arquivados só quando filtrados; cursor sem repetição nem buraco, página ≤ 50; arquivar
  DRAFT e APPROVED, restaurar para a situação anterior, no-op sem evento; arquivar um AI nunca
  aprovado fecha a proposta REJECT; 500 trabalhos numa disciplina e mais um aceito
  (`011/US7-1`…`011/US7-3`, `011/US7-5`, `011/FR-031`). O desempenho com 1 000 trabalhos (< 1 s)
  fica em `apps/api/test/security/011-performance.spec.ts` (`011/SC-009`).
- [ ] T045 [P] [US7] `apps/api/test/security/011-isolation.spec.ts`: área completa de A e B;
  toda rota de trabalhos e pedidos com a sessão de A sobre ids de B → 404; ADMIN, MANAGER e
  STUDENT → 403 em todas; conta ADMIN + TEACHER vê só o próprio banco (`011/US7-4`,
  `011/SC-008`).
- [ ] T046 [US7] `apps/api/src/modules/works/work-query.ts` (filtros, `EXISTS` em `work_topics`,
  `title_search_key LIKE`, keyset por `updated_at desc, id`), `archive`/`restore` com
  `archived_from_status`, auditorias `work.archived`/`work.restored`; rotas `GET /works`,
  `POST /works/:id/archive`, `POST /works/:id/restore`; linhas do `MATRIX` e de
  `route-declarations.spec.ts`.
- [ ] T047 [P] [US7] Web `/trabalhos` (filtros, busca, "Carregar mais", estado vazio, ações
  "Criar trabalho manualmente", "Criar trabalho com IA", "Pedidos de geração") e
  arquivar/restaurar em `/trabalhos/[id]` (`variant="danger"` com confirmação); testes.

---

## Phase 10: User Story 8 — Estratégias de correção e cálculo da nota do aluno (Priority: P2)

**Goal**: regras de correção puras, despachadas pela estratégia, prontas para a 012.

**Independent Test**: aplicar as regras a respostas simuladas de cada tipo, sem turma, entrega nem
modelo, e conferir nota por questão, nota do trabalho e pendências.

- [ ] T048 [P] [US8] `packages/contracts/src/works/grading.ts` (contracts/grading.md):
  `AnswerSchema`, `QuestionGradingSchema`, `WorkGradeSchema`, `GradingNatureSchema`,
  `PendingReasonSchema`; exportados; teste de forma em `packages/contracts/test/works.spec.ts`.
- [ ] T049 [P] [US8] Testes em `apps/api/src/modules/works/grading/*.spec.ts`: MC correta → valor,
  errada ou em branco → 0, sem porta; 0,50 × 10 com 9 e 8 acertos → 0,45 e 0,40; duas fontes
  diferentes `PASSED` → valor integral nas duas; o tipo de entrada de `testCases.grade` não tem
  campo de solução esperada (teste de tipo); `UNAVAILABLE`, `INFRA_ERROR` e sem casos →
  `PENDING_TEACHER`; sugestão 0,04 de 0,05 → `SUGGESTED` sem nota final, professor 0,05 → nota
  final 0,05; sugestão fora da faixa e falha → `PENDING_TEACHER`; nota do professor fora de 0…valor
  recusada; `computeWorkGrade` parcial sem contar zero e, por propriedade, sempre entre 0 e o
  total; o despachante não ramifica por tipo (varredura) (`011/US8-1`…`011/US8-7`,
  `011/SC-011`, `011/FR-036`…`011/FR-041`).
- [ ] T050 [US8] `apps/api/src/modules/works/grading/{strategy,registry,exact-match,test-cases,
  ai-review,decide,work-grade}.ts` e `UnavailableCodeRunner`; as portas `CodeRunnerPort` e
  `AiReviewPort` como interfaces; nenhuma rota, tabela ou chamada de modelo (`011/FR-042`).
- [ ] T051 [P] [US8] `apps/api/test/security/011-no-answer-key-route.spec.ts`: varredura do
  catálogo `endpoints.ts` — nenhuma rota da 011 acessível a STUDENT e nenhuma resposta de rota com
  `WorkTeacherViewSchema` sem `trabalhos.visualizar` (`011/US8-8`, `011/FR-035`).

---

## Phase 11: Evaluation & release gate of the generator

**Purpose**: conjunto de referência e portão de qualidade (constituição XIX, `011/FR-030`).

- [ ] T052 Conjunto de referência em `apps/api/test/fixtures/work-generation/`: casos fictícios
  (POO em Java com 3 tópicos e 10 questões mistas com 2 pegadinhas; SQL joins sem linguagem;
  listas em Python só código; tópico com injeção; 7 tópicos e 3 questões) com `expected.json`
  (pedido, termos-chave por tópico, padrões proibidos), `recorded.json` e o scorer puro com as
  métricas existentes (`schemaValidity`, `configMatch` incluindo tópicos por questão e cobertura,
  `duplicates`, `topicCoverage`, `injectionClean`); `apps/api/test/integration/011-evaluation.spec.ts`
  reproduz no CI (`011/SC-012`).
- [ ] T053 `apps/api/test/eval/work-generator.eval.ts` e script `eval:works` em
  `apps/api/package.json` com `EVAL_MODEL`, `EVAL_RECORD`, `EVAL_REPLAY` e a guarda de falhas de
  infraestrutura (como a 010), registrando a latência por caso e listando as pegadinhas para
  leitura humana na evidência (`011/SC-002`); README do conjunto.
- [ ] T054 **Etapa de liberação (custo de centavos; autorizada)**: rodar para `openai-basic`;
  se aprovado, acrescentar a aprovação de `work-generation` no catálogo e commitar a evidência em
  `apps/api/test/fixtures/evaluations/work-generation/`; o teste do portão
  (`009-quality-gate.spec.ts`) cobre a nova tarefa. Se o crédito faltar, registrar e seguir (a
  geração fica indisponível até a evidência).

---

## Phase 12: Polish & Cross-Cutting Concerns

- [ ] T055 [P] `apps/api/test/security/011-injection.spec.ts`: item da ementa com instruções para
  mudar quantidade, tipos, dificuldade, nota, linguagem, tópicos ou aprovar → o pedido e as regras
  não mudam; o texto chega só no bloco não confiável (`011/FR-026`).
- [ ] T056 [P] `test/helpers/journey.ts` e `secret-leak-scan.spec.ts`: a jornada cria um trabalho
  manual, gera outro, edita, aprova, arquiva e restaura; nenhum enunciado, gabarito, rubrica,
  solução, caso de teste ou texto da ementa nos logs, na auditoria ou em "Operação de IA".
- [ ] T057 [P] `apps/api/test/security/audit-coverage.spec.ts`: os 7 tipos `work.*` e
  `work_generation.*` cobertos, metadados só com ids, contagens, enums e códigos.
- [ ] T058 [P] E2E `apps/web/e2e/work-bank.spec.ts` (trabalho manual com os três tipos e valores
  0,17 · 0,17 · 0,16; trabalho gerado pela IA revisado e aprovado; "Ver como aluno") e
  `apps/web/e2e/openrouter-mock.ts` respondendo à geração de trabalhos com a fixture.
- [ ] T059 [P] SC-013: conferir por `git diff main -- apps/api/src/modules/exercises
  apps/api/src/modules/exercise-ai packages/contracts/src/exercises apps/web/features/exercises`
  que nada mudou e que as suítes `010-*` passam sem alteração.
- [ ] T060 [P] `apps/api/CLAUDE.md`: módulos `works`/`work-ai`, fábricas, fixtures, notas em
  centésimos e as regras de correção para a 012.
- [ ] T061 [P] `CLAUDE.md` da raiz: estado (011), arquitetura (`works` no contracts), guardas
  `011-*` e `works-boundary`, comando `eval:works`, agentes.
- [ ] T062 [P] `README.md`: fase 011, Banco de Trabalhos, etapa de liberação.
- [ ] T063 [P] `apps/web/design-system/` e testes de identidade se algum componente novo de base
  for criado (idealmente nenhum).
- [ ] T064 [P] Varredura administrativa (`006-ai-admin-scan.spec.ts`) com o agente e a tarefa
  novos em "Operação de IA" (sem conteúdo de trabalho).
- [ ] T065 Rodar o `quickstart.md` §1 e corrigir divergências.
- [ ] T066 Revisar `specs/011-work-bank/spec.md` × implementação (Assumptions e decisões de
  implementação registradas no research).
- [ ] T067 Acrescentar a 011 ao `SPECS` de `apps/api/test/traceability.spec.ts` (8 histórias,
  cenários do spec, `rows: 0`, `successCriteria` SC-001–SC-013) e cobrir ids faltantes.
- [ ] T068 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e
  `pnpm --filter web test:e2e` verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia todas as histórias.
- **US1 (Phase 3)**: depende da Foundational — MVP.
- **US2 (Phase 4)**: depende da US1 (criação grava valores).
- **US6 (Phase 5)**: depende da Foundational (T011) e de `GET /works/:id` (T018).
- **US3 (Phase 6)**: depende da Foundational; usa os valores da US2.
- **US4 (Phase 7)**: depende da US3 (build e runner).
- **US5 (Phase 8)**: depende da US1 (edição) e da US3 (aprovação de trabalho gerado e proposta).
- **US7 (Phase 9)**: depende da US1; pode correr em paralelo com US3–US5.
- **US8 (Phase 10)**: depende só da Foundational; pode correr em paralelo com qualquer história.
- **Evaluation (Phase 11)**: depende da US4.
- **Polish (Phase 12)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `works.service.ts` é tocado por T017, T022, T042 e T046; `works.controller.ts` por T018, T025,
  T042 e T046; `packages/contracts/src/endpoints.ts` por T018, T025, T032, T042 e T046:
  sequenciais.

### Parallel Opportunities

- Setup: T002–T005 em paralelo depois da T001.
- Foundational: T007–T010, T012 e T014 em paralelo depois da T006.
- US1: T015, T016 em paralelo; T019 e T020 em paralelo com T017–T018.
- US6: T024 e T026 em paralelo.
- US3: T027–T030 em paralelo; T034 em paralelo com T031–T033.
- US4: T035 e T036 em paralelo.
- US5: T038–T041 e T039a em paralelo; T043 em paralelo com T042.
- US7 em paralelo com US3–US5 (coordenar o serviço e o controller).
- US8 inteira em paralelo com US1–US7 (arquivos próprios em `works/grading/`).

## Parallel Example: User Story 3

```text
Task: "T027 011-us3-generation.spec.ts"
Task: "T028 011-no-model-choice.spec.ts"
Task: "T029 011-tool-scope.spec.ts"
Task: "T030 MATRIX rows for the generation routes"
# depois
Task: "T031 agent/task/tool"  →  "T032 requests service"  →  "T033 build + materialize"
Task: "T034 web /trabalhos/gerar + pedidos"   # em paralelo
```

## Parallel Example: User Story 8

```text
Task: "T048 grading contracts"
Task: "T049 grading specs (simulated answers, fake ports)"
Task: "T051 no answer-key route scan"
# depois
Task: "T050 grading strategies, registry, UnavailableCodeRunner"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Setup + Foundational.
2. US1: banco manual funcionando, sem IA → validar e demonstrar.
3. US2: valores com soma exata garantidos pela rota e pelo banco.
4. US6: visão do aluno garantida.

### Incremental Delivery

1. US3 (geração) → US4 (validação) → US5 (revisão e aprovação): a geração completa, ainda
   indisponível em produção até a etapa de liberação (Phase 11).
2. US7 (consulta, arquivar, restaurar) quando houver volume.
3. US8 (regras de correção) a qualquer momento depois da Foundational; a 012 depende dela.
4. Polish: jornada, varreduras, E2E, documentação e traceability.
