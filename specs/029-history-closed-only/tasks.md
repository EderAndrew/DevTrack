---
description: "Task list for 029 — Histórico só com provas e trabalhos encerrados ou cancelados pelo professor; ativas e exercícios em \"Minhas atividades\""
---

# Tasks: 029 — Histórico só com provas e trabalhos encerrados ou cancelados

**Input**: os documentos de design em `/specs/029-history-closed-only/`.
**Prerequisites**:

- plan.md, spec.md (US1–US3, FR-001–FR-012, SC-001–SC-006), research.md (HC1–HC9) e data-model.md (sem migration);
- contracts/: http-api (`GET /me/history`, `/me/activities`, `/me/dashboard`), ui e audit-events (nenhum evento);
- quickstart.md;
- constituição **v4.1.0** (sem emenda).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-006).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: `describe`/`it` levam o id da spec 029 com prefixo (`029/US2-4`, `029/FR-005`, `029/SC-002`),
  um `it` por cenário. Testes da API, do web e do E2E contam.
- **028 continua em `SPECS`** (research HC8): um teste da 028 cuja expectativa muda mantém o id 028 no título, muda a
  asserção e ganha um comentário `// 029/FR-00N: …`; nenhum id 028 deixa de aparecer num título.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Sem auditoria nova, migration, dependência, rota ou job** (contracts/audit-events.md, data-model.md).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva
  mais de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: os contratos novos, a regra de lugar (HC1) e a data da linha (HC4) puras, o carregador das
  canceladas (HC2) e o construtor da visão cancelada (HC3), e a adaptação das fixtures da 028 (encerrar as atividades).
- **US1** (P1, Histórico só com encerradas): depende só da Foundational.
- **US2** (P1, canceladas): depois de US1 (mesmo `history()` e mesma tela).
- **US3** (P1, "Minhas atividades" e Painel): depois da Foundational; pode correr em paralelo com US1/US2 na API
  (`list`/`dashboard`), mas o `counts.completed` do Painel usa as linhas do Histórico (US1/US2).
- **MVP**: Setup + Foundational + US1 + US3 (nenhuma atividade some das duas telas).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 029 entra na guarda de rastreabilidade e a 028 aponta para ela.

- [X] T001 Incluir a 029 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 028:
      `feature: "029"`, `path: "specs/029-history-closed-only/spec.md"`, `stories: 3`, `scenarios: 18` (6 + 6 + 6),
      `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 6)` e `pending: { stories: [1, 2, 3], successCriteria:
      ["SC-001", "SC-002", "SC-003", "SC-004", "SC-005", "SC-006"] }`, com o comentário de que cada história sai do
      `pending` na tarefa que escreve o seu último teste.
- [X] T002 [P] Em `specs/028-student-history-redesign/spec.md`, logo abaixo do título "#### Emenda 2026-11-23: concluídas
      só no Histórico" e no início da "User Story 5", acrescentar a nota: "> Substituída pela 029 em 2026-11-23
      (`specs/029-history-closed-only/`): o Histórico tem só provas e trabalhos encerrados ou cancelados pelo professor;
      FR-022–FR-025 e US5 passam a valer como 029/FR-001–FR-009." Sem mudar os ids nem os cenários (HC8).

**Checkpoint**: `pnpm --filter api test test/traceability.spec.ts` verde com a 029 toda em `pending`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: contratos, regras puras, carregador e visão que as três histórias usam.

### Tests for Foundational ⚠️

- [X] T003 [P] Em `packages/contracts/test/activities.spec.ts`, testes `029/FR-003` e `029/FR-008`:
      `StudentHistoryQuerySchema` aceita `tab: "CANCELLED"`; `StudentActivityListQuerySchema` aceita de novo
      `status: "COMPLETED"` (trocar a asserção da 028 que esperava a recusa, com o comentário `// 029/FR-008`);
      `StudentHistoryItemSchema` recusa `GRADED` sem `deliveredAt`, `MISSED` com `deliveredAt`, `CANCELLED` com `result`
      ou `points`, e exige `endedAt`; `StudentHistoryPageSchema` exige `tabCounts.cancelled` e `totals.cancelled`.
- [X] T004 [P] Criar `apps/api/test/unit/029-placement.spec.ts` (`029/FR-001`, `029/FR-002`, `029/FR-006`) sobre as
      funções puras de `student-activities/history.ts`: `inHistory`/`inList` para cada tipo × status (ACTIVE, CLOSED,
      CANCELLED) — uma e só uma é verdadeira; `historySituation` de uma linha CLOSED entregue (AWAITING/GRADED pela
      regra da 028), CLOSED com prova retida sem entrega (AWAITING), CLOSED sem entrega (MISSED), CANCELLED com e sem
      entrega (CANCELLED); `endedAt` (`closedAt` para CLOSED, `cancelledAt` para CANCELLED; sem recuo, o CHECK do banco garante a data); a data da linha `deliveredAt ?? endedAt` e a ordem/cursor estáveis com datas iguais. Em
      `apps/api/test/unit/028-history.spec.ts`, trocar os testes de `isMissed`/`missedAt` pela regra nova, mantendo os
      ids 028 nos títulos com `// 029/FR-002`.

### Implementation for Foundational

- [X] T005 Contratos em `packages/contracts/src/activities/enums.ts` e `student.ts` (contracts/http-api.md):
      `StudentHistorySituationSchema` += `"CANCELLED"`; `StudentActivityFilterSchema` += `"COMPLETED"` (comentário da 012
      de volta: SUBMITTED + GRADED + COMPLETED); `StudentHistoryItemSchema`: `missedAt` → `endedAt` (não nulo), refine com
      as invariantes do contrato; `tabCounts`/`totals` += `cancelled`. `pnpm --filter @repo/contracts build`.
- [X] T006 `apps/api/src/modules/activities/views/student-view.ts`: `StudentActivityInput` += `cancelledAt: Date | null`;
      nova `toCancelledSummary(input)` que chama `toStudentSummary` e fixa `result: null`, `points: null`,
      `canAnswer: false`, `urgent: false` e `status` = `SUBMITTED` com entrega, senão `OVERDUE` (HC3), com o comentário
      de por que o `status` não é mostrado. Atualizar o construtor de teste em `views.spec.ts`.
- [X] T007 `apps/api/src/modules/student-activities/student-activity-loader.ts`: selecionar `cancelledAt`; novo
      `loadCancelled(userId, now, classId?)` (HC2) com `status: "CANCELLED"`, `type: { in: ["ASSIGNMENT", "EXAM"] }`,
      `publishAt ≤ now` e `publishAt ≤ cancelledAt` (filtro em memória se o Prisma não comparar colunas), a mesma
      matrícula ACTIVE e a mesma cláusula de liberação 016 de `visibleTo`, o mesmo `select`/`toInput` de `loadAll` e
      sempre `canSeeResults = false`. `visibleTo` NÃO muda.
- [X] T008 `apps/api/src/modules/student-activities/history.ts`: `inHistory`, `inList`, `historySituation` estendida
      (MISSED e CANCELLED, prova retida como AWAITING), `endedAt(input)` e `rowDate`; remover `isMissed`, `missedAt` e
      `MissedInput` (e o campo `inactiveSince` do loader e de `StudentActivityInput`, se mais nada o usar). T004 verde.
- [X] T009 Adaptar as fixtures da 028 à regra nova (HC8): em `apps/api/test/integration/028-history-route.spec.ts`,
      `028-us1-history.spec.ts`, `028-us2-tabs.spec.ts`, `028-us3-search-class.spec.ts`,
      `apps/api/test/security/028-history-isolation.spec.ts` e `028-sc004-performance.spec.ts` (este com as 500
      atividades criadas `status: "CLOSED"`, `closedAt`), encerrar as atividades que devem estar no Histórico e trocar
      os exercícios por trabalhos onde o teste precisa de uma linha; onde a expectativa muda (exercício fora do
      Histórico, ativa fora), mudar a asserção com `// 029/FR-001`. O `028-sc004` também ganha `029/SC-004` no título.

**Checkpoint**: contratos, unit e as suítes 028 compilando; as rotas ainda com a regra antiga até US1/US3.

---

## Phase 3: User Story 1 - O Histórico só com o que o professor encerrou (Priority: P1) 🎯 MVP

**Goal**: `GET /me/history` e a tela com só trabalhos e provas CLOSED (as canceladas vêm na US2).

**Independent Test**: spec US1 — trabalho ativo entregue, trabalho encerrado corrigido, prova encerrada sem entrega,
exercício concluído: só os dois encerrados no Histórico, com cards e abas certos.

### Tests for User Story 1 ⚠️

- [X] T010 [P] [US1] Criar `apps/api/test/integration/029-us1-closed-history.spec.ts` com `029/US1-1`…`029/US1-6`
      (um `it` cada) sobre `/api/me/history`: encerrada entregue em AWAITING/GRADED e nos cards; encerrada sem entrega
      em MISSED com `endedAt` = encerramento, fora dos cards; ativa entregue ou não, ausente de itens e contagens;
      exercício concluído ativo e encerrado, ausente; encerrar uma ativa entregue a move (mesmo `FixedClock`, nova
      leitura); vazio com tudo 0. Também `029/FR-006` (data e ordem `deliveredAt ?? endedAt`) e os casos de borda: prova encerrada
      retida (AWAITING, `deliveredAt` nulo, conta em `totals.awaiting` e `totals.delivered`, `029/FR-004`); prova
      encerrada com a tentativa zerada pela decisão 018 (entrega, nota só após a liberação); trabalho em grupo encerrado
      (uma linha por membro, com a entrega do grupo).
- [X] T011 [P] [US1] Em `apps/web/features/student-activities/components/student-history.test.tsx`, testes `029/US1-2`
      (linha MISSED com "Encerrada em …" e "—"), `029/US1-6` (estado vazio "Nenhuma atividade encerrada ainda.") e
      `029/FR-011`; atualizar os testes 028 que usam `missedAt` ou exercícios (ids 028 mantidos, `// 029/FR-001`).

### Implementation for User Story 1

- [X] T012 [US1] `apps/api/src/modules/student-activities/my-activities.service.ts`: `history()` com as linhas de
      `loadAll` filtradas por `inHistory` (só CLOSED por enquanto), situação e data de T008, `endedAt` no item,
      `tabCounts`/`totals` com `cancelled: 0`. T010 verde.
- [X] T013 [US1] Web: `apps/web/features/student-activities/schemas/student-history.ts` (data da linha a partir de
      `deliveredAt ?? endedAt`, rótulos "Encerrada em"/"Cancelada em", textos vazios novos, descrição do cabeçalho de
      contracts/ui.md) e `components/student-history.tsx`; `app/(student)/historico/page.tsx` com a descrição nova.
      T011 verde. Tirar `029/US1` do `pending` (T001).

**Checkpoint**: US1 testável sozinha; o Histórico já não tem ativas nem exercícios.

---

## Phase 4: User Story 2 - Provas e trabalhos cancelados no Histórico (Priority: P1)

**Goal**: canceladas visíveis só no Histórico, aba "Canceladas", sem resultado nem link.

**Independent Test**: spec US2 — trabalho cancelado entregue com nota liberada e prova cancelada sem entrega.

### Tests for User Story 2 ⚠️

- [X] T014 [P] [US2] Criar `apps/api/test/integration/029-us2-cancelled.spec.ts` com `029/US2-1`…`029/US2-6`: aparece em
      "Todas" e `tab=CANCELLED`; com entrega e resultado liberado antes do cancelamento → `deliveredAt` e `result: null`,
      `points: null`, sem feedback; sem entrega → `endedAt` = `cancelledAt`; cancelada antes da publicação ou nunca
      liberada (PRESENT_ONLY sem presença) → ausente; fora dos cards; uma encerrada depois cancelada passa para
      CANCELLED.
- [X] T015 [P] [US2] Criar `apps/api/test/security/029-cancelled-isolation.spec.ts` (`029/SC-002`, `029/SC-003`,
      `029/US2-4`): a cancelada de outro aluno, de matrícula encerrada e de outra matéria (`classId`) nunca aparece; a
      rota da atividade, a da tentativa e o resultado continuam `404` com `student_access.denied` (`CANCELLED`);
      nenhuma resposta de `/api/me/history` em nenhuma combinação de aba/busca/matéria traz `"grade"`, `generalFeedback`
      ou o marcador de feedback para uma linha CANCELLED (padrão `RESULT` de `026-isolation.spec.ts`).
- [X] T016 [P] [US2] Web, `student-history.test.tsx`: `029/US2-1` (aba "Canceladas, N"), `029/US2-2`/`029/US2-3` (pílula
      "Cancelada", "—", data), `029/US2-4` (sem link, sem "Ver atividade", sem seta, no celular o cartão não é link),
      axe com uma linha cancelada nos dois temas.

### Implementation for User Story 2

- [X] T017 [US2] `my-activities.service.ts`: `history()` junta `loader.loadCancelled` (com o mesmo `classId`, depois do
      `assertActiveEnrollment`) via `toCancelledSummary`, situação CANCELLED, contagens `cancelled`. T014 e T015 verdes.
- [X] T018 [US2] Web: aba "Canceladas" (`?aba=canceladas`), rótulo e variante da pílula, linha sem link em
      `student-history.tsx` e `schemas/student-history.ts`; estado vazio "Nenhuma atividade cancelada.". T016 verde.
      Tirar `029/US2` do `pending`.

**Checkpoint**: Histórico completo pela spec.

---

## Phase 5: User Story 3 - "Minhas atividades" e o Painel com tudo o que está ativo (Priority: P1) 🎯 MVP

**Goal**: a lista e o Painel com exercícios e trabalhos/provas ativos, filtro "Entregues/concluídas" de volta.

**Independent Test**: spec US3 — uma atividade de cada situação; cada uma em exatamente uma tela (`029/SC-001`).

### Tests for User Story 3 ⚠️

- [X] T019 [P] [US3] Criar `apps/api/test/integration/029-us3-list-dashboard.spec.ts` com `029/US3-1`…`029/US3-5` e
      `029/SC-001`: entregue/corrigida ativa na lista e em `status=COMPLETED`; exercício concluído (ativo e encerrado) na
      lista e em `COMPLETED`; ativa que não aceita mais entrega em `OVERDUE`; encerrada/cancelada fora da lista e do
      Painel; Painel `pending/inProgress/overdue` da lista e `completed` = linhas do Histórico com a mesma `classId`;
      a matriz da SC-001 (as 13 situações da spec) com cada id em exatamente uma das duas rotas.
- [X] T020 [P] [US3] Reescrever `apps/api/test/integration/028-us5-concluded.spec.ts` pela regra nova (ids 028 mantidos,
      `// 029/FR-007`/`029/FR-009`), e mover de volta para `/api/me/activities` as expectativas que a emenda da 028
      mandou para `/api/me/history` onde a atividade continua ACTIVE (`029/SC-005`, cada uma com `// 029/FR-007`):
      `012-us6-history`, `012-us2-dashboard`, `013-us2-practice`, `015-us5-history`, `026-us1-list`,
      `027-us8-my-cohorts`, `027-transition` (integration) e `012-student-view`, `013-student-view`,
      `019-private-cases`, `012-performance`, `026-isolation` (security), mais `test/helpers/journey.ts`. Onde a
      atividade é encerrada no teste, a leitura no Histórico continua.
- [X] T021 [P] [US3] Web: `my-activities.test.tsx` (`029/US3-6`: `?situacao=concluidas` escolhe "Entregues/concluídas";
      o filtro existe) e `student-dashboard.test.tsx` (`029/US3-5`: "Concluídas" com `counts.completed` abre
      `/historico?materia=`); atualizar os testes 028 desses arquivos com `// 029/FR-008`/`029/FR-009`.

### Implementation for User Story 3

- [X] T022 [US3] `my-activities.service.ts`: `FILTER_STATUSES.COMPLETED = ["SUBMITTED", "GRADED", "COMPLETED"]`; `list`
      e `dashboard` filtram por `inList` em vez de `isOpen`; `counts.overdue` = todas as atrasadas da lista;
      `counts.completed` = número de linhas do Histórico (CLOSED de `loadAll` + `loadCancelled`) com a mesma `classId`.
      Remover `Classified.delivered/missed` e `isOpen`. T019 e T020 verdes.
- [X] T023 [US3] Web: `apps/web/features/student-activities/schemas/student-activity.ts` com a opção `COMPLETED`
      ("Entregues/concluídas", `?situacao=concluidas`) de volta; `components/student-dashboard.tsx` sem mudança de link,
      só os comentários. T021 verde. Tirar `029/US3` do `pending`.

**Checkpoint**: SC-001 verde; nenhuma atividade some das duas telas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T024 [P] E2E `apps/web/e2e/student-history.spec.ts`: o roteiro passa a encerrar e cancelar pelo professor antes de
      conferir o Histórico (`029/US1-1`, `029/US2-4`) e confere que a ativa entregue está em "Minhas atividades"; os
      cenários 028 do arquivo mantêm os ids (pedir consentimento para o reset do `devtrack_e2e`).
- [ ] T025 [P] `029/SC-006`: axe e contraste da tela do Histórico com as cinco abas e uma linha de cada situação nos dois
      temas, e sem rolagem horizontal em 360 px (no teste do componente e no E2E).
- [ ] T026 [P] Documentação: em `CLAUDE.md` acrescentar a 029 à lista de features ("028 … 029 the Histórico holds only
      works and exams the teacher closed or cancelled…") e reescrever a regra "Student's Histórico (028)" com a
      fronteira nova (cancelada só no Histórico, sem resultado nem link, outras rotas `404`; exercícios e ativas em
      "Minhas atividades", `COMPLETED` de volta; Painel "Concluídas" = linhas do Histórico); em `apps/api/CLAUDE.md`
      atualizar o parágrafo "Histórico (028)" com `loadCancelled`, `toCancelledSummary` e as suítes 029.
- [ ] T027 Rodar o quickstart manual (`specs/029-history-closed-only/quickstart.md`) no ambiente local e anotar o
      resultado; tirar os SCs restantes do `pending` (o `pending` da 029 termina vazio).
- [ ] T028 `pnpm lint && pnpm check-types && pnpm test` verde; marcar as tarefas `[X]`.

---

## Dependencies & Execution Order

- Setup (T001–T002) → Foundational (T003–T009) → US1 (T010–T013) → US2 (T014–T018) → Polish.
- US3 (T019–T023) depois da Foundational; o `counts.completed` de T022 usa o `history` completo, então T022 vem depois
  de T017.
- Dentro de cada história: testes (devem falhar) → API → web.

## Parallel Example

```text
# Foundational, testes juntos:
T003 contratos · T004 unit de lugar
# US1 e US3, testes juntos (arquivos diferentes):
T010 029-us1-closed-history · T011 student-history.test · T019 029-us3-list-dashboard · T021 my-activities/dashboard tests
# US2:
T014 029-us2-cancelled · T015 029-cancelled-isolation · T016 web
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US3 — a fronteira nova sem perder nenhuma atividade.
2. **US2**: as canceladas aparecem, com a segurança de T015.
3. **Polish**: E2E, acessibilidade, documentação e o quickstart.
