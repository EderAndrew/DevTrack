---
description: "Task list for 031 — Calendário com tipos de data (Aula, Prova, Trabalho, Revisão, Reposição, Feriado, Recesso, Evento especial, Falta do professor) e o card \"Seu calendário de aulas\" do aluno no Painel"
---

# Tasks: 031 — Calendário com tipos de data e calendário do aluno

**Input**: os documentos de design em `/specs/031-calendar-day-kinds/`.
**Prerequisites**:

- plan.md, spec.md (US1–US4, FR-001–FR-025, SC-001–SC-008), research.md (CK1–CK13), data-model.md (uma migration);
- contracts/: http-api, audit-events, permissions, ui;
- quickstart.md;
- constituição **v4.1.0** (sem emenda).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-008).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 031 com prefixo (`031/US1-3`, `031/FR-022`,
  `031/SC-004`), um id literal por cenário; onde uma tarefa cita uma faixa (`031/US1-1`…`031/US1-11`), cada cenário
  ganha o seu próprio `it`.
- **Ids antigos continuam cobertos**: os testes da 004 (US4, US5, US9) e da 026 que forem tocados mantêm os seus ids nos
  títulos.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Migration**: depois da migration, `pnpm --filter api prisma generate` e `prisma migrate deploy` no banco de dev; o
  `postgres-test` aplica as migrations no setup dos testes (`apps/api/CLAUDE.md`).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva mais
  de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: migration, Prisma, contratos (tipos, `set`, `days`, `StudentCalendarSchema`), permissão — todas as
  histórias dependem disso.
- **US1** (P1, tipos no calendário do professor): depende só da Foundational.
- **US2** (P1, dia com tópicos que deixa de ser aula): depois de US1 (mesmo serviço e mesmo editor).
- **US3** (P1, card do aluno) e **US4** (P1, só o que o aluno pode ver): dependem da Foundational e de dados gravados por
  US1 (as fixtures dos testes gravam direto no banco, então podem rodar em paralelo com US2).
- **MVP**: Setup + Foundational + US1 + US2 (o professor) ; a entrega ao aluno é US3 + US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 031 entra na guarda de rastreabilidade e a 004 registra o FR-026 substituído.

- [X] T001 Incluir a 031 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 030:
      `feature: "031"`, `path: "specs/031-calendar-day-kinds/spec.md"`, `stories: 4`, `scenarios: 32` (11 + 5 + 11 + 5),
      `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 8)` e
      `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", …, "SC-008"] }`, com o comentário de que cada
      história e SC saem de `pending` na tarefa que escreve o seu último teste; atualizar a lista de features do texto
      "Cross-cutting guards" do `CLAUDE.md` da raiz (`… 029, 030 and 031`). Rodar
      `pnpm --filter api test test/traceability.spec.ts` (verde: tudo pendente).
- [X] T002 [P] Anotar a substituição na 004: em `specs/004-syllabus-planning/spec.md`, logo abaixo do FR-026, a nota
      `> Substituído pela 031 em 2026-11-26 (`specs/031-calendar-day-kinds/`): o professor marca feriados, recessos,
      eventos e faltas como tipos de dia; o sistema continua sem calculá-los nem pedir motivo para dias não marcados.`;
      e abaixo do FR-028 a nota de que a Falta do professor da 031 não usa `CANCELLED` (os encontros continuam só
      `PLANNED`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o banco, os contratos e a permissão de que todas as histórias dependem.

### Tests for Foundational ⚠️

- [X] T003 [P] Teste de schema da migration em `apps/api/test/integration/031-schema.spec.ts` (no molde de
      `004-schema.spec.ts`): `031/FR-011` uma linha de `class_meetings` sem `kind` fica `CLASS` e `description` NULL;
      CHECKs de `class_meetings` (`CLASS` com descrição → erro; `EXAM` sem descrição → erro; descrição de 121 code points →
      erro); CHECKs de `class_calendar_days` por tipo (Feriado sem descrição, Falta sem motivo, Falta com descrição, aviso
      em Feriado, motivo de 501, aviso de 201 → erro); `UNIQUE (class_id, day_date)`; os dois triggers de data cruzada
      (inserir em `class_calendar_days` uma data que já é encontro da mesma disciplina → erro, e o contrário; outra
      disciplina da mesma turma na mesma data → aceito, `031/FR-013`); a permissão `calendario.turma.visualizar` existe e
      só o papel `STUDENT` a tem.
- [X] T004 [P] Testes de contrato em `packages/contracts/test/calendar.spec.ts`: `DayKindSchema` com os nove valores;
      `CalendarDayInputSchema` aceita `{date, kind:"CLASS"}` e recusa `CLASS` com `description`; os sete tipos descritos
      exigem `description` (1–120 code points após trim, só espaços recusado, NUL recusado); `TEACHER_ABSENCE` exige
      `absenceReason` (1–500), aceita `absenceNotice` até 200 e transforma `""`/espaços em `null`, recusa `description`;
      `UpdateClassMeetingsRequestSchema` aceita um corpo da 004 sem `set` (default `[]`) e recusa campo desconhecido;
      `ClassMeetingViewSchema` exige `kind` e `description`; `ClassMeetingListSchema` exige `days`;
      `StudentCalendarSchema` é estrito (recusa `topics`, `number`, `status`, `absenceReason`, `id` num dia).

### Implementation for Foundational

- [X] T005 Migration `apps/api/prisma/migrations/<timestamp>_031_calendar_day_kinds/migration.sql` e
      `apps/api/prisma/schema.prisma` conforme `data-model.md`: enums `class_meeting_kind` e `class_calendar_day_kind`;
      `class_meetings.kind NOT NULL DEFAULT 'CLASS'` e `description` com os CHECKs; tabela `class_calendar_days`
      (FK `class_id` → `classes` RESTRICT, `UNIQUE (class_id, day_date)`, CHECKs por tipo e de tamanho em `char_length`
      de `btrim`); funções e triggers `class_meetings_date_free` e `class_calendar_days_date_free`; a permissão
      `calendario.turma.visualizar` com o papel `STUDENT` (`INSERT … ON CONFLICT DO NOTHING`, no molde da migration da
      027, seção "(8) permissions"). Modelos Prisma `ClassMeeting.kind/description` e `ClassCalendarDay` com relação em
      `SchoolClass`. Rodar `prisma generate`, `migrate deploy` (dev) e T003 (verde).
- [X] T006 [P] Registrar a chave `calendario.turma.visualizar` no catálogo `apps/api/src/modules/access-control/permissions.ts`
      e na matriz `apps/api/test/security/authorization-matrix.ts` (STUDENT sim; TEACHER, MANAGER, ADMIN não); incluir
      a chave, em ordem alfabética e com o comentário "031: o calendário da disciplina", nas listas exatas de permissões
      do STUDENT em `GET /me` de `apps/api/test/integration/us1-email-verification.spec.ts` e
      `apps/api/test/integration/us2-auth-sessions.spec.ts` (sem isso as duas falham).
- [X] T007 Contratos em `packages/contracts/src/curriculum/class-meetings.ts` (`MeetingKindSchema`,
      `CalendarDayKindSchema`, `DayKindSchema`, `DescriptionSchema`, `AbsenceReasonSchema`, `AbsenceNoticeSchema`,
      `CalendarDayInputSchema` como união discriminada estrita por `kind`, `set` com `.default([])` e `.max(400)` em
      `UpdateClassMeetingsRequestSchema`, `kind`/`description` em `ClassMeetingViewSchema`, `CalendarDayViewSchema` do
      professor e `days` em `ClassMeetingListSchema`); novo `packages/contracts/src/me/calendar.ts` com
      `StudentCalendarSchema` (`class: {id, subjectName, teacherName, startsOn, endsOn}`, `today`, `days: [{date, kind,
      text}]`, tudo estrito); exportar em `src/index.ts`. Build dos contratos e T004 verde. (A entrada `"me.classCalendar"` de `src/endpoints.ts`
      vai com a rota, na T024: `endpoint-catalog.spec.ts` exige uma rota Nest para cada entrada.)
- [X] T008 Ajustar quem monta `ClassMeetingView`/`ClassMeetingList` para compilar com os campos novos, sem mudar
      comportamento ainda: `apps/api/src/modules/class-plans/class-plan.view.ts` (`meetingViews` seleciona e copia
      `kind`/`description`; nova `dayViews(db, classId)` lendo `class_calendar_days` por data) e
      `class-meetings.service.ts` (`view` devolve `days`); fixtures web que montam encontros:
      `apps/web/features/class-calendar/components/meeting-calendar.test.tsx`,
      `apps/web/features/class-plan/components/test-fixtures.ts`,
      `apps/web/features/classes/components/class-sections.test.tsx` (`kind: "CLASS"`, `description: null`, `days: []`).
      Rodar as suítes 004 da API (`test/integration/004-us4-class-meetings.spec.ts`, `004-us5`, `004-us6`, `004-us9`), as
      da 007 (`test/integration/007-*`, a proposta que usa o número de encontros) e
      as web de `class-calendar`/`class-plan`/`classes` sem mudar asserções (só fixtures): verde.

**Checkpoint**: o banco tem os tipos, os contratos compilam, a 004 continua igual com todos os dias como Aula.

---

## Phase 3: User Story 1 - Professor dá um tipo a cada dia do calendário (Priority: P1) 🎯 MVP

**Goal**: o modal "Marcar dia", os nove tipos com os seus textos, a gravação única com `set`, os encontros contando só
os cinco tipos de aula.

**Independent Test**: numa disciplina de fevereiro a junho, marcar 16 quartas como Aula, uma Prova, um Feriado e um
Evento especial; salvar e conferir tipos, descrições, "Total de aulas selecionadas: 17" e a numeração.

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] Testes puros de `apps/api/src/modules/class-plans/calendar-diff.spec.ts` (CK3): dado o mapa salvo
      (encontros com tipo/textos e dias) e `add`/`set`/`remove`, devolve `createMeetings`, `updateMeetings`,
      `createDays`, `updateDays`, `deleteDays`, `leavingMeetingIds` (encontros que deixam de ser encontro) e `changed`;
      casos: cada transição da tabela de `data-model.md`; data repetida entre `add`/`set`/`remove` → erro de validação;
      `add` de um dia que não é encontro → erro; `add` de encontro existente → nada; `set` idêntico ao salvo → nada e
      `changed = 0`; mudar para Aula descarta a descrição (`031/FR-006`).
- [X] T010 [P] [US1] Integração em `apps/api/test/integration/031-us1-day-kinds.spec.ts` (no molde de
      `004-us4-class-meetings.spec.ts`): `031/US1-7` uma gravação com `add`, `set` e `remove` aplica tudo numa operação;
      `031/US1-8` e `031/SC-002` o `total` e a numeração contam só `CLASS/EXAM/ASSIGNMENT/REVIEW/MAKEUP` (Feriado,
      Recesso, Evento e Falta fora); `031/US1-10` e `031/FR-006` mudar Prova → Aula limpa a descrição e Falta → Feriado
      limpa motivo e aviso; `031/US1-11` e `031/SC-007` encontros criados pela 004 (`add`) voltam como `CLASS` com a mesma
      numeração e tópicos; `031/FR-004`/`031/FR-005` corpos inválidos por tipo → `400`; data fora do período em `set` →
      `422 MEETING_OUT_OF_PERIOD`; `031/FR-013` a disciplina de outro professor da mesma turma → `404` e as marcações de
      uma disciplina não aparecem na outra; `031/US1-9` e `031/FR-002` um dia Feriado não é aceito como destino de
      `PATCH` de tópico nem de `MOVE` (`400`) e não conta para concluir aula (004/US9); o gestor → `403`;
      `031/FR-009` a mudança de período apaga os dias que não são encontro fora do novo período (e todos ao limpar as
      datas), recusa encontros fora como hoje, e o evento `class.offering_updated` traz `calendarDaysRemoved`;
      `031/FR-025` com dias de todos os tipos, o planejamento (`GET` do plano) lista só os encontros e a contagem de
      encontros usada pela 007 é a de `total`;
      auditoria: um `class_meetings.updated` por gravação com `kinds` (nove chaves) e `changed`, sem nenhum texto
      (procurar a descrição, o motivo e o aviso no `metadata` e no log capturado); `set` idêntico → nenhum evento.
- [X] T011 [P] [US1] Testes web puros em `apps/web/features/class-calendar/schemas/day-kinds.test.ts`: rótulos e dicas
      dos nove tipos (`contracts/ui.md`), `isMeetingKind`, `dotToken`, `pendingToRequest(saved, pending)` → `add`/`set`/
      `remove` mínimos (dia novo Aula → `add`; tipo ou texto mudado → `set`; desmarcado → `remove`; sem mudança → nada),
      `meetingCount(saved, pending)` e `meetingNumbers` só sobre os tipos de aula.
- [X] T012 [P] [US1] Testes de componente: `apps/web/features/class-calendar/components/day-kind-dialog.test.tsx` —
      `031/US1-1` modal de dia não marcado com a data por extenso, nove opções, Aula escolhida e sem campo; `031/US1-2`
      confirmar Aula; `031/US1-3` tipos descritos mostram "Descrição" com a dica e não confirmam vazios (só espaços
      também); `031/US1-4` Falta mostra "Motivo (só você vê)" obrigatório, "Aviso para a turma (opcional)" e a nota sobre
      o que os alunos veem; `031/US1-6` dia marcado abre com tipo e textos atuais e "Desmarcar dia"; contadores de
      caracteres e limites; foco volta ao dia ao fechar; `expectNoA11yViolations`. Em `meeting-calendar.test.tsx`:
      `031/US1-5` cada dia com tipo por texto/ícone com nome acessível e a legenda; `031/US1-8` "Total de aulas
      selecionadas" e "Outros dias marcados" seguem as mudanças pendentes; "Salvar calendário" envia o corpo de
      `pendingToRequest`; `031/FR-010` o modal e o calendário operáveis só com teclado (setas, Enter, Esc).

### Implementation for User Story 1

- [X] T013 [US1] Implementar `apps/api/src/modules/class-plans/calendar-diff.ts` (puro, sem Prisma) até T009 verde.
- [X] T014 [US1] `ClassMeetingsService.update` em `apps/api/src/modules/class-plans/class-meetings.service.ts`: ler
      encontros e dias salvos sob `lockOwnedClass`; validar período de `add`/`set`; aplicar o diff na ordem — resoluções
      (US2) → apagar dias que viram encontro e encontros que saem (com a checagem de tópicos da 004) → criar/atualizar
      encontros e dias; limite de 200 encontros; auditoria com `kinds` e `changed`, escrita só quando algo mudou
      (`apps/api/src/modules/audit/audit-event-types.ts`: novas chaves numéricas e o mapa por tipo). Em
      `apps/api/src/modules/classes/classes.service.ts`, a mudança de período apaga os `class_calendar_days` fora do
      novo período na mesma transação e registra `calendarDaysRemoved` em `class.offering_updated`. T010 verde, exceto
      os casos de tópicos de US2.
- [X] T015 [P] [US1] `apps/web/features/class-calendar/schemas/day-kinds.ts` (textos, tokens, conversões) até T011 verde.
- [X] T016 [US1] `apps/web/features/class-calendar/components/day-kind-dialog.tsx` (shadcn `Dialog`, `components/ui/radio`,
      `Textarea`, `FormField`; React Hook Form com o schema do contrato) e a integração em `meeting-calendar.tsx`
      (clique/Enter num dia do período abre o modal em vez de alternar; mapa de pendências; rótulo/ícone por dia; legenda;
      "Outros dias marcados: M") e `meeting-list.tsx` (tipo e descrição de cada encontro; seção "Dias sem aula" com o
      motivo da Falta). T012 verde. Tirar US1 de `pending` (com `SC-001` coberto pelo `it` "`031/SC-001` marcar um dia
      com tipo e descrição em até 3 interações" em `meeting-calendar.test.tsx` (acionar o dia, escolher o tipo,
      confirmar; escrever não conta), e `SC-002`, `SC-007`).

**Checkpoint**: o professor marca os nove tipos e o total de aulas está certo; dias com tópicos ainda só por desmarcar.

---

## Phase 4: User Story 2 - Dia com tópicos que deixa de ser aula (Priority: P1)

**Goal**: mudar um encontro com tópicos para Feriado, Recesso, Evento ou Falta pede as resoluções do 004/FR-029.

**Independent Test**: dois tópicos na aula de 18/03 (um concluído), mudar para Falta do professor; a gravação exige uma
resolução para cada um e nenhum tópico se perde.

### Tests for User Story 2 ⚠️

- [X] T017 [P] [US2] Integração em `apps/api/test/integration/031-us2-topics.spec.ts`: `031/US2-1` e `031/US2-3` mudar
      um encontro com tópicos para cada um dos quatro tipos sem resoluções → `409 MEETING_HAS_TOPICS` e nada muda (nem o
      tipo, nem os outros itens da gravação); `031/US2-2` e `031/SC-003` com `MOVE`, `UNSCHEDULE`, `MERGE` e `ARCHIVE`
      a gravação aplica tudo, o dia vira o tipo pedido, os encontros são renumerados e todos os tópicos continuam
      existindo; o concluído só aceita `ARCHIVE` (`409 INVALID_STATE_TRANSITION` para os outros); `MOVE` para uma data
      que vira Feriado na mesma gravação → `400`; `031/US2-4` Aula → Prova mantém os tópicos sem resolução;
      `031/US2-5` a mudança de período com encontros fora segue `409 MEETINGS_OUTSIDE_PERIOD`; concorrência: duas
      gravações com o mesmo `planRevision` → a segunda `409 PLAN_REVISION_CONFLICT`.
      _Nota (T014)_: o `update` já passa os `leavingMeetingIds` ao `resolve` e à checagem de tópicos e usa como destino
      de `MOVE` os encontros depois da gravação; a T017 passou sem mudança de código, o que fecha a T019.
- [X] T018 [P] [US2] Em `apps/web/features/class-calendar/components/meeting-calendar.test.tsx`: `031/US2-1` mudar no
      modal um dia salvo com tópicos para Falta e salvar abre o `TopicResolutionDialog` daquele dia (o concluído só com
      "Arquivar"), e o corpo enviado leva o `set` e as `resolutions`; mudar Aula → Prova não abre o diálogo
      (`031/US2-4`); "Desmarcar dia" com tópicos continua com o fluxo da 004 (ids `004/US4-6` mantidos).

### Implementation for User Story 2

- [X] T019 [US2] No `ClassMeetingsService`, os `leavingMeetingIds` do diff entram no mesmo conjunto dos removidos da 004
      (`resolve` e a checagem de tópicos não arquivados), e os destinos de `MOVE` são os encontros depois da gravação.
      T017 verde.
- [X] T020 [US2] No editor de `meeting-calendar.tsx`, um dia salvo com `topicCount > 0` cujo pendente é um tipo que não é
      aula entra na fila do `TopicResolutionDialog` antes de salvar, como o desmarcar de hoje. T018 verde. Tirar US2 e
      `SC-003` de `pending`.
      _Feito_: o diálogo abre ao confirmar o tipo no modal (como o "Desmarcar dia"), com "Confirmar mudança" e o tipo
      novo no texto; o dia só muda depois das escolhas.

**Checkpoint**: US1 + US2 = o calendário do professor completo (MVP do professor).

---

## Phase 5: User Story 3 - Aluno vê o calendário da matéria no Painel (Priority: P1)

**Goal**: a rota do aluno e o card "Seu calendário de aulas" com a semana, as setas, os pontos e o detalhe do dia.

**Independent Test**: uma disciplina com Aula, Prova, Feriado e uma Falta com motivo e aviso; o Painel do aluno nessa
matéria mostra cada dia corretamente ao navegar.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Integração em `apps/api/test/integration/031-us3-student-calendar.spec.ts`: o aluno matriculado lê
      `GET /me/classes/:classId/calendar` com `class` (matéria, professor, período), `today` do `Clock` injetado no fuso
      de `planningToday` e `days` em ordem de data juntando encontros e dias; `text` `null` na Aula, a descrição nos
      tipos descritos, o aviso (ou `null`) na Falta (`031/US3-4`…`031/US3-6` do lado da API); `031/US3-10` disciplina sem
      marcações → `days: []`; disciplina sem período → `startsOn/endsOn null` e `days: []`; disciplina migrada sem
      matéria → `subjectName` é o nome da turma; `031/US3-11` uma gravação do professor aparece na próxima leitura.
- [X] T022 [P] [US3] Testes web puros em `apps/web/features/student-calendar/schemas/week.test.ts`: `weekStart` (segunda),
      `weekDays`, `weekLabel` ("16–22 nov", "28 out–3 nov"), `monthLabel` da segunda-feira ("Novembro 2026"),
      `clampWeek` ao período, `initialSelection` (hoje no período → semana de hoje com hoje escolhido; antes → primeira
      semana e o primeiro dia marcado dela ou nenhum; depois → última semana; período nulo → sem semana, o card cai no
      estado "sem marcações"), `canGoPrevious/Next`, `dayDetail` por tipo
      (Aula só "Aula"; descritos com o texto; Falta com o aviso ou sem; não marcado "Nada marcado neste dia.").
- [X] T023 [P] [US3] Testes de componente em
      `apps/web/features/student-calendar/components/student-calendar-card.test.tsx`: `031/US3-1` título, intervalo,
      mês/ano, matéria, setas e sete dias SEG–DOM; `031/US3-2` abre na semana de `today` com hoje escolhido (e os casos
      fora do período, e período nulo); `031/US3-3` ponto e nome acessível com data e tipo, "hoje" no nome; `031/US3-4`…`031/US3-7` o
      detalhe de cada tipo na região `aria-live`, com matéria e professor, e nenhum tópico; `031/US3-8` setas mudam a
      semana, o mês acompanha, nenhum dia escolhido, setas desabilitadas nos extremos; `031/US3-10` sem marcações; estados
      carregando e erro com "Tentar novamente"; nenhum dia escolhido mostra "Escolha um dia para ver o que há nele."
      (`031/FR-017`); textos com marcação aparecem como texto (`031/FR-023`);
      `expectNoA11yViolations` nos temas escuro e claro. Em
      `apps/web/features/student-activities/components/student-dashboard.test.tsx`: `031/US3-9` e `031/FR-014` o card
      aparece com a matéria atual e a permissão, some sem a permissão, e troca de matéria troca o calendário (ids da 026
      mantidos).

### Implementation for User Story 3

- [X] T024 [US3] Novo módulo `apps/api/src/modules/student-calendar/` (registrado em `AppModule`):
      `student-calendar.controller.ts` (`@RequirePermissions("calendario.turma.visualizar")`, param `classId` validado
      pelo contrato antes de qualquer consulta), `student-calendar.service.ts` (checagem da matrícula ATIVA na turma da
      disciplina com a mesma consulta do 026 — `enrollment.findFirst({ studentUserId, status: "ACTIVE", cohort: { classes:
      { some: { id } } } })` — senão `notFound()`; depois `select` só de `meeting_date/kind/description` e
      `day_date/kind/description/absence_notice`, a matéria, o professor e o período; `today` pelo `Clock` e
      `planningToday`) e `views/student-calendar.view.ts` (copia a lista fechada de chaves de `contracts/http-api.md`).
      Catalogar `"me.classCalendar"` (`GET /me/classes/:classId/calendar`, `params: ClassParamsSchema`, resposta
      `StudentCalendarSchema`) em `packages/contracts/src/endpoints.ts` e atualizar a contagem de
      `apps/api/test/contracts/endpoint-catalog.spec.ts`. Acrescentar a linha `GET /me/classes/:classId/calendar` → `calendario.turma.visualizar` no `MATRIX` de
      `authorization-matrix.ts` e tirar a chave de `SEEDED_BEFORE_ROUTES` em `test/security/us7-matrix-completeness.spec.ts`
      (entrou lá na T006). T021 verde.
- [X] T025 [P] [US3] `apps/web/features/student-calendar/schemas/week.ts` (datas em `YYYY-MM-DD` sem fuso do navegador,
      textos de `contracts/ui.md`) até T022 verde.
- [X] T026 [US3] `apps/web/features/student-calendar/api/student-calendar.ts`, `hooks/use-student-calendar.ts`
      (TanStack Query por `classId`, sem polling) e `components/student-calendar-card.tsx` (Card do Design System,
      botões dos dias com `aria-pressed`, pontos pelos tokens de CK9, detalhe com `aria-live="polite"`, estados); montar o
      card em `apps/web/features/student-activities/components/student-dashboard.tsx` na coluna principal depois de
      "Próximas"/"Atrasadas", só com a matéria da 026 e `calendario.turma.visualizar` (UX); um `404` segue a volta da 026.
      T023 verde. Tirar US3 e `SC-006` de `pending` (o `it` "`031/SC-006` o dia com 1 interação e qualquer semana só com
      as setas" em `student-calendar-card.test.tsx`).

**Checkpoint**: o aluno vê o calendário da matéria no Painel.

---

## Phase 6: User Story 4 - Só o que o aluno pode ver (Priority: P1)

**Goal**: a resposta e a tela do aluno nunca trazem tópicos, números, situação ou motivo, nem calendário de outra turma.

**Independent Test**: dois alunos, um matriculado e outro não, e uma disciplina com tópicos e uma Falta com motivo; pedir o
calendário com cada um e conferir a resposta campo a campo.

### Tests for User Story 4 ⚠️

- [X] T027 [P] [US4] Segurança em `apps/api/test/security/031-student-calendar.spec.ts`: `031/US4-1` e `031/FR-022` as
      chaves da resposta são exatamente as do contrato (comparar `Object.keys` em todos os níveis); `031/US4-2` e
      `031/SC-004` com tópicos, encontros numerados e uma Falta com motivo únicos, o JSON bruto não contém o título de
      tópico, o motivo, ids de tópico ou `number`/`status`; `031/US4-3` e `031/SC-005` outra turma, matrícula encerrada e
      id inexistente → `404` com corpos idênticos, e id mal formado → `400` antes de qualquer consulta; `031/US4-4`
      professor, gestor e admin → `403`; `031/US4-5` turma encerrada (027) com a matrícula ativa → `200`; outra
      disciplina da mesma turma (de outro professor) → o calendário dela, não o da primeira (`031/FR-013`); o log
      capturado da requisição não tem descrição, aviso nem motivo.
- [X] T028 [P] [US4] Guarda em `apps/api/test/student-calendar-boundary.spec.ts` (CK12, no molde de
      `feedback-boundary.spec.ts`): `modules/student-calendar` não importa `class-plans`, `syllabus`, `curriculum-ai`,
      `activities`, `student-activities` nem módulos de IA; o código dele não cita `absenceReason`, `absence_reason`,
      `topic`/`Topic` nem `status` de encontro; `views/student-calendar.view.ts` copia chaves nomeadas (sem spread do
      objeto do banco); `apps/web/features/student-calendar` não importa `features/class-plan` nem
      `features/class-calendar`.
      _Nota (T024)_: o serviço do aluno importa só `class-plans/planning-date` (o `planningToday` puro, sem dados do
      plano, CK7) e `classes/class.view` (`isoDate`); a guarda deve permitir exatamente esses dois e recusar o resto.
- [X] T029 [P] [US4] `apps/web/test/student-portal-xss.test.tsx`: `031/FR-023` descrição e aviso com `<img onerror>` e
      `<script>` renderizados como texto no card do aluno; o mesmo em `day-kind-dialog.test.tsx`/`meeting-list` do lado do
      professor.

### Implementation for User Story 4

- [X] T030 [US4] Ajustar o que T027–T029 apontarem em `student-calendar.service.ts`, `student-calendar.view.ts` e no
      `select` (nenhum campo além da lista fechada). Tirar US4, `SC-004` e `SC-005` de `pending`.
      _Feito_: T027–T029 passaram sem ajuste no código da T024.

**Checkpoint**: todas as histórias funcionam juntas e nada vaza para o aluno.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T031 [P] `031/SC-008` e `031/FR-024`: incluir os tokens dos pontos (CK9) contra `card` em
      `apps/web/test/contrast.test.ts` nos dois temas (não-texto ≥ 3:1); conferir as varreduras do Design System de
      `apps/web/CLAUDE.md` (nenhuma cor ou tamanho fora dos tokens) e `expectNoA11yViolations` no tema claro no modal e no
      card. Tirar `SC-008` de `pending` depois de T033.
- [ ] T032 [P] Atualizar o `CLAUDE.md` da raiz: em "Project state", o item da 031 (no estilo da 030); em "Rules that are
      easy to get wrong", uma regra: `class_meetings` são só os encontros (CLASS/EXAM/ASSIGNMENT/REVIEW/MAKEUP, com
      `description` fora da Aula); Feriado/Recesso/Evento/Falta vivem em `class_calendar_days`, uma data por disciplina
      nas duas tabelas (triggers); sair da condição de encontro com tópicos exige as resoluções do 004/FR-029; o motivo
      da Falta é só do professor (nunca aluno, auditoria ou log); o aluno lê `GET /me/classes/:classId/calendar` só com
      matrícula ativa (`404` igual) e nunca tópicos; e o novo guarda `student-calendar-boundary.spec.ts` na lista
      "Cross-cutting guards". Em `apps/api/CLAUDE.md`, o módulo `student-calendar` na lista de módulos.
- [ ] T033 `031/SC-008` E2E em `apps/web/e2e/calendar-day-kinds.spec.ts` (fixtures de `e2e/fixtures/journeys.ts`, no molde
      de `student-classes.spec.ts`): o professor marca Prova, Feriado e uma Falta com motivo e aviso e salva; o aluno abre
      o Painel, navega até a semana, vê os tipos, o aviso e nunca o motivo; em 360 px
      `document.documentElement.scrollWidth <= clientWidth`, também no tema claro. Rodar também `syllabus-plan`
      (o calendário da 004 com o modal: ajustar o passo que marca dias para confirmar "Aula" no modal) e `student-portal`.
      Exige consentimento do usuário para o reset do `devtrack_e2e` (memória "Local dev environment").
- [ ] T034 Validar o quickstart.md manualmente (dev, temas escuro e claro, 360 px) e conferir `pending` vazio em
      `traceability.spec.ts`; `pnpm lint && pnpm check-types && pnpm test` verde; rodar a skill `owasp-security-auditor`
      nos arquivos alterados quando o hook pedir.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T008)** → **US1 (T009–T016)** → **US2 (T017–T020)**;
  **US3 (T021–T026)** e **US4 (T027–T030)** depois da Foundational, em paralelo com US2 (só a montagem do card em
  `student-dashboard.tsx` depende de nada do professor) → **Polish (T031–T034)**.
- Dentro de cada fase: testes antes da implementação; T005 antes de T006–T008; T007 (contratos compilados) antes de T008,
  T015, T025; T013 antes de T014; T016 antes de T020 (mesmo editor); T024 antes de T030.
- US2 mexe nos mesmos arquivos de US1 (`class-meetings.service.ts`, `meeting-calendar.tsx`): só depois de US1.

## Parallel Example

```text
Foundational:  T003 (schema test) ‖ T004 (contracts test) ; depois T006 ‖ T007
US1:           T009 (diff pure) ‖ T010 (API integration) ‖ T011 (web pure) ‖ T012 (web components)
               T013 → T014   ‖   T015 → T016
US2 ‖ US3:     T017/T018 (US2 tests) ‖ T021 (API) ‖ T022 (week pure) ‖ T023 (card)
US4:           T027 (security) ‖ T028 (boundary) ‖ T029 (XSS)
Polish:        T031 ‖ T032
```

## Implementation Strategy

1. **MVP do professor**: Setup + Foundational + US1 + US2 — os nove tipos no calendário, o total certo e nenhum tópico
   perdido. Validar e demonstrar.
2. **Entrega ao aluno**: US3 + US4 — o card no Painel e as garantias de que tópicos e motivo nunca saem.
3. **Polish**: contraste e acessibilidade nos dois temas, docs, E2E em 360 px e a suíte completa.
