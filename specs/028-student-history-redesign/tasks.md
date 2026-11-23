---
description: "Task list for 028 — Histórico do aluno redesenhado: cards de totais, abas Todas/Aguardando/Corrigidas com contagem, busca pelo título e filtro de matéria, tudo no servidor (`GET /me/history`), linhas e rodapé da imagem de referência"
---

# Tasks: 028 — Histórico do aluno redesenhado

**Input**: os documentos de design em `/specs/028-student-history-redesign/`.
**Prerequisites**:

- plan.md, spec.md (US1–US4, FR-001–FR-021, SC-001–SC-007), research.md (HI1–HI10) e data-model.md (sem migration);
- contracts/: http-api (`GET /me/history`), ui e audit-events (nenhum evento);
- quickstart.md;
- constituição **v4.1.0** (sem emenda).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-007).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 028 com prefixo (`028/US1-3`, `028/FR-011`,
  `028/SC-002`), um id literal por cenário; onde uma tarefa cita uma faixa (`028/US1-1`…`028/US1-9`), cada cenário
  ganha o seu próprio `it`. Testes da API, do web e do E2E contam.
- **Rota nova**: `GET /me/history` entra no `MATRIX` de `apps/api/test/security/authorization-matrix.ts` com
  `access: "atividades.proprias.visualizar"` (a mesma linha de `/me/activities`); `route-declarations.spec.ts` e
  `test/security/024-mobile-allowlist.spec.ts` (sem `@MobileAccess()` → `403 MOBILE_ROUTE_NOT_ALLOWED`) continuam verdes.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Sem auditoria nova** (contracts/audit-events.md): nenhum tipo novo em `audit-event-types.ts`; o Histórico nunca
  grava `activity_result.viewed`.
- **As outras rotas do aluno não mudam** (SC-005): `GET /me/activities`, `GET /me/dashboard` e `GET /me/classes` e as
  suítes 012, 013, 016, 018, 023 e 026 continuam verdes **sem mudança de asserção** na API.
- **Sem migration, dependência, WebSocket ou job** (data-model.md, IX).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: a rota `GET /me/history` sem filtros (todas as entregas, situação, data de entrega, ordem, cursor,
  contagens) e, no web, o cliente, o hook e os formatos de data, que todas as histórias usam.
- **US1** (P1, cards e lista redesenhada): depende só da Foundational.
- **US2** (P1, abas): acrescenta `tab` na API e as abas no web; depois de US1 (mesma tela).
- **US4** (P1, nada de nota antes da liberação): testes de segurança sobre a rota e a tela; depois de US2 (exercita as
  abas).
- **US3** (P2, busca e matéria): acrescenta `q` e `classId` na API, a redação do `q` no log e a barra no web; depois de
  US2.
- **MVP**: Setup + Foundational + US1 + US4 (os totais e a lista certos, sem vazar nota).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US4).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 028 entra na guarda de rastreabilidade e os contratos existem.

- [X] T001 Incluir a 028 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 027:
      `feature: "028"`, `path: "specs/028-student-history-redesign/spec.md"`, `stories: 4`, `scenarios: 24`
      (9 + 5 + 6 + 4), `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 7)` e
      `pending: { stories: [1, 2, 3, 4], successCriteria: ["SC-001", "SC-002", "SC-003", "SC-004", "SC-005", "SC-006", "SC-007"] }`,
      com o comentário "Joined in the Setup phase (T001); each story leaves `pending` with the task that writes its
      last test, each SC with the test that cites it, so the lists are empty at the end of T032; SC-005 leaves with T008 (T004)". Citar a 028 na
      lista de `SPECS` do `CLAUDE.md` raiz ("…, 026, 027 and 028").
- [X] T002 [P] Contratos (contracts/http-api.md "packages/contracts changes"):
      `packages/contracts/src/activities/enums.ts` — `StudentHistorySituationSchema = z.enum(["AWAITING", "GRADED"])`
      e o tipo; `packages/contracts/src/activities/student.ts` — `STUDENT_HISTORY_SEARCH_MAX = 100`,
      `StudentHistoryQuerySchema = z.strictObject({ tab: StudentHistorySituationSchema.optional(), q: z.string().trim()
      .refine((v) => [...v].length <= STUDENT_HISTORY_SEARCH_MAX).refine((v) => !v.includes("\u0000")).optional(), classId: UuidSchema.optional(),
      cursor: z.string().max(200).optional(), pageSize: <o mesmo de StudentActivityListQuerySchema>.optional() })`
      (contado em code points, como a 020; nunca `.max`, que conta unidades UTF-16),
      `StudentHistoryItemSchema = StudentActivitySummarySchema.extend({ deliveredAt: IsoDateTimeSchema, situation:
      StudentHistorySituationSchema })`, `StudentHistoryPageSchema = z.strictObject({ items, nextCursor:
      z.string().nullable(), total: z.int().min(0), tabCounts: z.strictObject({ all, awaiting, graded }), totals:
      z.strictObject({ delivered, awaiting, graded }) })` (contagens `z.int().min(0)`) e os tipos;
      `packages/contracts/src/endpoints.ts` — `"myActivities.history"` (GET `/me/history`, query, response, 200),
      ao lado de `myActivities.list`. `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: a API responde o histórico inteiro do aluno (sem aba, busca nem turma) com a situação e a data de cada
entrega, na ordem nova, paginado e com as contagens; o web sabe pedi-lo.

### Tests for Foundational ⚠️

- [X] T003 [P] Teste unitário `apps/api/test/unit/028-history.spec.ts` das funções puras de
      `apps/api/src/modules/student-activities/history.ts` (research HI3–HI6): `028/FR-002` `historySituation` —
      trabalho/prova com `result` → `GRADED`, sem `result` (não liberado, liberado com correção incompleta ou sem a
      permissão de notas) → `AWAITING`, exercício com `points.awaitingCorrection` → `AWAITING`, sem → `GRADED`;
      `028/FR-008` `byDelivery` ordena por `deliveredAt` desc e desempata por `id` asc; o cursor
      (`encodeNameCursor`/`decodeNameCursor` de `platform/database/keyset.ts` sobre `{ name: deliveredAt, id }`)
      retoma depois do último item mesmo com dois `deliveredAt` iguais; `normalizeSearch` — "Prova", "PROVA" e
      "próva" casam com "prova de teste"; espaços nas pontas ignorados; um texto com `.*(` não é tratado como padrão.
- [X] T004 [P] Teste de integração `apps/api/test/integration/028-history-route.spec.ts` (`resetDb`, `createTestApp`,
      factories da 027: uma turma com uma disciplina, um aluno matriculado; um trabalho entregue sem liberação, um
      trabalho liberado com correção completa, uma prova entregue e um exercício concluído, mais uma atividade
      pendente): `028/FR-016` `GET /me/history` → `200` com os quatro entregues e sem a pendente; cada item com
      `deliveredAt` (o do exercício = `completedAt` da tentativa 1) e `situation`; `028/FR-003` `totals` =
      `{ delivered: 4, awaiting: 3, graded: 1 }` e `tabCounts.all = total = 4`; com `pageSize=1` e `cursor`, as quatro
      páginas trazem os quatro ids uma vez cada e as contagens são as mesmas em todas; `028/SC-005` a resposta de
      `GET /me/activities?status=COMPLETED` no mesmo estado é a mesma de antes desta feature (os mesmos ids na ordem
      por prazo, sem `deliveredAt`/`situation`); sem sessão → `401`, sem `atividades.proprias.visualizar` → `403`.
- [X] T005 [P] Teste do web `apps/web/lib/messages/dates.test.ts` (acrescentar): `formatDayMonth` dá "13 de novembro"
      e `formatWeekdayTime` dá "Sexta-feira, 16:47" (dia da semana com inicial maiúscula), no fuso do navegador como
      `formatLongDateTime`.

### Implementation for Foundational

- [X] T006 Data de conclusão do exercício (research HI4): `StudentActivityInput` em
      `apps/api/src/modules/activities/views/student-view.ts` ganha `firstCompletedAt: Date | null`, preenchido em
      `toInput` (`apps/api/src/modules/student-activities/student-activity-loader.ts`) com o `completedAt` da tentativa
      de número 1 das linhas de tentativa que o loader já seleciona (null fora de EXERCISE); `toStudentSummary` não o
      expõe. Ajustar os fixtures de `apps/api/src/modules/activities/views/views.spec.ts` que montam um input.
- [X] T007 Funções puras em `apps/api/src/modules/student-activities/history.ts`: `historySituation(summary)`,
      `deliveredAt(input, summary)` (submissão ou `firstCompletedAt`), `byDelivery`, `historyCursor`/`afterCursor`
      (sobre o keyset de `platform/database/keyset.ts`), `normalizeSearch(text)` (`NFD`, sem `\p{M}`,
      `toLocaleLowerCase("pt-BR")`) e `matchesSearch(title, q)`. T003 verde.
- [X] T008 Rota e serviço: em `apps/api/src/modules/student-activities/my-activities.service.ts`,
      `history(userId, query: StudentHistoryQuery): Promise<StudentHistoryPage>` — reusa `summaries(userId, now)` mas
      precisa do input (para `deliveredAt`): extrair de `summaries` um `inputs(userId, now, classId?)` que devolve os
      `StudentActivityInput` (o `list` e o `dashboard` continuam mapeando com `toStudentSummary`, sem mudar a
      saída); mantém os de status `SUBMITTED`/`GRADED`/`COMPLETED`; monta os itens (`toStudentSummary` +
      `deliveredAt` + `situation`); calcula `totals`, `tabCounts`, `total`; ordena com `byDelivery` e pagina com o
      cursor (`pageSize` padrão `STUDENT_ACTIVITIES_PAGE_SIZE`). Ainda sem `tab`, `q` e `classId` (US2/US3).
      Em `my-activities.controller.ts`, `@Get("history")` com `@RequirePermissions("atividades.proprias.visualizar")`
      e `ZodValidationPipe(StudentHistoryQuerySchema)`. Acrescentar a linha `{ method: "GET", path: "/me/history",
      access: "atividades.proprias.visualizar" }` ao `MATRIX` de `apps/api/test/security/authorization-matrix.ts`.
      `apps/api/test/contracts/endpoint-catalog.spec.ts` não muda: `myActivities.history` entra na contagem da 012
      (`/^(activities|myActivities)\./`); a guarda só falhava (desde o T002) pela rota ainda não registrada.
      T004 verde; tirar `SC-005` de `pending` da 028 (citado no T004).
- [X] T009 [P] Web: `apps/web/lib/messages/dates.ts` — `formatDayMonth(iso)` e `formatWeekdayTime(iso)` (T005 verde);
      `apps/web/features/student-activities/api/student-activities.ts` — `history({ tab, q, classId }, cursor)` em
      `GET /api/me/history`, validado com `StudentHistoryPageSchema`; `hooks/use-student-activities.ts` —
      `studentActivitiesKeys.history(filters)` e `useStudentHistory(filters)` (`useInfiniteQuery`, as páginas
      seguintes pelo `nextCursor`, `POLL_WHILE_VISIBLE` como `useStudentActivities`).

**Checkpoint**: `GET /me/history` devolve o histórico certo, na ordem nova, com as contagens; o web tem o hook.

---

## Phase 3: User Story 1 - Aluno vê os totais e a lista redesenhada (Priority: P1) 🎯 MVP

**Goal**: o Histórico mostra os três cards, a lista mais recente primeiro com a linha completa, o rodapé e a nota
final.

**Independent Test**: com um trabalho entregue sem resultado, uma prova com resultado liberado e um exercício
concluído, abrir `/historico` e conferir os três totais, a ordem pela data da entrega e o conteúdo de cada linha.

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] Integração `apps/api/test/integration/028-us1-history.spec.ts`: `028/US1-1` os `totals` contam
      todas as entregas mesmo com `pageSize=1`; `028/US1-2` e `028/SC-001` a ordem é por `deliveredAt` desc e `total`
      bate com a soma das páginas; `028/US1-3` entrega não liberada: `situation: "AWAITING"`, `result: null`;
      `028/US1-4` liberada com correção completa: `situation: "GRADED"`, `result.grade`, `totalGrade` e
      `result.hasFeedback` com feedback do professor; `028/US1-5` exercício: `status: "COMPLETED"`, `points` e
      `result: null`; `028/US1-8` aluno sem entregas → `items: []`, todos os totais 0; `028/US1-9` 25 entregas com
      `pageSize` padrão: duas páginas, sem repetir nem pular; trabalho em grupo (023) aparece para cada membro com a
      entrega do grupo (edge case); prova (018) encerrada por tempo conta como entrega; uma prova retida
      (`exam_attempt_holds` aberta, sem entrega) não aparece, e depois de "Cancelar" pelo professor aparece como
      `AWAITING` até a liberação.
- [X] T011 [P] [US1] Web `apps/web/features/student-activities/components/student-history.test.tsx` (reescrever os
      testes da lista de hoje; manter os de `ScreenExitRecords`, `OwnRoomExits` e `OwnExamOccurrences`; montar
      `GET /api/me/history` com `routedFetch`): `028/US1-1` os cards "Atividades entregues", "Aguardando correção" e
      "Atividades corrigidas" com os números de `totals` ("04"), as legendas e o nome acessível com o número inteiro;
      `028/US1-2` o rodapé "Exibindo 4 de 4 atividades" e "Mais recentes primeiro"; `028/US1-3` linha aguardando:
      pílula "Entregue" (ou "Entregue com atraso") e "Aguardando correção", sem número; `028/US1-4` linha corrigida:
      pílula "Corrigida", "1,80" e "de 3,00", `Progress` com `aria-label` "Nota 1,80 de 3,00" e valor 60, e
      "Com feedback"; nota acima da total fica com a barra cheia (edge case); `028/US1-5` exercício: pílula
      "Concluída" e "45 de 60 pontos" (ou "Pontos aguardando correção"), sem `Progress`; `028/US1-6` o título, "Ver
      atividade" e a seta ("Abrir <título>") apontam para `/minhas-atividades/<id>`; tipo em selo, turma e disciplina
      em duas linhas (só a turma sem disciplina), data "13 de novembro" e "Sexta-feira, 16:47"; `028/US1-7` a nota
      "As notas aparecem aqui assim que a correção for concluída."; `028/US1-8` sem entregas: "Você ainda não entregou
      nenhuma atividade." sem a barra de ferramentas; `028/US1-9` "Carregar mais" pede `cursor=` e o "N" do rodapé
      cresce; `028/FR-019` um título com `<b>` aparece como texto.

### Implementation for User Story 1

- [X] T012 [US1] Web `apps/web/features/student-activities/schemas/student-history.ts`: os textos de
      contracts/ui.md (cards, legendas, rodapé, nota final, estados), `gradePercent(grade, total)` (limitado 0–100,
      total 0 → 0), `twoDigits(n)`, o rótulo da turma (`item.class.name` + `item.subjectName`) e
      `historyStatusLabel(item)` (a pílula a partir de `situation`, `type` e `late`: GRADED → "Corrigida", AWAITING →
      "Entregue", EXERCISE → "Concluída", "… com atraso" quando `late`).
- [X] T013 [US1] Web `apps/web/features/student-activities/components/student-history.tsx`: reescrever
      `StudentHistory` com `useStudentHistory` — os três cards (o padrão `Card` de `GradeSummaryCards` em
      `my-activities.tsx`, ícones `FileText`, `Clock`, `Check` decorativos, tom de sucesso na legenda das corrigidas),
      o painel com a `Table` (≥ `md`) e a lista de cartões (< `md`, o cartão inteiro um link), as colunas de
      contracts/ui.md (`Badge` do tipo, `Status` com `historyStatusLabel`, a nota com `Progress` ou
      `pointsSummary`, o `ChevronRight`), o rodapé, "Carregar mais", a nota final com o ícone `Info` e os estados de
      carregamento, erro e vazio. `ScreenExitRecords`, `OwnRoomExits` e `OwnExamOccurrences` ficam como estão.
      `apps/web/app/(student)/historico/page.tsx`: a descrição "Acompanhe suas entregas, correções e resultados." no
      `PageHeader`. T010 e T011 verdes; tirar `1` de `pending.stories` da 028 e `SC-001` (citado em T010).

**Checkpoint**: o Histórico tem os totais e a lista da imagem.

---

## Phase 4: User Story 2 - Abas "Todas", "Aguardando" e "Corrigidas" (Priority: P1)

**Goal**: as abas separam a lista no servidor, cada uma com a contagem, e ficam no endereço.

**Independent Test**: com entregas nas duas situações e mais de uma página, escolher cada aba e conferir lista e
contagem em todas as páginas.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Integração `apps/api/test/integration/028-us2-tabs.spec.ts`: `028/US2-1` sem `tab`, `tabCounts`
      com as três contagens e `total = tabCounts.all`; `028/US2-2` `tab=AWAITING` só itens `AWAITING` (trabalho e prova
      sem resultado, exercício com pontos aguardando), em todas as páginas com `pageSize=1`, `total =
      tabCounts.awaiting`, e os `totals` iguais aos de sem `tab` (`028/FR-007`); `028/US2-3` `tab=GRADED` só `GRADED`;
      `028/US2-4` aba vazia → `items: []`, `total: 0`, contagens das outras intactas; `tab=OUTRA` → `400`.
- [X] T015 [P] [US2] Web `student-history.test.tsx` (acrescentar): `028/US2-1` as abas "Todas", "Aguardando" e
      "Corrigidas" com as contagens, "Todas" escolhida, o nome acessível "Aguardando, 3"; `028/US2-2` e `028/SC-003`
      um clique em "Corrigidas" faz `router.replace` com `aba=corrigidas` e a lista pedida passa a ter `tab=GRADED`;
      `028/US2-4` aba vazia: "Nenhuma entrega aguardando correção." / "Nenhuma entrega corrigida ainda.", com os cards
      e as abas; `028/US2-5` a página aberta com `?aba=corrigidas` já pede `tab=GRADED`; `?aba=xyz` vale "Todas";
      as setas do teclado trocam de aba (Radix).

### Implementation for User Story 2

- [X] T016 [US2] API: `history` aplica `query.tab` à lista e ao `total` (não aos `totals` nem aos `tabCounts`).
      T014 verde.
- [X] T017 [US2] Web: `schemas/student-history.ts` — `historyFromSearch({ aba, busca, materia })` e
      `historyHref(filters)` (slugs `aguardando`/`corrigidas`, ordem `aba`, `busca`, `materia`); `student-history.tsx`
      monta os `Tabs` do Design System com as contagens e troca com `router.replace`; a página
      `app/(student)/historico/page.tsx` lê `aba` de `searchParams` e o repassa. T015 verde; tirar `2` de
      `pending.stories` e `SC-003`.

**Checkpoint**: as abas valem em todas as páginas.

---

## Phase 5: User Story 4 - Nada de nota antes da liberação (Priority: P1)

**Goal**: os totais, as abas e a lista nunca revelam nota, feedback ou correção não liberada.

**Independent Test**: com uma entrega corrigida mas não liberada e outra liberada com correção incompleta, conferir
que ambas são "Aguardando", sem nota em nenhuma resposta nem na tela.

### Tests for User Story 4 ⚠️

- [X] T018 [P] [US4] Segurança `apps/api/test/security/028-history-isolation.spec.ts` (parte 1): `028/US4-1` entrega
      com todas as notas lançadas e `resultReleasedAt` nulo → `AWAITING`, `result: null`, e nenhum valor de nota nem
      texto de feedback em lugar algum do corpo (varrer o JSON pelos valores semeados), em `tab` ausente,
      `AWAITING` e `GRADED`; `028/US4-2` liberada com correção incompleta (`gradePartial`) → `AWAITING`, sem nota;
      `028/US4-3` aluno sem `notas.proprias.visualizar` (tirar a permissão do papel no teste) → `totals.graded = 0`,
      nada em `tab=GRADED` e nenhum `result`; `028/US4-4` e `028/SC-002` cada item tem exatamente as chaves de
      `StudentHistoryItemSchema` (lista permitida), para toda combinação de `tab`; um aluno não vê a entrega de outro
      aluno da mesma turma; um aluno não marcado presente (016) não tem o trabalho no histórico; o Histórico não grava
      `activity_result.viewed` (contracts/audit-events.md).
- [X] T019 [P] [US4] Web `student-history.test.tsx` (acrescentar): `028/FR-018` um item `AWAITING` nunca mostra
      número de nota nem "Com feedback"; um exercício nunca mostra `Progress` nem a palavra "Nota"; `028/US4-3` um item
      `status: "GRADED"` com `situation: "AWAITING"` mostra a pílula "Entregue", nunca "Corrigida".

### Implementation for User Story 4

- [X] T020 [US4] Sem código novo esperado (a regra é a de `toStudentSummary` + `historySituation`): rodar T018–T019;
      se algo vazar, corrigir em `history.ts`/`my-activities.service.ts` sem afrouxar o teste. Tirar `4` de
      `pending.stories` e `SC-002`.

**Checkpoint**: nenhum caminho novo revela nota antes da liberação.

---

## Phase 6: User Story 3 - Buscar e filtrar por matéria (Priority: P2)

**Goal**: a busca pelo título e o filtro de matéria valem no servidor, combinados com a aba, e ficam no endereço; a
busca nunca vai para os logs.

**Independent Test**: com entregas em duas disciplinas e nomes diferentes, buscar parte de um nome e escolher uma
matéria, conferindo lista, contagens das abas e cards.

### Tests for User Story 3 ⚠️

- [X] T021 [P] [US3] Integração `apps/api/test/integration/028-us3-search-class.spec.ts` (a turma da 027 com duas
      disciplinas de professores diferentes, entregas nas duas): `028/US3-1` `q=prova` casa "Prova de teste" e
      "PROVA final" e "Próva", não "Trabalho"; `tabCounts` e `total` seguem a busca, `totals` não; `q` com espaços nas
      pontas = sem eles; `q` só de espaços = sem busca; `028/US3-2` busca sem resultado → `items: []`, `total: 0`;
      `028/US3-4` `classId=<disciplina A>` estreita `totals`, `tabCounts`, `items` e `total` só à A; `028/US3-5` aba +
      busca + matéria combinadas, em todas as páginas; matéria de uma turma encerrada (027, INACTIVE com matrícula ativa)
      continua aceita (edge case).
- [X] T022 [P] [US3] Segurança `apps/api/test/security/028-history-isolation.spec.ts` (parte 2): `028/FR-017` e
      `028/SC-006` `classId` de uma matéria de outro aluno, de uma matrícula encerrada e inexistente → `404` com corpos
      idênticos e nenhum item ou contagem; `classId=abc`, `q` com 101 caracteres, `q` com `\u0000`, `tab=X`,
      `pageSize=0`, parâmetro desconhecido → `400 VALIDATION_ERROR` sem `500`; `028/US3-6` nenhum evento de auditoria
      para esses pedidos; redação do log (research HI6): com o `destination` capturável de `LoggingModule.forRoot`
      (como `secret-leak-scan.spec.ts`), `GET /me/history?q=segredo-de-busca` não deixa "segredo-de-busca" em nenhuma
      linha de log e deixa `q=[REDACTED]` (ou o valor codificado) em `req.url`.
- [X] T023 [P] [US3] Web `student-history.test.tsx` (acrescentar; montar também `GET /api/me/classes`): `028/US3-1`
      digitar na busca ("Buscar atividade") pede `q=` só depois de 300 ms (timers falsos) ou no Enter, e escreve
      `busca=` no endereço; `028/US3-2` "Nenhuma atividade encontrada." e "Limpar busca e filtro" limpa `busca` e
      `materia` mantendo `aba`; `028/US3-3` o filtro "Matéria" oferece "Todas as matérias" e as turmas de "Minhas
      turmas" com o rótulo `subjectLabel` da 026; `028/US3-4` escolher uma matéria faz `router.replace` com `materia=` e
      pede `classId=`; `028/US3-5` abrir com `?aba=corrigidas&busca=prova&materia=<A>` pede as três; `028/US3-6`
      `materia` fora da lista ou um `404` da rota: o aviso "Essa matéria não está mais disponível para você." e o pedido
      sem `classId`; `028/FR-020` axe nos temas escuro e claro e a ordem de Tab (abas → busca → matéria → linhas →
      "Carregar mais").

### Implementation for User Story 3

- [X] T024 [US3] API: `history` aplica `query.q` (`matchesSearch`) à lista, ao `total` e aos `tabCounts`, e
      `query.classId` (o `assertActiveEnrollment` da 026 antes de qualquer leitura, depois `inputs(userId, now,
      classId)`) a tudo, inclusive `totals`. T021 verde.
- [X] T025 [US3] Log: em `apps/api/src/platform/logging/logging.module.ts`, `serializers.req` que chama o serializador
      padrão do pino-http e troca o valor do parâmetro `q` de `req.url` por `[REDACTED]`; comentar a razão (028
      research HI6). T022 verde (com T024).
- [X] T026 [US3] Web: `historyFromSearch`/`historyHref` com `busca` e `materia`; `student-history.tsx` ganha a busca
      (`Input type="search"`, rótulo "Buscar atividade" visualmente oculto, `maxLength` 100, espera de 300 ms) e o
      `NativeSelect` "Matéria" ("Todas as matérias" primeiro) com as opções de `useMyClasses()` e o rótulo
      `subjectLabel` de `schemas/student-activity.ts`; o aviso de matéria indisponível (`SUBJECT_UNAVAILABLE` da 026,
      reaproveitado; o padrão `useCurrentSubject`/D6: matéria fora da lista ou `404` → invalidar "Minhas turmas",
      `Alert` info, pedir sem `classId`); o estado "Nenhuma atividade encontrada." com "Limpar busca e filtro". A
      página lê `busca` e `materia`. T023 verde; tirar `3` de `pending.stories` e `SC-006`.

**Checkpoint**: busca e matéria valem no servidor e a busca não aparece nos logs.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T027 [P] Desempenho `apps/api/test/integration/028-sc004-performance.spec.ts`: `028/SC-004` um aluno com 500
      entregas (inserções em lote, como as suítes de desempenho da 025): `GET /me/history` com aba, busca e matéria
      responde em menos de 2 s cada, medido no teste. Tirar `SC-004` de `pending`.
- [ ] T028 [P] Contraste e visual: `apps/web/test/contrast.test.ts` cobre os tons novos (legenda de sucesso do card,
      "Aguardando correção" em aviso, a barra de nota) nos dois temas; axe nos dois temas no `student-history.test.tsx`
      (`028/FR-020`); checar os scans do Design System (`ds-exception` não deve ser preciso). A largura de 360 px fica
      no E2E (T029): o jsdom não calcula layout.
- [ ] T029 E2E `apps/web/e2e/student-history.spec.ts` (o seed de `e2e/support/student-portal-seed.ts`): `028/US1-1`
      um aluno com um trabalho liberado e outro não abre "Histórico": cards 2/1/1, a linha corrigida com a nota e a
      barra; `028/US2-3` "Corrigidas" mostra só a liberada; `028/US3-1` a busca filtra; `028/SC-007` com
      `page.setViewportSize({ width: 360, height: 800 })`, nos temas escuro e claro (o tema da conta, 022),
      `document.documentElement.scrollWidth <= clientWidth` no Histórico com dados e as linhas como cartões
      (`@axe-core/playwright` se já houver no E2E). Tirar `SC-007` de `pending`. Rodar com o consentimento do usuário
      para o reset de `devtrack_e2e` (pedir antes).
- [ ] T030 [P] Documentação: `CLAUDE.md` raiz — a 028 em "Project state" ("Features 001–028"), uma regra curta em
      "Rules that are easy to get wrong" (o histórico é derivado no servidor por `GET /me/history`: `GRADED` só com o
      resultado visível ao aluno, exercício pelos pontos, `q` redigido do log, a rota de `/me/activities` intocada) e
      tirar "(planned)" de "Recent Changes"; `apps/api/CLAUDE.md` e `apps/web/CLAUDE.md` — uma linha cada sobre
      `history.ts`/`GET /me/history` e o novo `StudentHistory`.
- [ ] T031 Rodar `pnpm lint && pnpm check-types && pnpm test` (suíte completa, em segundo plano) — `028/SC-005`: as
      suítes 012, 013, 016, 018, 023 e 026 verdes sem mudança de asserção na API (o `SC-005` já saiu de `pending` no
      T008; aqui é a confirmação na suíte inteira); `028/FR-021` o `student-layout.test.tsx` de hoje continua verde sem
      mudança (menu e barra lateral intactos).
- [ ] T032 Conferir `apps/api/test/traceability.spec.ts`: `pending` da 028 vazio (`stories: []`,
      `successCriteria: []`): conferir que não sobrou id (todos saíram nas tarefas que os testam).
- [ ] T033 Quickstart manual (`quickstart.md`, passos 1–8) no ambiente local, com o usuário; anotar os tempos de
      `028/SC-003` (1 interação até as corrigidas) e `028/SC-004` (≤ 2 s).

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T009)** → **US1 (T010–T013)** → **US2 (T014–T017)** →
  **US4 (T018–T020)** → **US3 (T021–T026)** → **Polish (T027–T033)**.
- Dentro de cada fase: os testes [P] primeiro (devem falhar), depois a implementação na ordem.
- T006 → T007 → T008 (o serviço usa o input com `firstCompletedAt` e as funções puras); T009 é independente da API.
- T012 → T013 (os textos e o percentual antes do componente); T016 independe de T017; T024 → T025 (o teste de log
  precisa da rota com `q`).
- US3 só depois de US2 (a busca combina com a aba); US4 depois de US2 (testa as abas).

## Parallel Example

```text
# Foundational, testes juntos:
T003 apps/api/test/unit/028-history.spec.ts
T004 apps/api/test/integration/028-history-route.spec.ts
T005 apps/web/lib/messages/dates.test.ts

# US3, testes juntos:
T021 apps/api/test/integration/028-us3-search-class.spec.ts
T022 apps/api/test/security/028-history-isolation.spec.ts (parte 2)
T023 apps/web/features/student-activities/components/student-history.test.tsx
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US4 — o aluno vê os totais certos e a lista nova, sem nota antes da
   liberação. Parar e validar (quickstart passos 1–3).
2. **US2**: as abas. Validar o passo 4.
3. **US3**: busca, turma e o log sem a busca. Validar os passos 5–6.
4. **Polish**: desempenho, contraste, E2E, documentação, suíte completa e o quickstart inteiro.
