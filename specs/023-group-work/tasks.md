---

description: "Task list for 023 — Trabalho individual ou em grupo: o professor aplica o trabalho em grupo (2 a 5 com o líder), o líder forma o grupo com colegas presentes, o grupo divide uma tentativa editada por um integrante de cada vez, cada salvamento fica registrado por aluno, o líder entrega e a nota liberada vale para todos"
---

# Tasks: 023 — Trabalho individual ou em grupo

**Input**: os documentos de design em `/specs/023-group-work/`.
**Prerequisites**:
- plan.md, spec.md, research.md (U1–U19) e data-model.md;
- contracts/: http-api, permissions, audit-events e web-ui;
- quickstart.md;
- constituição **v3.6.0** (XXIV, exceção do trabalho em grupo; `constitution-amendment-3.6.0.md`).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-008).
- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 023 com prefixo (`023/US2-5`, `023/FR-008`,
  `023/SC-002`), um id literal por cenário; onde uma tarefa cita uma faixa (`023/US4-1`…`023/US4-6`), cada cenário
  ganha o seu próprio `it`.
- **Rota nova**: exige, na mesma tarefa, a entrada em `packages/contracts/src/endpoints.ts`, as linhas no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` (contracts/permissions.md) e `route-declarations.spec.ts` verde.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Auditoria**: um tipo novo entra em `audit-event-types.ts`, na `contracts/audit-events.md` da 023 e no
  `test/helpers/journey.ts` na mesma tarefa que o emite (`audit-coverage.spec.ts`); metadados só com ids, enums e
  contagens.
- **Nada muda fora do grupo** (SC-007): as suítes 012–021 continuam verdes **sem mudança de asserção**; uma
  asserção antiga que precise mudar é um defeito do desenho, não do teste.
- **Sem WebSocket, Redis, fila, variável de ambiente ou dependência nova** (IX, research U18).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story, na ordem das dependências reais.
- **Foundational**: o esquema (participantes, grupo, registros, FKs movidas, travas por quem escreve) e a troca de
  todas as consultas "tentativa do aluno" pelos participantes; sem isso nenhuma história funciona, e é onde a
  invariância das features antigas é provada.
- **US1** (professor aplica em grupo) → **US2** (formar o grupo) → **US3** (integrantes e aviso) → **US4** (edição de
  um por vez): todas P1, nessa ordem.
- **US5** (incluir e entregar), **US6** (correção do professor) e **US7** (modo controlado, pausa, IA, execução) são P2
  e dependem da US4.
- **MVP**: Foundational + US1–US4.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US7).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 023 entra na guarda de rastreabilidade; os contratos compartilhados existem.

- [X] T001 Incluir a 023 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 022:
  `feature: "023"`, `path: "specs/023-group-work/spec.md"`, `stories: 7`, `scenarios: 38` (6 + 6 + 4 + 6 + 6 + 5 + 5),
  sem tabela de rastreabilidade (`rows: 0`, `rowsWithoutIds: []`), `successCriteria: sc(1, 8)` e
  `pending: { stories: [1, 2, 3, 4, 5, 6, 7], successCriteria: ["SC-001", …, "SC-008"] }`, com o comentário "Joined in
  the Setup phase (T001); each story leaves `pending` with the task that writes its last test, each SC with the test
  that cites it, so the lists are empty at the end of T040".
- [X] T002 [P] Contratos em `packages/contracts/src/activities/group.ts` (novo) e export em `activities/index.ts`/
  `src/index.ts` (contracts/http-api.md):
  - `GroupSizeSchema = z.number().int().min(2).max(5)`;
  - `StudentGroupSchema`, `GroupCandidatesSchema`, `TeacherAttemptGroupSchema`, `GroupEventKindSchema`
    (`EDITING_HANDED`, `EDITING_TAKEN_BACK`, `EDITING_RETURNED`, `EDITING_RESET`, `LEADER_CHANGED`),
    `GroupEventReasonSchema` (`PAUSED`, `ACCESS_LOST`);
  - pedidos estritos: `AddGroupMembersRequestSchema` `{ memberIds }` (1–4 uuids distintos),
    `GroupEditingRequestSchema` (união discriminada por `action`: `HAND` com `toUserId`, `TAKE_BACK`, `RETURN`);
  - `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test`.
  - Os campos novos de `StudentActivity`, `TeacherActivity*`, do pedido de aplicar/editar e do início entram nas tarefas
    que os atendem (T012, T016, T020…), junto com o código: antes disso o interceptor de conformidade derrubaria as
    respostas atuais.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a tentativa ganha participantes; os fatos por aluno apontam para eles; toda consulta do aluno passa por
eles; as features antigas continuam iguais.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests for Foundational ⚠️

- [X] T003 [P] `apps/api/test/integration/023-schema.spec.ts` (data-model.md), escrito antes da migração:
  - `023/FR-001` `group_size` aceita NULL e 2–5, recusa 1 e 6, recusa não NULL em EXERCISE, EXAM e em ASSIGNMENT
    `ALL_ENROLLED`; muda antes da primeira tentativa e é recusado depois (trigger);
  - `023/FR-008` `attempt_participants`: o dono de toda tentativa nova tem a sua linha; `UNIQUE (activity_id,
    student_user_id, attempt_number)` recusa o mesmo aluno em duas tentativas 1 do mesmo trabalho; uma linha de
    integrante só com `attempt_groups`, dentro do `group_size` e com a tentativa `IN_PROGRESS`; DELETE recusado;
  - `attempt_groups`: líder e editor precisam ser participantes; UPDATE só de líder, editor e `version` e só com a
    tentativa em andamento;
  - `023/FR-015` `attempt_group_events` e `activity_answer_saves` só aceitam INSERT; cada INSERT ou mudança de
    `revision` de `activity_answers` acrescenta uma linha em `activity_answer_saves` com `saved_by_user_id`;
  - `023/FR-012` gravar resposta de grupo com `saved_by_user_id` diferente do editor é recusado; entrega de grupo com
    `submitted_by_user_id` diferente do líder é recusada;
  - `023/FR-023` a trava de pausa olha quem escreve: pausa aberta de B recusa a resposta salva por B e aceita a salva
    por A na mesma tentativa; numa tentativa individual o comportamento é o da 016;
  - FKs movidas: evento do modo controlado, ajuda, pausa e execução com um `student_user_id` que não é participante
    são recusados;
  - backfill: numa cópia (esquema de rascunho, como `013-migration`) com tentativas, respostas, entregas, eventos,
    ajudas, pausas e execuções de 012–021, a migração cria um participante por tentativa, preenche
    `saved_by_user_id`/`submitted_by_user_id` e nenhuma linha antiga fica inválida.
- [X] T004 [P] `apps/api/test/group-work-boundary.spec.ts` (research U5), que deve falhar antes da T007: nos módulos
  `student-activities`, `attempt-integrity`, `work-help`, `attendance`, `code-runs`, `exam-sessions` e em
  `activities/{exam-settlement,roster,attempts-review.service}.ts`, nenhuma consulta que procura "a tentativa de um
  aluno" (do lado do aluno ou do professor) filtra `activity_attempts` por `student_user_id` (só pela junção com
  `attempt_participants`); a única escrita de `attempt_participants`
  fora da migração é a do início (`student-activities`) e a da inclusão (`group-work.service.ts`); nenhum desses
  módulos importa outro (as regras da 015/016 continuam).

### Implementation for Foundational

- [X] T005 Migração `apps/api/prisma/migrations/<ts>_group_work/migration.sql` + `schema.prisma` (data-model.md,
  research U2–U4, U8, U10): `class_activities.group_size` com as CHECKs e o trigger de congelamento ampliado; enums
  `attempt_group_event_kind`/`attempt_group_event_reason`; tabelas `attempt_participants` (com o backfill de um
  participante por tentativa existente), `attempt_groups`, `attempt_group_events`, `activity_answer_saves`; colunas
  `activity_answers.saved_by_user_id` (backfill do dono, depois NOT NULL) e `activity_submissions.submitted_by_user_id`
  (backfill, CHECK, imutável); as quatro FKs compostas (`attempt_integrity_events`, `work_help_requests`,
  `attempt_pauses`, `code_runs`) passam a referenciar `attempt_participants`; `attempt_paused_writes` por quem
  escreve; os triggers de editor, líder, registro e só-INSERT. `resetDb` (`test/helpers/test-app.ts`) passa a
  esvaziar as tabelas novas. O bloco da 023 entra em `apps/api/test/security/domain-boundary.spec.ts`
  (`AttemptParticipant`, `AttemptGroup`, `AttemptGroupEvent`, `ActivityAnswerSave`, com o comentário "023
  (specs/023-group-work/data-model.md) — a group shares the attempt; who takes part, who edits and who saved"). T003
  fica verde.
- [X] T006 O início de toda tentativa grava o participante dono na mesma transação: `student-activities/attempts.service.ts`
  (`start`, e a tentativa n do `retry` da 013) e qualquer outro `INSERT` em `activity_attempts` do código de produção
  e de `test/helpers/activities.ts` (`createAttemptRow`, `createActivity`) e `test/helpers/code-runs.ts`.
- [X] T007 Consultas pelos participantes (research U5), cada módulo na sua própria consulta escopada:
  `student-activities/{attempts.service.ts (findAttempt, lockContext), student-activity-loader.ts,
  my-activities.service.ts}`, `attempt-integrity/*` (o `FocusEventsService` e as leituras próprias),
  `work-help/work-help.service.ts`, `attendance/{my-pause.service.ts, pauses.service.ts, attendance.service.ts}` ("Pausar aluno" e as pausas de
  uma tentativa, a consulta da sala com o `roomStatus` de cada aluno e a recusa de desmarcar olham a participação,
  research U5, U15), `code-runs/code-runs.service.ts`, `activities/{exam-settlement.ts, roster.ts,
  attempts-review.service.ts}` (a situação de cada aluno para o professor). As respostas
  salvas passam a gravar `saved_by_user_id` (o aluno da sessão) e a entrega `submitted_by_user_id`
  (`activities/submission/register-submission.ts`; NULL no "Aceitar como entrega"). T004 fica verde.
- [X] T008 Invariância (SC-007): `pnpm --filter api test` completo, com as suítes 012–021 **sem mudança de
  asserção**; `pnpm --filter web test`. Se algo antigo mudar, o defeito está em T005–T007. Test helper novo
  `apps/api/test/helpers/group-work.ts`: `applyGroupWork(client, classId, workId, groupSize)` (via `applyWork`, com a
  turma inteira presente), `startGroup(client, activityId, memberIds)`, `startAlone`, `getCandidates`, `addMembers`,
  `handEditing`, `takeBackEditing`, `returnEditing`, `getAttemptGroup` (teacher).

**Checkpoint**: tudo o que existia passa igual; o banco já sabe o que é um participante.

---

## Phase 3: User Story 1 — Professor aplica um Trabalho em grupo (Priority: P1) 🎯 MVP

**Goal**: o formato "Individual" ou "Em grupo" com o máximo de 2 a 5 é escolhido ao aplicar e fica fixo no início.

**Independent Test**: aplicar "Em grupo" com máximo 3 e ver formato e máximo na atividade; aplicar sem mexer → "Individual".

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] API `apps/api/test/integration/023-us1-apply.spec.ts`: `023/US1-1` sem `groupSize` → individual
  (`groupSize: null`); `023/US1-2` `groupSize: 4` → em grupo, também no detalhe e na lista do professor e na visão do
  aluno; `023/US1-3` 1, 6, 2.5, `"3"` → 400 sem criar nada; `023/US1-4` PATCH antes do primeiro início muda, depois →
  `409 ACTIVITY_ALREADY_STARTED`; `023/FR-002` PATCH num trabalho `ALL_ENROLLED` → `422 GROUP_NEEDS_ATTENDANCE`;
  `023/US1-5` `groupSize` no corpo de EXERCISE e EXAM (aplicar e editar) → 400; `023/US1-6` trabalho antigo (linha sem
  `group_size`) continua individual; `activity.published` e `activity.settings_changed` trazem `groupSize`.
- [X] T010 [P] [US1] Web `apps/web/features/activities/components/work-options.test.tsx` (e o teste da aplicação):
  `023/US1-1 023/US1-2` "Formato" com "Individual" marcado; "Em grupo" mostra "Máximo de integrantes, com o líder"
  (2–5, padrão 3) e envia `groupSize`; "Individual" envia `groupSize: null`; fixo depois do início com a mensagem da
  015; axe e Tab.

### Implementation for User Story 1

- [X] T011 [US1] Contratos: `groupSize` no corpo de aplicar ASSIGNMENT e no PATCH (recusado nos de EXERCISE/EXAM),
  `groupSize` em `TeacherActivitySummary`, `TeacherActivity` e `StudentActivity`
  (`packages/contracts/src/activities/{teacher,student}.ts`); o código `GROUP_NEEDS_ATTENDANCE`.
- [X] T012 [US1] API: `activities/activities.service.ts` (aplicar e editar opções, `422` sem chamada),
  `activity-query.ts`, `views/teacher-view.ts`, `views/student-view.ts` (`groupSize` copiado na allowlist), metadados
  de `activity.published`/`activity.settings_changed` (`audit-event-types.ts`, contracts/audit-events.md). T009 fica
  verde.
- [X] T013 [US1] Web: "Formato" em `features/activities/components/work-options.tsx` (`RadioGroup` + `NativeSelect`,
  React Hook Form com o schema do contrato), "Em grupo (até N)" no detalhe e na lista da atividade; a mensagem de
  `GROUP_NEEDS_ATTENDANCE` em `lib/messages/error-messages.ts`. T010 fica verde; a US1 sai de `pending`.

**Checkpoint**: o professor aplica em grupo; para o aluno ainda nada muda.

---

## Phase 4: User Story 2 — Aluno inicia e escolhe os integrantes (Priority: P1)

**Goal**: "Iniciar" num trabalho em grupo mostra os colegas elegíveis; confirmar cria o grupo com o aluno líder e
editor; "Continuar sozinho" é individual.

**Independent Test**: três presentes, máximo 3; o primeiro marca os outros dois e confirma; os três veem a mesma tentativa.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] API `apps/api/test/integration/023-us2-start.spec.ts`:
  - `023/US2-1` `GET …/group/candidates` → `{ groupSize: 4, freeSlots: 3, candidates }` em ordem de nome, só `id` e
    `name`;
  - `023/US2-2` início com `{ memberIds: [b, c] }` → participantes A (dono), B e C, `attempt_groups` com líder e
    editor A, `StudentActivity.group` com `myRole: "LEADER"` e `canEdit: true`; eventos `activity_group.created`
    (`memberCount: 3`), `activity_group.member_added` ×2 e `activity_attempt.started` com `group: true`;
  - `023/US2-3` 0 ids, ids repetidos, mais que `groupSize − 1`, o próprio id → 400;
  - `023/US2-4` `{ alone: true }` → tentativa individual (sem `attempt_groups`), e A some da lista dos colegas;
    `{}` num trabalho em grupo → 400; `memberIds`/`alone` num trabalho individual → 400;
  - `023/US2-5` B começou sozinho depois de A abrir a lista → `409 GROUP_MEMBERS_UNAVAILABLE` com `unavailableIds:
    [b]`, nada criado (nem para C);
  - `023/US2-6` a lista nunca traz o próprio aluno, colegas não presentes, sem matrícula ativa, de outra turma, nem
    quem já participa de uma tentativa do trabalho;
  - `023/FR-008` repetir o início com membros → 200 com a mesma tentativa, nada novo.
- [X] T015 [P] [US2] Web `apps/web/features/group-work/components/group-start-dialog.test.tsx`: `023/US2-1` a mensagem
  "Esse trabalho é em grupo, escolha os integrantes do grupo. Você pode incluir até 3", a lista e "Continuar sozinho";
  `023/US2-3` "n de N", caixas desmarcadas desabilitadas no limite, "Iniciar em grupo" exige 1; `023/US2-5` o `409`
  relê a lista e o `Alert` nomeia quem saiu; lista vazia → "Nenhum colega disponível agora." e só "Continuar sozinho";
  axe, Tab, Esc fecha sem iniciar; nomes com HTML como texto.

### Implementation for User Story 2

- [X] T016 [US2] Contratos: o corpo de `myActivities.start` aceita `{ memberIds }` ou `{ alone: true }` (validado contra
  o formato no servidor); `StudentActivity.group: StudentGroup | null`; a rota `GET
  /me/activities/:activityId/group/candidates` em `endpoints.ts` + linhas no `MATRIX`; os códigos
  `GROUP_MEMBERS_UNAVAILABLE` e `GROUP_ALREADY_JOINED`.
- [X] T017 [US2] API (research U3, U6): `activities/group/group-roles.ts` (puro: papel, editor e líder efetivos, vagas)
  com o seu teste de unidade; `student-activities/group-work.{service,controller}.ts` (candidatos); o início em
  `attempts.service.ts` sob `pg_advisory_xact_lock(hashtext('activity-group'), hashtext(activityId))`, rechecando cada
  id e criando tentativa, participantes e `attempt_groups` numa transação; o bloco `group` em
  `student-activity-loader.ts`/`views/student-view.ts` (allowlist: nomes e ids, sem e-mail nem RA); auditoria
  `activity_group.created`/`member_added` (tipos, contracts/audit-events.md, journey). T014 fica verde.
- [X] T018 [US2] Web `features/group-work/{api,hooks,schemas,components/group-start-dialog.tsx}` (novo) e o botão
  "Iniciar" de `features/student-activities` abrindo o diálogo num trabalho em grupo; mensagens dos códigos novos em
  `lib/messages/error-messages.ts`. T015 fica verde; a US2 sai de `pending`.

**Checkpoint**: o grupo nasce; só o líder vê algo além do individual.

---

## Phase 5: User Story 3 — Integrantes participam e quem já está num grupo é avisado (Priority: P1)

**Goal**: os escolhidos veem o aviso, os integrantes e as respostas só para leitura; ninguém inicia o mesmo trabalho
duas vezes; quem lê vê os salvamentos em até 10 s.

**Independent Test**: depois da US2, B abre o trabalho: aviso, integrantes, respostas só leitura, sem "Iniciar".

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] API `apps/api/test/integration/023-us3-members.spec.ts`: `023/US3-1` B lê a atividade:
  `group.addedBy` = A, `members`, `editor`, `myRole: "MEMBER"`, `canEdit: false`, a tentativa e as respostas do grupo
  com `savedBy`; `023/US3-2` B tenta iniciar (com ou sem membros, de duas abas ao mesmo tempo) → 200 com a tentativa
  do grupo, nada novo; `GET …/group/candidates` por B → `409 GROUP_ALREADY_JOINED`; `023/US3-3` `GET /me/activities`
  de B traz o trabalho com a situação da tentativa do grupo e `groupSize`; `023/FR-010` um aluno fora do grupo (da
  turma ou de outra) recebe 404 em toda rota da tentativa do grupo; `023/FR-009` o painel da sala do professor (016)
  e a lista de entregas mostram B com a situação da tentativa do grupo, nunca "Não iniciado"; `023/FR-005` (achado
  `info` da auditoria da US2) `GET …/group/candidates` num trabalho que não aceita mais início (encerrado, ou prazo
  vencido sem entrega atrasada) → `409` com o código da recusa do início (ex.: `ACTIVITY_CLOSED`), sem a lista.
- [X] T020 [P] [US3] Web `apps/web/features/group-work/components/group-notice.test.tsx` e o teste da página da
  atividade: `023/US3-1` "Você está no grupo de <líder> neste trabalho", integrantes, "Editando agora" num
  `role="status"`, questões só leitura com "A edição está com <nome>."; `023/US3-3` "Em grupo" em "Minhas atividades";
  `023/US3-4 023/SC-004` com timers falsos, a página relê a atividade a cada 5 s só enquanto visível e mostra a
  resposta nova; nada de "Iniciar" nem "Entregar" para o integrante.

### Implementation for User Story 3

- [X] T021 [US3] API: `savedBy` nas respostas da visão do aluno e as regras de `GROUP_ALREADY_JOINED`/início
  idempotente em `attempts.service.ts` e `group-work.service.ts`; a lista de candidatos passa pela regra START da 012
  (`decideOperation`) e recusa quando o início seria recusado (achado da auditoria da US2). T019 fica verde.
- [X] T022 [US3] Web: `group-notice.tsx` e `group-bar.tsx` (parte de leitura) em `features/group-work`; `readOnly` em
  `features/student-activities/components/activity-answering.tsx` (também na página de foco); o polling de
  `GROUP_POLL_MS = 5000` no hook da atividade, só com a página visível; "Em grupo" na lista. T020 fica verde; a US3
  sai de `pending` e `023/SC-004` também.

**Checkpoint**: o grupo é visível para todos os integrantes.

---

## Phase 6: User Story 4 — Um integrante edita por vez e o líder passa a edição (Priority: P1)

**Goal**: só o editor salva; o líder passa e retoma; quem edita devolve; tudo registrado.

**Independent Test**: A passa a edição para B; B salva; A lê; A retoma; um salvamento atrasado de B é recusado.

### Tests for User Story 4 ⚠️

- [X] T023 [P] [US4] API `apps/api/test/integration/023-us4-editing.spec.ts`:
  - `023/US4-1` HAND para B → editor B, `version` +1, `attempt_group_events` `EDITING_HANDED`,
    `activity_group.editing_changed`; o `GET` de A e de C mostra B;
  - `023/US4-2` TAKE_BACK → editor A; o salvamento seguinte de B → `409 GROUP_NOT_EDITOR`, resposta inalterada,
    `activity_group.write_refused` (`operation: "SAVE"`, `reason: "NOT_EDITOR"`);
  - `023/US4-3 023/SC-003` salvar por quem não edita (pedido direto, outra aba) → 409 e nada muda; com o editor,
    `activity_answer_saves` ganha uma linha por revisão com o aluno certo;
  - `023/US4-4` RETURN por B (editor) → editor A, `EDITING_RETURNED`; RETURN por A ou por C → `409 GROUP_NOT_EDITOR`;
  - `023/US4-5` dois HAND simultâneos (B e C) → um só editor e uma linha por mudança aplicada; HAND para quem já edita
    → 200 sem linha;
  - `023/US4-6` depois da entrega, do prazo sem atraso aceito ou do cancelamento: HAND, TAKE_BACK, RETURN → `409
    INVALID_STATE_TRANSITION`; salvar → a recusa da 012;
  - `023/FR-013` HAND por B (não líder) → `409 GROUP_NOT_LEADER`; HAND para quem não é do grupo, pausado ou sem
    matrícula ativa → `422 GROUP_MEMBER_NOT_AVAILABLE`.
- [X] T024 [P] [US4] Web `apps/web/features/group-work/components/group-bar.test.tsx`: `023/US4-1` "Passar a edição"
  (só para o líder) lista os integrantes e envia HAND; `023/US4-2` "Retomar a edição"; `023/US4-4` "Devolver a
  edição" só para o integrante que edita; um `409 GROUP_NOT_EDITOR` ao salvar troca a página para leitura com "A
  edição voltou para <líder>. O que não foi salvo foi perdido."; axe e teclado.

### Implementation for User Story 4

- [X] T025 [US4] Contratos: `POST /me/activities/:activityId/group/editing` em `endpoints.ts` + `MATRIX`; os códigos
  `GROUP_NOT_EDITOR`, `GROUP_NOT_LEADER`, `GROUP_MEMBER_NOT_AVAILABLE`.
- [X] T026 [US4] API (research U7–U9): as ações em `group-work.service.ts` sob o `FOR UPDATE` da tentativa (UPDATE
  condicional pela `version`, uma linha de evento por mudança aplicada); a checagem de editor em `saveAnswers` e de
  líder + editor em `submit` (`attempts.service.ts`); `activities/group/settle-group.ts` (persiste editor pausado ou
  sem acesso → líder, e líder sem acesso → o integrante ativo mais antigo, actor SYSTEM) rodando antes de toda rota e
  leitura do grupo; auditoria `activity_group.editing_changed`, `leader_changed` e `write_refused`; cada ação conta no limite
  `activity-saves` da 012 (research U18). T023 fica verde.
- [X] T027 [US4] Web: ações do `group-bar.tsx` com mutações TanStack que invalidam a atividade; o tratamento do `409`
  no salvamento automático de `activity-answering.tsx`. T024 fica verde; a US4 sai de `pending`.

**Checkpoint**: MVP — trabalho em grupo utilizável de ponta a ponta até antes da entrega.

---

## Phase 7: User Story 5 — Líder inclui integrantes e entrega pelo grupo (Priority: P2)

**Goal**: o líder completa o grupo até o máximo e entrega uma vez; a nota liberada vale para todos.

**Independent Test**: grupo de 2 com máximo 4; o líder inclui um terceiro; entrega; os três veem a entrega e depois a nota.

### Tests for User Story 5 ⚠️

- [ ] T028 [P] [US5] API `apps/api/test/integration/023-us5-members-submit.spec.ts`: `023/US5-1` `POST …/group/members`
  pelo líder inclui elegíveis até o máximo (`added_by_user_id` = líder, `member_added`); `023/US5-2` além do máximo →
  `409 GROUP_FULL`; `023/US5-3` incluir ou entregar por um integrante → `409 GROUP_NOT_LEADER`; `023/US5-4` a entrega do
  líder (segurando a edição) fica entregue para todos, com `submitted_by_user_id`, `late` pela regra da 012 e
  `activity_submission.created` com `submittedById`; o líder sem a edição → `409 GROUP_NOT_EDITOR` (a página pede "Retome a edição para
  entregar"); `023/FR-018` "Aceitar como entrega" do professor numa tentativa de grupo não entregue vale para todos os
  integrantes (`submitted_by_user_id` NULL, `accepted_by_id` o professor); `023/US5-5
  023/SC-006` correção e liberação: cada integrante lê a mesma nota e retorno, nenhum antes da liberação nem sem
  `notas.proprias.visualizar`; `023/US5-6` não existe rota de sair nem de remover (o catálogo de rotas não tem);
  `023/FR-016` incluir depois da entrega → `409 INVALID_STATE_TRANSITION`.
- [ ] T029 [P] [US5] Web: `023/US5-1 023/US5-2` "Incluir integrantes" com "Você pode incluir até <vagas>", some quando
  cheio; `023/US5-4` "Entregar" só para o líder segurando a edição; `023/US5-5` o resultado liberado aparece para o
  integrante como na 012 (testes em `features/group-work` e `features/student-activities`).

### Implementation for User Story 5

- [ ] T030 [US5] Contratos + API: `POST /me/activities/:activityId/group/members` (`endpoints.ts`, `MATRIX`,
  `GROUP_FULL`), a inclusão em `group-work.service.ts` com o mesmo bloqueio e as mesmas regras do início, contando no limite
  `activity-saves`; o resultado
  da 012 servido a todo participante (`student-activity-loader.ts`, `views/student-view.ts`). T028 fica verde.
- [ ] T031 [US5] Web: "Incluir integrantes" (reusa a lista do diálogo) e as regras de "Entregar" em `group-bar.tsx` e
  `activity-answering.tsx`. T029 fica verde; a US5 sai de `pending` e `023/SC-006` também.

---

## Phase 8: User Story 6 — Professor vê o grupo, as passagens e quem salvou (Priority: P2)

**Goal**: a correção mostra integrantes, passagens da edição e salvamentos por questão, como fatos.

**Independent Test**: depois de uma passagem, o professor vê os integrantes, a passagem e "Salvo por B" na questão.

### Tests for User Story 6 ⚠️

- [ ] T032 [P] [US6] API `apps/api/test/integration/023-us6-review.spec.ts`: `023/US6-1` a lista de entregas traz uma
  linha por tentativa com `participants` (o grupo e quem fez sozinho); `023/FR-020` os contadores do professor contam
  por aluno (um grupo de 3 que entregou soma 3 entregues); `023/US6-2` `GET …/attempts/:attemptId/group` →
  líder, integrantes com `joinedAt`/`addedById` e `events` em ordem; `023/US6-3 023/SC-005` `saves` por questão, do
  primeiro ao último, com aluno e revisão; `023/US6-4` a linha do tempo da 015 e as pausas da 016 trazem o aluno de cada
  fato; `023/US6-5` nenhuma rota de nota lê os registros (nota única para o grupo); a rota para uma tentativa
  individual → 404; professor B → 404; outros papéis → 403.
- [ ] T033 [P] [US6] Web `apps/web/features/activities/components/group-facts.test.tsx`: `023/US6-1` "A e mais 2 — Em
  grupo" na lista; `023/US6-2 023/US6-3` integrantes, histórico em palavras e "Salvo por <nome> às hh:mm (revisão n)"
  com os anteriores num `Collapsible`; nenhum texto com "fraude", "cola" ou "violação"; axe.

### Implementation for User Story 6

- [ ] T034 [US6] Contratos + API: `participants` no roster e na tentativa (`activities/roster.ts`,
  `attempts-review.service.ts`); os contadores da atividade por aluno (cada participante de uma tentativa entregue); `GET /classes/:classId/activities/:activityId/attempts/:attemptId/group` em
  `attempts-review.controller.ts` com `views/teacher-group-view.ts` (allowlist, `entregas.visualizar`,
  `ClassContextPolicy`, sem auditoria); o nome do aluno nos fatos da 015/016 do professor. T032 fica verde.
- [ ] T035 [US6] Web `features/activities/components/group-facts.tsx` montado em `attempt-review.tsx`; a lista de
  entregas com o grupo. T033 fica verde; a US6 sai de `pending` e `023/SC-005` também.

---

## Phase 9: User Story 7 — Modo controlado, pausa, ajuda da IA e execução no grupo (Priority: P2)

**Goal**: as regras de 015, 016 e 021 continuam por aluno dentro do grupo; a ajuda é de 3 por grupo.

**Independent Test**: grupo CONTROLADO com ajuda e execução: a saída de B tem o nome de B; a 4ª orientação é recusada;
dois integrantes executam, cada um o seu.

### Tests for User Story 7 ⚠️

- [ ] T036 [P] [US7] API `apps/api/test/integration/023-us7-options.spec.ts` (com `createWorkHelpApp` e o worker em
  processo da 019):
  - `023/US7-1` eventos do modo controlado de B ficam com `student_user_id` B; A não os lê
    (`/attempt/integrity` só devolve os próprios);
  - `023/US7-2` pausa de B (sair da sala e "Pausar aluno"; B não tem tentativa própria e a pausa abre na tentativa do
    grupo, nunca `NOT_STARTED`): B não vê as questões nem salva (`409 ATTEMPT_PAUSED`), A segue; se B editava, o
    próximo toque devolve a edição a A (`EDITING_RESET`, `reason: "PAUSED"`) e, liberado o retorno, B não a recebe
    de volta;
  - `023/US7-3 023/SC-008` ajuda: só o editor pede (`409 GROUP_NOT_EDITOR` para os outros); três entregues e a quarta
    recusada para qualquer integrante; todos leem as orientações do grupo;
  - `023/US7-4` execução: C (que só lê) executa uma questão de Código; a execução é de C (pendente e limite por
    aluno), nada é salvo; pausado, C recebe `409 ATTEMPT_PAUSED`;
  - `023/US7-5` desmarcar a presença de B → `409 ATTENDANCE_STARTED`; o líder só vê presentes;
  - `023/FR-023` líder com a matrícula encerrada → no próximo toque a liderança passa ao integrante ativo mais
    antigo (`LEADER_CHANGED`, `activity_group.leader_changed`); editor removido da turma → a edição volta ao líder
    (`EDITING_RESET`, `reason: "ACCESS_LOST"`); líder pausado → passar a edição, entregar e incluir são recusados
    (`409 ATTEMPT_PAUSED`) e os integrantes seguem lendo.
- [ ] T037 [P] [US7] Web: `023/US7-1` a barra do grupo aparece na página de foco; `023/US7-3` o pedido de ajuda só para
  quem edita e as orientações para todos; `023/US7-4` "Executar" também para quem lê (testes em
  `features/work-help`, `features/code-run` e `features/group-work`).

### Implementation for User Story 7

- [ ] T038 [US7] API: a regra do editor no `WorkHelpService` (consulta própria; o limite de 3 já é por tentativa); a
  admissão das execuções na tentativa do grupo pela regra de tempo da 012 sem a checagem de editor e com a pausa do
  próprio aluno (`code-runs.service.ts`, research U13); os fatos do professor por aluno. T036 fica verde.
- [ ] T039 [US7] Web: as condições de ajuda e execução por papel em `features/work-help` e
  `features/student-activities/components/activity-answering.tsx`. T037 fica verde; a US7 sai de `pending`.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T040 Suítes de segurança em `apps/api/test/security/` (os SC restantes saem de `pending`, que fica vazio):
  - `023-isolation.spec.ts`: de fora do grupo, de outra turma e professor B → 404 em todas as rotas; um integrante
    nunca lê eventos, pausas ou execuções de outro; nenhuma resposta traz e-mail ou RA de colega;
  - `023-concurrency.spec.ts` `023/SC-002`: dois líderes × o mesmo colega, início sozinho × incluído, dez inclusões
    simultâneas no limite, salvar × TAKE_BACK, entregar × incluir — nunca um aluno em dois grupos nem em grupo e
    sozinho;
  - `023-boundaries.spec.ts`: corpos estritos (campos de servidor como `leaderId`, `editorId`, `groupId`,
    `attemptId`, `joinedAt` → 400), 0/1/4/5 ids, `groupSize` 1/2/5/6, e uma passagem recusada pelo limite
    `activity-saves` (429);
  - `023-invariance.spec.ts` `023/SC-007`: num trabalho individual, num exercício (013) e numa prova (018), o início,
    os salvamentos, a entrega, a nota, os eventos da 015, as pausas da 016 e as execuções da 019/021 dão os mesmos
    resultados e os mesmos eventos de auditoria de antes da 023; cada tentativa tem só o dono como participante e
    nenhuma linha em `attempt_groups`;
  - `023-audit.spec.ts`: nomes e respostas com `MARCADOR-GRUPO-023` fora da auditoria e dos logs; o journey
    (`test/helpers/journey.ts`) forma um grupo, passa, retoma e entrega com eles;
  - `023-performance.spec.ts`: candidatos de uma turma de 60 p95 < 100 ms; `GET /me/activities/:id` de um grupo
    p95 < 150 ms; o `GET …/group` do professor com 5 integrantes × 10 questões × 50 salvamentos p95 < 150 ms;
  - web: `test/student-portal-xss.test.tsx` cobre os nomes no diálogo, na barra, no aviso e nos fatos do professor;
    `023/FR-026` `test/exam-wording.test.ts` passa a varrer também `features/group-work` e
    `features/activities/components/group-facts.tsx`;
  - `023/SC-001` fica no E2E (T041) e `023/SC-007` em `023-invariance.spec.ts`.
- [ ] T041 E2E `apps/web/e2e/group-work.spec.ts`, com `023/SC-001` no título (três contextos do navegador,
  quickstart passos 1–9; formar o grupo de 3 a partir de "Iniciar" em menos de 1 minuto): aplicar em
  grupo, formar, ler o salvamento em até 10 s, passar e retomar, incluir, entregar pelo líder, corrigir e ver a mesma
  nota nos integrantes. Rodar com `pnpm --filter web test:e2e group-work` (exige consentimento para o reset do
  `devtrack_e2e`).
- [ ] T042 [P] Documentação: `apps/api/CLAUDE.md` (participantes, grupo, travas, helpers e suítes da 023),
  `apps/web/CLAUDE.md` (`features/group-work`, o polling, a regra de só leitura), `CLAUDE.md` raiz (regra "Group work
  (023)" em "Rules that are easy to get wrong"; o `SPECS` da traceability cita a 023), `README.md`.
- [ ] T043 Verificação final: `pnpm lint && pnpm check-types && pnpm test` verde; o quickstart percorrido no
  navegador; `pending` da 023 vazio em `traceability.spec.ts`.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T002) → Foundational (T003–T008) → US1 → US2 → US3 → US4 → (US5, US6, US7) → Polish.
- **Foundational**: bloqueia tudo; T005 antes de T006–T007; T008 prova a invariância antes de qualquer história.
- **US1 (T009–T013)**: depende da Foundational.
- **US2 (T014–T018)**: depende da US1 (precisa de um trabalho em grupo).
- **US3 (T019–T022)**: depende da US2.
- **US4 (T023–T027)**: depende da US3 (a leitura do grupo e o `group-bar`).
- **US5, US6, US7**: dependem da US4; independentes entre si (arquivos diferentes, exceto `group-bar.tsx` em US5 e US7
  e `activity-answering.tsx` em US5 e US7 — fazer em sequência).
- **Polish**: depois de todas as histórias.

## Parallel Opportunities

- Setup: T001 ∥ T002.
- Foundational: T003 ∥ T004 (testes); depois T005 → T006 → T007 → T008.
- Em cada história: o teste da API ∥ o teste do web (T009 ∥ T010, T014 ∥ T015, T019 ∥ T020, T023 ∥ T024, T028 ∥ T029,
  T032 ∥ T033, T036 ∥ T037).
- US6 ∥ US7 depois da US4 (API e web em arquivos diferentes); US5 em seguida da US7 ou antes, por causa do
  `group-bar.tsx`.
- Polish: T042 ∥ T040.

## Implementation Strategy

1. **MVP** (Foundational + US1–US4): o professor aplica em grupo, o líder forma o grupo, todos leem e a edição passa
   de mão em mão; validar com o quickstart passos 1–4.
2. **Incremento 1** (US5): incluir e entregar; nota para todos.
3. **Incremento 2** (US6): a correção com os registros.
4. **Incremento 3** (US7): modo controlado, pausa, ajuda e execução no grupo.
5. **Polish**: segurança, E2E, documentação.
