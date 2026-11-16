---
description: "Task list for 026 — Matéria atual do aluno: card \"Matéria\" no Painel e em \"Minhas atividades\" (uma matéria por vez, `?materia=`), `classId` opcional na lista e no painel do aluno, `subjectName` em \"Minhas turmas\""
---

# Tasks: 026 — Matéria atual do aluno no Painel e em "Minhas atividades"

**Input**: os documentos de design em `/specs/026-student-subject-selector/`.
**Prerequisites**:

- plan.md, spec.md (US1–US4, FR-001–FR-015, SC-001–SC-006), research.md (D1–D9) e data-model.md (sem migration);
- contracts/: http-api, ui e audit-events (nenhum evento);
- quickstart.md;
- constituição **v3.7.0** (sem emenda).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-006).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 026 com prefixo (`026/US1-3`, `026/FR-009`,
  `026/SC-002`), um id literal por cenário; onde uma tarefa cita uma faixa (`026/US1-1`…`026/US1-5`), cada cenário
  ganha o seu próprio `it`. Testes da API e do web contam.
- **Sem rota nova**: as rotas são as de hoje; o `MATRIX` de `apps/api/test/security/authorization-matrix.ts` não muda
  (`/me/dashboard`, `/me/activities`, `/me/classes` já estão lá) e `route-declarations.spec.ts` continua verde.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Sem auditoria nova** (contracts/audit-events.md): nenhum tipo novo em `audit-event-types.ts`.
- **Sem `classId`, nada muda** (SC-005): as suítes 012, 013, 016, 018 e 023 continuam verdes **sem mudança de
  asserção** na API. No web, os testes do Painel e de "Minhas atividades" ganham o card e a matéria nos links e nas
  URLs pedidas; só essas expectativas mudam.
- **Sem migration, dependência, WebSocket ou job** (data-model.md, IX).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: o escopo por turma na API (checagem da matrícula ativa + consulta estreitada) e, no web, a
  resolução da matéria e o `SubjectSwitcher`, que as duas telas usam.
- **US1** (P1, "Minhas atividades") e **US2** (P1, Painel): independentes depois da Foundational.
- **US3** (P1, só as matérias do próprio aluno): depende da Foundational; seus testes exercitam as duas rotas e as duas
  telas, então roda depois de US1 e US2.
- **US4** (P3, "Minhas turmas" com a disciplina): o campo `subjectName` entra no Setup (o card precisa dele); a tela
  "Minhas turmas" é independente.
- **MVP**: Setup + Foundational + US1 + US3 (a lista nunca mistura matérias e nunca vaza turma alheia).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 026 entra na guarda de rastreabilidade e os contratos existem.

- [X] T001 Incluir a 026 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 025:
      `feature: "026"`, `path: "specs/026-student-subject-selector/spec.md"`, `stories: 4`, `scenarios: 20`
      (7 + 5 + 6 + 2), `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 6)` e
      `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", "SC-002", "SC-003", "SC-004", "SC-005", "SC-006"] }`,
      com o comentário "Joined in the Setup phase (T001); each story leaves `pending` with the task that writes its
      last test, each SC with the test that cites it, so the lists are empty at the end of T030". Citar a 026 na
      lista de `SPECS` do `CLAUDE.md` raiz ("…, 024, 025 and 026").
- [X] T002 [P] Contratos (contracts/http-api.md "packages/contracts changes"):
      `packages/contracts/src/activities/student.ts` — `StudentActivityListQuerySchema` += `classId: UuidSchema.optional()`
      e o novo `StudentDashboardQuerySchema = z.strictObject({ classId: UuidSchema.optional() })` com o tipo
      `StudentDashboardQuery`; `packages/contracts/src/classes/my-classes.ts` — `MyClassViewSchema` +=
      `subjectName: z.string().nullable()`; `packages/contracts/src/endpoints.ts` — `myActivities.dashboard` ganha
      `query: StudentDashboardQuerySchema`; exportar em `src/index.ts` se o barril não reexportar o arquivo.
      `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test`.
      **Antecipado na implementação** (decisão de 2026-11-16, para a fase fechar verde): como `subjectName` é
      obrigatório no contrato, o `ContractConformanceInterceptor` derrubaria `GET /me/classes`; por isso o T002 já
      faz a API devolvê-lo (o select de T023 em `my-classes.service.ts`), acrescenta `subjectName: null` à igualdade
      dos dois itens de `003/US7-1` (`apps/api/test/integration/003-us7-my-classes.spec.ts`) e aos fixtures de
      `apps/web/features/my-classes/components/my-classes.test.tsx`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a API sabe estreitar a leitura do aluno a uma turma da sua matrícula ativa (e recusar as outras com
`404`); o web sabe qual matéria mostrar e tem o card.

### Tests for Foundational ⚠️

- [X] T003 [P] Teste de integração `apps/api/test/integration/026-class-scope.spec.ts` (`resetDb`, `createTestApp`,
      um aluno com matrícula ativa em duas turmas de disciplinas diferentes, cada uma com um trabalho publicado):
      `026/FR-008` `GET /me/activities?classId=<A>` devolve só itens com `class.id = A` e `?classId=<B>` só os de B;
      `026/FR-009` `classId` de uma turma sem matrícula do aluno → `404 NOT_FOUND`; `classId=abc` → `400`
      `VALIDATION_ERROR` sem consulta ao banco (sem `500`); `026/SC-005` sem `classId`, o corpo é igual ao de antes
      (comparar com a resposta da mesma chamada sem o parâmetro no mesmo estado: os mesmos ids na mesma ordem).
- [X] T004 [P] Teste do web `apps/web/features/student-activities/hooks/use-current-subject.test.tsx` (com
      `routedFetch` de `GET /api/me/classes`): `026/FR-003` sem `materia` resolve a primeira turma da lista;
      `026/FR-002` as opções são as turmas da lista, na ordem dela, sem "Todas"; `026/FR-011` uma `materia` fora da
      lista resolve a primeira e marca `unavailable: true`; `026/FR-012` sem turmas resolve `null` (sem card);
      enquanto a lista carrega, `isPending` (nenhuma atividade é pedida).
- [X] T005 [P] Teste do web `apps/web/features/student-activities/components/subject-switcher.test.tsx`:
      `026/FR-001` o card mostra "Matéria" e a opção "<disciplina> · <turma>"; `026/US1-6` turma sem disciplina mostra
      só "<turma>"; dois rótulos iguais ganham " · <período> · <professor>" (research D7); uma única matéria mostra
      "Sua única matéria"; `026/FR-014` `expectNoA11yViolations`, o `<label>` "Matéria" ligado ao select e a troca por
      teclado (`userEvent.selectOptions`) chama `onChange` com o id da turma; o aviso
      "Essa matéria não está mais disponível para você." aparece com `unavailable`.

### Implementation for Foundational

- [X] T006 Escopo por turma na API (research D2): em `apps/api/src/modules/student-activities/student-activity-loader.ts`,
      `loadAll(studentUserId, now, canSeeResults, classId?: string)` acrescenta `classId` ao `where` junto do
      `visibleTo(studentUserId, now)` (nada mais muda no escopo); em
      `apps/api/src/modules/student-activities/my-activities.service.ts`, um método privado
      `assertActiveEnrollment(userId, classId)` com `prisma.enrollment.findFirst({ where: { studentUserId: userId,
      classId, status: "ACTIVE" }, select: { id: true } })` que lança `notFound()` sem auditar, e `summaries(userId,
      now, classId?)` repassa o `classId` ao loader depois da checagem. T003 verde nos cenários de escopo.
      **Na implementação**: para o T003 passar, a lista já repassa `query.classId` a `summaries` (a linha do T011), e
      o T003 cita `026/SC-005`, que saiu de `pending` aqui (não no T025).
- [X] T007 [P] Resolução da matéria no web (research D6):
      `apps/web/features/student-activities/hooks/use-current-subject.ts` —
      `useCurrentSubject(materia: string | null)` usa `useMyClasses()` de `features/my-classes/hooks/use-my-classes.ts`
      e devolve `{ isPending, options, current: MyClassView | null, unavailable }`; e em
      `apps/web/features/student-activities/schemas/student-activity.ts` as funções puras `subjectLabel(item, all)`
      (com o desempate do D7), `subjectFromSearch(search: { materia?: string })` e os textos `SUBJECT_LABEL =
      "Matéria"`, `ONLY_SUBJECT = "Sua única matéria"`, `SUBJECT_UNAVAILABLE = "Essa matéria não está mais
      disponível para você."`. T004 verde.
- [X] T008 [P] `apps/web/features/student-activities/components/subject-switcher.tsx` (contracts/ui.md
      "SubjectSwitcher"): um cartão com tokens do Design System (como os cartões do painel), ícone `BookOpen`
      decorativo, `Label` + `NativeSelect` (`id="materia-atual"`), as opções de `subjectLabel`, a legenda
      `ONLY_SUBJECT` com uma opção só e, acima, um `Alert` (info) com `SUBJECT_UNAVAILABLE` quando `unavailable`;
      `onChange(classId)` é da página. T005 verde.

**Checkpoint**: a API filtra por turma com segurança; o card existe e sabe qual matéria mostrar.

---

## Phase 3: User Story 1 - Aluno vê e troca a matéria em "Minhas atividades" (Priority: P1) 🎯 MVP

**Goal**: "Minhas atividades" mostra só a matéria escolhida no card, com filtros, contagem, resumo e "Carregar mais".

**Independent Test**: com um aluno de duas matérias, abrir `/minhas-atividades`, ver só a primeira; trocar no card e
ver só a segunda, com os cartões de resumo recalculados e `materia=` no endereço.

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] Integração `apps/api/test/integration/026-us1-list.spec.ts`: `026/US1-1` e `026/SC-002` com
      `classId` da turma A, nenhum item de B (nem com `status`/`type`), e o inverso; `026/US1-3` os filtros
      `status=PENDING`/`type=ASSIGNMENT` combinados com `classId`; `026/US1-4` turma sem atividades → `items: []`;
      `026/US1-5` `pageSize=1` + `cursor` com o mesmo `classId` percorre só a turma A, sem repetir nem pular.
- [X] T010 [P] [US1] Web `apps/web/features/student-activities/components/my-activities.test.tsx` (acrescentar; os
      testes de hoje passam a montar `GET /api/me/classes` e a esperar `classId=` na URL pedida):
      `026/US1-1` sem `materia`, o card mostra a matrícula mais recente e a lista pedida é
      `/api/me/activities?classId=<A>`; `026/US1-2` e `026/SC-003` escolher outra matéria no card (uma interação
      depois de abrir) chama `router.replace` com `materia=<B>` mantendo `situacao`/`tipo`, e a lista pedida passa a
      ser a de B; `026/US1-3` "Limpar filtros" mantém `materia`; `026/US1-4` matéria vazia mostra "Você ainda não tem
      atividades." com o card; `026/US1-5` "Carregar mais" pede `?classId=<A>&cursor=c1`; `026/FR-015` depois de trocar de matéria, a
      consulta seguinte pede `/api/me/activities?classId=<B>`; `026/US1-7` axe e a ordem
      de Tab (card antes dos filtros); `026/SC-001` o card vem antes dos cartões de resumo no DOM;
      `026/SC-006` `myActivitiesHref({ materia, status })` produz `/minhas-atividades?materia=…&situacao=…`.

### Implementation for User Story 1

- [X] T011 [US1] API: `MyActivitiesService.list` aceita `query.classId` — `assertActiveEnrollment` e
      `summaries(userId, now, query.classId)` (`apps/api/src/modules/student-activities/my-activities.service.ts`); o
      controller já valida o query com `StudentActivityListQuerySchema`. **Já ligado no T006**; aqui só conferir T009
      verde.
- [X] T012 [US1] Web: `apps/web/features/student-activities/api/student-activities.ts` — `list(filters, cursor,
      classId: string | null)` põe `classId` na query; `hooks/use-student-activities.ts` —
      `studentActivitiesKeys.list(filters, classId)` e `useStudentActivities(filters, classId, { enabled })`;
      `schemas/student-activity.ts` — `myActivitiesHref` aceita `materia` (escrito primeiro na query).
- [X] T013 [US1] Web: `apps/web/features/student-activities/components/my-activities.tsx` recebe `materia` e monta
      `SubjectSwitcher` acima dos cartões de resumo (só com `current`); pede a lista só depois de `useCurrentSubject`
      resolver, com o `classId` de `current` (sem turmas: sem `classId`, estado vazio de hoje); a troca e os filtros
      usam `router.replace(myActivitiesHref({ ...filters, materia }))`; "Limpar filtros" mantém `materia`.
      `apps/web/app/(student)/minhas-atividades/page.tsx` lê `materia` de `searchParams` e o repassa. T010 verde;
      tirar `1` de `pending.stories` da 026 em `traceability.spec.ts` e `SC-001`, `SC-002`, `SC-003`, `SC-006` se os
      testes de T009–T010 os citam.

**Checkpoint**: "Minhas atividades" nunca mistura matérias.

---

## Phase 4: User Story 2 - Painel por matéria (Priority: P1)

**Goal**: o Painel mostra só a matéria do card em contadores, próximas, atrasadas e ranking, e leva a matéria nos
links.

**Independent Test**: abrir `/painel` com o aluno de duas matérias, conferir os blocos de uma, trocar e conferir os da
outra; tocar em "Pendentes" e chegar em "Minhas atividades" na mesma matéria.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Integração `apps/api/test/integration/026-us2-dashboard.spec.ts`: `026/US2-1` e `026/US2-2`
      `GET /me/dashboard?classId=<A>` conta e lista só a turma A (`counts`, `next`, `overdueOpen`), e com `<B>` só B;
      `026/US2-3` `rankings` tem só o bloco de A (com `ranking.turma.visualizar`), vazio sem a permissão e vazio para
      uma turma A arquivada ou inativa (research D4); `026/FR-009` `classId` alheio → `404`, malformado → `400`;
      `026/SC-005` sem `classId`, `rankings` tem um bloco por turma ativa, como hoje.
- [X] T015 [P] [US2] Web `apps/web/features/student-activities/components/student-dashboard.test.tsx` (acrescentar; os
      testes de hoje passam a montar `GET /api/me/classes` e a pedir `/api/me/dashboard?classId=<A>`):
      `026/US2-1` o card no topo com a matéria mais recente; `026/US2-2` trocar no card faz `router.replace` para
      `/painel?materia=<B>` e o painel pedido passa a ser o de B; `026/US2-3` só o cartão de ranking da turma
      escolhida e "Seu desempenho" só com o aluno no top 5 dela; `026/US2-4` os contadores e "Ver todas" apontam para
      `/minhas-atividades?materia=<A>[&situacao=…]`; `026/US2-5` o menu continua apontando para
      `/minhas-atividades` sem `materia` (link de `lib/navigation`); `026/FR-015` com timers falsos, depois de trocar
      de matéria a consulta seguinte (5 s, página visível) pede `/api/me/dashboard?classId=<B>` e nunca mais
      `classId=<A>`; axe e a ordem de Tab (card antes dos contadores).

### Implementation for User Story 2

- [X] T016 [US2] API: `MyActivitiesService.dashboard(userId, query)` com `classId` opcional — `assertActiveEnrollment`,
      `summaries(userId, now, classId)` e `ranking.dashboardFor(userId, classId)`; o controller lê
      `@Query(new ZodValidationPipe(StudentDashboardQuerySchema))`
      (`apps/api/src/modules/student-activities/my-activities.controller.ts`); `RankingService.dashboardFor(userId,
      classId?)` acrescenta `id: classId` ao `where` das turmas
      (`apps/api/src/modules/ranking/ranking.service.ts`). T014 verde e a 013 (`013-*`) sem mudança de asserção.
- [X] T017 [US2] Web: `studentActivitiesApi.dashboard(classId)`, `studentActivitiesKeys.dashboard(classId)` e
      `useStudentDashboard(classId, { enabled })`; `apps/web/features/student-activities/components/student-dashboard.tsx`
      recebe `materia`, monta `SubjectSwitcher` abaixo do cabeçalho, pede o painel depois da resolução, e os links dos
      contadores e de "Ver todas" usam `myActivitiesHref({ ..., materia })`; `apps/web/app/(student)/painel/page.tsx`
      lê `materia`. T015 verde; tirar `2` de `pending.stories`.

**Checkpoint**: Painel e "Minhas atividades" nunca misturam matérias.

---

## Phase 5: User Story 3 - Só as matérias do próprio aluno (Priority: P1)

**Goal**: nenhuma turma alheia aparece ou vaza, e a tela se recupera de uma matéria que deixou de ser do aluno.

**Independent Test**: com o aluno A, pedir as duas rotas com a turma de uma matrícula encerrada dele, com uma turma só
do aluno B e com um id inexistente: três `404` iguais; abrir as telas com esses ids na URL e ver o aviso e a primeira
matéria.

### Tests for User Story 3 ⚠️

- [X] T018 [P] [US3] Segurança `apps/api/test/security/026-isolation.spec.ts`: `026/US3-2` e `026/SC-004` para
      `GET /me/activities` e `GET /me/dashboard`, `classId` de (a) turma só do aluno B, (b) matrícula encerrada do
      próprio aluno, (c) UUID inexistente → `404` com corpo idêntico nos três e nenhuma atividade; nenhum evento de
      auditoria novo em `audit_events`; `026/US3-5` com `classId` da turma do aluno, um trabalho `PRESENT_ONLY` em que
      ele não foi marcado presente continua fora da lista e dos contadores (016); `026/FR-010` nenhuma nota antes da
      liberação e nenhum ponto de exercício como nota com `classId` (mesmas asserções da 012/013 para um item da
      turma); `026/US3-6` encerrar a matrícula e repetir o pedido → `404`.
- [X] T019 [P] [US3] Web: em `my-activities.test.tsx` e `student-dashboard.test.tsx`, `026/US3-1` as opções do card são
      só as de `GET /api/me/classes`; `026/US3-3` `materia` fora da lista mostra o aviso
      "Essa matéria não está mais disponível para você." e a primeira matéria, sem pedir a turma da URL;
      `026/US3-4` sem turmas, nenhum card e o estado vazio de hoje; `026/US3-6` a lista (e o painel) respondendo `404`
      para a turma escolhida invalida `["me", "classes"]` e, com a nova lista sem ela, mostra o aviso e a primeira
      matéria.

### Implementation for User Story 3

- [X] T020 [US3] Web: em `use-current-subject.ts`, `unavailable` também quando a turma escolhida sumiu de "Minhas
      turmas"; em `my-activities.tsx` e `student-dashboard.tsx`, um `404` (`ApiError` com `status === 404`) da lista
      ou do painel com `classId` chama `queryClient.invalidateQueries({ queryKey: myClassesKeys.list })` (sem
      reescrever a URL, research D6). T018 e T019 verdes; tirar `3` de `pending.stories` e `SC-004`.

**Checkpoint**: o filtro só estreita o escopo do próprio aluno.

---

## Phase 6: User Story 4 - "Minhas turmas" com a disciplina (Priority: P3)

**Goal**: cada turma de "Minhas turmas" mostra a disciplina.

**Independent Test**: abrir `/minhas-turmas` com o aluno de duas matérias e ver o nome da disciplina em cada turma.

### Tests for User Story 4 ⚠️

- [X] T021 [P] [US4] Integração em `apps/api/test/integration/026-us4-my-classes.spec.ts`: `026/US4-1`
      `GET /me/classes` traz `subjectName` de cada turma, na ordem de hoje; `026/US4-2` turma sem disciplina →
      `subjectName: null`; os testes `003/US7-*` de `003-us7-my-classes.spec.ts` continuam verdes (o campo novo já
      entrou na igualdade no T002). Como o select foi antecipado no T002, estes testes passam ao serem escritos.
- [X] T022 [P] [US4] Web `apps/web/features/my-classes/components/my-classes.test.tsx` (acrescentar): `026/US4-1` cada
      turma mostra "Disciplina: <nome>"; `026/US4-2` sem disciplina, nada a mais; axe.

### Implementation for User Story 4

- [X] T023 [US4] API: `MyClassesService.list` seleciona `subject: { select: { name: true } }` e devolve
      `subjectName: schoolClass.subject?.name ?? null`
      (`apps/api/src/modules/enrollments/my-classes.service.ts`) — **já feito no T002**; aqui só conferir T021 verde.
- [X] T024 [US4] Web: `apps/web/features/my-classes/components/my-classes.tsx` mostra "Disciplina: <nome>" quando há.
      T022 verde; tirar `4` de `pending.stories`.

**Checkpoint**: todas as histórias funcionam de forma independente.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T025 [P] Regressão SC-005: rodar as suítes `012-*`, `013-*`, `016-*`, `018-*`, `023-*`, `activities-boundary`,
      `attendance-boundary` e `exams-boundary` da API e confirmar zero mudança de asserção; citar `026/SC-005` no
      teste de T003 (já escrito) e tirar `SC-005` de `pending.successCriteria`.
- [ ] T026 [P] Guardas do web: `test/student-portal-xss.test.tsx` ganha o nome de disciplina e de turma com HTML no
      card (`026/FR-001` renderizado como texto); `test/design-system/token-usage.test.ts`,
      `identity.test.ts` e `lint-boundaries.test.ts` verdes com os arquivos novos.
- [ ] T027 [P] Documentação: `apps/web/design-system/layouts.md` (o card "Matéria" no Painel e em "Minhas atividades");
      a emenda das duas telas em `specs/012-student-portal/contracts/web-ui.md` (visual de 2026-11-16 e o card da 026,
      nota apontando para a 026); a regra da 026 em "Rules that are easy to get wrong" do `CLAUDE.md` raiz e o resumo
      em "Project state" ("026 matéria atual do aluno…").
- [ ] T028 Rodar `quickstart.md` "Automated" (`pnpm --filter api test -t "026/"`, `pnpm --filter web test -t "026/"`,
      `traceability.spec.ts`) e conferir `pending` vazio na entrada da 026.
- [ ] T029 Rodar `pnpm lint && pnpm check-types && pnpm test` completo (em segundo plano; reiniciar o `postgres-test`
      antes se já houve duas execuções).
- [ ] T030 Roteiro manual do `quickstart.md` (passos 1–7) no ambiente local e registro do resultado no fim do
      `plan.md` ("Pilot"), como na 025, incluindo o tempo medido da troca de matéria no passo 3 (`026/SC-003`, meta
      ≤ 2 s).

---

## Dependencies & Execution Order

- **Setup (T001–T002)**: sem dependências; T002 antes de tudo que usa os contratos.
- **Foundational (T003–T008)**: depende do Setup; bloqueia as histórias.
- **US1 (T009–T013)** e **US2 (T014–T017)**: dependem da Foundational; independentes entre si (arquivos de API
  diferentes, exceto `my-activities.service.ts`: T011 e T016 tocam métodos diferentes, fazer em sequência).
- **US3 (T018–T020)**: depende da Foundational; seus testes do web exercitam as telas de US1 e US2, então depois delas.
- **US4 (T021–T024)**: depende só do Setup (T002).
- **Polish (T025–T030)**: depois das histórias.

## Parallel Opportunities

- T002 em paralelo com T001.
- T003, T004 e T005 (testes da Foundational) em paralelo; T007 e T008 em paralelo depois de T006 começar.
- T009/T010 (US1), T014/T015 (US2), T021/T022 (US4) em paralelo entre si.
- US4 inteira em paralelo com US1/US2.
- T025, T026 e T027 em paralelo.

### Parallel Example: User Story 1

```text
Task: "T009 [US1] Integração 026-us1-list.spec.ts"
Task: "T010 [US1] Web my-activities.test.tsx (026/US1-*)"
```

## Implementation Strategy

### MVP First

1. Setup (T001–T002) e Foundational (T003–T008).
2. US1 (T009–T013): "Minhas atividades" por matéria.
3. US3 (T018–T020) restrita a "Minhas atividades": nenhuma turma alheia.
4. **Parar e validar**: lista sem mistura e sem vazamento.

### Incremental Delivery

1. MVP acima → US2 (Painel) → US3 completa (Painel incluso) → US4 ("Minhas turmas") → Polish.
2. Cada fase termina com lint, tipos e a suíte completa verdes.
