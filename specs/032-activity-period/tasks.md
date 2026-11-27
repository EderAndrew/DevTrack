---
description: "Task list for 032 — Período de aplicação da prova e do trabalho"
---

# Tasks: 032 — Período de aplicação da prova e do trabalho

**Input**: Design documents from `/specs/032-activity-period/`
**Prerequisites**: plan.md, spec.md, research.md (AP1–AP10), data-model.md, contracts/ (http-api, audit-events, ui),
quickstart.md

**Tests**: obrigatórios e escritos antes da implementação (constituição VII, `CLAUDE.md`). Todo título de teste cita o id
do cenário (`032/US1-3`) ou do critério (`032/SC-002`), porque `traceability.spec.ts` confere.

**Organization**: por história. US1 e US2 (P1) dividem a mudança de tempo da prova, que vive na fundação (Phase 2) porque
a migração, os contratos e `exam-time.ts` mudam juntos; cada história depois fecha o seu comportamento e os seus testes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta)
- **[Story]**: a história do spec (US1–US4)

## Path Conventions

`packages/contracts/src/…`, `apps/api/src/modules/…`, `apps/api/prisma/…`, `apps/api/test/…`, `apps/web/features/…`,
`apps/web/e2e/…`, `apps/mobile/…` (só leitura de compatibilidade).

---

## Phase 1: Setup (Shared Infrastructure)

- [X] T001 Incluir a 032 em `SPECS` de `apps/api/test/traceability.spec.ts` (`feature: "032"`, `path:
  "specs/032-activity-period/spec.md"`, `stories: 4`, `scenarios: 22 // 7 + 5 + 6 + 4`, `rows: 0`, `rowsWithoutIds: []`,
  `successCriteria: sc(1, 6)`) com `pending: { stories: ["US1", "US2", "US3", "US4"], successCriteria: ["SC-001", …,
  "SC-006"] }`; atualizar a lista de features no `CLAUDE.md` (seção do guard de rastreabilidade) para incluir 032.
- [X] T002 [P] Anotar a substituição nos specs antigos, sem mudar regra: em `specs/018-controlled-exams/spec.md` e
  `specs/012-student-portal/spec.md`, uma nota "Substituído pela 032
  (período)" junto aos FRs da janela de início e da política de atraso.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: migração, contratos e o cálculo de tempo da prova; nada de história funciona sem isso.

### Tests for Foundational ⚠️

- [X] T003 [P] Teste de schema/migração em `apps/api/test/integration/032-schema.spec.ts` (modelo:
  `018-schema.spec.ts`): (a) `deadline` obrigatório em EXAM e ASSIGNMENT, nulo em EXERCISE (CHECK); (b) EXAM com `deadline
  < publish_at + duration` → violação; (c) `start_window_minutes` não existe; (d) trigger, sem depender de relógio: o
  `deadline` de uma EXAM **com tentativa** não diminui (aumentar passa, diminuir falha); sem tentativa muda livre (a regra
  "publicada ⇒ só estender" é do serviço, T017); (e) `exam_attempt_holds_transition` RETURNED recusa quando `now() >=
  deadline` mesmo com duração sobrando; (f) **invariante da conversão** (`032/US4-1`, `032/SC-005`): a migração escreve o
  backfill como `UPDATE … SET deadline = publish_at + make_interval(mins => start_window_minutes + duration_minutes)`; o
  teste verifica, com valores literais na mesma expressão SQL (`SELECT $publish + make_interval(…)`), que o resultado é o
  `closesAt` antigo, e com a função pura `endsAt` (T005) que toda tentativa iniciada até `publish + janela` tem o mesmo
  fim antes e depois (o banco de teste já está migrado, então não há linha pré-032 para converter).
- [X] T004 [P] Testes de contrato em `packages/contracts/test/activity-period.spec.ts`: criar ASSIGNMENT sem `deadline`
  → erro; com `latePolicy` → erro (strict); EXAM exige `deadline`; EXAM com `startWindowMinutes` → erro; refinamento
  `deadline > publishAt` em ambos; `UpdateActivityRequestSchema` recusa `latePolicy` e aceita `deadline`;
  `ActivityExamSchema` sem `startWindowMinutes`; `ExamMonitorSchema` e `MobileExamListItemSchema` inalterados (mesmas
  chaves que antes — compatibilidade AP4).
- [X] T005 [P] Testes puros de `apps/api/src/modules/activities/status/exam-time.spec.ts` (reescrever os da janela):
  `canStart` de `publishAt` a `deadline` inclusive; `endsAt = min(início + duração, deadline, closedAt, cancelledAt)`;
  `closesAt = startDeadline = deadline`; o fim pelo período não é `endedByActivity` (fica `TIME_EXPIRED`, AP3); estender
  `deadline` aumenta o `endsAt` só de quem estava cortado. No mesmo commit, testes puros de
  `apps/api/src/modules/activities/status/period.spec.ts` (constituição VII, AP5/AP6): `validPeriod(type, publishAt,
  deadline, durationMinutes)` (término > início; EXAM ≥ duração), `canChangeEnd({ type, phase, currentEnd, newEnd, now })`
  → `ok | INVALID_SCHEDULE | EXAM_END_CANNOT_MOVE_EARLIER | ACTIVITY_PERIOD_ENDED` (ASSIGNMENT livre após o início;
  EXAM agendada livre; publicada só posterior com o fim atual no futuro), `acceptsAttendanceMark({ type, latePolicy,
  deadline, now })` (até o término inclusive; legado `ACCEPT_MARKED` sempre).

### Implementation for Foundational

- [X] T006 Migração `apps/api/prisma/migrations/<timestamp>_032_activity_period/migration.sql` (data-model.md, AP7), numa
  transação: backfill de `deadline` das EXAM; trocar `class_activities_type_fields_chk` e `class_activities_exam_chk`;
  `CREATE OR REPLACE` de `class_activities_fixed_columns()` (partir da **versão mais recente** da função — conferir com
  `grep -l 'FUNCTION "class_activities_fixed_columns"' apps/api/prisma/migrations/*/migration.sql` e preservar o que
  015/016/021/023 acrescentaram) sem `start_window_minutes` e com "o `deadline` de uma EXAM com tentativa nunca
  diminui" (`EXISTS activity_attempts`, como a regra do modo; nunca `now()`); `CREATE OR REPLACE`
  de `exam_attempt_holds_transition()` (versão mais recente, idem) com `least(…, deadline)`; `DROP COLUMN
  start_window_minutes`. Atualizar `apps/api/prisma/schema.prisma` (remover `startWindowMinutes`, comentar `deadline`
  como fim do período para ASSIGNMENT e EXAM) e rodar `pnpm --filter api prisma generate`.
- [X] T007 Contratos em `packages/contracts/src/activities/teacher.ts` e `enums.ts` (contracts/http-api.md): `deadline`
  obrigatório no corpo de EXAM; remover `latePolicy` dos corpos de criação de ASSIGNMENT e de atualização; remover
  `startWindowMinutes` do corpo de EXAM e de `ActivityExamSchema`; remover `EXAM_START_WINDOW_*`; manter `startDeadline`
  e `closesAt` em `ActivityExamSchema`, no bloco de prova do aluno (`student.ts`), em `exam-sessions/monitor.ts` e
  `mobile/exams.ts`, com comentário "= deadline desde a 032 (AP4)". `pnpm --filter @repo/contracts build`.
- [X] T008 `apps/api/src/modules/activities/status/exam-time.ts` e `facts.ts`: `ExamTiming` troca `startWindowMinutes`
  por `deadline`; `startDeadline`, `canStart`, `endsAt`, `closesAt`, `endedByActivity` conforme AP3; `examTiming(row)`
  lê `deadline`; `isStartClosed` usa o novo `startDeadline`. Criar o puro
  `apps/api/src/modules/activities/status/period.ts` (`validPeriod`, `canChangeEnd`, `acceptsAttendanceMark`) que T016,
  T017, T018 e T028 chamam; nenhuma dessas regras fica escrita só no serviço.
- [X] T009 Varredura dos leitores de `deadline` e do tempo da prova (AP1), cada um lendo o **tipo** e nunca "tem
  deadline ⇒ é trabalho": `activities/activity-types.ts` (`hasDeadline: true` para EXAM **e** um novo `hasLatePolicy`,
  `true` só em ASSIGNMENT; ajustar `activity.state-machine.spec.ts`), `activities.service.ts` linhas ~222 e ~340 (hoje
  `hasDeadline && "deadline" in body` grava `latePolicy: body.latePolicy`, que numa EXAM violaria o CHECK: `latePolicy`
  passa a vir de `hasLatePolicy` — `REJECT` em ASSIGNMENT, `null` nos demais — e nunca do corpo),
  `activity.state-machine.ts`, `activity-query.ts`, `roster.ts`, `status/operations.ts` (EXAM segue `exam-time`, nunca
  `isPastDeadline`/`latePolicy`), `status/roster-status.ts`, `status/student-status.ts` (EXAM nunca `OVERDUE`/
  `SUBMITTED_LATE`), `snapshot/write-snapshot.ts`, `attempts-review.service.ts`, `submission/settle-exam.ts`,
  `views/teacher-view.ts`, `views/student-view.ts`, `attempt-integrity/focus-events.service.ts`,
  `attempt-integrity/integrity-review.service.ts`, `attendance/my-pause.service.ts`, `code-runs/code-runs.service.ts`,
  `exam-sessions/exam-monitor.service.ts`, `exam-sessions/exam-status.ts`, `exam-alerts/mobile-exams.service.ts`,
  `exam-nudges/exam-nudges.service.ts`, `student-activities/{attempts.service,group-work.service,my-activities.service,
  save-facts,student-activity-loader}.ts`, `work-help/work-help.service.ts`. Remover `startWindowMinutes` dos selects.
- [X] T010 [P] Testes de regressão do AP1 em `apps/api/src/modules/activities/status/status.spec.ts`: uma EXAM depois do
  `deadline` nunca é `OVERDUE` nem `SUBMITTED_LATE` para aluno ou professor, e nunca aparece em "atrasadas que ainda
  aceitam" do Painel; uma EXERCISE continua sem `deadline` (`032/SC-006`).
- [X] T011 `apps/api/src/modules/audit/audit-event-types.ts`: remover `startWindowMinutes` de `class_activity.created`
  (contracts/audit-events.md). `apps/api/src/platform/http/errors.ts`: `INVALID_SCHEDULE` com a mensagem nova,
  `EXAM_END_CANNOT_MOVE_EARLIER` (422), `ACTIVITY_PERIOD_ENDED` (409), texto novo de `EXAM_START_CLOSED` (AP9).
- [X] T012 Helpers e fixtures de teste: `apps/api/test/helpers/{activities,exams,journey,mobile,code-runs}.ts` criam
  EXAM com `deadline` (padrão: `publishAt + 15 + duração`, que reproduz o comportamento antigo) e ASSIGNMENT sem
  `latePolicy` (um parâmetro opcional `legacyLatePolicy` grava `ACCEPT_MARKED` direto no banco para os testes do
  legado); varrer os ~70 arquivos de teste (API, web, e2e, contracts) que citam `startWindowMinutes`/`latePolicy` até
  `pnpm test` passar sem mudar o que cada teste antigo verifica, exceto onde a 032 muda a regra (anotar no teste).

**Checkpoint**: `pnpm check-types` e `pnpm test` passam com a regra nova; nada visível mudou para o professor além da
ausência dos campos removidos.

---

## Phase 3: User Story 1 - Professor aplica a prova com um período e libera quem chega (Priority: P1) 🎯 MVP

**Goal**: aplicar a prova com início/término, liberar alunos durante todo o período, recusar presença depois do fim,
estender o término.

**Independent Test**: prova 19:10–22:00 com 60 min; presença às 20:30 → começa com 60 min; presença às 22:01 → recusa;
estender para 22:30 funciona, antecipar não.

### Tests for User Story 1 ⚠️

- [X] T013 [P] [US1] Integração em `apps/api/test/integration/032-us1-exam-period.spec.ts` com o `Clock` injetado:
  `032/US1-1` (criar com período; a linha gravada tem `late_policy` nulo; detalhe e monitor com `closesAt = deadline`,
  sem janela), `032/US1-2` (presença às
  20:30, início aceito, `endsAt` = início + 60), `032/US1-3` (presença depois do fim → `409 ACTIVITY_PERIOD_ENDED`,
  nada gravado, aluno continua `404`), `032/US1-4` (agendada para outro dia invisível ao aluno), `032/US1-5` ("agora" usa
  o relógio do servidor), `032/US1-6` (`422 INVALID_SCHEDULE` para fim ≤ início e período < duração, nada criado),
  `032/US1-7` (estender move o `endsAt` de quem estava cortado; antecipar → `422 EXAM_END_CANNOT_MOVE_EARLIER`; fim já
  passado → `409 ACTIVITY_PERIOD_ENDED`; agendada muda livre; mudar só o **início** de uma agendada para deixar menos que
  a duração até o término → `422 INVALID_SCHEDULE`), `032/SC-001` (todos os marcados durante o período começam).
- [X] T014 [P] [US1] Testes web em `apps/web/features/activities/components/new-activity-exam.test.tsx` e
  `activity-detail.test.tsx`: fieldset "Período" (Agora/Agendar, Término com a data do início pré-preenchida), sem
  "Limite para iniciar"; erro no campo Término (cliente e `INVALID_SCHEDULE`); detalhe "Período: … → …"; a lista de
  atividades da turma mostra o período de cada prova e trabalho (FR-008); "Estender término" só oferece horário posterior
  e mostra `EXAM_END_CANNOT_MOVE_EARLIER` no campo; axe sem violações; `032/SC-004` (o formulário tem só Início, Término e
  Duração como campos de tempo, nenhum de janela ou prazo).
- [X] T015 [P] [US1] Testes web em `apps/web/features/attendance/components/attendance-tab.test.tsx` (ou `room-panel`):
  depois do término, marcar fica desabilitado com "O período terminou: não é possível liberar mais alunos."; um `409
  ACTIVITY_PERIOD_ENDED` de corrida mostra o mesmo texto.

### Implementation for User Story 1

- [X] T016 [US1] `apps/api/src/modules/activities/activities.service.ts` `create`: EXAM grava `deadline` do corpo e valida
  `deadline > publishAt` e `deadline ≥ publishAt + duração` com o "agora" do `Clock` (`422 INVALID_SCHEDULE`); remover
  `startWindowMinutes`. Validação por `validPeriod` (T008).
- [X] T017 [US1] `activities.service.ts` `update`: aceitar `deadline` em EXAM com `canChangeEnd` (T008, AP5) sob o `FOR
  UPDATE` da atividade, com o "agora" do `Clock`; depois de qualquer mudança de `publishAt` ou `deadline`, revalidar o par
  com `validPeriod` (`422 INVALID_SCHEDULE`); `changed` inclui `deadline`; violação do trigger (EXAM com tentativa e
  término menor) mapeada para `422 EXAM_END_CANNOT_MOVE_EARLIER` se escapar a checagem.
- [X] T018 [US1] `apps/api/src/modules/attendance/attendance.service.ts` `apply`: com `batch.mark` não vazio e
  `!acceptsAttendanceMark(…)` (T008) → `409 ACTIVITY_PERIOD_ENDED`, exceto ASSIGNMENT legado `ACCEPT_MARKED` (AP6); incluir `deadline` e
  `late_policy` no `findActivity`. `readRoom`/view: expor se o período terminou (campo no contrato `RoomSchema`, ex.
  `periodEnded: boolean`, derivado do `Clock`) para a web desabilitar.
- [X] T019 [US1] Web `apps/web/features/activities/schemas/activity-form.ts` e `components/new-activity.tsx`: fieldset
  "Período" (contracts/ui.md, AP8) para EXAM; remover `startWindowMinutes` e suas constantes; `FIELD_IDS.deadline` vira
  "atividade-termino"; validação cliente igual à do servidor.
- [X] T020 [US1] Web `components/activity-detail.tsx`: "Período: …"; "Alterar período" (agendada) e "Estender término"
  (publicada, fim no futuro) pela PATCH com `deadline`. Lista de atividades da turma (o componente de lista em
  `apps/web/features/activities/components/`): coluna/linha com o período no lugar do prazo (FR-008).
- [X] T021 [US1] Web chamada (`apps/web/features/attendance/components/…`) desabilitada com `periodEnded`; monitor
  (`apps/web/features/exam-session/components/exam-room-panel.tsx` e `schemas/exam-session.ts`) com "Termina às".

**Checkpoint**: US1 testável sozinha (quickstart passos 1, 2, 4, 5).

---

## Phase 4: User Story 2 - O tempo do aluno na prova termina no fim do período (Priority: P1)

**Goal**: o tempo de quem começa tarde é cortado no término; tudo o mais de 018 segue com esse fim.

**Independent Test**: aluno começa 21:30 numa prova de 60 min até 22:00 → relógio 30 min; às 22:00 + 2 s salvar e
entregar dão tempo esgotado.

### Tests for User Story 2 ⚠️

- [X] T022 [P] [US2] Integração em `apps/api/test/integration/032-us2-period-cap.spec.ts`: `032/US2-1` (`endsAt` = 22:00
  na visão do aluno e no monitor), `032/US2-2` (salvar/entregar aceitos até 22:00 + 2 s, depois `409 EXAM_TIME_OVER`; o
  próximo acesso finaliza com `exam_attempt.time_expired` e motivo `TIME_EXPIRED`), `032/US2-3` (quem começou cedo
  termina pela duração), `032/US2-4` (espera de decisão no fim: "retornar" recusado, "Não cancelar" e cancelar aceitos;
  e o caso de borda: aluno em espera, o professor estende o término antes do fim e "retornar" passa a ser aceito,
  inclusive pelo trigger `exam_attempt_holds_transition`),
  `032/US2-5` (encerrar/cancelar antes do fim corta todos, motivo `ACTIVITY_CLOSED`), `032/SC-002`, `032/SC-003`.
- [X] T023 [P] [US2] Teste web em `apps/web/features/exam-attempt/components/exam-attempt.test.tsx` e
  `rules-screen.tsx` test: relógio conta até o `endsAt` cortado; depois do fim, sem tentativa, a tela mostra "O período
  desta prova terminou.".
- [X] T024 [P] [US2] Compatibilidade do app: rodar `pnpm --filter mobile test` sem mudar fixtures além de valores; anotar
  num teste de `apps/mobile/features/exam-room/schemas/exam-room.test.ts` (ou o existente) `032/US2-1` que o rótulo usa
  `startDeadline = closesAt = término`.

### Implementation for User Story 2

- [X] T025 [US2] Conferir que `exam-sessions` (salvar, entregar, eventos, decisões), `attempt-integrity`, `exam-alerts` e
  `exam-nudges` usam só `endsAt` de `exam-time.ts` (T008/T009); corrigir onde ainda calculem início + duração por conta
  própria. Texto de `rules-screen.tsx` para o período encerrado.

**Checkpoint**: US1 + US2 entregam a prova por período inteira (MVP).

---

## Phase 5: User Story 3 - Trabalho com período no lugar de prazo e política de atraso (Priority: P2)

**Goal**: o trabalho é aplicado com início/término, sem política de atraso; recusa tudo depois do fim; chamada recusa
presença depois do fim.

**Independent Test**: trabalho 19:10–22:00; presença 21:00, começa e entrega 21:50; às 22:00 salvar e entregar
recusados; presença 22:01 recusada.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] Integração em `apps/api/test/integration/032-us3-work-period.spec.ts`: `032/US3-1` (corpo sem
  `latePolicy`, com ela → `400`; o servidor grava `REJECT`), `032/US3-2` (presença às 21:00 libera), `032/US3-3` (no fim
  começar/salvar/entregar/ajuda/executar código recusados como `DEADLINE_PASSED` de hoje; sem entrega automática),
  `032/US3-4` (presença depois do fim → `409 ACTIVITY_PERIOD_ENDED`), `032/US3-5` (estender o término reabre salvar e
  entregar), `032/US3-6` (grupo 023 e modo controlado 015: a mesma recusa para todo o grupo; eventos inalterados).
- [ ] T027 [P] [US3] Testes web em `apps/web/features/activities/components/new-activity.test.tsx`: trabalho com
  "Período", sem "Prazo de entrega" nem "Política de atraso"; erro no Término; "Alterar término" no detalhe.

### Implementation for User Story 3

- [ ] T028 [US3] `activities.service.ts` `create`/`update` de ASSIGNMENT: gravar `latePolicy = REJECT` (por
  `hasLatePolicy`, T009); remover `latePolicy` dos campos editáveis (`EditableField`); o término do trabalho também passa
  por `validPeriod`/`canChangeEnd`.
- [ ] T029 [US3] Web: fieldset "Período" também para ASSIGNMENT em `new-activity.tsx`; remover `LatePolicyField` e
  `LATE_POLICY_LABELS` do formulário (manter o rótulo só para o selo do legado, T032); detalhe com "Alterar término".

**Checkpoint**: US3 testável sozinha (quickstart passo 6).

---

## Phase 6: User Story 4 - Atividades já aplicadas continuam funcionando (Priority: P3)

**Goal**: nada muda para atividades antigas; o legado `ACCEPT_MARKED` continua aceitando atrasado.

**Independent Test**: com linhas pré-032 (prova com janela, trabalho `REJECT`, trabalho `ACCEPT_MARKED`), migrar e
comparar períodos e situações.

### Tests for User Story 4 ⚠️

- [ ] T030 [P] [US4] Integração em `apps/api/test/integration/032-us4-legacy.spec.ts`: `032/US4-2` (trabalho `REJECT`:
  fim = prazo, mesmo comportamento), `032/US4-3` (trabalho legado `ACCEPT_MARKED`: depois do fim aceita entrega marcada
  atrasada, `SUBMITTED_LATE`, e a chamada ainda aceita presença; nenhuma entrega perde a marca), `032/US4-4` (atividade
  encerrada/cancelada/de turma arquivada: Histórico, notas, revisão e ranking iguais), `032/SC-005`. (`032/US4-1` fica em
  T003.)
- [ ] T031 [P] [US4] Teste web em `activity-detail.test.tsx`: selo "Aceita entrega atrasada (regra anterior)" só para
  `latePolicy = ACCEPT_MARKED`.

### Implementation for User Story 4

- [ ] T032 [US4] Web `activity-detail.tsx`: selo do legado; conferir que `operations.ts`/`student-status.ts` mantêm o
  caminho `ACCEPT_MARKED` (T009) e que a chamada o respeita (T018).

**Checkpoint**: todas as histórias funcionando; `pending` da 032 vazio no `traceability.spec.ts`.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T033 [P] E2E em `apps/web/e2e/exam.spec.ts` (e `attendance.spec.ts`/`student-portal-seed.ts` já ajustados em
  T012): aplicar prova com "Período" pelo formulário e liberar um aluno depois do início; `032/US1-2` no título.
- [ ] T034 [P] Documentação: regras da 018 e da 012 em "Rules that are easy to get wrong" do `CLAUDE.md` (janela →
  período; `deadline` é o fim para ASSIGNMENT e EXAM; `ACCEPT_MARKED` só legado; o fim da prova publicada só estende;
  chamada recusa depois do fim) e o item 032 em "Project state"; `apps/api/CLAUDE.md` se citar a janela.
- [ ] T035 Remover de `pending` cada história/SC conforme os testes entram (T013, T022, T026, T030, T010) e conferir
  `pnpm --filter api test test/traceability.spec.ts`.
- [ ] T036 Rodar `pnpm lint`, `pnpm check-types`, `pnpm test`, `pnpm --filter mobile test` e o quickstart no ambiente de
  dev (passos 1–8, inclusive o app instalado listando a prova).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T012)** bloqueia tudo.
- **US1 (T013–T021)** e **US2 (T022–T025)** dependem só da fundação; US2 pode correr junto de US1 (arquivos diferentes),
  mas o checkpoint do MVP pede as duas.
- **US3 (T026–T029)** depende da fundação e de T018 (chamada) e T019 (fieldset).
- **US4 (T030–T032)** depende da fundação e de T028.
- **Polish (T033–T036)** por último.

Dentro de cada história: testes (falhando) → API → web.

## Parallel Example: Foundational

```text
T003 032-schema.spec.ts   |  T004 contracts activity-period.spec.ts  |  T005 exam-time.spec.ts + period.spec.ts
```

## Parallel Example: User Story 1

```text
T013 032-us1-exam-period.spec.ts  |  T014 new-activity-exam / activity-detail tests  |  T015 attendance-tab test
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US2 → a prova por período resolve o problema do piloto. Validar com o
   quickstart 1–5 e o app instalado.
2. **Incremento 2**: US3 (trabalho) — pequeno, porque `REJECT` já é um período.
3. **Incremento 3**: US4 (legado), majoritariamente testes.
4. Polish: E2E, docs, rastreabilidade vazia, suíte completa.
