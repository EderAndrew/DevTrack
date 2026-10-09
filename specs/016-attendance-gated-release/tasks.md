---

description: "Task list for 016 — Lista de Chamada e Liberação do Trabalho aos Presentes: chamada por atividade, trabalho visível só aos presentes, pausa por saída da sala liberada pelo professor"
---

# Tasks: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

**Input**: os documentos de design em `/specs/016-attendance-gated-release/`.
**Prerequisites**:
- plan.md, spec.md, research.md (M1–M13) e data-model.md;
- contracts/: http-api, permissions, audit-events, configuration e web-ui;
- quickstart.md;
- constituição v3.4.0.

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-010).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem
  falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 016 com prefixo
  (`016/US3-9`, `016/FR-013`, `016/SC-003`), um id literal por cenário. Onde uma tarefa cita uma
  faixa (`016/US1-1`…`016/US1-7`), cada cenário ganha o seu próprio `it`.
- **Relógio**: é injetado (`FixedClock`) onde horários e durações importam.
- **Exercícios e trabalhos antigos não mudam**:
  - toda suíte 012/013/015 continua passando;
  - a fábrica `createActivity` (banco direto) mantém `ALL_ENROLLED`;
  - o helper `applyWork` (via API) marca todos presentes por padrão (T013).
- **Tipo de auditoria novo**: exige, na mesma tarefa, `src/modules/audit/audit-event-types.ts`,
  `contracts/audit-events.md` e a emissão em `test/helpers/journey.ts`.
- **Rota nova**: exige, na mesma tarefa, `packages/contracts/src/endpoints.ts`, uma linha no
  `MATRIX` de `apps/api/test/security/authorization-matrix.ts` e `route-declarations.spec.ts`.
- **Build dos contratos**: mudanças em `packages/contracts` exigem
  `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- **Isolamento de módulo**: `activities` e `student-activities` não importam
  `modules/attendance`; só leem as tabelas nas próprias consultas (research M1).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: entrega a migração, a permissão, os contratos e a regra pura de situação na
  sala.
- **US1** (chamada e visibilidade): é o primeiro elo.
- **US2** (atrasado, desmarcar): estende a rota da US1.
- **US3** (pausa declarada) e **US5** (pausa do professor): compartilham as tabelas e o bloqueio
  de escrita.
- **US4** (correção): lê o que US1–US3 gravam.
- **MVP**: US1–US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US5).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: configuração, códigos de erro e contratos compartilhados.

- [X] T001 [P] Configuração `RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR` (padrão 20).
  - Acrescentar em `apps/api/src/platform/config/config.schema.ts` e `apps/api/.env.example`.
  - Teste de valor padrão e de recusa de não positivos em
    `apps/api/test/integration/platform.spec.ts`.
- [X] T002 [P] Códigos de erro em `packages/contracts/src/common/errors.ts`,
  `apps/api/src/platform/http/errors.ts` e `apps/web/lib/messages/error-messages.ts`, com o teste
  `apps/web/lib/messages/error-messages.test.ts`:

  | Código | Mensagem |
  |---|---|
  | `ATTEMPT_PAUSED` | "Atividade pausada. Peça ao professor para liberar o seu retorno." |
  | `ATTENDANCE_STARTED` | "O aluno já iniciou. Use Pausar aluno." |
  | `ATTENDANCE_NOT_REQUIRED` | — |
  | `STUDENT_NOT_IN_CLASS` | — |
- [X] T003 [P] Criar `packages/contracts/src/attendance/{enums,room,pauses}.ts`.
  - Enums: `ReleaseModeSchema` (`ALL_ENROLLED | PRESENT_ONLY`), `RoomStatusSchema`,
    `PauseInitiatorSchema` e `PauseReasonSchema` (com `StudentPauseReasonSchema`, sem `TEACHER`).
  - Chamada: `AttendanceBatchSchema` (`mark`/`unmark` com 0–200 itens cada, disjuntos, não ambos
    vazios) e `RoomSchema`.
  - Pausas: `TeacherPauseSchema`, `StudentPauseSchema`, `DeclareExitSchema` (`note` 1–200 só com
    `OTHER`), `MyPauseSchema` e `AttemptPausesSchema`.
  - Constantes `PAUSE_NOTE_MAX = 200` e `ATTENDANCE_BATCH_MAX = 200`.
  - Exportar tudo em `packages/contracts/src/index.ts`.
  - Testes em `packages/contracts/test/attendance.spec.ts`: recusa dos campos do servidor
    (`markedAt`, `startedAt`, `releasedAt`, `initiatedBy`, `reason: "TEACHER"` no aluno), 0/1/200/201
    ids, nota 0/1/200/201, `016/FR-011`.
- [X] T004 Mudanças nos contratos de `packages/contracts/src/activities/` (`enums`, `teacher` e
  `student`).
  - `RosterStatusSchema` += `ABSENT`.
  - `TeacherActivitySummary`/`TeacherActivity` ganham `releaseMode` e
    `attendance: { present, enrolled } | null`.
  - A linha do roster ganha `markedAt` e `pauses: { count, secondsAway, open }`.
  - `StudentActivity` ganha `pause` e `pauses`.
  - `CreateActivity` continua estrito: `releaseMode` no corpo → 400.
  - Testes em `packages/contracts/test/activities.spec.ts` (`016/FR-001`, `016/FR-019`).
  - Os campos entram aqui, mas só são preenchidos nas tarefas das histórias. Até lá a API devolve
    `null`, zeros ou listas vazias, nunca um valor inventado.

**Checkpoint**: `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test` verde.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, permissão, regra pura e esqueleto do módulo. ⚠️ Nenhuma história começa
antes desta fase.

- [X] T005 Teste primeiro: `apps/api/test/integration/016-schema.spec.ts`, com as regras de
  `data-model.md`. O teste cobre:
  - `release_mode`: o CHECK por tipo (EXERCISE sempre `ALL_ENROLLED`) e a imutabilidade.
  - `activity_attendances`: só em atividade `PRESENT_ONLY` ACTIVE, aluno com matrícula ACTIVE na
    turma da atividade, `class_id` igual ao da atividade; sem UPDATE; DELETE recusado com
    tentativa.
  - Início: `activity_attempts` INSERT de atividade `PRESENT_ONLY` sem presença é recusado.
  - `attempt_pauses`:
    - CHECK iniciador ↔ motivo e CHECK de nota só em `OTHER` (≤ 200);
    - uma pausa aberta por tentativa (UNIQUE parcial);
    - só em tentativa `IN_PROGRESS` de atividade `PRESENT_ONLY` ACTIVE;
    - `released_*` gravados juntos e uma vez; sem DELETE.
  - Gatilhos de defesa: escrita em `activity_answers`, `activity_submissions`,
    `attempt_integrity_events` e `work_help_requests` é recusada com a pausa aberta e a atividade
    ACTIVE. A submissão de aceitação do professor (`accepted_by_id` preenchido) passa, com a
    atividade ACTIVE (prazo vencido, sem atraso) ou encerrada.
- [X] T006 Migração `apps/api/prisma/migrations/<ts>_attendance_gated_release/migration.sql` e
  `apps/api/prisma/schema.prisma`, com T005 verde ao final. A migração cria:
  - o enum `activity_release_mode`, a coluna `class_activities.release_mode` (padrão
    `ALL_ENROLLED`, CHECK por tipo, entra nas colunas imutáveis do gatilho 012);
  - os enums `attempt_pause_initiator` e `attempt_pause_reason`;
  - as tabelas `activity_attendances` e `attempt_pauses`, com FKs compostas, índices, CHECKs e
    gatilhos;
  - o gatilho de início com presença e os 4 gatilhos de defesa;
  - o seed da permissão `chamada.registrar` para TEACHER.

  Também na mesma tarefa:
  - `resetDb` (`apps/api/test/helpers/`) apaga as tabelas novas na ordem certa;
  - `domain-boundary.spec.ts` fixa `ActivityAttendance` e `AttemptPause`.
- [X] T007 [P] Regras puras com testes, todas recebendo `now` do chamador:
  - `apps/api/src/modules/attendance/room-status.ts` + `room-status.spec.ts`: a tabela "Derived"
    de `data-model.md` (`NOT_MARKED`, `PRESENT`, `ANSWERING`, `OUT_OF_ROOM`, `SUBMITTED`).
  - `apps/api/src/modules/activities/status/pause-time.ts` + `pause-time.spec.ts` (research M1:
    fica em `activities` porque o roster o usa e `activities` não importa `attendance`):
    - o fim efetivo de uma pausa (`released_at`, senão o `submitted_at` da aceitação do
      professor, senão `closed_at`/`cancelled_at`, senão aberta);
    - `seconds` e `endedBy` (`RELEASE` | `ACCEPTED` | `ACTIVITY_CLOSED` | `null`);
    - o total fora por tentativa.
- [X] T008 [P] Esqueleto `apps/api/src/modules/attendance/attendance.module.ts`, registrado em
  `AppModule`.
  - `apps/api/test/attendance-boundary.spec.ts` (research M12): `attendance` (API e
    `apps/web/features/attendance`) não importa módulos de IA, `work-help`, `attempt-integrity`,
    `works/grading`, bancos, execução de código nem aritmética de float.
  - `apps/api/test/activities-boundary.spec.ts`: acrescentar `attendance` aos módulos que
    `activities`/`student-activities` não podem importar.
- [X] T009 Acrescentar `016` ao `SPECS` de `apps/api/test/traceability.spec.ts` (regra do
  CLAUDE.md), com `pending: { stories: [1, 2, 3, 4, 5], successCriteria: ["SC-001", …, "SC-010"] }`.
  - Cada história sai de `pending` na tarefa que escreve o último teste dela.
  - Cada SC sai de `pending` quando o teste que o cita entra.
  - O próprio guarda recusa um pendente já coberto.
  - Ao fim da T045, `pending` está vazio.

**Checkpoint**: migração aplicada, regras puras verdes e guardas verdes.

---

## Phase 3: User Story 1 — Professor faz a chamada e libera o trabalho aos presentes (Priority: P1) 🎯 MVP

**Goal**: um trabalho novo nasce invisível. A chamada libera o trabalho a cada aluno marcado, e
os demais recebem 404 em todas as vias. Exercícios não mudam.

**Independent Test**: aplicar a uma turma de 3, marcar 2, e conferir:
- os 2 marcados veem e iniciam;
- o terceiro recebe 404 em lista, dashboard, detalhe, início e salvamento.

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] `apps/api/test/integration/016-us1-release.spec.ts`, cobrindo:
  - os cenários `016/US1-1`, `016/US1-2`, `016/US1-3`, `016/US1-4`, `016/US1-5`, `016/US1-6` e
    `016/US1-7`;
  - `016/FR-001`, `016/FR-003`, `016/FR-006`, `016/FR-007`, `016/FR-008` e `016/FR-010`;
  - `016/SC-005` (40 alunos, "Marcar todos" com 3 desmarcados → 37 em um lote) e `016/SC-006`.

  O que o teste verifica:
  - "Aguardando chamada" é `attendance.present = 0`;
  - um trabalho agendado não aparece antes da publicação, mesmo com presença;
  - o Exercício segue visível a todos e a rota de chamada responde `409 ATTENDANCE_NOT_REQUIRED`;
  - `student_access.denied` com `reason: NOT_PRESENT`;
  - um trabalho aplicado antes (fábrica, `ALL_ENROLLED`) segue visível.
- [X] T011 [P] [US1] `apps/api/test/security/016-isolation.spec.ts` (`016/SC-001`), com professores
  A/B e alunos A1 (presente), A2 (não marcado) e B1.
  - A2 recebe 404, sem título nem existência, em todas as rotas do aluno:
    - lista, dashboard e detalhe;
    - início, salvamento e entrega;
    - eventos 015, ajuda 015, pausa e leitura da pausa.
  - O professor B recebe 404 na chamada de A.
  - ADMIN e MANAGER recebem 403.
  - Nenhuma resposta ao aluno contém a chamada nem a presença de outro.

### Implementation for User Story 1

- [X] T012 [US1] `apps/api/src/modules/attendance/attendance.{controller,service}.ts`. Vem
  primeiro porque o helper da T013 a usa. Nesta tarefa a atividade criada pela API ainda nasce
  `ALL_ENROLLED`, e as rotas são testadas com atividades da fábrica: `createActivity` em
  `apps/api/test/helpers/activities.ts` ganha a opção `releaseMode` (padrão `ALL_ENROLLED`).
  - Rotas, sob `ClassContextPolicy` e com `chamada.registrar`:
    - `GET …/activities/:activityId/attendance` → `Room`, em 3 consultas;
    - `POST …/attendance` → lote `{ mark, unmark }`.
  - O lote é tudo ou nada:
    - trava `FOR UPDATE` as presenças a desmarcar;
    - `409 ATTENDANCE_STARTED` com `details.studentUserIds` se algum tem tentativa;
    - `422 STUDENT_NOT_IN_CLASS` para id sem matrícula ACTIVE;
    - `409 ACTIVITY_CLOSED` com a atividade encerrada;
    - `409 ATTENDANCE_NOT_REQUIRED` em `ALL_ENROLLED`.
  - Marcar usa `ON CONFLICT DO NOTHING`; repetições não auditam.
  - Auditoria: `attendance.marked` e `attendance.unmarked` por aluno efetivamente alterado.
  - Visões em `apps/api/src/modules/attendance/views.ts`.
  - O teste cita `016/FR-002` (cada atividade tem a própria chamada: marcar na atividade A não
    libera a B da mesma turma) e `016/FR-020` (situação na sala de cada aluno).
  - Catálogo, `MATRIX` e `route-declarations`.
- [X] T013 [US1] Helpers de teste:
  - `apps/api/test/helpers/attendance.ts`: `markPresent(client, classId, activityId, ids)`,
    `getRoom` e `unmark`.
  - `applyWork` em `apps/api/test/helpers/activities.ts` ganha `attendance?: "ALL" | "NONE"`,
    padrão `"ALL"`. Com `"ALL"`, depois de criar, ele marca presentes todos os alunos ACTIVE da
    turma pela rota nova. Assim as suítes 012/013/015 continuam com o comportamento de antes.
  - `journey.ts` passa a marcar a presença explicitamente.
  - O helper só marca quando a atividade criada vem com `releaseMode: "PRESENT_ONLY"`. Antes da
    T014 nenhuma vem assim, então a suíte continua verde entre as tarefas sem engolir erros.
- [X] T014 [US1] Atividades, em conjunto com a T015 (as duas mudam o que o aluno vê; a fase só
  fica verde com as duas):
  - `apps/api/src/modules/activities/activities.service.ts` cria todo ASSIGNMENT com
    `releaseMode: PRESENT_ONLY`;
  - `activity.published` ganha `releaseMode` (`audit-event-types.ts`);
  - os resumos e o detalhe do professor ganham `releaseMode` e
    `attendance: { present, enrolled }`, numa contagem agregada sem N+1, em
    `apps/api/src/modules/activities/activity-query.ts`.
- [X] T015 [US1] Visibilidade (research M4), com o 404 da resposta igual ao de hoje, e T010–T011
  verdes ao final. A cláusula
  `release_mode = 'ALL_ENROLLED' OR EXISTS (presença)` entra em:
  - `visibleTo` e `ownAttempt` de
    `apps/api/src/modules/student-activities/student-activity-loader.ts`;
  - `lockContext` de `apps/api/src/modules/student-activities/attempts.service.ts`.

  `deniedReason` ganha `NOT_PRESENT` e o tipo `DeniedReason` é atualizado. Ao final,
  `pnpm --filter api test` inteiro verde: as suítes 012/013/015 passam pelo helper da T013.
- [X] T016 [P] [US1] Testes web, escritos primeiro:
  - `apps/web/features/attendance/components/attendance-tab.test.tsx`:
    - "Marcar todos" / "Desmarcar todos" e o contador;
    - o diálogo "Liberar o trabalho para n alunos?" e o envio só das diferenças;
    - axe e teclado.
  - `apps/web/features/activities/components/activity-list.test.tsx`: "Aguardando chamada" e
    "n de m presentes" por texto.
  - Os testes web das telas novas (T016, T023, T032, T036) citam `016/FR-023` nos títulos dos
    casos de estados (carregando, vazio, erro, sem conexão), axe e teclado.
- [X] T017 [US1] Web, com T016 verde:
  - `apps/web/features/attendance/{api,hooks,schemas}`, com `useRoom` sondando a cada
    `ATTENDANCE_POLL_MS = 5000` só com a página visível;
  - `components/attendance-tab.tsx` com a lista de verificação antes da primeira liberação;
  - a aba "Chamada" no detalhe da atividade `PRESENT_ONLY` e os textos de lista e detalhe em
    `apps/web/features/activities/components/`.
- [X] T018 [US1] Web do aluno, com o teste do hook em
  `apps/web/features/student-activities/hooks/use-student-activities.test.tsx` (`016/FR-009`):
  "Minhas atividades" e o dashboard sondam a cada 5 s com a página visível.
- [X] T019 [US1] E2E existentes: `student-portal.spec.ts`, `controlled-work.spec.ts`,
  `code-highlighting.spec.ts` e os demais que aplicam um trabalho pela interface ganham o passo
  "Chamada → Marcar todos → Liberar". Rodar só depois que o usuário consentir com a redefinição do
  banco E2E.

**Checkpoint**: só os presentes veem o trabalho, e 012/013/015 continuam verdes.

---

## Phase 4: User Story 2 — Aluno atrasado e presença marcada por engano (Priority: P1)

**Goal**: marcar depois libera na hora. Desmarcar só é possível sem tentativa.

**Independent Test**:
- liberar a 2 alunos; o terceiro não vê; marcá-lo faz o trabalho aparecer;
- desmarcar quem não iniciou tira o trabalho;
- desmarcar quem já iniciou é recusado.

### Tests for User Story 2 ⚠️

- [ ] T020 [P] [US2] `apps/api/test/integration/016-us2-late.spec.ts`: `016/US2-1`, `016/US2-2`,
  `016/US2-3`, `016/US2-4`, `016/US2-5`, `016/FR-004`, `016/FR-005` e `016/SC-002`.
  - Marcar depois da publicação, depois do prazo e com outros respondendo.
  - O prazo é o da turma.
  - Desmarcar sem tentativa some com o trabalho e é auditado.
  - Desmarcar com tentativa → `409 ATTENDANCE_STARTED`.
  - Dois lotes iguais → uma presença.
- [ ] T021 [P] [US2] `apps/api/test/security/016-concurrency.spec.ts` (parte da chamada,
  `016/SC-007`):
  - 10 marcações simultâneas do mesmo aluno → uma linha e um evento de auditoria;
  - desmarcar × iniciar simultâneos → ou a tentativa existe e a presença fica, ou não há tentativa
    nem presença; nunca uma tentativa sem presença.

### Implementation for User Story 2

- [ ] T022 [US2] Ajustes em `attendance.service.ts`, se T020–T021 exigirem: a ordem de travas entre
  o lote e o início (presença `FOR UPDATE` no lote, `FOR SHARE` no gatilho de início).
- [ ] T023 [US2] Web, com o teste `room-panel.test.tsx` primeiro: o painel da sala em
  `apps/web/features/attendance/components/room-panel.tsx`.
  - "Marcar presente" envia um lote de 1 na hora.
  - "Desmarcar" só aparece para "Presente".
  - O 409 mostra "O aluno já iniciou. Use Pausar aluno.".

**Checkpoint**: o atrasado recebe o trabalho, e o engano é corrigível antes do início.

---

## Phase 5: User Story 3 — Aluno sai da sala e a tentativa pausa até o professor liberar (Priority: P1)

**Goal**: a saída declarada pausa a tentativa em todos os dispositivos. Só o professor libera, e
o aluno retoma sem perder nada. O prazo corre.

**Independent Test**:
- responder 2 questões e declarar "Beber água";
- um segundo dispositivo não vê questões e não salva;
- o professor libera o retorno;
- as 2 respostas estão intactas.

### Tests for User Story 3 ⚠️

- [ ] T024 [P] [US3] `apps/api/test/integration/016-us3-pause.spec.ts`:
  - cenários `016/US3-1` a `016/US3-10`, cada um no seu `it`;
  - `016/FR-011`, `016/FR-012`, `016/FR-013`, `016/FR-014`, `016/FR-015`, `016/FR-017` e
    `016/FR-018`.

  O que o teste verifica:
  - a leitura com pausa aberta traz `pause` e omite questões e respostas, em outra sessão do
    mesmo aluno;
  - salvar e entregar → `409 ATTEMPT_PAUSED` com `activity_submission.rejected`; eventos e ajuda
    → `409 ATTEMPT_PAUSED` com `attempt_pause.write_refused` (`operation` `EVENTS`/`HELP`);
  - a visão pausada só tem os campos da lista fechada (`016/FR-022`);
  - uma ajuda `REQUESTED` antes da pausa é entregue durante ela e aparece depois do retorno;
  - prazo vencido sem atraso e a pausa aberta com a atividade ACTIVE: o professor aceita
    (012 FR-006b), a pausa termina com `endedBy: ACCEPTED` e
    `activity_submission.accepted_by_teacher.pauseEnded = true`;
  - uma pausa repetida devolve a mesma (200);
  - liberar devolve à questão e mantém as respostas;
  - o prazo vencido durante a pausa aplica a regra da 012, com FR-006b disponível;
  - o encerramento e o cancelamento terminam a pausa por derivação (`endedBy: ACTIVITY_CLOSED`),
    com `pausedCount` em `activity.closed` e em `activity.cancelled`;
  - uma pausa em trabalho CONTROLLED não gera evento de foco;
  - nada altera nota nem entrega;
  - `ALL_ENROLLED` → `409 ATTENDANCE_NOT_REQUIRED`.
- [ ] T025 [P] [US3] `apps/api/test/security/016-paused-writes.spec.ts` (`016/SC-003`).
  - Com a pausa aberta, nenhuma rota do aluno, em nenhuma sessão, devolve enunciado ou resposta.
  - Escrita direta pelo Prisma nas 4 tabelas também é recusada pelos gatilhos.
- [ ] T026 [P] [US3] `apps/api/test/security/016-concurrency.spec.ts` (parte da pausa,
  `016/SC-007`):
  - 10 declarações simultâneas → uma pausa aberta;
  - salvar × pausar e entregar × pausar → ordem consistente, nada de entrega a partir de PAUSADA;
  - liberar duas vezes → encerra uma vez, sem tocar uma pausa seguinte.
- [ ] T027 [P] [US3] `apps/api/test/security/016-rate-limits.spec.ts`: a 21ª declaração na hora →
  429, contada no `tx` da operação.

### Implementation for User Story 3

- [ ] T028 [US3] Bloqueio de escrita (research M6). Depois da trava da tentativa, uma pausa aberta
  → `409 ATTEMPT_PAUSED` em:
  - salvar e entregar, em `apps/api/src/modules/student-activities/attempts.service.ts`, com o
    `Refused` da 012 para auditar;
  - eventos, em `apps/api/src/modules/attempt-integrity/focus-events.service.ts`;
  - ajuda, em `apps/api/src/modules/work-help/work-help.service.ts`.

  `OwnAttemptContext` ganha `paused` em `student-activity-loader.ts`. As recusas de eventos e de
  ajuda gravam `attempt_pause.write_refused` depois do rollback, no padrão do `guarded` da 012
  (tipo novo em `audit-event-types.ts`, `contracts/audit-events.md` e `journey.ts`).
- [ ] T029 [US3] Visão do aluno:
  - `loadOne` lê a pausa aberta;
  - `apps/api/src/modules/activities/views/student-view.ts` copia `pause` pela lista fechada e,
    com a pausa aberta, devolve `questions: []` e `attempt.answers: []`.
- [ ] T030 [US3] `apps/api/src/modules/attendance/my-pause.{controller,service}.ts`:
  - `POST /me/activities/:activityId/attempt/pause`, com `lockContext`, a tentativa `FOR UPDATE`,
    as checagens e o insert, o rate limit no `tx` e a auditoria `attempt_pause.started`;
  - `GET /me/activities/:activityId/attempt/pause`.

  Também na mesma tarefa: catálogo, `MATRIX` e auditoria (journey).
- [ ] T031 [US3] `apps/api/src/modules/attendance/pauses.{controller,service}.ts`, com T024–T027
  verdes (`attempt_pause.write_refused` entra em `audit-event-types.ts` e no journey na T028):
  - `POST …/pauses/:pauseId/release` sob `ClassContextPolicy`, chaveado pela pausa, idempotente,
    `409 ACTIVITY_CLOSED`, auditoria `attempt_pause.released` com `seconds`;
  - `activities.service`: `pausedCount` em `activity.closed` e `activity.cancelled`;
    `pauseEnded` em `activity_submission.accepted_by_teacher`. A aceitação de uma tentativa
    pausada é permitida (o gatilho de defesa a isenta).
- [ ] T032 [P] [US3] Testes web, escritos primeiro:
  - `apps/web/features/attendance/components/exit-room-dialog.test.tsx`:
    - os motivos e "Outro" com até 200 caracteres;
    - o aviso de prazo;
    - sem conexão → "Avise o professor antes de sair.";
    - axe e teclado.
  - `paused-notice.test.tsx`:
    - `role="status"`;
    - a sondagem e "Retomar";
    - a retomada em modo controlado pelo aviso da 015.
  - No painel: "Fora da sala — <motivo>, desde HH:MM" ordenado primeiro, e "Liberar retorno"
    (`016/FR-020`).
  - `apps/web/features/controlled-attempt/components/controlled-attempt.test.tsx`
    (`016/FR-017`, research M10): na saída declarada, o monitor para antes de sair da tela
    cheia, e nenhum `SCREEN_LEFT` nem `FULLSCREEN_EXITED` entra na fila. A ordem é verificada
    por chamada: monitor parado → autosave e fila enviados → pausa → saída da tela cheia. Na
    retomada, o aviso "Retomar em modo controlado" pede a tela cheia por gesto.
- [ ] T033 [US3] Web, com T032 verde:
  - `ExitRoomDialog` e `PausedNotice` em `apps/web/features/attendance/components/`;
  - `useMyPause`, sondando a cada 5 s;
  - integração em `features/student-activities/components/activity-answering.tsx` e em
    `features/controlled-attempt/components/controlled-attempt.tsx`, na ordem de research M10:
    1. parar o monitor;
    2. enviar o autosave e a fila de eventos;
    3. pausar;
    4. sair da tela cheia.
  - Um 409 `ATTEMPT_PAUSED` em salvamento mostra o aviso e guarda as respostas não enviadas
    (012 FR-019).
  - No painel: "Liberar retorno".

**Checkpoint**: MVP completo — chamada, atrasado e pausa com retorno.

---

## Phase 6: User Story 4 — Professor vê presença e pausas ao corrigir (Priority: P2)

**Goal**: "Ausente" separado de "Não entregou", e as pausas na lista e na correção. O aluno vê as
próprias pausas no histórico.

**Independent Test**: com 1 ausente, 1 aluno com 2 pausas e 1 sem pausa, conferir a lista e a
correção.

### Tests for User Story 4 ⚠️

- [ ] T034 [P] [US4] `apps/api/test/integration/016-us4-review.spec.ts`: `016/US4-1`, `016/US4-2`,
  `016/US4-3`, `016/US4-4`, `016/FR-019`, `016/FR-021` e `016/SC-008`.
  - `ABSENT` fora de `MISSED` e fora de `missedCount`.
  - `markedAt` e `pauses` por aluno.
  - `GET …/attempts/:attemptId/pauses` com durações e iniciador.
  - O histórico do aluno com as próprias pausas só depois da entrega.
  - Nenhuma nota alterada.

### Implementation for User Story 4

- [ ] T035 [US4] Roster e revisão:
  - `apps/api/src/modules/activities/roster.ts` e `status/roster-status.ts` passam a ter `ABSENT`,
    `markedAt` e `pauses`, usando `activities/status/pause-time.ts` (T007, research M1).
  - `GET …/attempts/:attemptId/pauses` em `pauses.controller.ts`, com `entregas.visualizar`;
    catálogo e `MATRIX`.
  - `pauses` na visão do aluno depois da entrega, em `student-view.ts`.
- [ ] T036 [US4] Web, com os testes primeiro:
  - roster: o status "Ausente" e as colunas "Presença" e "Pausas", em
    `features/activities/components/activity-detail.tsx`;
  - "Saídas da sala" em `attempt-review.tsx`, com "Encerrada com a atividade";
  - pausas em `features/student-activities/components/student-history.tsx`.

**Checkpoint**: o professor tem o quadro da aula na correção.

---

## Phase 7: User Story 5 — Professor pausa um aluno (Priority: P3)

**Goal**: "Pausar aluno" com o mesmo efeito da pausa declarada e o motivo "Pausado pelo
professor".

**Independent Test**: pausar pelo professor, conferir que o aluno fica sem acesso em todo
dispositivo, liberar e continuar.

- [ ] T037 [P] [US5] `apps/api/test/integration/016-us5-teacher-pause.spec.ts`: `016/US5-1`,
  `016/US5-2`, `016/US5-3` e `016/FR-016`.
  - Pausa com `initiatedBy: TEACHER`.
  - Sem tentativa ou entregue → 409.
  - Pausa já aberta → a mesma (200).
  - Auditoria `attempt_pause.started` com ator professor.
- [ ] T038 [US5] `POST …/students/:studentUserId/pause` em `pauses.{controller,service}.ts`:
  - mesma transação da pausa do aluno, com a tentativa do aluno-alvo `FOR UPDATE`;
  - catálogo e `MATRIX`.
- [ ] T039 [US5] Web, com o teste primeiro:
  - "Pausar aluno" com confirmação em `room-panel.tsx`;
  - o aluno pausado pelo professor vê o aviso na próxima sondagem ou no 409 de salvamento, com
    "Pausado pelo professor".

**Checkpoint**: todas as histórias entregues.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T040 Auditoria e journey (`016/SC-009`):
  - `apps/api/test/helpers/journey.ts` com presença, desmarcação, pausa do aluno, pausa do
    professor e retorno;
  - `audit-coverage.spec.ts`: metadados só com ids e enums;
  - `secret-leak-scan.spec.ts` com o marcador `MARCADOR-NOTA-016` no texto de "Outro", fora de
    auditoria e logs.
- [ ] T041 [P] Segurança restante em `apps/api/test/security/`:
  - `016-boundaries.spec.ts`: campos do servidor → 400, 0/1/200/201 ids, nota 0/1/200/201, motivo
    fora da lista, `reason: TEACHER` vindo do aluno;
  - `016-performance.spec.ts`: sala de 60 alunos p95 < 300 ms, lote de 60 < 500 ms, pausa e
    retorno p95 < 200 ms, lista do aluno sem regressão em relação a 012-performance;
  - `016/FR-024` em `016-boundaries.spec.ts`: Exercício sem chamada nem pausa (rotas →
    `409 ATTENDANCE_NOT_REQUIRED`), prazo igual antes e depois de uma pausa, nenhuma rota nova
    fora do catálogo de `contracts/http-api.md`.
- [ ] T042 [P] Web: `apps/web/test/student-portal-xss.test.tsx` cobre a nota de "Outro" no painel,
  na correção e no histórico. `token-usage`, `identity`, `docs` e `catalog.test.tsx` ficam verdes
  com os componentes novos.
- [ ] T043 E2E `apps/web/e2e/attendance.spec.ts` (`016/SC-002`, `016/SC-004`, `016/SC-010`), com o
  professor e 2 alunos em contextos separados:
  1. o professor aplica e o aluno não vê;
  2. a chamada libera para um aluno;
  3. o aluno inicia, sai da sala e o painel mostra a saída;
  4. o professor libera e o aluno retoma com a resposta intacta;
  5. o atrasado é marcado e vê o trabalho;
  6. tudo pelo teclado;
  7. `016/SC-005`: numa turma de 40 alunos criada pelo setup, "Marcar todos", desmarcar 3 e
     liberar leva menos de 1 minuto de relógio no teste.

  A redefinição do banco E2E pede consentimento do usuário.
- [ ] T044 [P] Documentação:
  - `CLAUDE.md`: Project state com a 016, as regras fáceis de errar da chamada e da pausa, e o
    contrato `attendance` na lista de domínios;
  - `apps/api/CLAUDE.md`: módulo `attendance`, helpers e suítes 016;
  - `apps/web/CLAUDE.md`: `features/attendance` e a sondagem;
  - `README.md`.
- [ ] T045 Rodar o `quickstart.md` de ponta a ponta e `pnpm lint && pnpm check-types && pnpm test`.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T004) → Foundational (T005–T009) → histórias.
- **US1 (T010–T019)**: depende da Foundational e destrava todas as outras. Dentro dela a ordem é
  T012 (rota de chamada) → T013 (helper `applyWork` com presença) → T014 + T015 (trabalho nasce
  `PRESENT_ONLY` e a visibilidade muda). T014 e T015 entram juntas, e só então as suítes
  012/013/015 voltam a depender da presença.
- **US2 (T020–T023)**: estende a rota da US1.
- **US3 (T024–T033)**: depende da US1 (presença para iniciar).
- **US5 (T037–T039)**: depende da US3 (mesma tabela, bloqueio e retorno).
- **US4 (T034–T036)**: lê o que US1–US3 gravam.
- **Polish**: depois de todas.
- **Dentro de cada história**: testes → regras puras → serviços e rotas → web.

## Parallel Opportunities

- **Setup**: T001, T002 e T003 juntos; T004 em seguida.
- **Foundational**: T007 e T008 em paralelo depois de T006.
- **US1**: T010, T011 e T016 juntos.
- **US2 e US3**: andam em paralelo depois da US1. Dentro da US3, T024–T027 e T032 juntos.
- **Polish**: T041, T042 e T044 em paralelo.

## Implementation Strategy

1. **MVP** = Setup + Foundational + US1 + US2 + US3: só os presentes recebem o trabalho, o atrasado
   é marcado depois e a saída da sala pausa até o professor liberar.
2. **Incremento 2**: US4 (ausentes e pausas na correção e no histórico).
3. **Incremento 3**: US5 (pausa pelo professor) e Polish (segurança, E2E, docs).
