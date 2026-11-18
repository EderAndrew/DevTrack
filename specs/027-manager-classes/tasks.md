---
description: "Task list for 027 — Turmas do gestor e disciplinas da turma: `cohorts` (a turma do MANAGER: convites, inclusão direta, matrículas, encerrar/arquivar), `classes` vira a disciplina da turma do professor (busca de turmas, encerrar/arquivar após o calendário), transição na migration, \"Minhas turmas\" por ano letivo"
---

# Tasks: 027 — Turmas do gestor e disciplinas da turma

**Input**: os documentos de design em `/specs/027-manager-classes/`.
**Prerequisites**:

- plan.md, spec.md (US1–US8, FR-001–FR-034, SC-001–SC-006), research.md (Q1–Q12), data-model.md (duas migrations: a dos
  valores de enum e a principal, que é também a transição);
- contracts/: http-api, permissions, audit-events, ui;
- quickstart.md;
- constituição **v4.1.0** (emendas 4.0.0 e 4.1.0 já feitas).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-006).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 027 com prefixo (`027/US2-7`, `027/FR-034`,
  `027/SC-002`), um `it` por cenário. Testes da API, do web e do E2E contam.
- **Os ids da 003 continuam cobertos**: as suítes da 003 que mudam de ator (o professor vira o gestor) são reescritas
  mantendo os seus ids (`003/US1-1`…) nos títulos; a spec 003 recebe uma nota de emenda apontando para a 027 (T004).
- **Rotas novas**: toda rota nova ou alterada entra no `MATRIX` de `apps/api/test/security/authorization-matrix.ts`
  e em `endpoints.ts`; `route-declarations.spec.ts` continua verde.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções). **Exceção
  da Phase 2**: ela termina com as suítes 004–026 verdes (SC-005); as suítes HTTP da 003 que usam rotas removidas
  ficam vermelhas até serem reescritas: `003-us1`, `003-list-performance` e `003-concurrency` (turma) em US1;
  `003-us2`, `003-us5`, `003-class-invitation-delivery` e `003-concurrency` (convites) em US2; `003-us6` em US5;
  `003-class-authorization-matrix` em US7. Da Phase 3 à Phase 9, cada fase termina com 004–026 e as suítes da 027
  verdes, e só as suítes da 003 ainda não reescritas podem estar vermelhas; a partir do fim de US7 (Phase 9) a suíte
  inteira fica verde. A lista exata é registrada na T018.
- **Sem dependência nova, WebSocket ou job** (plan, IX).

**Organization**: por user story.

- **Foundational**: a migration (schema + transição + permissões), o Prisma, a situação efetiva, a visão
  `class_enrollments` nos leitores pedagógicos, o rótulo da disciplina da turma e as factories de teste. Tudo o que as
  histórias usam.
- **US1** (P1, turmas do gestor) → **US2** (P1, alunos na turma: convite e inclusão direta) → **US3** (P1, professor
  acrescenta disciplina) → **US4** (P1, professor trabalha como hoje + encerrar/arquivar após o calendário). US3
  depende de US1 só nos testes (precisa de uma turma criada pelo gestor; a factory cobre). US4 depende de US3.
- **US5** (P2, encerrar matrícula): depois de US2 e antes de US7; entra no MVP porque a T003 remove a rota do
  professor e, sem US5, ninguém encerraria uma matrícula depois do deploy.
- **US6** (P1, transição) e **US7** (P1, isolamento): depois da Foundational; US7 roda depois de US1–US5 (exercita as
  rotas delas).
- **US8** (P3, "Minhas turmas" por ano): independente depois de US2.
- **MVP**: Setup + Foundational + US1 + US2 + US3 + US4 + US5 + US6 + US7 (sem isso o beta não pode receber o
  deploy: a migration muda o dono das turmas).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US8).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 027 entra na guarda de rastreabilidade, os contratos existem e a 003 registra a emenda.

- [X] T001 Incluir a 027 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 026:
      `feature: "027"`, `path: "specs/027-manager-classes/spec.md"`, `stories: 8`, `scenarios: 41`
      (6 + 9 + 6 + 5 + 3 + 4 + 4 + 4), `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 6)` e
      `pending: { stories: [1, 2, 3, 4, 5, 6, 7, 8], successCriteria: ["SC-001", …, "SC-006"] }`, com o comentário de
      como cada id sai de `pending`. Citar a 027 na lista de `SPECS` do `CLAUDE.md` raiz ("…, 025, 026 and 027").
- [X] T002 [P] Contratos novos em `packages/contracts/src/cohorts/` (contracts/http-api.md): `cohorts.ts`
      (`CohortCodeSchema`, `CreateCohortRequestSchema`, `UpdateCohortRequestSchema` strict parcial,
      `ChangeCohortStatusRequestSchema`, `CohortListQuerySchema` com `q`, `academicYear`, `status`, `cursor`, `limit`
      ≤ 50, `CohortViewSchema`, `CohortPageSchema`, `CohortDetailSchema` com `activeEnrollmentCount` e
      `classes[{ id, subjectName, teacherName, effectiveStatus }]`), `directory.ts` (`CohortDirectoryQuerySchema` com
      `q` 1–100 e `cursor`, `CohortDirectoryPageSchema` só com id, name, code, academicYear, period e
      `classes[{ subjectName, teacherName }]`), `enrollments.ts` (`StudentLookupRequestSchema { email }`,
      `StudentLookupResponseSchema` discriminada por `found`, com `alreadyEnrolled` no ramo `true`, `DirectEnrollmentRequestSchema { email }`,
      `CohortEnrollmentViewSchema`/`PageSchema` com `source`). Exportar no barril. As entradas `cohorts.*` de
      `endpoints.ts` entram com as rotas (T022, T030, T031, T037, T054): `test/contracts/endpoint-catalog.spec.ts` exige
      rota ↔ entrada.
- [X] T003 [P] **Feito na Phase 1 só o aditivo**: `MyCohortListSchema` em `my-classes.ts` (e o teste
      `packages/contracts/test/cohorts.spec.ts`). **O resto entra com a rota que o usa**, porque
      `test/contracts/endpoint-catalog.spec.ts` exige rota ↔ entrada do catálogo e o `ContractConformanceInterceptor`
      transforma em 500 uma resposta fora do contrato (trocar agora quebraria 004–026): `classes.ts` com a T038/T043,
      `my-classes.ts` (`myClasses.list` → `MyCohortListSchema`) com a T058, `class-invitations.ts` com a T030 e as
      entradas removidas de `endpoints.ts` com a T022/T030/T054. O enum de motivo de cancelamento não existe nos
      contratos (só no banco). Alvo final, inalterado: `classes.ts` — `CreateClassRequestSchema =
      { cohortId, subjectId, startsOn?, endsOn? }` (strict; datas como hoje, ambas ou nenhuma), `UpdateClassRequestSchema
      = { startsOn, endsOn }`, `ClassViewSchema` com `subjectName`, `cohort { id, name, code, academicYear, period }`,
      `ownStatus`, `effectiveStatus`, `startsOn`, `endsOn`, `canChangeStatus`; `ClassListQuerySchema` mantém `q`,
      `status`, `cursor`; `my-classes.ts` — `MyCohortListSchema` (`years[{ academicYear, cohorts[{ id, name, code,
      period, status, classes[{ classId, subjectName, teacherName, effectiveStatus }] }] }]`); `class-invitations.ts`
      — o enum de motivo de cancelamento += `MANAGER`, `ENROLLED_DIRECTLY`, `MERGED`; a página pública do convite
      mostra a turma (nome, código, período). `endpoints.ts`: as rotas de contracts/http-api.md (novas `cohorts.*`,
      `cohortDirectory.search`, `cohortInvitations.*`, `cohortEnrollments.*`; `classes.*` reescritas;
      `classes.invitations*` e `classes.enrollments.remove` removidas; `myClasses.list` com o novo schema).
      `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test`.
- [X] T004 [P] Nota de emenda em `specs/003-class-invitations-enrollment/spec.md` (logo abaixo do cabeçalho):
      "Emenda 2026-11-17 (027, constituição 4.0.0/4.1.0): a turma, os convites e as matrículas passam a ser do gestor
      (MANAGER/ADMIN); o professor não cria turma nem convida. O comportamento dos convites, do aceite e das matrículas
      não muda. Ver specs/027-manager-classes." — e o mesmo em `specs/004-syllabus-planning/spec.md` sobre a turma
      como oferta (E2): "a oferta passa a ser a disciplina da turma (027)".

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: o novo modelo no banco e no código, com as suítes 004–026 verdes por cima dele.

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests (escritos antes, devem falhar)

- [X] T005 [P] Testes puros em `apps/api/src/modules/classes/effective-status.spec.ts` (`effectiveStatus`:
      ARCHIVED > INACTIVE > ACTIVE, as 9 combinações, título `027/FR-023`), `apps/api/src/modules/classes/close-rule.spec.ts`
      (`canCloseClass(class, today)`: sem calendário → false; `today` ≤ `endsOn` → false; `today` = `endsOn` + 1 →
      true; título `027/FR-022`) e `apps/api/src/modules/classes/class-label.spec.ts` (`classLabel("Banco de Dados",
      "ADS 3NA")` → "Banco de Dados · ADS 3NA"; sem disciplina → "ADS 3NA"; título `027/FR-030`).
- [X] T006 [P] Guarda `apps/api/test/cohorts-boundary.spec.ts` (research Q3): falha se algum `.ts` de `apps/api/src`
      juntar `enrollments` por `class_id` (regex em SQL cru: `enrollments\s+\w+\s+(ON|WHERE)[^;]*\.class_id`, e o
      filtro Prisma `schoolClass:\s*\{\s*enrollments`), e se um módulo fora de `cohorts`, `class-invitations` e
      `enrollments` chamar `enrollment.create|update|upsert` ou `classInvitation.create|update`, e se `schoolClass.status`
      ou `schoolClass: { status` aparecer em `apps/api/src` fora de `classes/class-context.policy.ts` e dos arquivos que
      também leem `cohort.status` (FR-023). Citar a guarda na lista
      "Cross-cutting guards" do `CLAUDE.md` raiz.

### Implementation

- [X] T007 Duas migrations (data-model.md, research Q9): (1) `apps/api/prisma/migrations/20261118115900_027_enum_values/migration.sql`:
      `CREATE TYPE enrollment_removal_reason`, `enrollment_source`; `ALTER TYPE mail_kind ADD VALUE
      'CLASS_ENROLLMENT_NOTICE'`, `class_invitation_cancel_reason ADD VALUE 'MANAGER'`, `'ENROLLED_DIRECTLY'`,
      `'MERGED'`. Os passos (2)–(9), em ordem, ficam em
      `apps/api/prisma/migrations/20261118120000_027_manager_classes/migration.sql`: (2) `CREATE TABLE cohorts` com os
      CHECKs da 003 (ano 1900–2100) e `UNIQUE (academic_year, upper(code))`; (3) `INSERT INTO cohorts` um por grupo
      `(academic_year, upper(code))` de `classes`, dados da turma mais antiga (`created_at`, `id`), situação a mais
      aberta, `created_by_id` = professor da mais antiga, `search_key` recalculado como em `classes`; (4)
      `classes.cohort_id` preenchido e `NOT NULL`; (5) `enrollments.cohort_id`/`source`/`enrolled_by_id`/`removal_reason`
      preenchidos; duplicadas ACTIVE por `(cohort_id, student_user_id)`: a mais antiga fica, as outras `REMOVED`,
      `removed_at = now()`, `removal_reason = 'MERGED'`; (6) `class_invitations.cohort_id`; PENDING duplicados por
      `(cohort_id, email)`: fica o de maior `expires_at`, o outro `CANCELLED`, `cancelled_at = now()`,
      `cancel_reason = 'MERGED'`, `cancelled_by_id` NULL (a coluna já é anulável na 003); nos passos (5) e (6), um
      `audit_events` SYSTEM por linha alterada (`enrollment.removed {cohortId, userId, reason: "MERGED"}` /
      `class_invitation.cancelled {cohortId, invitationId, reason: "MERGED"}`), por `INSERT … SELECT` sobre os ids
      devolvidos (`WITH … UPDATE … RETURNING`); (7) dropar `classes.name/code/academic_year/period/description/search_key`,
      `enrollments.class_id`, `class_invitations.class_id` e os índices antigos; criar os novos (data-model.md),
      a partial UNIQUE `(cohort_id, subject_id) WHERE subject_id IS NOT NULL`, o trigger
      `classes_identity_immutable`, a visão `class_enrollments` e a função `class_effective_status(uuid)`; (8)
      permissões (data-model.md "Permissions"): `UPDATE permissions SET description` das 9 chaves `turmas.*`,
      `DELETE FROM role_permissions` delas para TEACHER, `INSERT` para MANAGER e ADMIN, chaves novas `turmas.incluir_aluno`
      (MANAGER, ADMIN), `turmas.buscar` e `disciplinas_turma.{visualizar,criar,editar,alterar_situacao,visualizar_alunos}`
      (TEACHER); (9) um `audit_events` `cohort_transition.applied` (actor SYSTEM, como os eventos SYSTEM de 018) com as
      contagens e as mudanças de permissão do passo (8) (`permissionsMoved`, `permissionsAdded`: chaves e papéis,
      constituição XXV). Tudo numa transação.
- [X] T008 `apps/api/prisma/schema.prisma`: model `Cohort` (`@@map("cohorts")`), `SchoolClass` sem os campos movidos e
      com `cohortId`/`cohort`, `Enrollment` e `ClassInvitation` com `cohortId`, os enums novos e os valores novos.
      `pnpm --filter api prisma generate`; `pnpm --filter api prisma migrate deploy` no banco de dev (porta 5434) e
      `prisma migrate diff` sem diferença entre schema e migrations.
- [X] T009 [P] `apps/api/src/modules/classes/effective-status.ts`, `close-rule.ts` (usa `planningToday` de
      `class-plans/planning-date.ts`) e `class-label.ts` — puros, fazem T005 passar.
- [X] T010 `apps/api/src/modules/classes/class-context.policy.ts`: `findInContext` carrega a turma junto
      (`include: { cohort: true }`) e devolve a classe com `status` = situação efetiva e `ownStatus` = a da classe
      (tipo `ClassInContext` exportado); `findOwnedOrNotFound` idem. Conferir os 20+ consumidores (lista no
      `rtk proxy grep -rln ClassContextPolicy apps/api/src`) — nenhum muda de comportamento.
- [X] T011 Leitores de matrícula por classe → `class_enrollments` (research Q3), sem mudar a semântica: SQL cru em
      `activities/roster.ts`, `activities/group/settle-group.ts` (2), `activities/activity-query.ts`,
      `attendance/attendance.service.ts` (2), `attendance/pauses.service.ts`, `exam-sessions/exam-monitor.service.ts`,
      `ranking/ranking.service.ts`, `student-activities/student-activity-loader.ts`, `student-activities/group-work.service.ts`,
      `student-activities/attempts.service.ts`, `student-activities/group-eligibility.ts`; filtros Prisma
      (`schoolClass.enrollments.some` → `schoolClass.cohort.enrollments.some`; `student.enrollments.some({ classId })`
      → `{ cohort: { classes: { some: { id: classId } } } }`) em `attempt-integrity/integrity-review.service.ts`,
      `ranking/ranking.service.ts` (2), `student-activities/student-activity-loader.ts`; e
      `retention/unverified-accounts.job.ts` (só troca de coluna). T006 passa.
- [X] T012 Leitores da situação da classe → situação efetiva. **SQL cru**: `class_effective_status(ca.class_id)` onde
      hoje se lê `c.status` (`student-activities/attempts.service.ts`, `student-activities/group-work.service.ts`, o
      worker de `exam-alerts` — destinatários: "a turma não arquivada" —, `group-eligibility`, `mobile-exams`).
      **Prisma fora do `ClassContextPolicy`**: `activities/activities.service.ts`, `classes/plannable-class.ts`,
      `student-activities/student-activity-loader.ts` (`classActive`, l. 241 e 548), `exam-nudges/exam-nudges.service.ts`,
      `exam-alerts/exam-alert-preferences.service.ts` e `class-invitations/*` (estes passam a ler a turma) — incluir
      `cohort: { select: { status: true } }` e usar `effectiveStatus()`. Teste `027/FR-023` em
      `027-us4-class-subject.spec.ts`: turma INATIVA → aplicar atividade, editar o plano e salvar a resposta do aluno
      são recusados com os códigos de hoje.
- [X] T013 Leitores do nome da classe → turma + `classLabel` (research Q2): `classes/class.view.ts`, as views do
      professor que mostram a turma, `class-invitations/class-invitation.mail-subject.ts` (usa a turma: nome, código,
      período), `exam-alerts` (texto do push: rótulo da disciplina da turma), `mobile-exams` (lista), 
      `enrollments/my-classes.service.ts` (provisório até US8: mantém o shape atual com o rótulo) e os demais da
      busca `rtk proxy grep -rln -e "sc\.name" -e "schoolClass\.name" -e "c\.name AS" apps/api/src`.
- [X] T014 Factories de teste (`apps/api/test/helpers/factories.ts`, `apps/api/test/helpers/activities.ts`):
      `createCohort(t, overrides)` novo (criador = um MANAGER criado sob demanda); `createClass(t, teacherId,
      overrides)` mantém a assinatura e os campos de hoje (`name`, `code`, `academicYear`… vão para a turma criada por
      trás, ou usa `overrides.cohortId`); `createClassInvitation(t, classId, …)` e o enroll grava `cohort_id` da classe
      (com `classId` ainda aceito para não mexer nas 86 suítes); `createClassWithStudents` idem. As suítes 004–026
      passam sem mudar asserção, exceto onde leem colunas removidas de `classes` (ajustar para a turma).
- [X] T015 [P] Eventos de auditoria em `apps/api/src/modules/audit/audit-event-types.ts` (contracts/audit-events.md):
      `cohort.*`, `cohort.student_lookup`, `cohort.student_lookup_rate_limited`, `cohort_transition.applied`;
      `class.created` passa a `["cohortId", "subjectId"]`; `class_invitation.*` e `enrollment.*` com `cohortId`
      (e `source`/`reason`).
- [X] T016 [P] `apps/api/src/modules/access-control/permissions.ts`: as chaves novas (`turmas.incluir_aluno`,
      `turmas.buscar`, `disciplinas_turma.*`) e o comentário de cada grupo.
- [X] T017 [P] Web: os tipos de `apps/web/features/classes/api`, `features/class-invitations/api`, `features/my-classes/api`
      e `features/student-activities` passam a usar os contratos novos sem mudar tela (o que ainda não existe na API
      fica atrás do que existe; as telas mudam nas histórias); `pnpm --filter web check-types` verde.
- [X] T018 Rodar `pnpm --filter api test` e `pnpm --filter web test`: 004–026 verdes (`027/SC-005` fica em `pending`
      até a T065); registrar no fim desta tarefa a lista exata de suítes da 003 vermelhas por rota removida (a exceção
      da Phase 2).
      **Registro (2026-11-18)**: `pnpm lint`, `pnpm check-types`, `@repo/contracts test` e `pnpm --filter web test`
      (2 046) verdes; na API, 6 246 de 6 409 verdes, e as 161 vermelhas são só destas suítes, todas por rota da 003 que a
      027 tira do professor:
      - 003 (como previsto): `003-us1-classes`, `003-list-performance`, `003-concurrency`,
        `003-class-authorization-matrix`, `003-us2-class-invitations`, `003-us5-manage-invitations`,
        `003-class-invitation-delivery`, `003-us6-enrollments`;
      - 017, que convidam alunos pela rota do professor (`POST /classes/:id/invitations`, agora `turmas.*` do gestor):
        `017-us1-outbox`, `017-us2-notices`, `017-us3-templates` (1), `017-us4-config` (2 pulados no `beforeAll`),
        `017-boundaries` (4), `017-notice-auth` — reescritas na T028 com o gestor e `/cohorts/:id/invitations`;
      - 004, que criam a turma pelo `POST /classes` da 003 (professor): `004-us1-class-offering` (12) e o teste "turma
        própria com disciplina alheia (criar e editar)" de `004-cross-links` — reescritos na T034 sobre
        `POST /classes { cohortId, subjectId }`, mantendo os ids `004/…`.
      Decisões da fase (usuário, 2026-11-18): o `PATCH /classes/:id` já aceita só as datas (`disciplinas_turma.editar`,
      alvo da T038) e as rotas de leitura do professor já usam `disciplinas_turma.*`; os testes 004 que editavam
      nome/período/disciplina passaram a esperar 400; a jornada cria turma, disciplina e convites pelas factories
      (o e-mail do convite segue pelo outbox) e os tipos que ela deixou de emitir esperam em `NOT_IN_JOURNEY_027`
      (`audit-coverage.spec.ts`), com `cohort.*` em `PENDING_027` (entram no catálogo com as rotas, US1/US2) e as linhas
      da 027 substituindo as da 003 (`REPLACED_BY_027`). A migration também criou `mail_deliveries.enrollment_id` (o
      assunto do `CLASS_ENROLLMENT_NOTICE`, data-model.md). As chaves sem rota esperam em `SEEDED_BEFORE_ROUTES`
      (`us7-matrix-completeness.spec.ts`).

**Checkpoint**: o banco tem turmas e disciplinas da turma; o que existia funciona por cima delas.

---

## Phase 3: User Story 1 — Gestor cria e administra as turmas (Priority: P1) 🎯 MVP

**Goal**: o gestor cria, lista, pesquisa, edita, encerra, reativa e arquiva turmas e vê as disciplinas de cada uma.

**Independent Test**: com uma conta de gestor, criar, pesquisar, editar, inativar, reativar e arquivar uma turma, sem
nenhum professor envolvido; abrir uma turma com duas disciplinas.

### Tests for User Story 1

- [ ] T019 [P] [US1] `apps/api/test/integration/027-us1-cohorts.spec.ts`: `027/US1-1`…`027/US1-6` (um `it` cada;
      US1-2 com o mesmo código no mesmo ano → `409 COHORT_CODE_TAKEN` e em outro ano → `201`, `027/FR-002`; US1-5 com
      os convites cancelados `CLASS_ARCHIVED` e a edição recusada `409 COHORT_ARCHIVED`; US1-6 sem nenhum campo
      pedagógico no `CohortDetail`); auditoria `cohort.created/updated/status_changed`; `027/FR-008` (nenhuma rota
      `DELETE` de turma no catálogo → `404`/`405`; `DELETE FROM cohorts` de uma turma com disciplina da turma ou
      matrícula falha pela FK `RESTRICT`).
- [ ] T020 [P] [US1] Reescrever `apps/api/test/integration/003-us1-classes.spec.ts` com o gestor como ator nas rotas
      `/cohorts`, mantendo os títulos `003/US1-*`; `003-list-performance.spec.ts` e `003-concurrency.spec.ts` (parte de
      turma) idem; `027/SC-006`: 20 `POST /cohorts` simultâneos com o mesmo código e ano → 1 turma.
- [ ] T021 [P] [US1] Web `apps/web/features/cohorts/components/cohort-list.test.tsx`, `cohort-form.test.tsx`,
      `cohort-page.test.tsx`: lista com filtros, formulário com as mensagens de FR-032, ações de situação com
      AlertDialog no arquivar, aba "Disciplinas" sem dados pedagógicos; `027/FR-033` (nome de turma, disciplina e
      professor com `<b>x</b>` aparece como texto literal, sem elemento `b`); axe.

### Implementation for User Story 1

- [ ] T022 [US1] Módulo `apps/api/src/modules/cohorts/`: `cohorts.module.ts`, `cohorts.controller.ts` (rotas de
      contracts/http-api.md "MANAGER — turma", sem convites/matrículas), `cohorts.service.ts` (criar com `search_key`;
      `409 COHORT_CODE_TAKEN` pelo UNIQUE; editar; mudar situação com a máquina de `classes/class.state-machine.ts` e,
      ao arquivar, `SELECT … FOR UPDATE` da turma e cancelamento dos PENDING `CLASS_ARCHIVED` na mesma transação;
      listar com keyset `(academic_year desc, created_at desc, id desc)`; detalhe com contagem e disciplinas pela
      situação efetiva), `cohort.view.ts` (allowlist). Registrar em `app.module.ts` e no `MATRIX` de
      `authorization-matrix.ts`; retirar as rotas de turma da 003 de `classes.controller.ts`.
- [ ] T023 [US1] Web: `apps/web/features/cohorts/{api,hooks,schemas,components}` e as páginas
      `apps/web/app/(app)/gestao/turmas/page.tsx` e `apps/web/app/(app)/gestao/turmas/[id]/page.tsx` (contracts/ui.md);
      item de menu "Turmas" (→ `/gestao/turmas`) para `turmas.visualizar` no layout `(app)`; textos de FR-032.
- [ ] T024 [US1] Retirar US1 de `pending` em `traceability.spec.ts`; `SC-006` também.

**Checkpoint**: o gestor administra turmas de ponta a ponta.

---

## Phase 4: User Story 2 — Gestor põe os alunos na turma (Priority: P1) 🎯 MVP

**Goal**: convite por e-mail (como a 003, agora do gestor) e inclusão direta de quem já tem conta.

**Independent Test**: convidar um e-mail novo e aceitar; incluir direto o e-mail de um aluno com conta; ver os dois na
turma; o aluno vê no card as disciplinas da turma sem convite por matéria.

### Tests for User Story 2

- [ ] T025 [P] [US2] `apps/api/test/integration/027-us2-invitations.spec.ts`: `027/US2-1`…`027/US2-6` (e-mail sem
      professor nem disciplina, FR-010; convite duplicado; reenvio/cancelamento com motivo `MANAGER`; aceite por pessoa
      nova; o card oferece as duas disciplinas — `GET /me/classes` e `GET /me/activities?classId` de cada uma; turma
      inativa/arquivada → `409 COHORT_NOT_ACTIVE`); `027/SC-001` (um convite, N disciplinas).
- [ ] T026 [P] [US2] `apps/api/test/integration/027-us2-direct-enrollment.spec.ts`: `027/US2-7`…`027/US2-9` e
      `027/FR-034`: lookup encontrado (só `studentUserId`, `name` e `alreadyEnrolled`; aluno já matriculado →
      `found: true, alreadyEnrolled: true`), não encontrado igual para sem conta, conta sem
      STUDENT, e-mail não verificado e conta desativada; inclusão cria matrícula `DIRECT` com `enrolled_by_id`, cancela
      o convite PENDING do mesmo e-mail (`ENROLLED_DIRECTLY`), agenda `CLASS_ENROLLMENT_NOTICE` (Mailpit: assunto e
      corpo sem token, professor ou disciplina); `409 ALREADY_ENROLLED`; `422 STUDENT_NOT_ELIGIBLE`; 2 inclusões
      simultâneas → 1 matrícula; auditoria sem e-mail nem nome.
- [ ] T027 [P] [US2] `apps/api/test/security/027-student-lookup.spec.ts`: 31º lookup do mesmo gestor em 1 min → `429`
      com `Retry-After` e `cohort.student_lookup_rate_limited`; o e-mail nunca aparece em URL, log ou auditoria
      (`log-scan` como em 020).
- [ ] T028 [P] [US2] Reescrever `003-us2-class-invitations.spec.ts`, `003-us5-manage-invitations.spec.ts`,
      `003-class-invitation-delivery.spec.ts` e a parte de convites de `003-concurrency.spec.ts` com o gestor e as
      rotas `/cohorts/:id/invitations`, mantendo os ids `003/…`; `003-us3`/`003-us4`/`003-public-invitation` (aceite)
      só trocam a criação da turma (factory) e a expectativa do texto da turma (feito na Phase 2; o reenvio de
      `003-public-invitation` volta à rota do gestor aqui). Também as suítes 017 da T018 (`017-us1-outbox`,
      `017-us2-notices`, `017-us3-templates`, `017-us4-config`, `017-boundaries`, `017-notice-auth`) com o gestor e
      `/cohorts/:id/invitations`, e a jornada (`test/helpers/journey.ts`) volta a convidar pela rota; os tipos
      `class_invitation.*` saem de `NOT_IN_JOURNEY_027`.
- [ ] T029 [P] [US2] Web `apps/web/features/cohorts/components/add-student.test.tsx`: e-mail → lookup → "Incluir na
      turma" / "Enviar convite" / "Esse aluno já está na turma."; resultado anunciado em `role="status"`; teclado; axe;
      `apps/web/features/class-invitations` (lista, reenviar, cancelar) dentro da página da turma do gestor.

### Implementation for User Story 2

- [ ] T030 [US2] `apps/api/src/modules/class-invitations/`: controller em `/cohorts/:id/invitations` com as permissões
      de sempre; o service busca a turma (não a classe), exige ACTIVE (`409 COHORT_NOT_ACTIVE`), grava `cohort_id`,
      cancela com `MANAGER`; `class-invitation-acceptance.service.ts` cria a matrícula na turma (`source INVITATION`);
      `class-invitation.mail-subject.ts` e a página pública com nome, código e período da turma (FR-010).
- [ ] T031 [US2] `apps/api/src/modules/enrollments/direct-enrollment.service.ts` + rotas
      `POST /cohorts/:id/student-lookup` e `POST /cohorts/:id/enrollments` (`turmas.incluir_aluno`): elegibilidade
      (ACTIVE, STUDENT, e-mail verificado), limite 30/min reaproveitando `class-invitations/invitation-rate-limit.ts`,
      inclusão sob `FOR UPDATE` da turma + `ON CONFLICT` da partial UNIQUE, cancelamento do convite pendente, outbox
      `CLASS_ENROLLMENT_NOTICE`; `enrollment-notice.mail-subject.ts` registrado como `MailSubject` (017) com template
      HTML + texto em `apps/api/src/platform/mail/templates/` (padrão dos outros); `GET /cohorts/:id/enrollments` com
      nome, e-mail, situação e `source`.
- [ ] T032 [US2] Web: aba "Alunos" e "Convites" da página da turma do gestor; diálogo "Adicionar aluno"
      (contracts/ui.md); mensagens "Aluno incluído na turma.", "Esse aluno já está na turma.", "Convite enviado.".
- [ ] T033 [US2] Retirar US2 e `SC-001` de `pending`.

**Checkpoint**: alunos entram na turma pelos dois caminhos.

---

## Phase 5: User Story 3 — Professor encontra a turma e acrescenta a sua disciplina (Priority: P1) 🎯 MVP

**Goal**: o professor busca turmas ativas e cria a sua disciplina da turma.

**Independent Test**: com uma turma do gestor, o professor a encontra pela busca, acrescenta "Banco de Dados" e vê a
disciplina da turma entre as suas; o segundo professor acrescenta "Redes" na mesma turma.

### Tests for User Story 3

- [ ] T034 [P] [US3] `apps/api/test/integration/027-us3-add-subject.spec.ts`: `027/US3-1`…`027/US3-6` (busca sem
      acento/maiúsculas só de ativas, só os campos de FR-016; criação com disciplina própria e ativa; duplicada
      `409 CLASS_SUBJECT_DUPLICATE`; mesma disciplina em outra turma → outra disciplina da turma; outro professor na
      mesma turma; busca vazia); disciplina de outro professor → `404`, arquivada → `422 SUBJECT_ARCHIVED`, turma
      inativa → `409 COHORT_NOT_ACTIVE`; corpo com `teacherId` → `400`; auditoria `class.created`; `027/FR-019`
      (`UPDATE classes SET teacher_id|cohort_id|subject_id` direto no banco é recusado pelo trigger
      `classes_identity_immutable`, e `PATCH /classes/:id` com `cohortId`/`subjectId` → `400`).
- [ ] T035 [P] [US3] `apps/api/test/security/027-concurrency.spec.ts`: o mesmo professor acrescenta a mesma disciplina
      2× ao mesmo tempo → 1; gestor arquiva × professor acrescenta, em 100 rodadas: ou o `POST /classes` responde
      `409 COHORT_NOT_ACTIVE`, ou o `created_at` da classe é anterior ao `status_changed_at` do arquivamento e
      `class_effective_status` dela é `ARCHIVED`; o fluxo de busca + criação em uma chamada cada (sem o id SC-004, que é do E2E da T061).
      Reescrever também `004-us1-class-offering.spec.ts` e o teste de criação de `004-cross-links.spec.ts` (T018) sobre
      `POST /classes { cohortId, subjectId }`, mantendo os ids `004/…`; a jornada passa a acrescentar a disciplina pela
      rota (`class.created`/`class.updated` saem de `NOT_IN_JOURNEY_027`).
- [ ] T036 [P] [US3] Web `apps/web/features/classes/components/add-class.test.tsx` (busca, escolha da turma e da
      disciplina, calendário opcional, "Turma não encontrada. Peça ao gestor que a crie.", mensagens) e
      `class-list.test.tsx` ("<disciplina> · <turma>", situação efetiva; resultado da busca com nome `<b>x</b>`
      mostrado como texto); axe.

### Implementation for User Story 3

- [ ] T037 [US3] `apps/api/src/modules/cohorts/cohort-directory.controller.ts` + service (`GET /cohort-directory`,
      `turmas.buscar`, keyset 20 por página, view allowlist).
- [ ] T038 [US3] `apps/api/src/modules/classes/classes.service.ts` e `classes.controller.ts`: `GET /classes` (próprias,
      com a turma e a situação efetiva), `POST /classes` (research Q10: turma `FOR SHARE` e ACTIVE, disciplina própria e
      ativa, UNIQUE → `409`), `GET /classes/:id` com `canChangeStatus`, `PATCH /classes/:id` só datas (regras da 004);
      permissões `disciplinas_turma.*`; `MATRIX` atualizado.
- [ ] T039 [US3] Web: `apps/web/app/(app)/turmas/page.tsx` (lista das disciplinas da turma) e
      `apps/web/app/(app)/turmas/nova/page.tsx` ("Acrescentar disciplina a uma turma"); menu "Turmas" do professor para
      `disciplinas_turma.visualizar`.
- [ ] T040 [US3] Retirar US3 de `pending`.

**Checkpoint**: o professor monta as suas disciplinas nas turmas do gestor.

---

## Phase 6: User Story 4 — Professor trabalha na sua disciplina da turma como hoje (Priority: P1) 🎯 MVP

**Goal**: tudo da 004–025 dentro da disciplina da turma; roster só leitura; encerrar/arquivar só após o calendário.

**Independent Test**: percorrer calendário, plano, uma atividade aplicada, a chamada e o ranking; confirmar a ausência
de convidar/remover/editar turma; encerrar e arquivar só depois do último dia.

### Tests for User Story 4

- [ ] T041 [P] [US4] `apps/api/test/integration/027-us4-class-subject.spec.ts`: `027/US4-1`…`027/US4-5` (roster
      só leitura em `GET /classes/:id/enrollments`; rotas de turma/convite/matrícula → `403` para o professor;
      arquivar após o calendário: sem novas atividades (`409` de hoje) e consulta mantida, a turma e a outra disciplina
      intactas; atividade aplicada segue 012–025; US4-5 com `FixedClock` no último dia → `409 CLASS_CALENDAR_NOT_ENDED`
      e no dia seguinte → `200`, sem calendário → `409`); `027/FR-024`: trabalho e prova de outra disciplina →
      `SUBJECT_MISMATCH`; duas disciplinas do mesmo professor na mesma turma nunca mostram atividades, chamada ou
      ranking uma da outra.
- [ ] T042 [P] [US4] Web `apps/web/features/classes/components/class-page.test.tsx`: título "<disciplina> · <turma>",
      aba "Alunos" sem ações, botões "Encerrar disciplina"/"Arquivar disciplina" só com `canChangeStatus`; axe.

### Implementation for User Story 4

- [ ] T043 [US4] `POST /classes/:id/status` (`disciplinas_turma.alterar_situacao`): `canCloseClass` com o `Clock`,
      máquina da 003 sobre `ownStatus`, turma ARCHIVED → `409 INVALID_STATE_TRANSITION`; `class.status_changed`.
      `GET /classes/:id/enrollments` (`disciplinas_turma.visualizar_alunos`) só leitura, com os campos de
      contracts/http-api.md: nome, RA e situação da matrícula — nunca e-mail, `source` ou convites; se a view do
      professor da 003 (`enrollment.view.ts`) tiver outro campo, o contrato é corrigido antes da implementação.
- [ ] T044 [US4] Web: página da disciplina da turma em `apps/web/app/(app)/turmas/[id]/` sem convidar/remover/editar
      turma, aba "Alunos" só leitura, ações de situação; remover os componentes de convite do professor de
      `features/classes`.
- [ ] T045 [US4] Retirar US4 de `pending`.

---

## Phase 7: User Story 6 — As turmas de hoje continuam funcionando (Priority: P1) 🎯 MVP

**Goal**: a transição da T007 não perde, duplica nem troca dono de nada.

**Independent Test**: base pré-027 com turmas de dois professores (uma sem disciplina, uma arquivada, códigos
repetidos no mesmo ano e em anos diferentes, convites pendentes, atividades, entregas, notas, pontos), aplicar a
migration e comparar o que cada um vê.

### Tests for User Story 6

- [ ] T046 [US6] `apps/api/test/integration/027-transition.spec.ts` (research Q9): pela conexão do banco de teste, cria
      um banco temporário com o nome do banco de teste + `_transition_027` (ex.: `devtrack_test_transition_027`, contém
      "test"; `DROP DATABASE IF EXISTS` antes e no `afterAll`); aplica nele, em ordem de nome, o `migration.sql` de cada
      pasta de `apps/api/prisma/migrations` anterior a `20261118115900_027_enum_values` (nunca `prisma migrate reset`);
      semeia o cenário por SQL; aplica as duas migrations da T007 e verifica: `027/US6-1`…`027/US6-4`,
      `027/FR-028` (fusão: dados da mais antiga, situação mais aberta, matrícula duplicada `REMOVED`/`MERGED`, convite
      duplicado `CANCELLED`/`MERGED`, o link mais longo ainda vale), `027/SC-002` (contagens antes = depois por tabela;
      cada atividade/entrega/nota/ponto no mesmo professor e aluno), o evento `cohort_transition.applied` com as
      contagens, o número de eventos `enrollment.removed`/`class_invitation.cancelled` com `reason MERGED` igual a
      `mergedEnrollments`/`mergedInvitations`, e a reexecução impossível (migration aplicada uma vez).

### Implementation for User Story 6

- [ ] T047 [US6] Ajustes no SQL da T007 que o teste revelar; documentar em `docs/deploy/hostinger.md` o passo do
      deploy (backup do banco antes, `migrate deploy`, conferir o evento `cohort_transition.applied`).
- [ ] T048 [US6] Retirar US6 e `SC-002` de `pending`.

---

## Phase 8: User Story 5 — Gestor encerra a matrícula de um aluno (Priority: P2) 🎯 MVP

**Goal**: o gestor encerra a matrícula na turma; vale para todas as disciplinas dela.

**Independent Test**: aluno com uma entrega numa disciplina; encerrar a matrícula; conferir aluno e professor.

### Tests for User Story 5

- [ ] T052 [P] [US5] `apps/api/test/integration/027-us5-remove-enrollment.spec.ts`: `027/US5-1`…`027/US5-3`
      (aluno deixa de ver as duas disciplinas — lista, Painel, card, ranking — e a linha fica `REMOVED` com
      `removal_reason MANAGER`; o professor ainda vê a entrega, a nota e os fatos na revisão; novo convite aceito →
      nova matrícula ACTIVE); reescrever `003-us6-enrollments.spec.ts` com o gestor mantendo os ids.
- [ ] T053 [P] [US5] Web: "Encerrar matrícula" na aba "Alunos" do gestor (AlertDialog), teste em
      `apps/web/features/cohorts/components/cohort-students.test.tsx`.

### Implementation for User Story 5

- [ ] T054 [US5] `POST /cohorts/:id/enrollments/:enrollmentId/remove` em `apps/api/src/modules/enrollments/` (efeitos da
      003 FR-044/FR-047 para todas as disciplinas da turma, `enrollment.removed` com `reason`); web da T053.
- [ ] T055 [US5] Retirar US5 de `pending`.

---

## Phase 9: User Story 7 — Cada um só vê o que é seu (Priority: P1) 🎯 MVP

**Goal**: nenhum acesso novo entre disciplinas da mesma turma, do gestor ao pedagógico, do aluno a outra turma.

**Independent Test**: turma com disciplinas de dois professores; cada papel tenta abrir pelo id o que não é seu.

### Tests for User Story 7

- [ ] T049 [P] [US7] `apps/api/test/security/027-isolation.spec.ts`: `027/US7-1`…`027/US7-4` (professor A nas rotas de
      plano, atividade, chamada, ranking, revisão e provas da disciplina de B → `404` com o mesmo corpo de um id
      inexistente; gestor em atividade, entrega, nota, plano e ementa → `403`; professor em `/cohorts/*` → `403` e no
      roster só o que vê hoje; aluno de "ADS 3NA" em disciplina, atividade e ranking de "ADS 3NB" → `404`);
      `027/SC-003` (100% das tentativas, tabela de rotas × papéis gerada do `MATRIX`).
- [ ] T050 [P] [US7] `apps/api/test/security/027-authorization-matrix.spec.ts` a partir de contracts/permissions.md
      (cada rota nova × ADMIN, MANAGER, TEACHER, STUDENT, anônimo); reescrever `003-class-authorization-matrix.spec.ts`
      para o novo dono mantendo os ids `003/…`.

### Implementation for User Story 7

- [ ] T051 [US7] Corrigir o que T049–T050 revelarem; retirar US7 e `SC-003` de `pending`.

---

## Phase 10: User Story 8 — Aluno vê as suas turmas e matérias (Priority: P3)

**Goal**: "Minhas turmas" por ano letivo, com as encerradas só para leitura; o card só com disciplinas ativas.

**Independent Test**: aluno numa turma com duas disciplinas e numa encerrada de outro ano.

### Tests for User Story 8

- [ ] T056 [P] [US8] `apps/api/test/integration/027-us8-my-cohorts.spec.ts`: `027/US8-1`…`027/US8-4` (`GET /me/classes`
      por ano, turma uma vez com as duas disciplinas e professores; turma sem disciplina; turma de 2026 encerrada em
      2027 aparece no seu ano com a situação, e as rotas do aluno dela respondem leitura mas recusam iniciar, salvar e
      entregar — os códigos de hoje para turma fechada; disciplina arquivada pelo professor listada com a situação
      `ARCHIVED` e `GET /me/activities?classId=<arquivada>` → `200` só leitura); `027/FR-004` (encerrar não mexe na matrícula); reescrever
      `003-us7-my-classes.spec.ts` e `026-us4-my-classes.spec.ts` para o shape novo mantendo os ids.
- [ ] T057 [P] [US8] Web `apps/web/features/my-classes/components/my-classes.test.tsx` (seções por ano, selo
      "Encerrada", "Ainda não há disciplinas nesta turma.", links `?materia=`), `subject-switcher.test.tsx` e
      `use-current-subject` (só disciplinas com situação efetiva ACTIVE; a 026 continua verde); axe.

### Implementation for User Story 8

- [ ] T058 [US8] `apps/api/src/modules/enrollments/my-classes.service.ts` com o shape `MyCohortList`; conferir que as
      rotas de escrita do aluno usam a situação efetiva (T012) e que a 026 (`classId`) aceita a disciplina de turma
      encerrada para leitura.
- [ ] T059 [US8] Web: `apps/web/app/(student)/minhas-turmas/page.tsx` e `features/my-classes`; o card "Matéria"
      (`features/student-activities`) com as opções ativas; página pública do convite com a turma.
- [ ] T060 [US8] Retirar US8 de `pending`.

---

## Phase 11: Polish & Cross-Cutting Concerns

- [ ] T061 [P] E2E `apps/web/e2e/manager-classes.spec.ts` (local): gestor cria turma, convida (Mailpit) e inclui um
      aluno existente; dois professores acrescentam disciplinas; aluno vê as duas no card; professor encerra após o
      calendário (relógio do E2E); um `test` com título `027/SC-004` que mede, do clique em "Turmas" à mensagem
      "Disciplina acrescentada à turma.", ≤ 3 interações e < 60 s, e retira `SC-004` de `pending`. Ajustar `class-teacher.spec.ts`, `class-teacher-setup.spec.ts`,
      `class-new-student.spec.ts`, `class-existing-student.spec.ts`, `class-remove-student.spec.ts`,
      `class-invitation-keyboard.spec.ts` e o `e2e/fixtures` que cria turma pela UI do professor.
- [ ] T062 [P] Documentação: `CLAUDE.md` raiz — "Project state" (027), "Rules that are easy to get wrong" (a turma é
      do gestor; `class_enrollments`; situação efetiva; encerrar/arquivar após o calendário; inclusão direta) e a regra
      da 003 em "One `User` identity…" (convite do gestor); `apps/api/CLAUDE.md` (módulo `cohorts`, factories);
      `apps/web/CLAUDE.md` (`features/cohorts`, `/gestao/turmas`); `docs/` de deploy (T047); a linha
      "Active Technologies" da 027 no `CLAUDE.md` raiz ("two migrations: …"); o sétimo tipo de e-mail
      (`CLASS_ENROLLMENT_NOTICE`) em `docs/deploy/email.md` e no `CLAUDE.md` raiz (017: "the six e-mails" → sete).
- [ ] T063 [P] `specs/027-manager-classes/quickstart.md` conferido de ponta a ponta no ambiente local; corrigir o que
      divergir.
- [ ] T064 Auditoria de segurança do Stop hook (owasp-security-auditor) sobre os arquivos da feature; corrigir achados.
- [ ] T065 `027/SC-005`: suíte completa (`pnpm lint && pnpm check-types && pnpm test`) verde; retirar `SC-005` de
      `pending`; `pending` vazio.
- [ ] T066 Piloto no beta (manual, com o usuário): backup, deploy, conferir o evento da transição, uma turma real com
      duas disciplinas; registrar em `plan.md`.

---

## Dependencies & Execution Order

- Setup (T001–T004) → Foundational (T005–T018) → US1 (T019–T024) → US2 (T025–T033) → US3 (T034–T040) → US4
  (T041–T045) → US5 (T052–T055) → US7 (T049–T051); US6 (T046–T048) pode rodar depois da Foundational, em paralelo
  com US1–US5; US8 (T056–T060) depois de US2; Polish por último.
- Dentro de cada história: testes → API → web → `pending`.
- T007 → T008 → (T009, T010, T011, T012, T013 em paralelo por arquivo) → T014 → T018.

## Parallel Examples

- Phase 1: T002, T003, T004 juntos.
- Phase 2: T005 e T006 juntos; depois de T008, T009/T015/T016/T017 juntos.
- US1: T019, T020, T021 juntos. US2: T025–T029 juntos. US3: T034–T036. US7: T049 e T050. US8: T056 e T057.
- Polish: T061, T062, T063 juntos.

## Implementation Strategy

1. **MVP (deploy possível)**: Setup, Foundational, US1, US2, US3, US4, US5, US6, US7 — a migration troca o dono das
   turmas, então o beta só recebe o deploy com tudo isso verde e a transição verificada.
2. **Incremento**: US8 ("Minhas turmas" por ano).
3. **Fecho**: Polish, auditoria, piloto.
