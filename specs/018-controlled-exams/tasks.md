---

description: "Task list for 018 — Prova em Modo Restrito com Avisos e Decisão do Professor: Banco de Provas (manual e com IA), prova aplicada sempre restrita e só aos presentes, tempo do servidor, ocorrências com 3 avisos e encerramento na 4ª, decisão do professor"
---

# Tasks: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

**Input**: os documentos de design em `/specs/018-controlled-exams/`.
**Prerequisites**:
- plan.md, spec.md, research.md (T1–T19) e data-model.md;
- contracts/: http-api, permissions, audit-events, configuration, exam-generator e web-ui;
- quickstart.md;
- constituição v3.4.0.

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-012).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 018 com prefixo
  (`018/US4-5`, `018/FR-018`, `018/SC-004`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`018/US1-1`…`018/US1-5`), cada cenário ganha o seu próprio `it`.
- **Relógio**: é injetado (`FixedClock`) em todo teste de tempo, ocorrência, retenção e decisão; o
  web usa timers falsos para cronômetro, alertas, contagem e inatividade.
- **Trabalhos e exercícios não mudam**: toda suíte 012–016 continua passando; só o guarda SC-012
  de `activities-boundary.spec.ts` é emendado (T009).
- **Tipo de auditoria novo**: exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no
  `MATRIX` de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Isolamento de módulo** (research T1, T16): `exams`/`exam-ai` só importam de `works` os
  diretórios puros `types`, `grading` e `grade`; `activities` e `student-activities` não importam
  `exam-sessions` nem `attendance` (leem as tabelas nas próprias consultas); `exam-sessions` não
  importa IA, `work-help` nem execução de código.
- **Palavras proibidas**: nenhum texto de UI, contrato ou auditoria usa "fraude", "cola" ou
  "violação" (FR-032).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: migração, permissões, contratos, regras puras e esqueletos dos módulos.
- **US1** (Banco de Provas) → **US2** (aplicar e chamada) → **US3** (tempo) → **US4**
  (ocorrências e retenção) → **US5** (decisões): a cadeia da prova.
- **US6** (pausa) depende da US3; **US7** (IA) depende só da US1 e anda em paralelo; **US8**
  (correção e liberação) lê o que US3–US5 gravam.
- **MVP**: US1–US5.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US8).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuração, códigos de erro e contratos compartilhados.

- [X] T001 [P] Configuração `RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE` (padrão 60) e
  `RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR` (padrão 10) em
  `apps/api/src/platform/config/config.schema.ts` e `apps/api/.env.example`, com o teste de valor
  padrão e de recusa de não positivos em `apps/api/test/integration/platform.spec.ts`.
- [X] T002 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts`, com o teste
  `apps/web/lib/messages/error-messages.test.ts`:

  | Código | Mensagem |
  |---|---|
  | `EXAM_RULES` | "Revise as questões destacadas antes de salvar." |
  | `EXAM_ARCHIVED` | "Esta prova está arquivada." |
  | `EXAM_NOT_APPROVED` | "Só uma prova aprovada pode ser aplicada." |
  | `EXAM_START_CLOSED` | "O prazo para iniciar esta prova terminou. Fale com o professor." |
  | `EXAM_TIME_OVER` | "Tempo esgotado. Suas respostas salvas foram registradas." |
  | `EXAM_ATTEMPT_ON_HOLD` | "Prova encerrada por excesso de avisos; o cancelamento com nota zero será confirmado pelo professor" |
  | `EXAM_TIME_NOT_OVER` | "Ainda há tempo de prova: devolva a prova ou confirme o cancelamento." |
  | `EXAM_DECISIONS_PENDING` | "Há provas encerradas por avisos aguardando a sua decisão." |
  | `EXIT_NOT_ALLOWED` | "Na prova, chame o professor para sair da sala." |
  | `NOT_AN_EXAM` | — |
- [X] T003 [P] Criar `packages/contracts/src/exams/{enums,exam,questions,coverage,generation}.ts`
  (research T2, T14, T15; contracts/http-api.md "Banco de Provas" e "Criar prova com IA"):
  - enums `ExamStatusSchema`, `ExamOriginSchema`; reuso de `WorkQuestionTypeSchema`,
    `WorkDifficultySchema` (sem redefinir, `duplication.spec.ts`);
  - `ExamQuestionInputSchema` (o da 011 + `difficulty` + `topicIds` 1–3),
    `CreateExamRequestSchema`, `UpdateExamRequestSchema`, `TeacherExamSchema`,
    `ExamSummarySchema`, `ExamListQuerySchema`, `ExamStudentPreviewSchema`, `ExamVersionSchema`;
  - `ExamCoverageSchema` (`byTopic`, `byDifficulty`);
  - `CreateExamGenerationRequestSchema` (sem modelo/provedor/nível), `ExamGenerationRequestSchema`,
    `GeneratedExamSchema` (contracts/exam-generator.md);
  - constantes `EXAM_MAX_QUESTIONS = 20`, `EXAM_QUESTION_TOPICS_MAX = 3`;
  - exportar em `packages/contracts/src/index.ts`; testes em
    `packages/contracts/test/exams.spec.ts` (limites 0/1/20/21, campos do servidor recusados,
    tópicos da questão ⊆ tópicos da prova).
- [X] T004 [P] Criar `packages/contracts/src/exam-sessions/{monitor,holds}.ts`:
  `ExamStatusOfStudentSchema` (valores de data-model "Derived"), `ExamHoldResolutionSchema`,
  `TeacherExamHoldSchema` (com `canReturn`), `ExamMonitorSchema`; exportar e testar em
  `packages/contracts/test/exam-sessions.spec.ts`.
- [X] T005 Mudanças nos contratos existentes (research T3, T13; contracts/http-api.md):
  - `packages/contracts/src/activities/`: `ActivityTypeSchema` += `EXAM`; `ActivitySourceSchema`
    += `{ type: "EXAM", examId }`; `CreateActivity` para EXAM (`durationMinutes` 1–120,
    `inactivityLimitSeconds` 30–60 padrão 60, `startWindowMinutes` 0–60 padrão 15; recusa
    `deadline`, `latePolicy`, `executionMode`, `aiHelpAllowance`, `releaseMode`); `ScopeCheck` +=
    `coverage`; `TeacherActivity`/resumos += `exam`; `RosterStatus` += `AWAITING_DECISION`,
    `TIME_EXPIRED`, `CANCELLED`, `ENDED_BY_WARNINGS`, `START_CLOSED`; linha do roster +=
    `occurrenceCount`; `StudentActivity` += `exam`; `StartAttemptRequest` com `acceptRules: true`
    para EXAM; `ExamEndReasonSchema`;
  - `packages/contracts/src/attempt-integrity/`: tipo `INACTIVITY` com `idleSeconds` (30–60, só
    com ele); resposta do lote += `exam: { occurrenceCount, held } | null`; eventos da revisão +=
    `occurrenceOrdinal`, `idleSeconds`; revisão += `holds`;
  - `packages/contracts/src/attendance/`: fim de pausa += `TIME_EXPIRED`;
  - testes nos `packages/contracts/test/*.spec.ts` correspondentes; `boundary.spec.ts` e
    `duplication.spec.ts` verdes.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, permissões, regras puras e esqueletos. ⚠️ Nenhuma história começa antes
desta fase.

- [X] T006 Teste primeiro: `apps/api/test/integration/018-schema.spec.ts`, com as regras de
  `data-model.md`:
  - Banco de Provas: 1–20 questões e soma exata (gatilhos adiados); aprovação recusada sem
    gabarito, dificuldade ou tópico; tópicos da questão só da prova (FK composta), 1–3; `origin`
    imutável; `generation_request_id` sse `AI_GENERATED`; `archived_from_status` sse ARCHIVED;
  - `class_activities` EXAM: CHECKs (CONTROLLED, ajuda 0, `PRESENT_ONLY`, nota total, sem prazo nem
    política de atraso, faixas de duração/inatividade/janela), colunas novas imutáveis;
  - `class_activity_questions.exam_difficulty` sse EXAM; `value` em ASSIGNMENT ou EXAM;
  - `activity_submissions.end_reason` sse EXAM; `cancelled_by_id` sse `CANCELLED`; `CANCELLED`
    com nota 0;
  - `attempt_integrity_events`: `INACTIVITY` com `idle_seconds` 30–60, só com ele;
  - `exam_occurrences`: ordinal sem lacuna, append-only, recusado em tentativa pausada, retida,
    entregue ou fora de EXAM;
  - `exam_attempt_holds`: uma aberta por tentativa (UNIQUE parcial); abre só no ordinal ≥ 4 e após
    uma devolução; resolução uma vez, com `resolved_*` juntos; sem DELETE;
  - gatilhos de defesa: com retenção aberta, `activity_answers`, `activity_submissions` e
    `work_help_requests` recusados; exceções da decisão do professor (`CANCELLED`,
    `ENDED_BY_WARNINGS`) e dos eventos de integridade (gravados como fato).
- [X] T007 Migração `apps/api/prisma/migrations/<ts>_controlled_exams/migration.sql` e
  `apps/api/prisma/schema.prisma`, com T006 verde ao final: as tabelas do Banco de Provas (8), as
  colunas e CHECKs de EXAM, `exam_difficulty`, `end_reason`/`cancelled_by_id`, `INACTIVITY` e
  `idle_seconds`, `exam_occurrences`, `exam_attempt_holds`, os 5 enums, os gatilhos e a extensão
  dos gatilhos de defesa da 016; seed das 7 permissões para TEACHER
  (contracts/permissions.md). Na mesma tarefa: `resetDb` (`apps/api/test/helpers/`) apaga as
  tabelas novas na ordem certa; `domain-boundary.spec.ts` fixa os modelos novos.
- [X] T008 [P] Regras puras com testes, todas recebendo `now` do chamador:
  - `apps/api/src/modules/activities/status/exam-time.ts` + `exam-time.spec.ts` (research T4):
    `startDeadline`, `canStart`, `endsAt` (com o teto do encerramento/cancelamento), `closesAt`,
    `remaining`, `acceptsWrite(now, endsAt)` com `EXAM_END_GRACE_MS = 2000`;
  - `apps/api/src/modules/attempt-integrity/exam-occurrences.ts` + `exam-occurrences.spec.ts`
    (research T6): tipos contáveis, agrupamento de 2 s (`recorded_at` ao vivo; `clientOccurredAt`
    só dentro de um lote bufferizado), novos ordinais a partir do último, `opensHold(ordinal,
    lastHold)` (4ª, ou a primeira depois de `RETURNED`), nada conta pausado, retido, entregue ou
    após `endsAt`;
  - `apps/api/src/modules/exam-sessions/exam-status.ts` + `exam-status.spec.ts`: a tabela
    "Derived" de `data-model.md` e `canReturn`;
  - `apps/api/src/modules/exams/coverage.ts` + `coverage.spec.ts` (research T15): questões e
    pontos por tópico e por dificuldade, `outOfScope` a partir do escopo ensinado.
- [X] T009 [P] Esqueletos `apps/api/src/modules/{exams,exam-ai,exam-sessions}/*.module.ts`,
  registrados em `AppModule`, e os guardas (research T16):
  - `apps/api/test/exams-boundary.spec.ts` (novo): `exams`/`exam-ai` e
    `apps/web/features/exams` não importam os bancos de exercícios e trabalhos exceto
    `works/{types,grading,grade}`; sem execução de código, escolha de modelo nem aritmética de
    float; `exam-sessions` sem IA, `work-help` ou execução de código, nota só por
    `activities/submission`;
  - `apps/api/test/activities-boundary.spec.ts` (emendado): SC-012 aceita EXAM; cronômetro e
    contagem só em `apps/web/features/exam-attempt` e `apps/web/components/ui/assessment`;
    `activities`/`student-activities` não importam `exam-sessions`.
- [X] T010 Acrescentar `018` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do
  CLAUDE.md): `stories: 8`, `scenarios: 51`, `rows: 0`,
  `successCriteria: sc(1, 12)` e `pending: { stories: [1, 2, 3, 4, 5, 6, 7, 8],
  successCriteria: ["SC-001", …, "SC-012"] }`. Cada história sai de `pending` na tarefa que
  escreve o último teste dela, cada SC quando o teste que o cita entra; ao fim da T056, `pending`
  está vazio.

**Checkpoint**: migração aplicada, regras puras e guardas verdes.

---

## Phase 3: User Story 1 — Professor cria uma prova manualmente (Priority: P1) 🎯 MVP

**Goal**: o Banco de Provas com criação, edição, aprovação, arquivamento e prévia do aluno.

**Independent Test**: criar uma prova manual com uma questão de cada tipo, conferir os valores,
aprovar e conferir que nenhuma execução de IA foi criada.

### Tests for User Story 1 ⚠️

- [X] T011 [P] [US1] `apps/api/test/integration/018-us1-bank.spec.ts`: `018/US1-1`…`018/US1-5`,
  `018/FR-001`…`018/FR-004` (valores 3,34/3,33/3,33; aprovação recusada apontando a questão; 0 e
  21 questões; edição não muda aplicadas — este cenário fica `it.todo` até a T018; outro
  professor → 404; nenhuma `ai_executions` criada).
- [X] T012 [P] [US1] `apps/api/test/security/018-isolation.spec.ts` (parte do banco): prova de
  outro professor → 404 em toda rota do banco; ADMIN e MANAGER → 403; prévia do aluno sem
  gabarito (lista fechada, chaves proibidas ausentes).

### Implementation for User Story 1

- [X] T013 [US1] `apps/api/src/modules/exams/`: `exams.controller.ts` (rotas de
  contracts/http-api.md "Banco de Provas"), `exams.service.ts` (transações com `version`,
  auditoria `exam.created/edited/approved/archived/restored`), `exam-rules.ts` (regras de
  estrutura reaproveitando `works/types` e o rateio de `works/grade`), `exam.state-machine.ts`,
  `exam-query.ts` (lista com cursor e busca), `views/{teacher-view,student-view}.ts`.
- [X] T014 [US1] Helper de teste `apps/api/test/helpers/exams.ts`: `createExam` (pela API, com
  3 questões e tópicos de uma ementa confirmada) e `approvedExam`.
- [X] T015 [P] [US1] Testes web primeiro em `apps/web/features/exams/**/*.test.tsx`: lista,
  editor (dificuldade e tópicos por questão, valores somente leitura), "Aprovar" com a lista do que
  bloqueia, `vitest-axe` e teclado (`018/US1-*`).
- [X] T016 [US1] Web `apps/web/features/exams/{api,components,hooks,schemas}/…` e a rota
  `apps/web/app/(app)/provas/…` (como `/trabalhos`), com o item "Banco de Provas" no menu; T015 verde.

**Checkpoint**: Banco de Provas funcional sem IA.

---

## Phase 4: User Story 2 — Professor aplica a prova à turma e faz a chamada (Priority: P1)

**Goal**: atividade EXAM criada como cópia, com cobertura antes da confirmação e chamada da 016.

**Independent Test**: aplicar com 30 min e 45 s a uma turma de 3, conferir a cobertura, marcar 2
e conferir que só eles a veem.

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] `apps/api/test/integration/018-us2-apply.spec.ts`: `018/US2-1`…`018/US2-6`,
  `018/FR-007`…`018/FR-010` (cobertura em `scope-check`; faixas recusadas; "Aguardando chamada";
  não marcado → 404 em toda via; campos de modo/ajuda/liberação → 400; prova editada depois não
  muda a aplicada) e o `it.todo` de `018/US1-4` passa a teste real.

### Implementation for User Story 2

- [X] T018 [US2] `apps/api/src/modules/activities/`: `snapshot/from-exam.ts` (leitor de snapshot da
  prova, com `exam_difficulty` e tópicos), `activities.service.ts` (cria EXAM com CONTROLLED, ajuda
  0, `PRESENT_ONLY`, as colunas de tempo; `activity.published` com os metadados novos), `scope/`
  (cobertura em `scope-check` usando `exams/coverage.ts` pelo leitor), resumos e detalhe com
  `exam` (`startDeadline`, `closesAt`, `pendingDecisions`).
- [X] T019 [US2] Helper `applyExam` em `apps/api/test/helpers/exams.ts` (aplica pela API e marca
  presentes por padrão, como o `applyWork` da 016).
- [X] T020 [P] [US2] Testes web primeiro em `apps/web/features/activities/components/new-activity-exam.test.tsx`
  (fonte "Prova do banco", campos de tempo, tabelas de cobertura, sem opções de modo/ajuda).
- [X] T021 [US2] Web `apps/web/features/activities/components/new-activity.tsx` ("Nova atividade") e o detalhe da
  atividade EXAM abrindo "Chamada e prova" com o painel da 016; T020 verde.

**Checkpoint**: a prova chega só aos presentes.

---

## Phase 5: User Story 3 — Aluno faz a prova com tempo controlado (Priority: P1)

**Goal**: regras antes do início, janela para iniciar, cronômetro do servidor, alertas, contagem,
fim automático e acerto por tempo.

**Independent Test**: prova de 1 min, 1 de 3 respondida, tempo acaba → encerrada, salvar recusado,
só a resposta salva corrigida.

### Tests for User Story 3 ⚠️

- [X] T022 [P] [US3] `apps/api/test/integration/018-us3-time.spec.ts`: `018/US3-1`…`018/US3-9`,
  `018/FR-011`…`018/FR-014` (`acceptRules` obrigatório; `endsAt`/`serverNow` na visão; atrasado com
  a duração inteira; início após a janela → 409; escrita após `endsAt + 2 s` → 409; a resposta que
  chega dentro da tolerância é aceita; brancas valem zero; entrega × fim → uma só submissão).
- [X] T023 [P] [US3] `apps/api/test/security/018-time.spec.ts` (`018/SC-002`, `018/SC-008`) e
  `018-settlement.spec.ts`: o acerto roda em cada toque (leitura do aluno, eventos, monitor,
  roster, revisão, liberação) uma única vez, com `submitted_at = endsAt`, `end_reason`
  `TIME_EXPIRED` ou `ACTIVITY_CLOSED`, e `exam_attempt.time_expired` (SYSTEM) uma vez; tentativas
  retidas não são acertadas.

### Implementation for User Story 3

- [X] T024 [US3] `apps/api/src/modules/activities/submission/settle-exam.ts` (research T5):
  `settleExpiredExamAttempts(tx, { activityId, studentUserId? , now })` sob `FOR SHARE` da atividade e
  `FOR UPDATE` das tentativas, reaproveitando `registerSubmission` com `end_reason` e
  `submittedAt` derivado; auditoria nova `exam_attempt.time_expired`.
- [X] T025 [US3] `apps/api/src/modules/student-activities/`: `attempts.service.ts` (início com
  `acceptRules` e janela; `assertExamWritable` com `exam-time.ts` e tolerância dentro do lock;
  acerto antes de cada operação; entrega com `end_reason = STUDENT_SUBMITTED`),
  `student-activity-loader.ts` (acerto na leitura) e `activities/views/student-view.ts` (`exam`
  por lista fechada).
- [X] T026 [P] [US3] Componentes Exam Mode com testes primeiro em
  `apps/web/components/ui/assessment/{exam-timer,time-alert,final-countdown}.tsx` (+ `.test.tsx`
  com timers falsos: 10 e 5 min, contagem 10…1, nada se a prova começa abaixo do marco,
  `role` timer/status/alert, `prefers-reduced-motion`), no catálogo do Design System.
- [X] T027 [US3] `apps/web/features/exam-attempt/`: `components/{rules-screen,exam-shell}.tsx`,
  `hooks/use-exam-clock.ts` (offset do servidor por leitura), salvamento imediato no último
  minuto, tela "Tempo esgotado" e "prazo para iniciar terminou"; `activity-answering.tsx` envia
  EXAM para `exam-attempt`; testes em `apps/web/features/exam-attempt/**/*.test.tsx`
  (`018/US3-*`, `018/SC-003`).

**Checkpoint**: a prova roda com tempo do servidor e acaba sozinha.

---

## Phase 6: User Story 4 — Ocorrências, avisos e encerramento na 4ª (Priority: P1)

**Goal**: contagem de ocorrências no servidor, avisos 1–3 e retenção na 4ª.

**Independent Test**: 3 ocorrências de tipos diferentes → avisos 1, 2, 3; a 4ª retém a tentativa e
recusa escrita em qualquer dispositivo.

### Tests for User Story 4 ⚠️

- [X] T028 [P] [US4] `apps/api/test/integration/018-us4-occurrences.spec.ts`: `018/US4-1`…`018/US4-8`,
  `018/FR-015`…`018/FR-020` (cada tipo contável; agrupamento de 2 s; inatividade com
  `idleSeconds`; a 4ª abre a retenção e esconde as questões; eventos durante a retenção gravados
  sem contar; eventos pausados, após o fim ou após a entrega recusados com 409 e nada gravado;
  lote bufferizado contado na chegada e recusado se chegar após o fim; resposta do lote com
  `occurrenceCount`/`held`; `exam_attempt.held` uma vez).
- [X] T029 [P] [US4] `apps/api/test/security/018-holds.spec.ts` (escrita recusada com retenção em
  toda rota e em duas sessões) e `018-concurrency.spec.ts` (`018/SC-004`: 10 ocorrências
  simultâneas → ordinais sem lacuna, uma retenção, um evento de auditoria).

### Implementation for User Story 4

- [X] T030 [US4] `apps/api/src/modules/attempt-integrity/focus-events.service.ts`: para EXAM, trava a
  tentativa `FOR UPDATE`, acerta o tempo antes, grava os eventos (com `INACTIVITY`), aplica
  `exam-occurrences.ts`, insere `exam_occurrences` e, quando cabe, `exam_attempt_holds` +
  `exam_attempt.held` (SYSTEM) na mesma transação; `TYPING_LIMIT_EXCEEDED` não conta; resposta com
  `exam`.
- [X] T031 [US4] `apps/api/src/modules/student-activities/attempts.service.ts` e
  `student-activity-loader.ts`: `EXAM_ATTEMPT_ON_HOLD` em salvar e entregar dentro do lock;
  visão com `hold` e sem questões nem respostas; `activity_submission.rejected` com o código.
- [X] T032 [P] [US4] Testes web primeiro: `apps/web/features/exam-attempt/hooks/use-inactivity.test.ts`
  (limite configurado, um evento por período, suspenso com a página oculta, pausado, retido, antes
  do início e depois do fim) e `apps/web/components/ui/assessment/warning-dialog.test.tsx`
  ("Aviso n de 3", foco, teclado, `vitest-axe`).
- [X] T033 [US4] Web: `use-inactivity.ts`, `warning-dialog.tsx`, aviso de retenção e a ligação com o
  monitor da 015 (`features/controlled-attempt`) no `exam-shell.tsx`; T032 verde; varredura de
  palavras proibidas em `apps/web/test/` cobre os textos novos.

**Checkpoint**: a regra dos 3 avisos funciona e nada é cancelado sozinho.

---

## Phase 7: User Story 5 — Professor decide: confirmar o cancelamento ou devolver a prova (Priority: P1)

**Goal**: monitor da prova e as três decisões.

**Independent Test**: duas tentativas retidas; cancelar uma (nota zero), devolver a outra
(continua com o tempo restante; a próxima ocorrência retém de novo).

### Tests for User Story 5 ⚠️

- [X] T034 [P] [US5] `apps/api/test/integration/018-us5-decisions.spec.ts`: `018/US5-1`…`018/US5-8`,
  `018/FR-021`…`018/FR-025` (cancelar → submissão `CANCELLED` com cada questão `DECIDED` 0 pelo
  professor, e o aluno vê só "Prova encerrada" até a liberação; devolver com tempo; nova ocorrência retém de novo; devolver após o fim → 409
  `EXAM_TIME_OVER`; "Não cancelar" antes do fim → 409 `EXAM_TIME_NOT_OVER`, depois → submissão
  `ENDED_BY_WARNINGS` com as respostas salvas; liberação recusada com retenção aberta; decisão
  repetida → 409 sem evento) e o monitor (situações, ordenação, acerto antes de ler).
- [X] T035 [P] [US5] Concorrência em `apps/api/test/security/018-concurrency.spec.ts`: decisão ×
  decisão, devolver × fim do tempo, cancelar × liberação; `018/SC-005` (nenhum zero sem decisão),
  `018/SC-006`, `018/SC-007` (retenção visível no monitor no próximo poll).

### Implementation for User Story 5

- [X] T036 [US5] `apps/api/src/modules/exam-sessions/`: `exam-monitor.{controller,service}.ts`
  (consulta própria das tabelas de presença, pausa, ocorrência e retenção; acerto antes),
  `exam-holds.{controller,service}.ts` (cancelar, devolver, não cancelar sob os locks de research
  T9, taxa `RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE`), `views.ts`; auditorias
  `exam_attempt.cancel_confirmed/returned/not_cancelled`.
- [X] T037 [US5] `apps/api/src/modules/activities/`: liberação acerta e recusa com
  `EXAM_DECISIONS_PENDING`; roster com as situações novas e `occurrenceCount`; encerrar/cancelar a
  atividade mantém as retenções decidíveis; revisão de integridade com `occurrenceOrdinal`,
  `idleSeconds` e `holds`.
- [X] T038 [P] [US5] Testes web primeiro em `apps/web/features/exam-session/**/*.test.tsx`: painel
  com cada `examStatus` (tabela de contracts/web-ui.md), ordenação, diálogo de confirmação,
  "Devolver prova" só com `canReturn`, "Não cancelar" após o fim, "Liberar resultado" desabilitado
  com pendências, teclado e `vitest-axe`.
- [X] T039 [US5] Web `apps/web/features/exam-session/{api,components,hooks}/…` (`ExamRoomPanel`,
  `HoldDecisionDialog`, `OccurrenceList`, sondagem de 5 s) e, no aluno, o retorno ("Retomar" com o
  tempo restante, volta à tela cheia); T038 verde.

**Checkpoint**: MVP completo (US1–US5).

---

## Phase 8: User Story 6 — Professor pausa o aluno que precisa sair da sala (Priority: P2)

**Goal**: a pausa da 016 na prova, só pelo professor, com o tempo correndo.

**Independent Test**: pausar com 20 min restantes, esperar 2 min, liberar → 18 min, respostas
intactas, nenhuma ocorrência durante a pausa.

- [X] T040 [P] [US6] `apps/api/test/integration/018-us6-pause.spec.ts`: `018/US6-1`…`018/US6-5`,
  `018/FR-026`, `018/FR-027` (visão sem questões; eventos na pausa não contam; tempo acaba na pausa
  → acerto e pausa encerrada com `TIME_EXPIRED`; "Sair da sala" do aluno → 409
  `EXIT_NOT_ALLOWED`; pausar aluno retido → 409 `EXAM_ATTEMPT_ON_HOLD`; liberar após o fim → 409).
- [X] T041 [US6] `apps/api/src/modules/attendance/my-pause.service.ts` (`EXIT_NOT_ALLOWED`),
  `pauses.service.ts` (recusa com retenção aberta, liberar só antes do fim) e
  `apps/api/src/modules/activities/status/pause-time.ts` (`TIME_EXPIRED`), com o
  `pause-time.spec.ts` ampliado.
- [X] T042 [US6] Web: aviso "Prova pausada pelo professor. O tempo continua correndo." no
  `exam-shell.tsx` e sem o botão "Sair da sala" na prova, com testes em
  `apps/web/features/exam-attempt/**/*.test.tsx`.

---

## Phase 9: User Story 7 — Professor cria uma prova com IA (Priority: P2)

**Goal**: o agente `exam-generator` L2, rascunho no banco, avaliação de release.

**Independent Test**: com o provedor falso, gerar 5 questões → DRAFT `AI_GENERATED`, tópicos
escolhidos, aprovação só pelo professor.

- [X] T043 [P] [US7] `apps/api/test/integration/018-us7-ai.spec.ts`: `018/US7-1`…`018/US7-5`,
  `018/FR-005`, `018/FR-006`, `018/SC-009` (provedor falso de `apps/api/test/fixtures/ai`; saídas
  inválidas rejeitadas; agente desligado → indisponível; campos de modelo → 400; nenhuma chamada de
  IA durante tentativas).
- [X] T044 [P] [US7] `apps/api/src/modules/exam-ai/generation/validate-generated-exam.ts` +
  `validate-generated-exam.spec.ts` (contracts/exam-generator.md "Validation").
- [X] T045 [US7] `apps/api/src/modules/exam-ai/`: `definitions/{exam-generator,exam-generation.prompt,
  read-exam-generation-request.tool,request.ownership}.ts` (agente DISABLED, tarefa
  `exam-generation`), `generation/{request-content,build-proposal,materialize,proposal-rejected}.ts`,
  `exam-generation-requests.{controller,service}.ts`, `exam-proposal-closer.ts`; auditorias
  `exam_generation.requested/completed/rejected`; taxa `RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR`.
- [X] T046 [P] [US7] Avaliação sob demanda `apps/api/test/eval/exam-generator.eval.ts` (casos em
  `apps/api/test/fixtures/exam-generator/`), script `eval:exams` em `apps/api/package.json`,
  replay gravado no CI; o catálogo 009 só aprova modelos com evidência em
  `apps/api/test/fixtures/evaluations/exam-generation/`.
- [X] T047 [US7] Web: diálogo "Criar prova com IA" em `apps/web/features/exams/components/` (até 20
  questões, estado indisponível), com testes primeiro.

---

## Phase 10: User Story 8 — Professor corrige e libera o resultado vendo as ocorrências (Priority: P2)

**Goal**: correção da 012 com os fatos da prova; o aluno vê nota, ocorrências e pausas depois.

**Independent Test**: quatro tentativas (entregue, tempo esgotado, cancelada, devolvida e
entregue) corrigidas e liberadas.

- [X] T048 [P] [US8] `apps/api/test/integration/018-us8-grading.spec.ts`: `018/US8-1`…`018/US8-5`,
  `018/FR-029`…`018/FR-031` (situações do roster; cancelada liberada com zero; tempo esgotado com
  brancas zeradas sem ação; histórico do aluno com as próprias ocorrências e pausas e sem dados de
  outro aluno; presente que não iniciou sem nota automática; antes da liberação, cancelamento
  confirmado e "Não cancelar" chegam ao aluno iguais, com `endReason: WARNINGS` e sem a decisão).
- [X] T049 [US8] `apps/api/src/modules/activities/attempts-review.service.ts` (início, fim, motivo,
  ocorrências, pausas, decisões) e `activities/views/student-view.ts` (ocorrências próprias depois
  do fim, lista fechada).
- [X] T050 [US8] Web: cabeçalho e seções "Ocorrências" e "Saídas da sala" em
  `apps/web/features/activities/components/attempt-review.tsx`; histórico do aluno em
  `apps/web/features/student-activities/components/student-history.tsx`; testes primeiro.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T051 Auditoria e journey (`018/SC-010`): `apps/api/test/helpers/journey.ts` com prova criada,
  gerada, aplicada, iniciada, retida, cancelada, devolvida, não cancelada e acertada;
  `audit-coverage.spec.ts` (metadados só ids/enums/contagens); `secret-leak-scan.spec.ts` com
  `MARCADOR-PROVA-018` no enunciado e na resposta, fora de auditoria e logs.
- [ ] T052 [P] Segurança restante em `apps/api/test/security/`:
  - `018-boundaries.spec.ts`: campos do servidor → 400; 0/1/20/21 questões; duração 0/1/120/121;
    inatividade 29/30/60/61; janela -1/0/60/61; `idleSeconds` fora da faixa; `018/FR-034`
    (nenhuma rota fora do catálogo; Trabalho e Exercício inalterados, `018/SC-012`);
  - `018-rate-limits.spec.ts`: decisões e gerações;
  - `018-performance.spec.ts`: lote de eventos com contagem p95 < 200 ms, monitor de 60 alunos
    p95 < 300 ms, decisão p95 < 300 ms.
- [ ] T053 [P] Web: varredura de palavras proibidas (`apps/web/test/`), `student-portal-xss.test.tsx`
  com enunciados da prova, `token-usage`, `identity`, `docs` e `catalog.test.tsx` verdes com os
  componentes novos; `018/SC-011` por teclado nos testes de componente.
- [ ] T054 E2E `apps/web/e2e/exam.spec.ts` (`018/SC-001`, `018/SC-004`, `018/SC-007`,
  `018/SC-011`), com o professor e 2 alunos em contextos separados: criar e aprovar; aplicar com
  duração curta; chamada; aluno A com 3 avisos e a 4ª retendo; devolver; nova ocorrência retendo;
  aluno B deixando o tempo acabar; confirmar o cancelamento de A após o fim; liberar; tudo pelo
  teclado. A redefinição do banco E2E pede consentimento do usuário.
- [ ] T055 [P] Documentação: `CLAUDE.md` (Project state com a 018, regras fáceis de errar da
  prova, contratos `exams` e `exam-sessions`, comando `eval:exams`), `apps/api/CLAUDE.md` (módulos,
  helpers, suítes, resultados do release gate), `apps/web/CLAUDE.md` (`features/exams`,
  `exam-session`, `exam-attempt`, componentes Exam Mode), `README.md`, ADR-0001 com o novo agente.
- [ ] T056 Rodar o `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types && pnpm test`;
  `pending` do `SPECS` 018 vazio.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T005) → Foundational (T006–T010) → histórias.
- **US1 (T011–T016)**: depende da Foundational; destrava US2 e US7.
- **US2 (T017–T021)**: depende da US1 (prova aprovada).
- **US3 (T022–T027)**: depende da US2 (prova aplicada e presença).
- **US4 (T028–T033)**: depende da US3 (tempo e acerto entram na contagem).
- **US5 (T034–T039)**: depende da US4 (retenções).
- **US6 (T040–T042)**: depende da US3; pode andar junto com US4/US5.
- **US7 (T043–T047)**: depende só da US1; anda em paralelo com US2–US6.
- **US8 (T048–T050)**: depende de US3–US5.
- **Polish (T051–T056)**: depois de todas.
- **Dentro de cada história**: testes → regras puras → serviços e rotas → web.

## Parallel Opportunities

- **Setup**: T001–T004 juntos; T005 em seguida.
- **Foundational**: T008 e T009 em paralelo depois de T007.
- **US1**: T011, T012 e T015 juntos.
- **US3**: T022, T023 e T026 juntos.
- **US4**: T028, T029 e T032 juntos.
- **US5**: T034, T035 e T038 juntos.
- **US7** inteira em paralelo com US2–US6 (outra pessoa ou outro agente); T043, T044 e T046 juntos.
- **Polish**: T052, T053 e T055 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1–US5: o professor cria e aplica a prova, o aluno faz com
   tempo do servidor, os avisos e a retenção funcionam e o professor decide.
2. **Incremento 2**: US6 (pausa) e US8 (correção e liberação com os fatos da prova).
3. **Incremento 3**: US7 ("Criar prova com IA", depois do release gate) e Polish (segurança, E2E,
   docs).
