---
description: "Task list for 030 — \"Minhas turmas\" do aluno redesenhada: um card por disciplina da turma, data de entrada na turma (`enrolledAt` em `GET /me/classes`), busca e filtro de ano no navegador, painel de ranking"
---

# Tasks: 030 — "Minhas turmas" do aluno redesenhada

**Input**: os documentos de design em `/specs/030-student-classes-redesign/`.
**Prerequisites**:

- plan.md, spec.md (US1–US3, FR-001–FR-015, SC-001–SC-006), research.md (MT1–MT7) e data-model.md (sem migration);
- contracts/: http-api (`GET /me/classes` + `enrolledAt`) e ui;
- quickstart.md;
- constituição **v4.1.0** (sem emenda).

**Tests**: os testes são obrigatórios (Constituição VII; SC-001–SC-006).

- **Testes primeiro**: os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- **Ids nos títulos**: os títulos de `describe`/`it` levam o id da spec 030 com prefixo (`030/US1-2`, `030/FR-012`,
  `030/SC-004`), um id literal por cenário; onde uma tarefa cita uma faixa (`030/US1-1`…`030/US1-10`), cada cenário
  ganha o seu próprio `it`.
- **Ids antigos continuam cobertos**: `my-classes.test.tsx` cobre hoje `003/US7-1`, `003/SC-011`, `027/US8-1`…`027/US8-4`,
  `026/US4-1`, `026/US4-2` e `013/FR-021`; o arquivo reescrito MUST manter cada um desses ids num título (ao lado do id
  030 equivalente), ou a rastreabilidade dessas features quebra.
- **Build dos contratos**: mudanças em `packages/contracts` exigem `pnpm --filter @repo/contracts build` antes dos
  testes da API e do web.
- **Sem auditoria, migration, dependência, rota nova ou parâmetro novo** (plan.md, MT1, MT2).
- **Fim de fase**: cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde (a suíte completa leva mais
  de 10 min: rodar em segundo plano e reiniciar o `postgres-test` antes, se já houve duas execuções).

**Organization**: por user story.

- **Foundational**: o campo `enrolledAt` no contrato e na API, e as fixtures que o recebem — toda a tela depende dele.
- **US1** (P1, os cards): depende só da Foundational.
- **US3** (P1, nada além do que o aluno já via): testes de isolamento da rota e da tela; depois da Foundational
  (pode rodar junto com US1).
- **US2** (P2, busca, ano, aba, rodapé): depois de US1 (mesma tela).
- **MVP**: Setup + Foundational + US1 + US3.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência de tarefa incompleta).
- **[Story]**: a história da tarefa (US1…US3).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: a 030 entra na guarda de rastreabilidade.

- [X] T001 Incluir a 030 em `SPECS` de `apps/api/test/traceability.spec.ts`, no formato da entrada da 028:
      `feature: "030"`, `path: "specs/030-student-classes-redesign/spec.md"`, `stories: 3`, `scenarios: 19`
      (10 + 6 + 3), `rows: 0`, `rowsWithoutIds: []`, `successCriteria: sc(1, 6)` e
      `pending: { stories: [1, 2, 3], successCriteria: ["SC-001", "SC-002", "SC-003", "SC-004", "SC-005", "SC-006"] }`,
      com o comentário de que cada história e SC saem de `pending` na tarefa que escreve o seu último teste; atualizar a
      lista de features do texto "Cross-cutting guards" do `CLAUDE.md` da raiz (`… 027, 028, 029 and 030`). Rodar
      `pnpm --filter api test test/traceability.spec.ts` (verde: tudo pendente).
- [X] T002 [P] Anotar a substituição na 027: em `specs/027-manager-classes/spec.md`, logo abaixo do título da User Story 8,
      a nota `> Tela redesenhada pela 030 em 2026-11-25 (`specs/030-student-classes-redesign/`): um card por disciplina,
      filtro de ano (o mais recente de início) em vez de seções por ano; o conteúdo e as regras de US8 continuam.`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: `enrolledAt` no contrato e na resposta de `GET /me/classes` (MT1, FR-012).

**⚠️ CRITICAL**: nenhuma história começa antes desta fase.

### Tests for Foundational ⚠️

- [X] T003 [P] Em `packages/contracts/test/cohorts.spec.ts`, um `describe("030/FR-012 MyCohortSchema.enrolledAt")`:
      aceita uma turma com `enrolledAt` ISO (`"2026-11-07T21:08:00.000Z"`); recusa sem `enrolledAt`, com data mal formada
      e com um campo a mais (schema estrito). Deve falhar antes de T005.
- [X] T004 [P] Criar `apps/api/test/integration/030-my-classes.spec.ts` no molde de
      `apps/api/test/integration/027-us8-my-cohorts.spec.ts` (`createTestApp` com `FixedClock`, `resetDb`, factories
      `createCohort`/`createClass`/`createEnrollment`/`createUser`, `loginAs`): `it("030/FR-012 cada turma traz o
      enrolledAt da matrícula ativa do aluno")` — duas turmas com `enrolledAt` diferentes (passar a data à factory ou
      atualizar `enrollments.enrolled_at` por Prisma), conferir o valor ISO exato de cada uma e que a ordem continua
      ano desc, matrícula desc. Deve falhar antes de T006.

### Implementation for Foundational

- [X] T005 Em `packages/contracts/src/classes/my-classes.ts`, acrescentar a `MyCohortSchema`
      `enrolledAt: IsoDateTimeSchema` (o primitivo de data-hora já usado nos contratos; conferir o nome em
      `packages/contracts/src/common/primitives.ts`), com o JSDoc "030/FR-012: a matrícula ativa do próprio aluno na
      turma (a matrícula é da turma, 027)". `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test`.
- [X] T006 Em `apps/api/src/modules/enrollments/my-classes.service.ts`, selecionar `enrolledAt: true` da matrícula e
      copiar `enrolledAt: enrolledAt.toISOString()` em cada turma; atualizar o JSDoc (030). T004 verde.
- [X] T007 [P] Dar `enrolledAt` às fixtures de `MyCohort` no web, para que os testes existentes voltem a compilar e
      passar: `apps/web/features/student-activities/components/test-fixtures.ts`,
      `apps/web/features/cohorts/components/cohort-page.test.tsx` (se monta um `MyCohort`),
      `apps/web/test/student-portal-xss.test.tsx` e `apps/web/features/my-classes/components/my-classes.test.tsx`
      (só as fixtures, por ora). `pnpm --filter web check-types`.
- [X] T008 [P] Rodar `apps/api/test/integration/003-us7-my-classes.spec.ts`, `027-us8-my-cohorts.spec.ts` e
      `027-us1-cohorts.spec.ts`; onde comparam o corpo inteiro com `toEqual`, acrescentar `enrolledAt:
      expect.any(String)` (sem mudar outra asserção — SC-006).

**Checkpoint**: `GET /me/classes` traz `enrolledAt`; nenhum consumidor quebrou.

---

## Phase 3: User Story 1 - Aluno vê cada disciplina num card (Priority: P1) 🎯 MVP

**Goal**: a tela nova com um card por disciplina, "Acessar turma", o painel de ranking e os estados (FR-001–FR-006,
FR-011 sem o vazio de filtro, FR-013–FR-015).

**Independent Test**: um aluno com uma turma de duas disciplinas e outra turma de outro ano; conferir os cards, o
conteúdo de cada um e os destinos dos botões (com "Todos os anos" no endereço até a US2 existir).

### Tests for User Story 1 ⚠️

- [X] T009 [P] [US1] Criar `apps/web/features/my-classes/schemas/my-classes.test.ts` (funções puras de data-model.md):
      `030/US1-1` `subjectCards` dá um card por disciplina na ordem da API e um card com `classId: null` para turma sem
      disciplinas; `030/US1-6` `cardStatusBadge` (selo da turma; o da disciplina só com a turma ACTIVE); `030/US1-8`
      disciplina sem nome usa o nome da turma.
- [X] T010 [US1] Reescrever `apps/web/features/my-classes/components/my-classes.test.tsx` (mesmo `fetchMock`,
      `renderWithProviders`, `expectNoA11yViolations`; fixtures com `enrolledAt`), com um `it` por cenário
      `030/US1-1`…`030/US1-10`, mantendo nos títulos os ids antigos (ver "Ids antigos"):
      - US1-1 título, subtítulo e um `article` por disciplina (`getAllByRole("article")`);
      - US1-2 selo do código, nome da turma, disciplina (`h2`) + "Disciplina", "Professor", "Ano", "Período" ("—" sem
        período), "Entrada na turma" `07/11/2026, 18:08` para `2026-11-07T21:08:00.000Z`, "Código da turma: QA001"
        (+ `027/US8-1 026/US4-1`);
      - US1-3 "Acessar turma" com nome acessível "Acessar Banco de Dados · ADS 4NA" e `href`
        `/minhas-atividades?materia=<id>`;
      - US1-4 / US1-5 painel "Ranking da turma" e "Ver ranking" (`/minhas-turmas/<id>/ranking`, nome "Ver ranking de …")
        só com `showRanking` (+ `013/FR-021`);
      - US1-6 "Encerrada"/"Arquivada" em texto e "Acessar turma" presente (+ `027/US8-3 027/US8-4`);
      - US1-7 turma sem disciplinas: "Ainda não há disciplinas nesta turma.", sem "Acessar turma" nem ranking
        (+ `027/US8-2 026/US4-2`);
      - US1-8 disciplina sem nome: o `h2` é o nome da turma e não há "Disciplina";
      - US1-9 vazio: "Você ainda não participa de nenhuma turma." sem busca, filtro, aba nem "Ano letivo"
        (+ `003/US7-1 003/SC-011`);
      - US1-10 `welcome`: "Você agora faz parte da turma."; falha + "Tentar novamente" como hoje;
      - `030/FR-013` nomes com `<b>` aparecem como texto; `030/SC-005` `expectNoA11yViolations` com e sem ranking.
      Deve falhar antes de T011–T014.

### Implementation for User Story 1

- [X] T011 [P] [US1] Em `apps/web/features/my-classes/schemas/my-classes.ts`, acrescentar o tipo `SubjectCard` e
      `subjectCards(list)`, `cardStatusBadge(card)` e os textos (`PAGE_SUBTITLE`, `RANKING_PANEL_TEXT`, `NO_RESULTS`,
      etc.), sem mudar `mySubjectClasses`, `mySubjectLabel` nem `subjectActivitiesHref` (026/028 usam). T009 verde.
- [X] T012 [P] [US1] Criar `apps/web/features/my-classes/components/academic-year-card.tsx`: o card "Ano letivo"
      (`CalendarDays` decorativo, legenda em versalete, o ano grande), só tokens do Design System.
- [X] T013 [P] [US1] Criar `apps/web/features/my-classes/components/subject-card.tsx` conforme contracts/ui.md "Card":
      `Card` em `article` com `aria-labelledby` do `h2`; grade de duas colunas a partir de `md` (dados | painel), empilhada
      abaixo; fatos com ícones Lucide `aria-hidden` e texto visível; `formatDateTime(enrolledAt)`; `Button asChild` com
      `Link` para "Acessar turma" (`subjectActivitiesHref`) e, com `showRanking`, o painel com `Trophy` e "Ver ranking"
      (`classRankingHref`), `aria-label`s de MT7 via `mySubjectLabel`; a variante de turma sem disciplinas.
- [X] T014 [US1] Reescrever `apps/web/features/my-classes/components/my-classes.tsx`: `useMyClasses`; estados (carregando
      com `Skeleton` de card, erro com "Tentar novamente", vazio); a lista de `SubjectCard`; a `Notice` de boas-vindas;
      por ora todos os anos (o filtro vem em US2). O `PageHeader` passa para dentro de `MyClasses` (componente de
      cliente, que já tem a lista): título "Minhas turmas", `description` com o subtítulo e, quando há turmas, o
      `AcademicYearCard` em `actions` (U1, MT6). Em `apps/web/app/(student)/minhas-turmas/page.tsx`, remover o
      `PageHeader` e só renderizar `<MyClasses welcome showRanking />` dentro da `section` (a checagem de sessão e de
      permissão continua na página). O `h1` continua único (o teste de `student-layout.test.tsx` procura um
      `heading` nível 1 "Minhas turmas"). T010 verde.
- [X] T015 [US1] Ajustar o E2E que lia a tabela antiga, sem mudar o que cada teste prova:
      `apps/web/e2e/class-new-student.spec.ts` (o card da disciplina: `getByRole("article", { name: subjectName })` com o
      professor), `apps/web/e2e/manager-classes.spec.ts` (linhas 164–185: o card de cada disciplina com "Encerrada" e o
      professor; `027/US8-3` com `?ano=todos` ou o ano corrente e o link "Acessar …"). Os títulos dos testes não mudam.
- [X] T016 [US1] Tirar a história 1 e `SC-001`, `SC-002` e `SC-005` de `pending` em `apps/api/test/traceability.spec.ts`
      (`SC-001` e `SC-002` citados em `it`s de T010: um card por disciplina com os dados certos; 1 interação até
      atividades/ranking).

**Checkpoint**: a tela nova funciona com todos os anos; MVP com US3.

---

## Phase 4: User Story 3 - Nada além do que o aluno já via (Priority: P1)

**Goal**: o `enrolledAt` e a lista são só do aluno da sessão, só de matrículas ativas (FR-012, SC-004).

**Independent Test**: um aluno com uma matrícula ativa e uma encerrada e um colega na mesma turma.

### Tests for User Story 3 ⚠️

- [X] T017 [P] [US3] Em `apps/api/test/integration/030-my-classes.spec.ts`: `030/US3-1` dois alunos da mesma turma com
      `enrolledAt` diferentes — cada um recebe só o seu; `030/US3-2` a turma de uma matrícula encerrada não aparece;
      `030/US3-3` e `030/SC-004` as chaves de cada turma são exatamente
      `["classes","code","enrolledAt","id","name","period","status"]` e as de cada disciplina as de hoje (nenhum e-mail, RA,
      convite ou outro aluno); passam já com T006 (a regra existe; o teste a fixa).
- [X] T018 [P] [US3] Em `apps/web/test/student-portal-xss.test.tsx`, o caso de "Minhas turmas" com nomes de turma,
      disciplina e professor com marcação renderizados como texto nos cards (`030/FR-013`), se o arquivo já tiver o caso
      do 027 — ajustar ao card; senão acrescentar.

### Implementation for User Story 3

- [X] T019 [US3] Nenhuma mudança de código esperada (MT1: a consulta já é da sessão e só de matrículas ACTIVE); se T017
      falhar, corrigir em `my-classes.service.ts`. Tirar a história 3 e `SC-004` de `pending`.

**Checkpoint**: US1 + US3 = MVP entregue.

---

## Phase 5: User Story 2 - Buscar e escolher o ano letivo (Priority: P2)

**Goal**: filtro "Ano" (o mais recente de início, "Todos os anos"), busca, aba com contagem, rodapé, endereço
(FR-007–FR-011).

**Independent Test**: disciplinas em 2025 e 2026 com nomes diferentes; conferir o ano inicial, filtro, busca, contagem,
rodapé e o endereço.

### Tests for User Story 2 ⚠️

- [X] T020 [P] [US2] Em `apps/web/features/my-classes/schemas/my-classes.test.ts`: `studentYears` (distintos, desc);
      `resolveYear` (ausente, mal formado, de outro ano → o mais recente; `todos`; um ano válido) — `030/US2-6`;
      `normalizeSearch` (espaços nas pontas, só espaços = vazio, acentos e maiúsculas, corte em 100) e
      `filterSubjectCards` por nome/código da turma e nome da disciplina, nunca pelo professor — `030/US2-3`.
- [X] T021 [US2] Em `apps/web/features/my-classes/components/my-classes.test.tsx`, primeiro um
      `vi.mock("next/navigation")` no topo do arquivo, valendo para todos os testes (os da US1 também, que passam a
      renderizar um componente com `useSearchParams`/`useRouter`): `useSearchParams` lendo um `URLSearchParams` mutável
      por teste (vazio por padrão) e `useRouter().replace` como `vi.fn()`, no molde de
      `apps/web/features/student-activities/components/student-history.test.tsx` (I1). Conferir também o mock de
      `apps/web/test/student-portal-xss.test.tsx:82`: se não tiver `useSearchParams` e `useRouter().replace`,
      acrescentá-los. Depois, um `it` por cenário:
      `030/US2-1` abre no ano mais recente, card "Ano letivo" com ele, só os cards dele; `030/US2-2` opções do "Ano"
      (desc + "Todos os anos"), com "Todos os anos" o card mostra o mais recente e a lista todos; `030/US2-3` digitar
      "orient" (com 300 ms, `vi.useFakeTimers` ou Enter) deixa só o card certo e chama `replace` com `busca`;
      `030/US2-4` "Nenhuma turma encontrada." e "Limpar busca e filtro"; `030/US2-5` aba "Todas as turmas" com a
      contagem do ano (sem a busca) e o rodapé "Mostrando 1 de 2 turmas"/"Mostrando 1 de 1 turma" e "Entrada mais
      recente primeiro"; `030/US2-6` `ano`/`busca` do endereço aplicados ao abrir e um `ano` desconhecido cai no mais
      recente; `030/SC-003` a busca e a troca de ano não chamam `fetch` de novo.

### Implementation for User Story 2

- [X] T022 [P] [US2] Em `apps/web/features/my-classes/schemas/my-classes.ts`: `studentYears`, `resolveYear`,
      `normalizeSearch`, `filterSubjectCards` e `footerText(shown, total)` (MT4, MT5). T020 verde.
- [X] T023 [US2] Criar `apps/web/features/my-classes/hooks/use-my-classes-filters.ts`: lê `ano`/`busca` de
      `useSearchParams`, devolve o ano resolvido e a busca e os setters que fazem `router.replace` preservando o outro
      parâmetro e `bem-vindo` (busca com 300 ms de espera e Enter imediato), no molde do hook de filtros da 028.
- [X] T024 [US2] Em `apps/web/features/my-classes/components/my-classes.tsx`: a barra (contracts/ui.md "Toolbar":
      `Tabs` com uma aba e a contagem, `Input type="search"` com rótulo oculto e `maxLength` 100, `NativeSelect` "Ano"),
      a lista filtrada, o vazio de filtro com "Limpar busca e filtro", o rodapé com `aria-live="polite"` e o card "Ano
      letivo" com o ano resolvido. Atualizar T015 se o E2E precisar de `?ano=todos`. T021 verde.
- [X] T025 [US2] Tirar a história 2 e `SC-003` de `pending`.

**Checkpoint**: todas as histórias funcionam juntas.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T026 [P] `030/SC-005` e `030/FR-014`: em `my-classes.test.tsx`, `expectNoA11yViolations` no tema claro (como os
      testes de tema da 022) e conferir que nenhuma classe fixa de cor ou tamanho fora dos tokens entrou
      (`pnpm --filter web test test/contrast.test.ts` e as varreduras do Design System de `apps/web/CLAUDE.md`).
- [ ] T027 [P] `030/SC-006`: rodar as suítes web do card "Matéria" (`use-current-subject.test.tsx`,
      `subject-switcher.test.tsx`), do Histórico (`student-history.test.tsx`) e do ranking (`ranking-table.test.tsx`) sem
      mudar asserções (só fixtures de T007); citar `030/SC-006` num `it` de `my-classes.test.tsx` que monta o
      `mySubjectClasses` a partir da mesma resposta e confere que ele não mudou. Tirar `SC-006` de `pending`.
- [ ] T028 [P] Atualizar o `CLAUDE.md` da raiz: em "Project state", o item da 030 (uma linha no estilo da 028/029); em
      "Rules that are easy to get wrong", uma linha: "`GET /me/classes` carries the turma's `enrolledAt` (the student's
      own ACTIVE enrollment); the 030 year filter and search run in the browser over that list, the route takes no
      parameters".
- [ ] T029 `030/SC-005` (G1): criar `apps/web/e2e/student-classes.spec.ts` com
      `test("030/SC-005 Minhas turmas sem rolagem horizontal em 360 px")`: o aluno da turma E2E (fixtures de
      `e2e/fixtures/journeys.ts`, como `class-new-student.spec.ts`) abre `/minhas-turmas` com
      `page.setViewportSize({ width: 360, height: 800 })`, vê o card da disciplina e confere
      `document.documentElement.scrollWidth <= document.documentElement.clientWidth`, no molde de
      `apps/web/e2e/code-highlighting.spec.ts:62`; repetir no tema claro. Depois rodar o E2E de "Minhas turmas"
      (`pnpm --filter web test:e2e student-classes`, `class-new-student`, `manager-classes`,
      `class-invitation-keyboard`, `class-remove-student`) — exige consentimento do usuário para o reset do
      `devtrack_e2e` (memória "Local dev environment").
- [ ] T030 Validar o quickstart.md manualmente (dev, temas escuro e claro, 360 px) e conferir `pending` vazio em
      `traceability.spec.ts`; `pnpm lint && pnpm check-types && pnpm test` verde.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T008)** → **US1 (T009–T016)** e **US3 (T017–T019)** em paralelo →
  **US2 (T020–T025)** → **Polish (T026–T030)**.
- Dentro de cada fase: testes antes da implementação; T005 antes de T006 e T007 (o contrato é compilado antes);
  T011 antes de T013–T014; T022 antes de T023–T024.
- US2 mexe nos mesmos arquivos que US1 (`my-classes.tsx`, o teste, os schemas): só depois de US1.

## Parallel Example

```text
Foundational:  T003 (contracts test) ‖ T004 (API integration test)
               T007 (web fixtures)   ‖ T008 (API suites 003/027)   — after T005/T006
US1:           T009 (pure tests) ‖ T011 (schemas) ‖ T012 (year card) ‖ T013 (subject card)
US1 ‖ US3:     T010/T014 (web) ‖ T017 (API isolation) ‖ T018 (XSS)
US2:           T020 (pure tests) ‖ T022 (pure helpers)
Polish:        T026 ‖ T027 ‖ T028
```

## Implementation Strategy

1. **MVP**: Setup + Foundational + US1 + US3 — a tela nova com todos os cards, a data de entrada e o ranking, sem
   vazar nada. Validar e demonstrar.
2. **Incremento**: US2 — busca, ano, aba, rodapé e endereço.
3. **Polish**: acessibilidade nos dois temas, consumidores intactos, docs, E2E e a suíte completa.
