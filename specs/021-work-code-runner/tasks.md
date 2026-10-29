---

description: "Task list for 021 — Code Runner nos Trabalhos: o professor permite executar ao aplicar o trabalho, o aluno executa nas questões de Código (também no modo controlado) e o professor vê o resumo das execuções na correção"
---

# Tasks: 021 — Code Runner nos Trabalhos

**Input**: os documentos de design em `/specs/021-work-code-runner/`.
**Prerequisites**:
- plan.md, spec.md, research.md (Y1–Y13) e data-model.md;
- contracts/: http-api, permissions, audit-events e web-ui;
- quickstart.md;
- constituição v3.5.0; o Code Runner da 019 (worker, `FakeSandbox`, `test/helpers/code-runs.ts`).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-009).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 021 com prefixo
  (`021/US1-3`, `021/FR-006`, `021/SC-004`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`021/US4-1`…`021/US4-7`), cada cenário ganha o seu próprio `it`.
- **Relógio**: `FixedClock` nos testes de prazo, de pausa e da limpeza de 24 h; execuções criadas no
  mesmo instante empatam em `created_at` (avance o relógio entre elas quando a ordem importa).
- **Sem Docker**: os testes da API usam o worker em processo com `FakeSandbox` (019); `test:sandbox`
  não muda.
- **Auditoria**: mudança de metadados exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no `MATRIX`
  de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Fronteiras**: os módulos de atividades não importam `code-runs` (`activities-boundary.spec.ts`);
  `code-runner-boundary.spec.ts` continua verde; nenhuma auditoria, log ou resposta ao professor leva
  código, entrada, saída, stderr ou mensagem do compilador.
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: migração, contratos, elegibilidade pura, campo do loader e fixtures.
- **US2** (professor liga a opção) vem antes da **US1** (aluno executa), porque a execução num trabalho
  só existe com a opção; as duas são P1.
- **US4** (regras de pausa, prazo e entrega) depende da US1.
- **US3** (resumo na correção) depende da US1 e pode andar junto com a US4.
- **MVP**: US2 + US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: os contratos que todas as histórias usam.

- [X] T001 [P] Contratos em `packages/contracts/src/` (contracts/http-api.md, research Y10):
  - `activities/teacher.ts`: `codeExecution: z.boolean().default(false)` em
    `CreateAssignmentRequestSchema`; `codeExecution: z.boolean().optional()` em
    `UpdateActivityRequestSchema` (comentário: ASSIGNMENT only, 015/FR-002); `codeExecution: z.boolean()`
    em `TeacherActivitySummarySchema` e `TeacherActivitySchema`;
  - `works/works.ts`: `runnableCodeQuestionCount: z.int().min(0)` em `WorkSummarySchema`;
  - `code-runs/review.ts` (novo): `AttemptCodeRunSummarySchema` (`questions[]` com `questionId`,
    `runCount`, `pending`, `lastFinished` nulo ou `{ status: COMPLETED|FAILED, failureReason, outcome,
    publicCaseCount, passedCount, finishedAt, cases: { position, verdict }[] }`), reusando os enums de
    `code-runs`;
  - `code-runs/availability.ts` (novo): `CodeRunnerAvailabilitySchema` `{ available: boolean }`;
  - código de erro `CODE_EXECUTION_NOT_ELIGIBLE` onde ficam os códigos;
  - exportar em `index.ts`; testes em `packages/contracts/test/code-runs.spec.ts` (ou o arquivo de
    `activities`): `codeExecution` recusado nos corpos estritos de EXERCISE e EXAM, padrão `false` no
    ASSIGNMENT, `AttemptCodeRunSummarySchema` sem nenhuma chave de conteúdo (`sourceCode`, `stdout`,
    `stderr`, `compileOutput`, `input`, `expectedOutput`); `boundary.spec.ts` e `duplication.spec.ts`
    verdes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, elegibilidade, loader e fixtures. ⚠️ Nenhuma história começa antes desta fase.

- [X] T002 Teste primeiro: `apps/api/test/integration/021-schema.spec.ts` (data-model.md, research Y5):
  - `class_activities.code_execution_allowed` padrão `false`; `true` num EXERCISE ou EXAM →
    `check_violation`; `true` num ASSIGNMENT aceito;
  - mudar `code_execution_allowed` com uma tentativa na atividade → erro; sem tentativa → aceito;
  - inserir `code_runs` numa questão CODE de ASSIGNMENT sem a opção → erro; com a opção → aceito; de
    EXAM → erro; de EXERCISE → aceito (019 inalterada);
  - inserir `code_runs` com uma pausa aberta da tentativa numa atividade ACTIVE → erro; com a pausa
    liberada → aceito; o UPDATE do worker (claim e resultado) numa execução de tentativa pausada →
    aceito.
- [X] T003 Migração `apps/api/prisma/migrations/<ts>_work_code_runner/migration.sql` e
  `apps/api/prisma/schema.prisma` (`ClassActivity.codeExecutionAllowed`), com T002 verde ao final: a
  coluna, o CHECK, o gatilho `class_activities_code_execution_fixed`, `code_runs_insert_valid`
  substituído e `code_runs_paused` (reusa `attempt_paused_writes()` da 016). Na mesma tarefa,
  `createActivity` de `apps/api/test/helpers/activities.ts` aceita `codeExecutionAllowed`.
- [X] T004 [P] Elegibilidade pura (research Y2) com teste:
  `apps/api/src/modules/activities/code-execution.ts` + `code-execution.spec.ts` (`021/FR-001`):
  `codeExecutionEligible(questions)` verdadeiro só com uma questão CODE com ao menos um caso PUBLIC e
  linguagem com `execution`; casos: sem CODE, CODE só com PRIVATE, CODE de C++ (sem execução), CODE
  de Python com PUBLIC, mistura. Sem imports de `code-runs`.
- [X] T005 [P] `OwnAttemptContext.codeExecutionAllowed` em
  `apps/api/src/modules/student-activities/student-activity-loader.ts` (lido com o resto da atividade);
  `codeExecutionAllowed` no select de `apps/api/src/modules/activities/activity-query.ts` e
  `codeExecution` em `views/teacher-view.ts` (sempre `false` para EXERCISE e EXAM).
- [X] T006 [P] Fixtures: `createCodeWork(t, schoolClass, { languageKey, testCases, codeExecutionAllowed,
  executionMode, latePolicy, releaseMode })` em `apps/api/test/helpers/code-runs.ts` — um ASSIGNMENT com
  uma questão CODE (`DOUBLE_CASES`, o caso PRIVATE com `PRIVATE_RUN_MARKER`) e uma de Múltipla escolha,
  sobre `createActivity`; reusa `seedHeartbeat`, `createRunWorker`, `drainRuns`, `requestRun`.
- [X] T007 Acrescentar `021` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do CLAUDE.md):
  `stories: 4`, `scenarios: 26`, `rows: 0`, `successCriteria: sc(1, 9)` e
  `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-009"] }`. Cada história sai de
  `pending` na tarefa que escreve o último teste dela, cada SC quando o teste que o cita entra; ao fim
  da T027, `pending` está vazio.

**Checkpoint**: migração aplicada, elegibilidade e fixtures prontas; nada muda para o aluno ainda.

---

## Phase 3: User Story 2 — Professor decide se o Trabalho permite executar (Priority: P1) 🎯 MVP

**Goal**: ao aplicar um Trabalho elegível, o professor liga "Permitir executar o código"; pode mudar até
o primeiro aluno iniciar.

**Independent Test**: aplicar o mesmo trabalho com e sem a opção; conferir o campo na atividade; mudar
depois do primeiro início e ver `409 ACTIVITY_ALREADY_STARTED`.

### Tests for User Story 2 ⚠️

- [X] T008 [P] [US2] `apps/api/test/integration/021-us2-option.spec.ts`: `021/US2-1` (trabalho elegível
  aplicado sem o campo → `codeExecution: false`; com `true` → `true` na lista e no detalhe; `WorkSummary`
  com `runnableCodeQuestionCount` 1), `021/US2-2` (trabalho sem CODE, CODE só PRIVATE ou em C++ →
  `runnableCodeQuestionCount` 0 e `true` → `422 CODE_EXECUTION_NOT_ELIGIBLE`, nada gravado),
  `021/US2-3` (`activity.published` com `codeExecution`), `021/US2-4` (PATCH antes do início → aceito e
  `activity.settings_changed` com `codeExecution`; depois do primeiro início → `409
  ACTIVITY_ALREADY_STARTED`; PATCH com `true` num snapshot não elegível → 422), `021/US2-5` (corpo de
  EXERCISE ou EXAM com `codeExecution` → 400; PATCH de EXERCISE com `codeExecution` → 400),
  `021/US2-6` (sem heartbeat ou com `CODE_RUNNER_ENABLED=false`: a aplicação com `true` é aceita;
  `GET /code-runner/availability` → `{ available: false }`; com heartbeat → `true`), `021/FR-003`
  (atividade criada sem a coluna explícita fica `false`).
- [X] T008a [P] [US2] `apps/api/test/security/021-concurrency.spec.ts` (`021/FR-002`): 10 rodadas de
  `PATCH { codeExecution: true }` e `POST …/attempt` do primeiro aluno ao mesmo tempo; em cada rodada,
  ou o PATCH entra e o início vê a opção ligada, ou o PATCH responde `409 ACTIVITY_ALREADY_STARTED` e a
  coluna fica igual — nunca a coluna muda com uma tentativa já gravada (o gatilho de T003 recusa).
  Também 10 `POST …/code-runs` simultâneos do mesmo aluno num trabalho → uma só execução pendente.
- [X] T009 [P] [US2] Web, testes primeiro em `apps/web/features/activities/components/new-activity.test.tsx`
  e `activity-detail.test.tsx` (`021/US2-1`, `021/US2-2`, `021/US2-4`, `021/US2-6`): a opção aparece
  desmarcada só com `runnableCodeQuestionCount > 0`, com o texto de contracts/web-ui.md; o corpo envia
  `codeExecution`; o aviso de indisponível quando `available: false` com a opção ainda marcável; no
  detalhe, "Execução de código: permitida" e a opção travada depois do início (o texto de
  `WORK_OPTIONS_LOCKED`); a mensagem de `CODE_EXECUTION_NOT_ELIGIBLE`; `vitest-axe` e teclado.

### Implementation for User Story 2

- [X] T010 [US2] API:
  - `apps/api/src/modules/activities/activities.service.ts`: `codeExecution` em `WorkOptions` (apply e
    update), checado com `codeExecutionEligible` sobre o snapshot (422), junto das opções da 015
    (`optionsChanged`, `ACTIVITY_ALREADY_STARTED`, `activity.settings_changed`), `activity.published`
    com `codeExecution`; `write-snapshot.ts` grava a coluna;
  - `apps/api/src/modules/works/work-query.ts` + a view da lista (`WorkSummary`): `runnableCodeQuestionCount`
    pela regra da Y2 (o detalhe `WorkTeacherView` não muda);
  - `GET /code-runner/availability` (`atividades.aplicar`) em
    `apps/api/src/modules/code-runs/availability.controller.ts`, de `RunnerAvailability.state`;
  - catálogo de endpoints, `MATRIX`, `route-declarations.spec.ts`, metadados em
    `audit-event-types.ts` + `contracts/audit-events.md` + `journey.ts`; T008 verde.
- [X] T011 [US2] Web: `apps/web/features/activities/components/work-options.tsx` (a opção, o texto e o
  aviso), `new-activity.tsx` (envia `codeExecution`), `activity-detail.tsx` e `class-activities.tsx`
  (badge com texto), hook `useCodeRunnerAvailability` em `apps/web/features/code-run/{api,hooks}/`,
  textos em `features/activities/schemas/`, `CODE_EXECUTION_NOT_ELIGIBLE` em
  `apps/web/lib/messages/error-messages.ts`; T009 verde. `021/US2` sai de `pending`.

**Checkpoint**: o professor liga e desliga a opção; o aluno ainda não executa num trabalho.

---

## Phase 4: User Story 1 — Aluno executa numa questão de Código do Trabalho (Priority: P1) 🎯 MVP

**Goal**: com a opção ligada, "Executar" nas questões de Código elegíveis do trabalho, igual à 019,
também na tela de foco.

**Independent Test**: um trabalho de Python com 2 casos públicos e 1 privado e a opção ligada; o aluno
executa um programa certo, um errado e um com erro de sintaxe; nenhum caso privado; a entrega segue a
012.

### Tests for User Story 1 ⚠️

- [ ] T012 [P] [US1] `apps/api/test/integration/021-us1-run-work.spec.ts`: `021/US1-1` (a visão do aluno
  traz `execution` AVAILABLE na questão CODE com heartbeat; `NO_PUBLIC_CASES`/`NOT_SUPPORTED` como na
  019), `021/US1-2` (programa certo → 2 de 2; saída diferente; erro de compilação; tempo esgotado, pelo
  worker em processo), `021/US1-4` (execuções feitas e entrega: a resposta entregue é a salva, a
  correção e a liberação da 012 iguais), `021/US1-5` (trabalho sem a opção: `execution` nulo nas
  questões CODE e `POST …/code-runs` → 404 sem linha; EXAM → 404), `021/US1-6` (trabalho CONTROLLED
  com a opção: a execução é aceita e nenhum evento de `attempt_integrity_events` é criado por ela),
  `021/FR-010` (execução pendente num Exercício → o pedido no Trabalho devolve a pendente; as 10 por
  minuto contam as duas atividades), `code_run.requested` com `activityType: "ASSIGNMENT"`.
- [ ] T013 [P] [US1] `apps/api/test/security/021-private-cases.spec.ts` (`021/US1-3`, `021/SC-002`):
  `PRIVATE_RUN_MARKER` e `MARCADOR-PRIVADO-012` fora de toda resposta ao aluno de um trabalho com a
  opção (atividade, questão, criar, `latest`, `get`), sem contagem de casos privados.
- [ ] T014 [P] [US1] Web, testes primeiro em
  `apps/web/features/student-activities/components/activity-answering.test.tsx` e no teste da tela de
  foco de `features/controlled-attempt` (`021/US1-1`, `021/US1-5`, `021/US1-6`, `021/US1-7`,
  `021/SC-008`): `CodeRunPanel` numa questão CODE de trabalho com `execution`, nenhum painel nem aviso
  com `execution` nulo; na tela de foco o painel aparece e o resultado fica nela; copiar do resultado é
  bloqueado; aviso de versão anterior; teclado e `vitest-axe`.

### Implementation for User Story 1

- [ ] T015 [US1] API:
  - `apps/api/src/modules/activities/views/student-view.ts`: `executionOf` também para um ASSIGNMENT
    com `codeExecutionAllowed` (research Y9);
  - `apps/api/src/modules/code-runs/code-runs.service.ts`: `runnableQuestion` aceita EXERCISE ou
    ASSIGNMENT com a opção (EXAM e trabalho sem a opção → `OutOfContext`), `code_run.requested` com
    `activityType` (e `code_run.requested` sai de `PENDING_CHANGED_021` em `audit-coverage.spec.ts`); T012 e
    T013 verdes, e o `it.skip` de `021/FR-010` em `test/security/021-concurrency.spec.ts` (T008a) ativado.
- [ ] T016 [US1] Web: em `apps/web/features/student-activities/components/activity-answering.tsx`, montar
  `CodeRunPanel` com `question.type === "CODE" && question.execution && editable` (comentário 021); T014
  verde. `021/US1` sai de `pending`.

**Checkpoint**: MVP — o professor permite e o aluno executa num trabalho, normal ou controlado.

---

## Phase 5: User Story 4 — A execução respeita a tentativa, a pausa e o prazo (Priority: P2)

**Goal**: nada executa com a tentativa pausada, entregue, fora do prazo sem atraso aceito ou com a
atividade encerrada; o trabalho funciona sem o Code Runner.

**Independent Test**: pausar e executar (409), liberar o retorno e executar (aceito), entregar e
executar (409), desligar a execução e entregar normalmente.

### Tests for User Story 4 ⚠️

- [ ] T017 [P] [US4] `apps/api/test/integration/021-us4-rules.spec.ts`: `021/US4-1` (pausa aberta →
  `POST` 409 `ATTEMPT_PAUSED` sem linha e `attempt_pause.write_refused` com `operation: "CODE_RUN"`;
  `latest` e `get` → 409 `ATTEMPT_PAUSED`; liberada → aceito), `021/US4-2` (sem tentativa ou entregue →
  409 `ATTEMPT_NOT_IN_PROGRESS`; `latest` → `{ run: null }`, `get` → 404), `021/US4-3` (com
  `FixedClock`: prazo passado em REJECT → o código do salvamento; em ACCEPT_AND_MARK com a tentativa
  aberta → aceito), `021/US4-4` (atividade encerrada ou cancelada, aluno não marcado presente → 404 e
  `student_access.denied`), `021/US4-5` (pendente única e limite compartilhados com Exercício),
  `021/US4-6` (`CODE_RUNNER_ENABLED=false` ou sem heartbeat: `execution` UNAVAILABLE, salvar, ajuda,
  pausa e entrega da 012/015/016 funcionando), `021/US4-7` (execução pendente quando a tentativa é
  pausada, entregue ou a atividade encerrada: o worker termina num estado final e a tentativa, a
  resposta e a pausa ficam iguais).
- [ ] T018 [P] [US4] `apps/api/test/security/021-refusals.spec.ts` (`021/SC-004`): a matriz inteira
  (sem a opção, EXAM, pausada, entregue, prazo REJECT, encerrada, cancelada, outra turma) → recusado e
  `code_runs` sem linha nova; `021/SC-007`: com a execução desligada, os fluxos do trabalho (responder,
  salvar, CONTROLLED, ajuda da IA, chamada e pausa, entregar, corrigir, liberar) verdes num só roteiro.

### Implementation for User Story 4

- [ ] T019 [US4] `apps/api/src/modules/code-runs/code-runs.service.ts` (research Y4, Y6): para um
  ASSIGNMENT, depois da checagem da tentativa, `AttemptPaused` → 409 com `attempt_pause.write_refused`
  (`operation: "CODE_RUN"`) depois do rollback, e `decideOperation("SAVE", …)` da 012 com
  `saveFactsOf(context, now)`, movido de `work-help/work-help.service.ts` para
  `apps/api/src/modules/student-activities/save-facts.ts` (puro, ao lado do loader); `work-help` e
  `code-runs` importam de lá e `work-help` mantém o comportamento (suítes 015 verdes); `latest`/`get` de execução de trabalho só com a tentativa aberta e sem pausa; metadados
  `operation: "CODE_RUN"` em `audit-event-types.ts` + `contracts/audit-events.md` + `journey.ts`; T017 e
  T018 verdes. `021/US4` sai de `pending`.

**Checkpoint**: a execução nunca contorna a 012, a 015 ou a 016.

---

## Phase 6: User Story 3 — Professor vê o resumo das execuções na correção (Priority: P2)

**Goal**: na tentativa do aluno, cada questão de Código mostra quantas execuções e os vereditos da
última, sem conteúdo, iguais depois da limpeza de 24 h.

**Independent Test**: um aluno executa 3 vezes (a última 1 de 2) e entrega; o professor vê "3
execuções" e os vereditos; depois do job `code-run-content`, o mesmo resumo.

### Tests for User Story 3 ⚠️

- [ ] T020 [P] [US3] `apps/api/test/integration/021-us3-summary.spec.ts`: `021/US3-1` (3 execuções, a
  última EXECUTED 1 de 2 → `runCount` 3, `lastFinished` com os vereditos por posição e `finishedAt`),
  `021/US3-2` (última com erro de compilação → `outcome` COMPILATION_ERROR sem casos; última FAILED →
  `failureReason`), `021/US3-3` (nenhuma → `runCount` 0, `lastFinished` nulo), `021/US3-4` (com
  `FixedClock`, depois do job `code-run-content`: resposta idêntica; nenhuma chave de conteúdo),
  `021/US3-5` (trabalho sem a opção, EXERCISE ou EXAM → 404), `021/US3-6` (a correção da 012 não muda:
  nenhuma nota sugerida), `pending` verdadeiro com uma execução na fila e a última terminada mostrada.
- [ ] T021 [P] [US3] `apps/api/test/security/021-isolation.spec.ts`: o resumo de outra turma (professor
  B) → 404; tentativa de outra atividade → 404; STUDENT, MANAGER e ADMIN → 403;
  `021/SC-005` (o número e os vereditos que o aluno viu em `latest` são os do resumo, antes e depois
  da limpeza).
- [ ] T022 [P] [US3] Web, testes primeiro em `apps/web/features/code-run/components/code-run-summary.test.tsx`
  e `apps/web/features/activities/components/attempt-review.test.tsx` (`021/US3-1`…`021/US3-5`,
  `021/SC-006`): "Nenhuma execução", "n execuções", "Última execução: p de m casos públicos passaram",
  "Caso k: <veredito>", erro de compilação, não foi possível executar, "Uma execução em andamento", a
  nota de que não muda a nota; montado só com `codeExecution`; nenhum código ou saída na tela;
  `vitest-axe`.

### Implementation for User Story 3

- [ ] T023 [US3] API: `apps/api/src/modules/code-runs/code-run-review.{service,controller}.ts` e
  `views/teacher-run-summary.ts` (allowlist), `GET /classes/:classId/activities/:activityId/attempts/:attemptId/code-runs`
  (`entregas.visualizar`) com `ClassContextPolicy`, `settleStaleRuns` do aluno antes, uma consulta para
  as contagens e a última terminada por questão (research Y7, Y8); catálogo de endpoints, `MATRIX`,
  `route-declarations.spec.ts`, e a rota sai de `pending021` em `test/security/019-boundaries.spec.ts`; T020 e T021 verdes.
- [ ] T024 [US3] Web: `apps/web/features/code-run/{api,hooks/use-attempt-code-runs.ts,components/code-run-summary.tsx}`
  e a montagem em `apps/web/features/activities/components/attempt-review.tsx` em cada questão CODE
  quando `activity.codeExecution`; textos em `features/code-run/schemas/`; T022 verde. `021/US3` sai de
  `pending`.

**Checkpoint**: as quatro histórias funcionando de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 Invariância, auditoria e desempenho:
  - `apps/api/test/security/021-invariance.spec.ts` (`021/SC-003`): dois alunos com as mesmas respostas,
    um com 0 e outro com 50 execuções → entrega, correção, nota e liberação idênticas;
  - `021-audit.spec.ts` + `secret-leak-scan.spec.ts` (`021/SC-009`): o journey executa num trabalho
    (executado, erro de compilação, limitado por taxa, recusado por pausa) com `MARCADOR-CODIGO-021` no
    programa, no caso e na saída, fora de auditoria e logs; `audit-coverage.spec.ts` verde;
  - `021-performance.spec.ts` (`021/SC-001` na parte da API): criar execução num trabalho p95 < 150 ms;
    resumo de 10 questões e 200 execuções p95 < 150 ms (o tempo do programa é o do `test:sandbox` da
    019).
- [ ] T026 [P] XSS e E2E: `apps/web/test/student-portal-xss.test.tsx` com saída contendo HTML num trabalho
  e no resumo; E2E `apps/web/e2e/work-code-runner.spec.ts` (`021/SC-001`, `021/SC-006`, `021/SC-008`:
  professor aplica com a opção, aluno executa pelo teclado na tela normal e na de foco, pausa e retorno,
  entrega, professor vê o resumo) — a redefinição do banco E2E pede consentimento do usuário.
- [ ] T027 Documentação e fechamento: `CLAUDE.md` (Project state com a 021, regra fácil de errar do Code
  Runner nos trabalhos), `apps/api/CLAUDE.md` (`createCodeWork`, a rota do resumo, as suítes 021),
  `apps/web/CLAUDE.md` (painel em qualquer CODE com `execution`, `CodeRunSummary`), `README.md` (fase 021
  e a linha da spec), `docs/deploy/code-runner.md` (trabalhos também executam); rodar o
  `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types && pnpm test`; `pending` do `SPECS`
  021 vazio.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001) → Foundational (T002–T007) → histórias.
- **US2 (T008–T011, com T008a)**: depende da Foundational.
- **US1 (T012–T016)**: depende da US2 (a opção existe e é gravada).
- **US4 (T017–T019)**: depende da US1 (as rotas aceitam trabalhos).
- **US3 (T020–T024)**: depende da US1; pode andar junto com a US4 (arquivos diferentes, exceto
  `code-runs.service.ts`, que só a US4 muda nessa fase).
- **Polish (T025–T027)**: depois de todas.
- **Dentro de cada história**: testes → API → web.

## Parallel Opportunities

- **Foundational**: T004, T005 e T006 em paralelo depois da T003.
- **US2**: T008, T008a e T009 juntos.
- **US1**: T012, T013 e T014 juntos; T016 depois da T015 (a visão traz `execution`).
- **US4 e US3**: em paralelo; dentro da US3, T020, T021 e T022 juntos.
- **Polish**: T025 e T026 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US2 + US1: o professor permite e o aluno executa num trabalho.
2. **Incremento 2**: US4 (as regras de pausa, prazo e entrega fechadas no servidor e no banco).
3. **Incremento 3**: US3 (o resumo na correção).
4. **Incremento 4**: Polish (invariância, auditoria, E2E, documentação).
