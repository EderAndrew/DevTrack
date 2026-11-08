---
description: "Task list for 025 — Aviso discreto do professor ao aluno durante a prova: sino no app mobile (aluno com 2+ ocorrências contadas) que mostra só a esse aluno um aviso fixo em Alert Dialog na tela da prova; um pendente por tentativa, envio só pelo celular, nunca ocorrência"
---

# Tasks: 025 — Aviso discreto do professor ao aluno durante a prova

**Input**: os documentos de design em `/specs/025-exam-student-nudge/`.
**Prerequisites**:

- plan.md, spec.md (US1–US3, FR-001–FR-018, SC-001–SC-007), research.md (N1–N10) e data-model.md;
- contracts/: http-api, audit-events e ui;
- quickstart.md;
- constituição **v3.7.0** (sem emenda: a spec amplia o `apps/mobile` e revoga, com uma exceção, a regra "só
  leitura" da 024).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-007).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 025 com prefixo (`025/US1-4`, `025/FR-013`,
  `025/SC-003`), um id literal por cenário; onde uma tarefa cita uma faixa (`025/US1-1`…`025/US1-9`), cada cenário
  ganha o seu próprio `it`. Testes da API, do web (unit e `apps/web/e2e`) e do app contam.
- **Rota nova**: exige, na mesma tarefa, a entrada em `packages/contracts/src/endpoints.ts`, as linhas no `MATRIX` de
  `apps/api/test/security/authorization-matrix.ts` (contracts/http-api.md, "Permission matrix", com a sessão WEB e a
  MOBILE na rota de envio) e `route-declarations.spec.ts` verde.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API, do web e do app.
- **Auditoria**: um tipo novo entra em `apps/api/src/modules/audit/audit-event-types.ts`, em
  contracts/audit-events.md e no `apps/api/test/helpers/journey.ts` na mesma tarefa que o emite
  (`audit-coverage.spec.ts`); metadados só com ids, enums, códigos e contagens — nunca nome nem o texto do aviso.
- **A 018 não muda** (FR-013, SC-003): as suítes 018 (`018-*`, `exams-boundary`, `activities-boundary`,
  `attendance-boundary`) continuam verdes **sem mudança de asserção**, exceto onde um shape ganha um campo (monitor,
  linha do tempo), em que só se acrescenta o campo esperado.
- **Sem dependência nova, push, WebSocket ou job** (IX, research N10).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: contratos, esquema, permissão, `@MobileOnly()`, o puro `nudge-status.ts` e a guarda de fronteira.
- **US1** (P1, o professor envia pelo sino) e **US2** (P1, o aluno vê e fecha): independentes depois da Foundational
  (os testes da US2 criam o aviso por helper); a demonstração ponta a ponta precisa das duas.
- **US3** (P2, histórico na sala, linha do tempo e revisão): depende só da Foundational (helper cria avisos).
- **MVP**: Foundational + US1 + US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 025 entra na guarda de rastreabilidade e os contratos existem.

- [X] T001 Incluir a 025 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 024:
      `feature: "025"`, `path: "specs/025-exam-student-nudge/spec.md"`, `stories: 3`, `scenarios: 23` (9 + 9 + 5),
      `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 7)` e
      `pending: { stories: [1, 2, 3], successCriteria: ["SC-001", "SC-002", "SC-003", "SC-004", "SC-005", "SC-006", "SC-007"] }`,
      com o comentário "Joined in the Setup phase (T001); each story leaves `pending` with the task that writes its
      last test, each SC with the test that cites it, so the lists are empty at the end of T030". Citar a 025 na
      lista de `SPECS` do `CLAUDE.md` raiz.
- [X] T002 [P] Contratos em `packages/contracts/src/exam-nudges/nudge.ts` (novo domínio; contracts/http-api.md
      "Schemas"), exportados em `src/index.ts`: `ExamNudgeStatusSchema` (`PENDING`, `DISMISSED`, `UNSEEN`),
      `TeacherExamNudgeSchema`, `ExamNudgeSummarySchema`, `SendExamNudgeRequestSchema` (`z.strictObject({})`),
      `SendExamNudgeResponseSchema`, `StudentExamNudgeSchema`, `DismissExamNudgeRequestSchema`; os códigos
      `EXAM_NUDGE_NOT_ALLOWED`, `EXAM_NUDGE_NOT_PENDING` e `MOBILE_SESSION_REQUIRED` em
      `packages/contracts/src/common/errors.ts`; os campos novos `nudge: ExamNudgeSummarySchema.nullable()` em
      `ExamMonitorStudentSchema` (`packages/contracts/src/exam-sessions/monitor.ts`) e
      `nudges: z.array(TeacherExamNudgeSchema)` em `IntegrityTimelineSchema`
      (`packages/contracts/src/attempt-integrity/views.ts`). As entradas de `endpoints.ts` entram nas tarefas das
      rotas (T012, T020). `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test` (nenhum texto
      de usuário no pacote).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o banco tem `exam_nudges` e a permissão; a API tem `@MobileOnly()` e a derivação pura; a fronteira do
módulo novo é vigiada.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests for Foundational ⚠️

- [X] T003 [P] `apps/api/test/integration/025-schema.spec.ts` (data-model.md), escrito antes da migração:
  - insere em tentativa `IN_PROGRESS` de EXAM; recusa (trigger) em tentativa `SUBMITTED`, de trabalho ou exercício,
    com `exam_attempt_holds` aberto, com `attempt_pauses` sem `released_at`, com `activity_id` diferente do da
    tentativa e com `dismissed_at` preenchido no insert;
  - UNIQUE parcial: um segundo pendente da mesma tentativa falha; depois de `dismissed_at` preenchido, um novo entra;
  - CHECK `dismissed_at >= sent_at`; UPDATE só de `dismissed_at` de NULL para valor (mudar `sent_at`, `attempt_id`
    ou um `dismissed_at` já preenchido falha); DELETE direto falha e o apagamento em cascata da tentativa funciona;
  - a permissão `provas.avisos.enviar` existe e só o papel TEACHER a tem.
- [X] T004 [P] `apps/api/src/modules/exam-nudges/nudge-status.spec.ts` (research N6, data-model "Derived"), antes da
      T008: `running` (cada condição isolada: submissão, retenção aberta, pausa aberta, pausa encerrada por derivação,
      `now >= endsAt`, atividade fechada/cancelada), `canSendNudge` com 0, 1, 2, 3 e 4 ocorrências (4 com retenção
      devolvida → pode), com pendente → não; `nudgeShown`; `nudgeStatus` → `DISMISSED`, `UNSEEN` (entregue, tempo
      esgotado sem submissão, atividade encerrada) e `PENDING` (inclusive retida ou pausada).
- [X] T005 [P] `apps/api/test/exam-nudges-boundary.spec.ts`, que deve falhar antes da T009:
  - `modules/exam-nudges` não importa `ai`, `*-ai`, `work-help`, `platform/push`, `exam-alerts`, `platform/mail`,
    `activities/submission`, grading (`works/grading`), `exam-holds`, `attendance` nem `attempt-integrity`; não
    contém `INSERT`/`UPDATE`/`DELETE` em `exam_occurrences`, `exam_attempt_holds`, `attempt_pauses`,
    `activity_submissions`, `activity_attempts` ou `attempt_integrity_events`;
  - `exam-sessions` e `attempt-integrity` só importam de `exam-nudges` os arquivos `nudge-status.ts` e `views.ts`;
  - nas chamadas de auditoria e de log de `exam-nudges`, nenhum campo `name`, `studentName`, `text` ou `message`;
  - nenhum texto de `apps/web/features/exam-nudge` nem de `apps/mobile/features/exam-room` diz "fraude", "cola" ou
    "violação" (`025/SC-006`, também lido pela T030);
  - o texto do aviso ("o professor está acompanhando suas ações") não aparece em `apps/api/src` nem em
    `packages/contracts/src` (`025/FR-017`).
- [X] T006 [P] `apps/api/test/security/025-mobile-only.spec.ts` (research N3), antes da T010: uma rota de teste
      marcada `@MobileOnly()` responde `403 MOBILE_SESSION_REQUIRED` a uma sessão WEB (cookie) antes de checar a
      permissão, aceita o bearer MOBILE e conta como `@MobileAccess()` (a coluna do bearer da matriz).

### Implementation for Foundational

- [X] T007 Migração `apps/api/prisma/migrations/<ts>_025_exam_student_nudge/migration.sql` e
      `apps/api/prisma/schema.prisma` (`model ExamNudge` mapeado para `exam_nudges`, relações com `ActivityAttempt`,
      `ClassActivity` e `User`): tabela, CHECK, índice único parcial `exam_nudges_one_pending`, índice
      `exam_nudges_attempt_sent`, triggers `exam_nudges_insert_valid`, `exam_nudges_update_guard` e
      `exam_nudges_no_delete` (data-model.md); seed de `provas.avisos.enviar` ("Enviar aviso discreto a um aluno
      durante a prova") para TEACHER, no padrão do seed da 018 (`ON CONFLICT DO NOTHING`). `PermissionKey` em
      `apps/api/src/modules/access-control/permissions.ts` ganha a chave. `pnpm --filter api prisma migrate deploy`
      no banco de teste; T003 verde.
- [X] T008 [P] `apps/api/src/modules/exam-nudges/nudge-status.ts` (puro, sem Prisma nem Nest): `NudgeAttemptFacts`,
      `running`, `canSendNudge`, `nudgeShown`, `nudgeStatus`, `MIN_OCCURRENCES_FOR_NUDGE = 2`; usa `pauseTime`
      (`activities/status/pause-time`) e recebe `endsAt` pronto. T004 verde.
- [X] T009 Esqueleto `apps/api/src/modules/exam-nudges/exam-nudges.module.ts` registrado no `AppModule`, e
      `views.ts` com as listas fechadas `toTeacherExamNudge(row, facts, now)` e `toStudentExamNudge(row, name)`.
      T005 verde.
- [X] T010 `@MobileOnly()` em `apps/api/src/modules/access-control/decorators.ts` (aplica `MOBILE_ACCESS_KEY` e
      `MOBILE_ONLY_KEY`) e a regra em `apps/api/src/modules/access-control/guards/session.guard.ts`: cookie (WEB) numa
      rota `@MobileOnly()` → `403 MOBILE_SESSION_REQUIRED`, antes do `PermissionsGuard`; helper de erro ao lado de
      `mobileRouteNotAllowed()`. Mover `MobileWriteLimit` de `apps/api/src/modules/exam-alerts/mobile-write-limit.ts`
      para `apps/api/src/platform/http/mobile-write-limit.ts` (analysis I2: `exam-nudges` não pode importar
      `exam-alerts`), atualizando as importações de `exam-alerts`; `024-rate-limits.spec.ts` verde sem mudança de
      asserção. T006 verde; as suítes 001/002/024 de sessão e origem continuam verdes sem mudança.

**Checkpoint**: banco, permissão, derivação e regra do celular prontos.

---

## Phase 3: User Story 1 - Professor envia o aviso pelo sino no celular (Priority: P1) 🎯 MVP

**Goal**: o sino aparece só para o aluno elegível; tocar e confirmar cria um aviso pendente, idempotente, só pelo
celular.

**Independent Test**: com uma prova em andamento e um aluno com 2 ocorrências, enviar pelo app (cliente mockado) e
pela API com o bearer; conferir um pendente só para aquele aluno, o mesmo aviso no segundo envio e a recusa pela web.

### Tests for User Story 1 ⚠️

- [X] T011 [P] [US1] `apps/api/test/integration/025-us1-send.spec.ts` (helpers novos em
      `apps/api/test/helpers/exam-nudges.ts`: prova aplicada, aluno presente com tentativa e N ocorrências via o lote
      de eventos real, sessão MOBILE do professor; `createNudge` direto no banco para as outras histórias):
  - `025/US1-1`, `025/US1-2`: `nudge.canSend` no monitor com 1, 2 e 3 ocorrências (lido pela rota do monitor com o
    bearer);
  - `025/US1-3`: `201`, linha pendente, `exam_nudge.sent` com `activityId`, `nudgeId`, `occurrenceCount`;
  - `025/US1-4`: segundo envio → `200` com o mesmo `id`, uma linha, um evento;
  - `025/US1-5`: depois do `dismissed_at` (helper), `canSend` volta a `true`, `lastDismissedAt` preenchido, novo
    envio `201`;
  - `025/US1-6`: retida, pausada, entregue, tempo esgotado (relógio injetado além de `endsAt`, liquidado pelo envio),
    cancelada → `409 EXAM_NUDGE_NOT_ALLOWED` e `exam_nudge.send_refused` com o `reason`; menos de 2 ocorrências →
    `TOO_FEW_OCCURRENCES`;
  - `025/US1-7`: turma de outro professor, trabalho, exercício, tentativa de outra atividade → `404` sem evento;
  - `025/US1-8`: mesmo professor com a sessão WEB → `403 MOBILE_SESSION_REQUIRED`;
  - `025/FR-006`: corpo com campo extra (`{ text: "…" }`, `{ studentId }`, `{ message }`) → `400`, nada criado;
  - permissões: sem `provas.avisos.enviar` ou sem `chamada.registrar` (papel ajustado no teste) → `403`;
  - prova silenciada (024 US4) continua com `canSend` verdadeiro e o envio funciona (spec Edge Cases);
  - `025/US1-9` e `025/FR-013`: depois do envio, `exam_occurrences`, `exam_attempt_holds`, `attempt_pauses`,
    `activity_submissions`, `exam_alerts` e o `endsAt` da tentativa iguais aos de antes (nenhum push enfileirado).
- [X] T012 [P] [US1] `apps/api/test/security/025-concurrency.spec.ts` `025/SC-004`: 10 envios simultâneos → um aviso,
      um evento, os demais `200` com o mesmo `id`; envio simultâneo ao lote da 4ª ocorrência → ou o aviso entra antes
      e a retenção depois (aviso pendente, não mostrado), ou o envio recebe `409`; nunca um aviso inserido depois da
      retenção aberta.
- [X] T013 [P] [US1] Testes do app em `apps/mobile/features/exam-room/components/nudge-bell.test.tsx` (cliente
      mockado): `025/US1-1`/`025/US1-2` sino só com `nudge.canSend` (ou pendente, desabilitado), nome acessível
      "Enviar aviso para <nome>", na linha da sala e no detalhe do aluno; confirmação "Enviar aviso para <nome>?" →
      `POST …/exam-nudges` com `{}`; `025/US1-3` estado "Aviso enviado — aguardando o aluno"; `025/US1-5` "Último aviso
      fechado às HH:MM" com o horário do servidor; `025/US1-6` `409` → "Não é possível enviar o aviso agora." e a sala
      relida; cancelar não envia; sem cor como único sinal.
- [X] T014 [P] [US1] Atualizar `apps/mobile/test/no-decision-routes.test.ts`: `ALLOWED` ganha
      `…/attempts/${attemptId}/exam-nudges` (POST) com comentário "025: a única escrita do app (spec Emenda à 024)";
      o título passa a citar `024/FR-010` e `025/FR-007`, e um `it` novo afirma que nenhuma outra rota `POST`/`PUT`
      fora de sessão, celular, silenciar e aviso existe.

### Implementation for User Story 1

- [X] T015 [US1] `apps/api/src/modules/exam-nudges/exam-nudges.service.ts` → `send(teacherId, classId, activityId,
      attemptId)` (research N5): `ClassContextPolicy.findOwnedOrNotFound`, `findExamActivity` (não EXAM → `404`, não o
      `409 NOT_AN_EXAM` do monitor), `ExamSettlement` da tentativa, transação com a tentativa `FOR UPDATE`, fatos lidos
      em query própria (status, submissão, retenção aberta, pausa não liberada, `max(ordinal)` das ocorrências),
      `canSendNudge`, `INSERT … ON CONFLICT DO NOTHING RETURNING` (`sent_at` do `Clock`), sem linha → devolve o
      pendente (`created: false`); `exam_nudge.sent` na mesma transação; recusa → `exam_nudge.send_refused` em
      transação própria e `409 EXAM_NUDGE_NOT_ALLOWED`; erro do trigger mapeado para o mesmo `409`. Tipos de
      auditoria registrados (`audit-event-types.ts`, `journey.ts`).
- [X] T016 [US1] `apps/api/src/modules/exam-nudges/teacher-exam-nudges.controller.ts`: `POST
      classes/:classId/activities/:activityId/attempts/:attemptId/exam-nudges`, `@RequirePermissions(
      "chamada.registrar", "provas.avisos.enviar")`, `@MobileOnly()`, `ZodBody(SendExamNudgeRequestSchema)`,
      `201`/`200` conforme `created`; limite `mobile-writes` pelo `platform/http/mobile-write-limit.ts` (movido na
      T010); entrada em `endpoints.ts`, linhas do `MATRIX`, rota na lista de
      `024-mobile-allowlist.spec.ts`. T011 e T012 verdes.
- [X] T017 [US1] Monitor: `apps/api/src/modules/exam-sessions/exam-monitor.service.ts` lê por aluno, na mesma query,
      um `LEFT JOIN LATERAL` de agregado de `exam_nudges` (pendente `sent_at`, contagem, último `dismissed_at`) e
      monta `nudge` (`null` sem tentativa) com `canSendNudge` do puro. Atualizar as asserções de shape do monitor nas
      suítes 018/024 só para incluir o campo.
- [X] T018 [US1] App: `apps/mobile/features/exam-room/api/exam-nudges.ts` (`sendNudge(classId, activityId,
      attemptId)` com `SendExamNudgeResponseSchema`), `hooks/use-send-nudge.ts` (mutação que invalida a sala),
      `apps/mobile/components/ui/dialog.tsx` (modal de confirmação só com tokens; exportado em `components/ui/index.ts`),
      `features/exam-room/components/nudge-bell.tsx` (Lucide `Bell`) e o uso em `exam-room.tsx` (linha) e
      `student-occurrences-screen.tsx` (detalhe); textos em `features/exam-room/schemas/exam-room.ts` (contracts/ui.md).
      T013 e T014 verdes; US1 sai de `pending`.

**Checkpoint**: o professor envia pelo celular; o aviso fica pendente no servidor.

---

## Phase 4: User Story 2 - Aluno vê o aviso, fecha e continua a prova (Priority: P1) 🎯 MVP

**Goal**: a tela da prova consulta a cada 5 s e mostra o aviso fixo com o nome do aluno; "Entendi" fecha uma vez; o
aviso nunca é ocorrência.

**Independent Test**: com um aviso criado por helper, abrir a tela da prova do aluno, ver o diálogo em até 10 s,
fechar, recarregar e conferir que não volta e que nenhuma ocorrência foi registrada.

### Tests for User Story 2 ⚠️

- [ ] T019 [P] [US2] `apps/api/test/integration/025-us2-student.spec.ts`:
  - `025/US2-1`: `GET /me/activities/:id/attempt/exam-nudge` → `{ nudge: { id, studentName } }` com o nome da conta;
    sem pendente → `null`; o corpo tem só essas chaves (`025/FR-009`);
  - `025/US2-2`, `025/US2-3`: dismiss → `200 { nudge: null }`, `dismissed_at` do `Clock`, `exam_nudge.dismissed`;
    repetir → `200`, sem segundo evento; o `GET` seguinte → `null`;
  - `025/US2-6`: pausada → `GET` `null` e dismiss `409 ATTEMPT_PAUSED`; retida → `null` e `409
    EXAM_ATTEMPT_ON_HOLD`; liberado o retorno / devolvida → o `GET` volta a trazer o aviso;
  - `025/US2-7`: entregue, tempo esgotado, cancelada → `GET` `null` e dismiss `409 EXAM_NUDGE_NOT_PENDING`;
  - `025/US2-9`: outro aluno da mesma prova → `GET` `null` e dismiss do aviso alheio → `404`;
  - aluno não marcado presente, trabalho, exercício → `404` como as rotas de aluno da 018; bearer → `403
    MOBILE_ROUTE_NOT_ALLOWED`;
  - `025/FR-006` (fechamento): corpo com campo extra (`{ dismissedAt }`, `{ studentId }`) → `400`, nada muda.
- [ ] T020 [P] [US2] `apps/api/test/security/025-never-occurrence.spec.ts` `025/SC-003`: duas tentativas iguais, uma
      com envio + fechamento, outra sem; mesmas ocorrências, contagem, `endsAt`, respostas, situação e nota depois da
      correção e liberação (0 diferenças).
- [ ] T021 [P] [US2] Testes do web em `apps/web/features/exam-nudge/components/exam-nudge-dialog.test.tsx` e
      `apps/web/features/exam-attempt/components/exam-nudge.test.tsx` (MSW/fetch mockado, timers falsos):
      `025/US2-1` diálogo "Mensagem do professor" depois de uma consulta de 5 s com o texto exato e o nome;
      `025/US2-2` "Entendi" e Escape fecham na hora, chamam o dismiss e o foco volta; `025/FR-011` falha de rede → o
      diálogo já fechado não volta, a prova segue respondível e o dismiss é reenviado até dar `200` (o id fica em
      `sessionStorage`; uma consulta que ainda traz o mesmo aviso não o reabre); `025/US2-3` e Edge Cases (duas abas,
      analysis C2): com o diálogo aberto, a consulta seguinte volta `null` → o diálogo some sem chamar o dismiss; a
      prova deixa de rodar (pausa, retenção, fim) com o diálogo aberto → some;
      `025/US2-4` nenhuma `requestFullscreen`/`exitFullscreen` e nenhum evento `INACTIVITY` gravado com o diálogo
      aberto além do limite (relógio avançado), e o período recomeça ao fechar; `025/US2-5` cronômetro visível com o
      diálogo; tempo esgotado esconde o diálogo; `025/US2-6` sem consulta (ou sem diálogo) com a tentativa pausada ou
      retida; espera o `WarningDialog` fechar; `025/US2-8` `role="alertdialog"`, foco preso, `vitest-axe` sem
      violações nos temas escuro e claro; consulta só com a página visível (`refetchIntervalInBackground: false`).
- [ ] T022 [P] [US2] E2E `apps/web/e2e/exam-nudge.spec.ts` `025/SC-001`, `025/SC-002`: professor aplica a prova, dois
      alunos presentes iniciam; o aluno A sai da tela duas vezes; o aviso é criado pela API com o bearer do professor
      (helper do e2e); A vê o diálogo em ≤ 10 s, B não vê nada em 15 s; A fecha e o diálogo não volta depois de
      recarregar; nenhum "Aviso n de 3" novo.

### Implementation for User Story 2

- [ ] T023 [US2] `exam-nudges.service.ts` → `studentPending(studentId, activityId)` e `dismiss(studentId, activityId,
      nudgeId)` (research N7): tentativa própria localizada por `attempt_participants` com as regras de acesso de
      aluno da 018 (matrícula ACTIVE, presença 016; fora → `404`); `nudgeShown` com os fatos da tentativa; dismiss com
      `UPDATE … WHERE dismissed_at IS NULL RETURNING`, já fechado → `200` sem evento, os `409` da tabela de
      contracts/http-api.md; `exam_nudge.dismissed` na mesma transação (tipo registrado na auditoria e no journey).
- [ ] T024 [US2] `apps/api/src/modules/exam-nudges/student-exam-nudge.controller.ts`: `GET
      me/activities/:activityId/attempt/exam-nudge` e `POST …/exam-nudge/:nudgeId/dismiss`
      (`@RequirePermissions("atividades.proprias.responder")`, `ZodBody(DismissExamNudgeRequestSchema)`), entradas
      em `endpoints.ts` e no `MATRIX`. T019 e T020 verdes.
- [ ] T025 [US2] Web: `apps/web/features/exam-nudge/api/exam-nudge.ts`, `hooks/use-exam-nudge.ts`
      (`refetchInterval: ATTENDANCE_POLL_MS`, `refetchIntervalInBackground: false`, `enabled` só com a prova
      rodando; dismiss que fecha na hora, guarda o id em `sessionStorage` e reenvia em segundo plano até ser aceito,
      filtrando da consulta os ids já fechados neste aparelho), `schemas/exam-nudge.ts` (textos, contracts/ui.md) e
      `components/exam-nudge-dialog.tsx` (`components/ui/alert-dialog.tsx`, título "Mensagem do professor", um botão
      "Entendi"; fecha sem dismiss quando a consulta volta `null` ou a prova para); em
      `apps/web/features/exam-attempt/components/exam-shell.tsx`, montar o diálogo quando `running && !held &&
      warning === null`, e passar `enabled={running && !nudgeOpen}` ao `InactivityWatch` (research N8). ESLint de
      camadas do web verde (feature nova só importada por `features/exam-attempt`). T021 e T022 verdes; US2 sai de
      `pending`.

**Checkpoint**: MVP completo — o professor envia pelo celular e só aquele aluno vê o aviso e o fecha.

---

## Phase 5: User Story 3 - Professor acompanha os avisos na sala, na linha do tempo e na revisão (Priority: P2)

**Goal**: os avisos aparecem com horários e situação na linha do tempo (app e web), no monitor da web e na revisão,
nunca para o aluno.

**Independent Test**: dois avisos por helper (o primeiro fechado), ler a linha do tempo com o bearer e com a sessão
web e a revisão depois do fim; conferir os registros, as situações e que o aluno não os vê.

### Tests for User Story 3 ⚠️

- [ ] T026 [P] [US3] `apps/api/test/integration/025-us3-history.spec.ts`: `025/US3-1` `GET
      …/attempts/:attemptId/integrity` traz `nudges` em ordem de `sentAt` com `DISMISSED`, `PENDING` e, depois da
      entrega, `UNSEEN`, igual com o bearer e com a sessão web; trabalho → `nudges: []`; `025/US3-2` o monitor traz
      `pendingSince` e `sentCount`; `025/US3-3` depois do fim e da liberação, a mesma linha do tempo; `025/US3-5` as
      rotas do aluno (`GET /me/activities/:id`, `…/attempt/integrity` próprio, resultado liberado) não têm nenhum
      campo de aviso; `025/SC-005` em 40 alunos com situações variadas, `canSend` verdadeiro exatamente nos que estão
      em andamento com 2+ ocorrências e sem pendente.
- [ ] T027 [P] [US3] Testes do web: `apps/web/features/exam-session/components/exam-room-panel.test.tsx` (`025/US3-2`
      "Aviso do professor pendente" e "Avisos do professor enviados: n", nenhum botão de envio, `025/US3-4` não entra na contagem de
      ocorrências) e `apps/web/features/activities/components/attempt-records.test.tsx` (`025/US3-1`, `025/US3-3`
      "Aviso do professor enviado — HH:MM", "Aviso fechado pelo aluno — HH:MM", "Aguardando o aluno", "Não visto",
      "Não é uma ocorrência"; não indicado só por cor).
- [ ] T028 [P] [US3] Teste do app em `apps/mobile/features/exam-room/components/student-occurrences.test.tsx`
      (`025/US3-1`, `025/US3-4`): os avisos intercalados por horário entre as ocorrências, com os mesmos textos da
      web, fora da contagem de 1–3.

### Implementation for User Story 3

- [ ] T029 [US3] API: `apps/api/src/modules/attempt-integrity/integrity-review.service.ts` lê os avisos da tentativa
      em query própria (só EXAM; senão `[]`) e monta com `toTeacherExamNudge` e `nudgeStatus`; web:
      `exam-room-panel.tsx` e `attempt-records.tsx` com os textos de contracts/ui.md (em
      `apps/web/features/exam-nudge/schemas/exam-nudge.ts`, reexportados só como texto); app:
      `student-occurrences.tsx` intercala os avisos. Atualizar as asserções de shape da linha do tempo nas suítes
      015/018/024 só para incluir `nudges`. T026–T028 verdes; US3 sai de `pending`.

**Checkpoint**: histórico completo para o professor.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T030 Suítes finais em `apps/api/test/security/` (os SC restantes saem de `pending`, que fica vazio):
  - `025-isolation.spec.ts`: professor B, gestor, ADMIN e aluno → `403`/`404` no envio; aluno B → `404` no dismiss
    do aviso de A; nenhuma resposta de aluno traz `sentBy`; professor removido da turma ou turma arquivada → `404`;
    sessão MOBILE revogada → `401` (spec Edge Cases, analysis C3);
  - `025-audit.spec.ts` `025/SC-006`: aluno e prova com `MARCADOR-AVISO-025` no nome e no título — o marcador e o
    texto do aviso nunca aparecem em `audit_events` nem nos logs capturados; o journey (`test/helpers/journey.ts`)
    envia, consulta e fecha um aviso;
  - `025/SC-007` fica no piloto (T033), registrado no título de `apps/mobile/test/pilot-flow.test.tsx` (sala → sino →
    confirmar em dois toques).
- [ ] T031 [P] Documentação: `CLAUDE.md` raiz (025 em "Project state"; a regra "Mobile exam monitor (024)" passa de
      "the app is read-only" para "read-only except the 025 nudge"; nova regra "Exam nudge (025)" em "Rules that are
      easy to get wrong": um pendente por tentativa, só celular `@MobileOnly()`, 2+ ocorrências e em andamento, texto
      só no web/app, nunca ocorrência/nota/bloqueio, inatividade suspensa com o diálogo, consulta de 5 s; o guard
      `exam-nudges-boundary`; a linha "(planned)" do Recent Changes vira a definitiva), `apps/api/CLAUDE.md`
      (`@MobileOnly()`, módulo `exam-nudges`, helpers e suítes da 025), `apps/mobile/CLAUDE.md` (a única escrita, o
      `components/ui/dialog.tsx`), `specs/024-mobile-exam-monitor/spec.md` (nota em FR-010 apontando a emenda da 025).
- [ ] T032 [P] Revisão de desempenho em `apps/api/test/security/025-performance.spec.ts` (plan "Performance Goals"):
      `GET …/attempt/exam-nudge` p95 < 50 ms com 40 alunos e avisos; envio p95 < 150 ms; o monitor com o agregado
      novo no mesmo alvo da 018.
- [ ] T033 Piloto manual: quickstart "Manual check" passos 1–6 com o build `development` do app; cronometrar
      `025/SC-001` (aviso em ≤ 10 s) e `025/SC-007` (envio em < 5 s a partir da sala). Anotar no plan.md.
- [ ] T034 Verificação final: `pnpm lint && pnpm check-types && pnpm test` verde (inclui `apps/mobile`); `pending` da
      025 vazio em `traceability.spec.ts`; Semgrep sem achados nos arquivos novos.

---

## Dependencies & Execution Order

- **Ordem das fases**: Setup (T001–T002) → Foundational (T003–T010) → US1 ∥ US2 ∥ US3 → Polish.
- **Foundational**: T003–T006 (testes) antes de T007–T010; T007 antes de T009; T008 e T010 independentes de T007.
- **US1 (T011–T018)**: depende da Foundational; T015 → T016 → T017 na API; T018 no app depois da T016 (contrato e
  rota).
- **US2 (T019–T025)**: depende da Foundational (helper `createNudge` da T011 ou equivalente no próprio arquivo);
  T023 → T024 → T025.
- **US3 (T026–T029)**: depende da Foundational e da T017 (o campo `nudge` do monitor) para o painel da web.
- **Polish**: T030–T034 depois de todas as histórias; T031 ∥ T032.

## Parallel Opportunities

- Setup: T001 ∥ T002.
- Foundational: T003 ∥ T004 ∥ T005 ∥ T006; depois T007 → T009, com T008 ∥ T010.
- Testes de cada história em paralelo entre si (T011 ∥ T012 ∥ T013 ∥ T014; T019 ∥ T020 ∥ T021 ∥ T022; T026 ∥ T027 ∥
  T028); US1 e US2 podem andar juntas depois da Foundational (API de envio ∥ API do aluno; app ∥ web).

## Implementation Strategy

1. **MVP** (Foundational + US1 + US2): o professor toca no sino e só aquele aluno vê o aviso; validar com o quickstart
   passos 1–5.
2. **Incremento** (US3): histórico na sala da web, na linha do tempo e na revisão; quickstart passo 6.
3. **Polish**: isolamento, auditoria, desempenho, documentação e piloto.
