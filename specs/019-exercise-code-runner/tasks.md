---

description: "Task list for 019 — Code Runner nos Exercícios (primeira etapa): casos de teste no banco de exercícios, \"Executar\" contra os casos públicos num worker separado com containers isolados, sem mudar pontos nem conclusão"
---

# Tasks: 019 — Code Runner nos Exercícios (primeira etapa)

**Input**: os documentos de design em `/specs/019-exercise-code-runner/`.
**Prerequisites**:
- plan.md, spec.md, research.md (B1–B17) e data-model.md;
- contracts/: http-api, permissions, audit-events, configuration, sandbox e web-ui;
- quickstart.md;
- constituição v3.5.0.

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-008).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 019 com prefixo
  (`019/US1-4`, `019/FR-012`, `019/SC-003`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`019/US1-1`…`019/US1-10`), cada cenário ganha o seu próprio `it`.
- **Sandbox**: a suíte normal (`pnpm test`, CI) usa o `FakeSandbox`; o Docker real só entra em
  `pnpm --filter api test:sandbox` (`apps/api/test/sandbox/`) e no E2E.
- **Relógio**: injetado (`FixedClock`) em todo teste de prazo da fila, lease, heartbeat e retenção.
- **Exercícios, trabalhos e provas não mudam**: toda suíte 010–018 continua passando; os guardas
  de "nada é executado" de `works-boundary`, `activities-boundary` e `exams-boundary` não mudam.
- **Tipo de auditoria novo**: exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no
  `MATRIX` de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Isolamento** (research B15): a API nunca importa `apps/api/src/code-runner/**`;
  `child_process` só em `code-runner/sandbox/docker-sandbox.ts`; `code-runs` não importa correção,
  pontos, ranking nem submissão; nenhuma auditoria ou log leva código, entrada ou saída.
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: spike do sandbox, migração, permissão, contratos, regras puras, porta do
  sandbox e esqueletos.
- **US2** (casos de teste no banco) vem antes da **US1** (executar), porque sem casos não há o
  que executar; as duas são P1.
- **US3** (limites, disponibilidade, falhas e o sandbox endurecido) depende da US1.
- **US4** (linguagens do catálogo) depende da US1 e pode andar junto com a US3.
- **MVP**: US2 + US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: medir o sandbox antes de construir sobre ele, configuração, códigos de erro e
contratos.

- [X] T001 Spike do sandbox (research B1, B3, B4; plan "Performance Goals"): script descartável em
  `apps/api/scripts/code-runner-spike.ts` (fora do build, removido no fim da tarefa) que, com as
  três imagens de `contracts/sandbox.md` e as flags de B3, mede no Docker Desktop: início de um
  container, checagem/compilação, um caso, e uma execução de 5 casos por linguagem; confere que o
  prelúdio `sh` com `head -c` entrega o programa e a entrada certos e que `--read-only` + tmpfs
  `/tmp` bastam para o Java (`javac` + tar). Registrar os tempos medidos e os digests escolhidos
  numa nota "Spike (data)" ao fim de `research.md` B4. Se a SC-001 não couber, parar e reabrir a
  decisão B1 com o usuário antes da T002.
- [X] T002 [P] Configuração (contracts/configuration.md) em
  `apps/api/src/platform/config/config.schema.ts` e `apps/api/.env.example`:
  `CODE_RUNNER_ENABLED`, `RATE_LIMIT_CODE_RUNS_PER_MINUTE` (10), `CODE_RUN_QUEUE_DEADLINE_SECONDS`
  (60), `CODE_RUNNER_STALE_SECONDS` (15), `CODE_RUN_CONTENT_RETENTION_HOURS` (24) e as do worker
  (`CODE_RUNNER_CONCURRENCY` 2, `CODE_RUNNER_POLL_MS` 500, `CODE_RUNNER_LEASE_SECONDS` 90,
  `CODE_RUNNER_DOCKER_RUNTIME` `runc`, `CODE_RUNNER_TIME_LIMIT_MS` 2000,
  `CODE_RUNNER_COMPILE_LIMIT_MS` 10000, `CODE_RUNNER_MEMORY_MB` 256,
  `CODE_RUNNER_OUTPUT_LIMIT_BYTES` 65536, `CODE_RUNNER_PIDS_LIMIT` 128); guarda de produção
  (`CODE_RUNNER_ENABLED` obrigatório; com ele `true`, `CODE_RUNNER_DOCKER_RUNTIME=runsc`, research
  B12). Testes de padrão, de recusa de não positivos e do guarda em
  `apps/api/test/integration/platform.spec.ts`; `testConfig()` com valores de teste.
- [X] T003 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts`, com o teste
  `apps/web/lib/messages/error-messages.test.ts`:

  | Código | Mensagem |
  |---|---|
  | `CODE_RUN_NOT_AVAILABLE` | "Este exercício não tem casos para executar." |
  | `CODE_RUNNER_UNAVAILABLE` | "Execução indisponível no momento. Você pode continuar respondendo e concluir normalmente." |
  | `SOURCE_TOO_LARGE` | "O código passou do tamanho máximo de 64 KB." |
  | `ATTEMPT_NOT_IN_PROGRESS` | "Comece ou refaça os exercícios para executar o código." (se ainda não existir no catálogo da 012) |
- [X] T004 [P] Criar `packages/contracts/src/code-runs/{enums,run,execution}.ts` (contracts/http-api.md):
  `CodeRunStatusSchema`, `CodeRunFailureReasonSchema`, `CodeRunOutcomeSchema`,
  `CodeRunVerdictSchema`, `ExecutionKeySchema` (`java`/`python`/`javascript`),
  `CreateCodeRunRequestSchema` (`sourceCode` de 0 a 65 536 bytes UTF-8, string vazia aceita — spec
  Edge Cases —, estrito), `CodeRunSchema`,
  `LatestCodeRunSchema`, `QuestionExecutionSchema` (`status`, `languageVersion`, `convention` como
  chave `JAVA_MAIN_CLASS`/`STDIN_STDOUT`, `limits`); constantes `CODE_RUN_MAX_SOURCE_BYTES`,
  `TEST_CASES_MAX = 20` (se já não exportada pela 011, reusar sem redefinir), `CODE_RUN_POLL_MS = 1000`.
  Exportar em `packages/contracts/src/index.ts`; testes em `packages/contracts/test/code-runs.spec.ts`
  (corpo estrito, limite de bytes com acentos, nenhum campo de caso privado ou id de caso em
  `CodeRunSchema`).
- [X] T005 Mudanças nos contratos existentes (research B16, B17):
  - `packages/contracts/src/exercises/`: `ExerciseTestCaseInputSchema` e `ExerciseTestCaseSchema`
    (sem importar `works`), `testCases` opcional (0–20) nos pedidos de criação, edição e `sets`;
    `TeacherExercise.testCases`; `ProgrammingLanguage.execution`;
  - `packages/contracts/src/activities/`: `execution: QuestionExecution | null` na questão do aluno;
  - testes nos `packages/contracts/test/*.spec.ts` correspondentes; `boundary.spec.ts` e
    `duplication.spec.ts` verdes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, permissão, regras puras, porta do sandbox e esqueletos. ⚠️ Nenhuma história
começa antes desta fase.

- [X] T006 Teste primeiro: `apps/api/test/integration/019-schema.spec.ts`, com as regras de
  `data-model.md`:
  - `programming_languages.execution`: CHECK e seed (`java`, `python`, `javascript`; as demais NULL);
  - `exercise_test_cases`: só exercício CODE, no máximo 20, posições sem lacuna, saída esperada não
    vazia, recusado em exercício ARCHIVED;
  - `code_runs`: um pendente por aluno (UNIQUE parcial); FKs compostas (questão ↔ atividade,
    tentativa ↔ atividade ↔ aluno); questão CODE; `failure_reason` sse FAILED, `outcome` e
    `passed_count` sse COMPLETED, `finished_at` sse final; transições só as do diagrama; linha final
    só aceita a purga (conteúdo → NULL + `content_purged_at`); sem DELETE;
  - `code_run_cases`: só caso PUBLIC da questão da execução; posição única; imutável exceto a purga;
  - `code_runner_heartbeats`: chave por worker.
- [X] T007 Migração `apps/api/prisma/migrations/<ts>_exercise_code_runner/migration.sql` e
  `apps/api/prisma/schema.prisma`, com T006 verde ao final: a coluna `execution` e o seed,
  `exercise_test_cases`, `code_runs`, `code_run_cases`, `code_runner_heartbeats`, os 4 enums, CHECKs,
  índices, gatilhos e o seed de `atividades.proprias.executar` → STUDENT (contracts/permissions.md).
  Na mesma tarefa: `resetDb` (`apps/api/test/helpers/`) apaga as tabelas novas na ordem certa;
  `domain-boundary.spec.ts` fixa os modelos novos.
- [X] T008 [P] Regras puras com testes (research B6, B7, B8):
  - `apps/api/src/modules/code-runs/compare-output.ts` + `compare-output.spec.ts` (`019/FR-012`):
    `\r\n` e `\r`; espaços e tabulações no fim da linha; linhas vazias no fim; diferença de
    maiúsculas, acentos, espaço interno e linha em branco no meio NÃO passam; saída vazia × esperada
    vazia; sem imports;
  - `apps/api/src/modules/code-runs/verdict.ts` + `verdict.spec.ts`: a tabela de B6 na ordem
    (tempo antes de saída, saída antes de memória, memória antes de erro de execução), saída 0 com
    saída de erro preenchida e saída igual → `PASSED`, `passedCount` e a contagem por veredito;
  - `apps/api/src/modules/code-runs/run-state.ts` + `run-state.spec.ts`: transições válidas e
    inválidas; `staleReason(run, now)` (`EXPIRED` por `deadline_at`, `INTERRUPTED` por
    `lease_until`), recebendo `now` do chamador.
- [X] T009 [P] Porta e perfis do sandbox (contracts/sandbox.md):
  `apps/api/src/code-runner/sandbox/sandbox.port.ts`, `fake-sandbox.ts` (resultados programáveis por
  caso, contagem de chamadas, falha simulada do daemon) e `apps/api/src/code-runner/profiles.ts`
  (digests da T001, rótulos de versão, comandos, convenção, o enquadramento do prelúdio) +
  `profiles.spec.ts` (comandos montados, enquadramento com bytes multibyte, nenhuma variável de
  ambiente do worker passada ao container, flags de B3 presentes, `--runtime` só quando configurado).
- [X] T010 [P] Esqueletos e guardas (research B15):
  - `apps/api/src/modules/code-runs/code-runs.module.ts` registrado no `AppModule`;
    `apps/api/src/code-runner/{main.ts,code-runner.module.ts}` (contexto Nest mínimo: config,
    Prisma, relógio, auditoria, logs; não registrado no `AppModule`);
  - scripts em `apps/api/package.json`: `code-runner:start` (`node --env-file-if-exists=.env
    dist/code-runner/main.js`), `code-runner:dev`, `code-runner:images` (puxa os digests de
    `profiles.ts`), `test:sandbox` (`vitest run test/sandbox`, excluído do `test` padrão em
    `vitest.config`); tarefa no `turbo.json` para o `pnpm dev` subir o worker;
  - `apps/api/test/code-runner-boundary.spec.ts` (novo): nada fora de `src/code-runner` o importa;
    `child_process` só em `docker-sandbox.ts`; `code-runs` sem `activities/submission`,
    `activities/grading`, `activities/results`, `ranking` ou pontos (`019/FR-008`); chamadas de
    auditoria e log de `code-runs`/`code-runner` sem `sourceCode`, `stdout`, `stderr`, `input`,
    `expectedOutput` ou `compileOutput`; controle de que cada varredura acha o padrão proibido.
- [X] T011 Acrescentar `019` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do CLAUDE.md):
  `stories: 4`, `scenarios: 24`, `rows: 0`, `successCriteria: sc(1, 8)` e
  `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-008"] }`. Cada história sai
  de `pending` na tarefa que escreve o último teste dela, cada SC quando o teste que o cita entra; ao
  fim da T040, `pending` está vazio.

**Checkpoint**: migração aplicada, regras puras, porta do sandbox e guardas verdes.

---

## Phase 3: User Story 2 — Professor cadastra casos de teste nos exercícios de Código (Priority: P1) 🎯 MVP

**Goal**: o exercício de Código do banco tem casos de teste, copiados para a atividade ao aplicar.

**Independent Test**: criar um exercício de JavaScript com 2 casos públicos e 1 privado, aprovar e
aplicar; editar os casos no banco e conferir que a atividade já aplicada não muda.

### Tests for User Story 2 ⚠️

- [X] T012 [P] [US2] `apps/api/test/integration/019-us2-test-cases.spec.ts`: `019/US2-1`…`019/US2-5`,
  `019/FR-001`…`019/FR-003` (0, 1, 20 e 21 casos; entrada vazia aceita; saída esperada vazia → 422
  `EXERCISE_RULES`/`TEST_CASE_EXPECTED_OUTPUT`; casos em Múltipla escolha → 422
  `EXERCISE_RULES`/`TEST_CASES_NOT_ALLOWED`; 21 casos → 400; edição de
  APPROVED continua APPROVED (010); `sets` com casos; snapshot copia na ordem e edição posterior não
  muda a atividade; exercício sem caso público aplicado normalmente; rascunho de "Criar com IA" sem
  casos e o agente intocado — nenhum campo novo na proposta da 010; auditoria com
  `testCaseCount`/`publicTestCaseCount`).
- [X] T013 [P] [US2] `apps/api/test/security/019-private-cases.spec.ts` (parte do banco e da visão,
  `019/FR-004`, `019/SC-002`): a visão do aluno da atividade (antes e depois de concluir) traz só
  `publicTestCases`; nenhuma chave, valor ou contagem de caso privado (procura o marcador
  `MARCADOR-PRIVADO-019` na entrada e na saída esperada em todo JSON do aluno); outro professor →
  404 nos casos do exercício.

### Implementation for User Story 2

- [X] T014 [US2] API do banco: regras de casos em `apps/api/src/modules/exercises/rules/` (violações
  da T012), serviço (`exercises.service.ts`: criar, editar e `sets` substituem os casos inteiros na
  mesma transação, com a `version` otimista da 010), visão do professor com `testCases`,
  `programming-languages.service.ts` com `execution`, metadados de auditoria
  (`contracts/audit-events.md` "Changed").
- [X] T015 [US2] Snapshot: `apps/api/src/modules/activities/snapshot/read-source.ts` lê os casos do
  exercício e `from-exercises.ts` os copia (no lugar de `testCases: []`); `snapshot.spec.ts` com o
  caso de exercício de código com casos.
- [X] T016 [P] [US2] Web do banco (contracts/web-ui.md "Teacher"): `apps/web/features/exercises/components/exercise-test-cases.tsx`
  (adicionar até 20, remover, mover para cima/baixo, visibilidade em rádio, campos ligados aos erros
  da API) dentro de `exercise-form.tsx`, a frase de execução ao lado da linguagem e a lista em
  `exercise-detail.tsx`; testes `exercise-test-cases.test.tsx` e `exercise-form.test.tsx`
  (`019/US2-1`, `019/US2-2`, axe, Tab, `expectFieldErrorLinked`).

**Checkpoint**: exercícios de Código com casos aplicados à turma, sem nada executar ainda.

---

## Phase 4: User Story 1 — Aluno executa o código contra os casos públicos (Priority: P1) 🎯 MVP

**Goal**: "Executar" cria a execução, o worker a roda no sandbox e a tela mostra o resultado por caso,
sem mudar pontos nem conclusão.

**Independent Test**: com um exercício de Python com 2 casos públicos e 1 privado, executar um
programa certo, um errado e um com erro de sintaxe; nenhum caso privado aparece; pontos e conclusão
seguem a 013.

### Tests for User Story 1 ⚠️

- [X] T017 [P] [US1] `apps/api/test/integration/019-us1-run.spec.ts` com `FakeSandbox` e o worker em
  `runOnce` (`019/US1-1`…`019/US1-10`, `019/FR-005`…`019/FR-011`): criar → 202 QUEUED com
  `publicCaseCount`; ciclo do worker → COMPLETED com casos na ordem e `passedCount`; saída diferente;
  erro de compilação sem casos; erro de execução com stderr; tempo, memória e saída excedidos;
  clique duplo e duas abas → 200 com a pendente (`019/FR-009`); `latest` por questão na tentativa
  atual; Trabalho e Prova → 404; tentativa não iniciada ou concluída → 409
  `ATTEMPT_NOT_IN_PROGRESS`; atividade encerrada ou cancelada → 404; "Refazer" volta a executar;
  código vazio → 202 e, no ciclo, casos com o veredito do programa vazio (nenhum passa se a saída
  esperada não é vazia); a resposta salva e a `updated_at` da tentativa não mudam (`019/FR-008`).
- [X] T018 [P] [US1] `apps/api/test/integration/019-worker.spec.ts`: claim com `FOR UPDATE SKIP
  LOCKED` (dois workers, uma execução cada); resultado gravado uma vez pelo `claim_token`; worker
  atrasado após lease tomado não grava; `SANDBOX_ERROR` quando a porta lança; heartbeat gravado a
  cada ciclo com perfis e limites; `code_run.finished` exatamente uma vez por execução.
- [X] T019 [P] [US1] `apps/api/test/security/019-isolation.spec.ts`: execução de outro aluno → 404;
  atividade de outra turma, não publicada ou de matrícula inativa → 404; questão de outra atividade
  → 404; TEACHER, MANAGER e ADMIN → 403; campos do servidor no corpo (`attemptId`, `languageId`,
  `testCases`, `status`) → 400; complementa `019-private-cases.spec.ts` com as respostas de
  `POST`/`GET` da execução (`019/SC-002`).
- [X] T020 [P] [US1] `apps/api/test/security/019-invariance.spec.ts` (`019/SC-004`): dois alunos
  com as mesmas respostas, um com 0 e outro com 50 execuções (limite elevado no teste) → mesmas
  conclusões, resultados, pontos, fila do professor e ranking.
- [X] T021 [P] [US1] Web: `apps/web/features/code-run/components/code-run-panel.test.tsx` e
  `code-run-result.test.tsx` (`019/US1-1`…`019/US1-5`, `019/US1-10`, `019/SC-008`): botão e textos
  por `execution.status`; "Na fila"/"Executando" com `aria-busy`; resumo anunciado; cada veredito em
  palavras com ícone; entrada e saída esperada vindas de `publicTestCases`; aviso de versão anterior
  ao editar; polling a cada 1 s só pendente e visível (timers falsos, `visibilitychange`); pendente
  de outra questão → aviso e nenhum resultado alheio (`019/FR-009`); 429 com o tempo de espera; tudo por teclado; axe.

### Implementation for User Story 1

- [X] T022 [US1] `apps/api/src/modules/code-runs/settle-stale.ts`: `UPDATE … RETURNING` condicional
  que fecha EXPIRED/INTERRUPTED/DISABLED com `code_run.finished` (SYSTEM) na mesma transação, usado
  pela API e pelo worker.
- [X] T023 [US1] Serviço e rotas da API (contracts/http-api.md): `code-runs.service.ts`
  (escopo da 012: matrícula ACTIVE, atividade EXERCISE liberada, tentativa própria em andamento,
  questão CODE com caso público e `execution`; acerta as velhas; `INSERT … ON CONFLICT DO NOTHING`
  sob o UNIQUE parcial; `code_run.requested`), `code-runs.controller.ts` (3 rotas,
  `atividades.proprias.executar`), `views/student-run-view.ts` (lista fechada) e
  `availability.ts` (lê o heartbeat; usado também pela visão do aluno). Na mesma tarefa: endpoints,
  `MATRIX`, `route-declarations.spec.ts`, os tipos de auditoria e `journey.ts`.
- [X] T024 [US1] `apps/api/src/modules/activities/views/student-view.ts`: `execution` nas questões CODE
  de EXERCISE (status, versão, convenção, limites da disponibilidade; `null` nas demais), por
  lista fechada; a visão continua sem gabarito antes da conclusão (013).
- [X] T025 [US1] Worker: `apps/api/src/code-runner/worker.ts` (laço com `CODE_RUNNER_POLL_MS`,
  `CODE_RUNNER_CONCURRENCY` vagas, `runOnce(now)` para testes; acerta velhas; claim; `prepare` e
  `runCase` por caso público; vereditos de `verdict.ts` e `compare-output.ts`; grava casos +
  COMPLETED + `code_run.finished` numa transação pelo `claim_token`; nunca grava conteúdo em log),
  `heartbeat.ts` (a cada 5 s, limpa linhas com mais de 1 dia no início) e `main.ts` (para com
  SIGTERM terminando as execuções em curso como INTERRUPTED só se o prazo do lease passar).
- [X] T026 [US1] `apps/api/src/code-runner/sandbox/docker-sandbox.ts` (research B3, B4): `docker run`
  com as flags de B3 por etapa via `child_process.spawn` (argumentos em lista, nunca shell da
  máquina), programa e entrada pelo stdin enquadrados, limites de stdout/stderr por bytes, `timeout
  -s KILL` no container e timer do worker com `docker kill`, `OOMKilled` pelo código de saída,
  remoção dos containers com o rótulo `devtrack.code-run` no início e ao fim de cada execução.
  Teste real: `apps/api/test/sandbox/019-languages.spec.ts` e `019-verdicts.spec.ts` (as três
  linguagens: passou, saída diferente, erro de compilação/sintaxe, erro de execução; a tabela de B6
  ponta a ponta; classe Java com outro nome).
- [X] T027 [US1] Web: `apps/web/features/code-run/{api/code-runs.ts,hooks/use-code-run.ts,components/code-run-panel.tsx,components/code-run-result.tsx}`
  (TanStack Query, `refetchInterval` de `CODE_RUN_POLL_MS` só pendente e visível; saídas em
  `CodeBlock` como texto; "Como a saída é comparada"; textos de contracts/web-ui.md) e o encaixe em
  `apps/web/features/student-activities/components/activity-answering.tsx` só para questões CODE de
  EXERCISE (o painel lê o código atual do editor; "Executar" não salva nem conclui). Atualizar
  `activity-answering.test.tsx` (`019/US1-1`, painel ausente em Trabalho e Prova).

**Checkpoint**: o aluno executa e vê o resultado com o worker e o Docker locais; pontos intactos.

---

## Phase 5: User Story 3 — Execução segura, limitada e que pode faltar sem quebrar o exercício (Priority: P2)

**Goal**: o sandbox resiste ao código hostil, o limite por minuto vale, e o exercício segue
funcionando com a execução desligada ou fora do ar.

**Independent Test**: rodar a suíte hostil; desligar o worker e concluir um exercício normalmente.

### Tests for User Story 3 ⚠️

- [ ] T028 [P] [US3] `apps/api/test/sandbox/019-hostile.spec.ts` (Docker real; `019/US3-1`…`019/US3-3`,
  `019/FR-013`, `019/SC-003`), nas três linguagens onde fizer sentido: conexão de rede (TCP para o
  host e DNS) falha; `/etc/passwd` do container sem nada da plataforma e ambiente sem variáveis do
  worker; escrita fora de `/tmp` recusada; encher `/tmp` para em 32 MB; fork bomb contida pelo
  `pids-limit`; laço infinito → `TIME_LIMIT` dentro de limite + 1 s; alocação sem fim →
  `MEMORY_LIMIT`; 10 MB de saída → `OUTPUT_LIMIT`; `kill -9 -1` não afeta o worker; depois de cada
  um, uma execução normal seguinte passa e não sobra container com o rótulo.
- [ ] T029 [P] [US3] `apps/api/test/integration/019-us3-availability.spec.ts` (`019/US3-4`…`019/US3-7`,
  `019/FR-014`…`019/FR-017`, `019/SC-007`): `CODE_RUNNER_ENABLED=false` → visão `UNAVAILABLE`, POST
  409 `CODE_RUNNER_UNAVAILABLE`, enfileiradas → FAILED/DISABLED no próximo toque; heartbeat velho →
  `UNAVAILABLE`; fila sem worker por 60 s → FAILED/EXPIRED na leitura, nunca executada depois;
  lease vencido → INTERRUPTED; com a execução fora, responder, salvar, concluir, refazer, corrigir
  (013) e ranking funcionam; a tela mostra os limites do heartbeat.
- [ ] T030 [P] [US3] `apps/api/test/security/019-rate-limits.spec.ts` (`019/FR-015`, `019/SC-005`):
  limite baixado no teste; a (N+1)ª no minuto → 429 com `Retry-After`, nenhuma execução criada,
  `code_run.rate_limited`; devolver a pendente não conta; outro aluno segue.
- [ ] T031 [P] [US3] `apps/api/test/security/019-concurrency.spec.ts`: 10 POSTs simultâneos do mesmo
  aluno → uma execução; acerto de velhas pela API e pelo worker ao mesmo tempo → um só
  `code_run.finished`; resultado × expiração → um estado final.

### Implementation for User Story 3

- [ ] T032 [US3] Ligar o limite (`RateLimitService`, escopo `code-runs`, contado só ao criar) e o
  kill switch no `code-runs.service.ts`; disponibilidade por perfil em `availability.ts` com
  `CODE_RUNNER_STALE_SECONDS`; o worker respeita o próprio `CODE_RUNNER_ENABLED`.
- [ ] T033 [US3] Endurecer o `docker-sandbox.ts` até a T028 passar (ajustes de flags, limites de
  bytes, classificação de memória do Java e do Node) e a medição `apps/api/test/sandbox/019-timing.spec.ts`
  (`019/SC-001`: 5 casos em ≤ 5 s Python/JavaScript e ≤ 10 s Java, p95 de 20 execuções; 40
  execuções com 4 vagas, 95% em ≤ 30 s).
- [ ] T034 [US3] Web: estados `UNAVAILABLE`, `FAILED` ("Não foi possível executar agora. Tente de
  novo.") e 429 no painel, com testes em `code-run-panel.test.tsx` (`019/US3-4`, `019/US3-5`).

**Checkpoint**: suíte hostil verde no Docker local; exercício completo com o worker parado.

---

## Phase 6: User Story 4 — Linguagens com execução vêm do catálogo (Priority: P3)

**Goal**: só as linguagens marcadas no catálogo executam; o professor vê isso ao escolher a linguagem.

**Independent Test**: um exercício de C++ com casos públicos aplicado não mostra "Executar"; um
pedido forjado é recusado.

- [ ] T035 [P] [US4] `apps/api/test/integration/019-us4-languages.spec.ts` (`019/US4-1`,
  `019/US4-2`, `019/FR-020`): questão de linguagem sem `execution` → visão `NOT_SUPPORTED`, POST
  409 `CODE_RUN_NOT_AVAILABLE` (`NOT_SUPPORTED`) sem execução criada; perfil sem worker vivo →
  `UNAVAILABLE`, não `NOT_SUPPORTED`; `GET /programming-languages` com `execution`; nenhum nome de
  linguagem do catálogo no código de `code-runs` e `code-runner` (varredura em
  `code-runner-boundary.spec.ts`: só as chaves de perfil).
- [ ] T036 [US4] Ajustes que a T035 pedir em `code-runs.service.ts`/`availability.ts` e, no web, o
  teste da frase "Os alunos poderão executar o código." / "Sem execução nesta linguagem." em
  `exercise-form.test.tsx` (`019/US4-2`).

**Checkpoint**: as quatro histórias funcionando de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T037 Retenção e auditoria (`019/FR-019`, `019/SC-006`): job `code-run-content` em
  `apps/api/src/modules/code-runs/content-retention.job.ts`, registrado em `MAINTENANCE_JOB_NAMES`
  depois de `ai-records` (`contracts/maintenance-jobs.md` da 001 atualizado), lotes de 500, logs só
  com contagens; `apps/api/test/security/019-retention.spec.ts` (23 h e 24 h com `FixedClock`:
  conteúdo de 23 h + 1 s já apagado com o intervalo de 1 h, só finais, linhas ficam, conteúdo nulo,
  gatilho recusa outra mudança); `journey.ts` com execução pedida,
  concluída, falha e recusada; `audit-coverage.spec.ts`; `secret-leak-scan.spec.ts` com
  `MARCADOR-CODIGO-019` no código, na entrada, na saída esperada e na saída obtida, fora de
  auditoria e logs.
- [ ] T038 [P] Segurança e desempenho restantes: `apps/api/test/security/019-boundaries.spec.ts`
  (código com 65 536 e 65 537 bytes, inclusive multibyte → 413 `SOURCE_TOO_LARGE`; 20/21 casos;
  entrada e saída esperada de 10 000/10 001 caracteres; `019/FR-021` sem HTML interpretado na API;
  nenhuma rota fora do catálogo) e `019-performance.spec.ts` (criar p95 < 150 ms, ler p95 < 100 ms);
  web: `student-portal-xss.test.tsx` com saída, stderr e mensagem do compilador contendo HTML;
  `features/code-run` na lista sem `dangerouslySetInnerHTML`; `token-usage`, `identity` verdes.
- [ ] T039 [P] CI e deploy: job `sandbox` em `.github/workflows/ci.yml` (Ubuntu, actions por SHA,
  `code-runner:images` + `test:sandbox`); `docs/deploy/code-runner.md` (máquina do worker, Docker +
  gVisor `runsc` e a checagem `docker run --runtime runsc … dmesg`, roteiro de incidente — parar o
  worker (efeito em até 15 s) e depois `CODE_RUNNER_ENABLED=false` —, papel do PostgreSQL com os GRANTs
  de research B2, imagens por digest, variáveis, kill switch, como ler o heartbeat); E2E
  `apps/web/e2e/code-runner.spec.ts` (`019/SC-002`, `019/SC-008`; professor cria exercício Python com
  2 públicos e 1 privado, aplica; aluno executa certo, errado e com erro de sintaxe pelo teclado;
  caso privado ausente da página; conclusão "Aguardando correção" como na 013) com o worker real
  subido pelo `playwright.config` — a redefinição do banco E2E pede consentimento do usuário.
- [ ] T040 Documentação e fechamento: `CLAUDE.md` (Project state com a 019, regras fáceis de errar
  do Code Runner, contrato `code-runs`, comandos `code-runner:*` e `test:sandbox`, guarda
  `code-runner-boundary`), `apps/api/CLAUDE.md` (módulo, worker, helpers, suítes),
  `apps/web/CLAUDE.md` (`features/code-run`), `README.md` (linha da spec 019, pré-requisito Docker
  para o worker); rodar o `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types &&
  pnpm test` e `test:sandbox`; `pending` do `SPECS` 019 vazio.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T005, com a T001 antes de tudo) → Foundational (T006–T011) →
  histórias.
- **US2 (T012–T016)**: depende da Foundational; destrava a US1 (casos na atividade).
- **US1 (T017–T027)**: depende da US2.
- **US3 (T028–T034)**: depende da US1 (worker e sandbox reais).
- **US4 (T035–T036)**: depende da US1; pode andar junto com a US3.
- **Polish (T037–T040)**: depois de todas.
- **Dentro de cada história**: testes → regras puras → serviços e rotas → worker/sandbox → web.

## Parallel Opportunities

- **Setup**: T002–T004 juntos depois da T001; T005 em seguida.
- **Foundational**: T008, T009 e T010 em paralelo depois da T007.
- **US2**: T012 e T013 juntos; T016 em paralelo com T014–T015.
- **US1**: T017–T021 juntos; T026 (sandbox real) e T027 (web) em paralelo depois da T023.
- **US3**: T028–T031 juntos.
- **US4** em paralelo com a US3.
- **Polish**: T038 e T039 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US2 + US1: o professor cadastra casos e o aluno executa nas três
   linguagens com o worker local, sem mudar pontos.
2. **Incremento 2**: US3 (suíte hostil, limites, kill switch e falhas) — obrigatório antes de
   qualquer uso com alunos reais.
3. **Incremento 3**: US4 e Polish (retenção, CI do sandbox, deploy com gVisor, E2E, docs).
