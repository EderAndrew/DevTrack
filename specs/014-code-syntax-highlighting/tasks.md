---

description: "Task list for 014 — Realce de Sintaxe do Código: CodeMirror 6 sob demanda, leitura por spans React, gramática por linguagem no catálogo, tokens de sintaxe"
---

# Tasks: 014 — Realce de Sintaxe do Código

**Input**: Design documents from `/specs/014-code-syntax-highlighting/`
**Prerequisites**: plan.md, spec.md, research.md (L1–L14), data-model.md, contracts/
(http-api, design-tokens, web-ui), quickstart.md

**Tests**: obrigatórios (Constituição VII; a tela de responder e o salvamento automático são regras
críticas da 012; SC-001–SC-007).
- Os testes de cada história são escritos antes da implementação e devem falhar antes dela.
- Os títulos de `describe`/`it` levam o id da spec 014 com prefixo (`014/US1-4`, `014/FR-007`,
  `014/SC-003`), **um id literal por cenário**.
- **O texto do código nunca muda**: todo teste de editor compara o valor emitido com o digitado,
  caractere por caractere (a única normalização é `\r\n` → `\n`, como o textarea já faz).
- Nenhum código vira HTML: nada de `dangerouslySetInnerHTML` em `components/ui/code` nem nas telas.
- Nenhuma linguagem do catálogo aparece como condição no código: o web conhece só **chaves de
  gramática** (`grammars.ts`); a ligação linguagem → gramática é dado (`programming_languages.highlight`).
- `@codemirror/*` e `@lezer/*` só por `import()` dinâmico em `components/ui/code/load-*.ts` (regra ESLint).
- Nenhuma cor fora dos tokens; nenhum `ds-exception` novo.
- `packages/contracts` exige `pnpm --filter @repo/contracts build` antes dos testes da API e do web.
- Regras de 012/013 (autosave, revisões, buffer offline, entrega, conclusão, gabarito só depois da
  conclusão) não mudam: as suítes delas passam sem alteração de expectativa.
- Cada fase termina com `pnpm lint && pnpm check-types && pnpm test` verde.

**Organization**: por user story.
- A Foundational entrega a coluna e o dado do catálogo, o campo `highlight` em todos os objetos de
  linguagem (API e contratos), os tokens de sintaxe e as peças puras do web (registro de gramáticas,
  highlighter, tema).
- US1 (editor do aluno) é o MVP. US2 (leitura) e US3 (formulários do banco) dependem só da
  Foundational e do componente da US1 (US3) — podem andar em paralelo com a US2. US4 (acessibilidade e
  vitrine) fecha o conjunto.

## Phase 1: Setup

**Purpose**: dependências, regra de importação e ambiente de teste.

- [X] T001 Adicionar a `apps/web/package.json` (`pnpm --filter web add`) `@codemirror/state`,
  `@codemirror/view`, `@codemirror/language`, `@codemirror/commands`, `@lezer/highlight` e
  `@codemirror/lang-{java,python,javascript,cpp,php,rust,go,html}`; `pnpm audit` sem alta/crítica;
  uma linha por pacote direto em `DEPENDENCIES.md` (licença MIT, finalidade, por que não é trivial,
  carregado só nas telas com código — research L1, L11).
- [X] T002 [P] Regra ESLint em `apps/web/eslint.config.js`: `no-restricted-imports` de `@codemirror/*`
  e `@lezer/*` fora de `components/ui/code/load-*.ts` (research L6); caso fixado em
  `apps/web/test/lint-boundaries.test.ts` (um import estático numa feature é apontado; o loader passa).
- [X] T003 [P] Polyfills do jsdom para o CodeMirror em `apps/web/test/setup.ts`
  (`Range.prototype.getClientRects`/`getBoundingClientRect`, `document.createRange` quando faltar —
  research L13), sem quebrar as suítes atuais.

---

## Phase 2: Foundational

**Purpose**: o dado da gramática de ponta a ponta, os tokens e as peças puras do realce.

- [X] T004 [P] Teste primeiro: `apps/api/test/integration/014-highlight.spec.ts` (`014/FR-002`,
  `014/FR-003`): depois da migração, as 13 linguagens têm o `highlight` de data-model.md (Angular e
  Nest → `typescript`, Node → `javascript`, C → `cpp`, "HTML & CSS" → `html`); `GET
  /programming-languages` e `GET /works/programming-languages` trazem `highlight`; a visão do
  professor e a do aluno de um exercício de Código, de uma questão de Código de trabalho (incluindo
  "Ver como aluno") e de uma questão de Código de atividade (professor em
  `GET /classes/:classId/activities/:activityId`; aluno em
  `GET /me/activities/:activityId`) trazem `language.highlight` (a tentativa
  `GET /classes/:classId/activities/:activityId/attempts/:attemptId` não traz questões nem linguagem:
  a tela de revisão lê a linguagem de cada questão do detalhe da atividade); uma linguagem com `highlight` NULL aparece com `null`; `highlight` no
  corpo de criação de exercício → 400.
- [X] T005 Migração `apps/api/prisma/migrations/<ts>_code_highlight/migration.sql`: coluna
  `programming_languages.highlight text NULL` com CHECK `^[a-z][a-z0-9-]{0,31}$` e o `UPDATE` idempotente
  das 13 linhas; `highlight String?` em `ProgrammingLanguage` (`apps/api/prisma/schema.prisma`);
  `prisma generate`. Um caso em `apps/api/test/integration/014-highlight.spec.ts` para o CHECK (valor
  com maiúscula ou espaço recusado).
- [X] T006 [P] Contratos (contracts/http-api.md): `packages/contracts/src/common/code-highlight.ts`
  (`CodeHighlightSchema`) exportado pelo índice de `common`; `highlight` em
  `exercises/programming-languages.ts`, `exercises/exercises.ts` (visões do professor e do aluno),
  `works/works.ts` (professor e aluno), `activities/teacher.ts` e `activities/student.ts`;
  `pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test` (boundary e duplicação
  verdes; nenhum import entre `exercises` e `works`).
- [X] T007 API (research L8, L10): `highlight` nos selects de linguagem de
  `apps/api/src/modules/exercises/exercise-query.ts`, `apps/api/src/modules/works/work-query.ts`,
  `apps/api/src/modules/activities/activity-query.ts`, `apps/api/src/modules/activities/views/rows.ts`
  e nas listas de `apps/api/src/modules/exercises/programming-languages.service.ts` e
  `apps/api/src/modules/works/works.service.ts`; copiado nas visões do professor e, explicitamente na
  allowlist, em `exercises/views/student-view.ts`, `works/views/student-view.ts` e
  `activities/views/student-view.ts`. T004 passa; `010-student-view`, `011-student-view` e
  `012-student-view` seguem verdes (o campo novo não carrega gabarito).
- [X] T008 [P] Tokens (contracts/design-tokens.md): os 8 `--syntax-*` em
  `apps/web/design-system/tokens.css` (claro em `:root`, escuro no bloco `prefers-color-scheme: dark` e
  em `:root[data-theme="dark"]`), utilitários `text-syntax-*` no tema Tailwind, `@media
  (forced-colors: active)` com `CanvasText`; os pares de cada `--syntax-*` e do `--foreground` sobre `--background`, `--surface`,
  `--primary-subtle` (seleção) e `--disabled-bg`, nos dois temas, em
  `apps/web/test/contrast.test.ts` (`014/FR-017`, `014/SC-005`); seção em
  `apps/web/design-system/tokens.md` (o `docs.test.ts` exige). O texto comum do código usa o
  `--foreground` existente (8 tokens novos, não 9). A seleção e a linha ativa do editor usam fundos
  de token: ou o texto mantém a cor de sintaxe e os pares de cada `--syntax-*` (e do `--foreground`)
  sobre o fundo da seleção e da linha ativa entram no `contrast.test.ts` nos dois temas, ou a
  seleção troca a cor do texto por um token de primeiro plano já verificado — a escolha fica
  registrada em `tokens.md`.
- [X] T009 [P] Testes primeiro das peças puras em `apps/web/components/ui/code/code-pieces.test.ts`:
  `grammars` resolve as 9 chaves (`java`, `python`, `javascript`, `typescript`, `cpp`, `php`, `rust`,
  `go`, `html`) para um carregador e devolve `null` para chave desconhecida ou `null` (`014/FR-002`);
  o highlighter mapeia as tags Lezer das 8 categorias para as classes `text-syntax-*` (`014/FR-004`);
  todo valor de cor do tema do editor é `var(--…)` (`014/FR-016`).
- [X] T010 Implementar em `apps/web/components/ui/code/`: `grammars.ts` (chave → `import()` do
  `LanguageSupport`; `typescript` = `javascript({ typescript: true })`), `highlighter.ts`
  (`tagHighlighter` de research L5), `editor-theme.ts` (todas as cores do tema base do CodeMirror em
  tokens), `load-editor.ts` (o único ponto de `import()` do editor). T009 passa.

**Checkpoint**: a API entrega a gramática de cada código; o web sabe carregar e colorir uma gramática.

---

## Phase 3: User Story 1 — Aluno responde com o código colorido (Priority: P1) 🎯 MVP

**Goal**: o editor da questão de Código (Trabalho e Exercício) colore pela linguagem da questão, sem
mudar nada do que a 012/013 garantem.

**Independent Test**: aplicar um Exercício de Código em Java, responder, conferir cores, Tab, Esc +
Tab, salvamento depois de recarregar e o texto salvo idêntico.

- [ ] T011 [P] [US1] Testes primeiro em `apps/web/components/ui/code/code-editor.test.tsx`
  (contracts/web-ui.md): `014/US1-1` mostra o código inicial com números de linha e o rótulo com a
  linguagem; `014/US1-2` digitar `String nome = "Ana"; // aluno` em Java produz segmentos com
  `text-syntax-keyword`, `-string` e `-comment` e `onChange` recebe exatamente o texto; `014/US1-3` Tab
  insere dois espaços e o foco fica, Esc + Tab sai, Shift+Tab volta; `014/FR-007` Enter não indenta e
  aspas/parênteses não se fecham; `014/FR-014` antes do chunk e com o `import()` rejeitado o editor é o
  textarea da 012 e continua emitindo o mesmo `onChange`; a troca textarea → CodeMirror mantém valor,
  seleção e foco e **não emite `onChange`**; `disabled` não edita e o estado não é só cor;
  `014/FR-007` valor inicial com `\r\n` (código guardado assim): montar, trocar para o CodeMirror e
  re-renderizar com o mesmo `value` não emite `onChange` sem digitação nem move o cursor, e ao
  digitar o valor emitido é o texto com `\n`; `014/FR-012` desfazer e refazer (Ctrl/Cmd+Z,
  Ctrl/Cmd+Shift+Z) devolvem exatamente os textos anteriores no `onChange`, e recortar/colar
  (eventos `cut`/`paste`) emitem o texto exato; `aria-labelledby`, `aria-describedby` (dica + erro)
  e `aria-invalid` chegam ao conteúdo editável; axe sem violações.
- [ ] T012 [P] [US1] Testes primeiro nas telas: em `apps/web/components/ui/assessment/assessment.test.tsx`
  `CodeAnswer` repassa `highlight` e o rótulo "Sua resposta (Java)"; em
  `apps/web/features/student-activities/components/activity-answering.test.tsx` `014/US1-4` resposta
  de código salva pelo autosave, recarregada e do buffer offline volta idêntica (reusando os fixtures
  da 012), `014/US1-5` linguagem com `highlight: null` responde sem cores, `014/US1-6` colar
  `<script>alert(1)</script>` aparece como texto (nenhum `script`/`img` no DOM).
- [ ] T013 [US1] `apps/web/components/ui/code/code-editor.tsx` (research L2, L6, L7): textarea imediato,
  troca para o CodeMirror carregado por `load-editor.ts` com a gramática de `grammars.ts`, extensões
  exatamente as de L2, `contentAttributes` de L7, `ref` com `focus()`; valor controlado (despacha
  substituição quando a prop muda de fora, como no CONFLICT da 012 e no "Refazer" da 013),
  comparando a prop e o documento **depois de normalizar as quebras de linha** (`\r\n`/`\r` → `\n`),
  para que um código guardado com `\r\n` não gere substituição a cada render nem `onChange` sem
  digitação; a troca textarea → CodeMirror não emite `onChange`; `disabled` também quando o editor
  está dentro de um `<fieldset disabled>` (o `contenteditable` não herda o `disabled` do fieldset:
  o componente verifica `closest("fieldset:disabled")` além da prop);
  `apps/web/components/ui/assessment/code-editor.tsx` reexporta; `CodeAnswer` em
  `apps/web/components/ui/assessment/answers.tsx` recebe `highlight` e põe a linguagem no rótulo.
- [ ] T014 [US1] `apps/web/features/student-activities/components/activity-answering.tsx` passa
  `question.language?.highlight ?? null` ao `CodeAnswer`. T011 e T012 passam; as suítes 012/013 da tela
  de responder seguem verdes sem mudar expectativas.

**Checkpoint**: MVP — o aluno responde código colorido com tudo da 012/013 intacto.

---

## Phase 4: User Story 2 — Aluno e professor leem código colorido (Priority: P2)

**Goal**: `CodeBlock` só leitura em todas as telas de leitura.

**Independent Test**: concluir um Exercício de Código e abrir o resultado (aluno) e a tentativa
(professor): código colorido, só leitura, copiar traz só o código.

- [ ] T015 [P] [US2] Testes primeiro em `apps/web/components/ui/code/code-block.test.tsx`: segmentos
  com as classes de sintaxe depois do carregamento; texto puro antes e com o `import()` rejeitado;
  `014/US2-4` o texto do elemento de código (o que se copia) é o código exato, sem números de linha
  (coluna `aria-hidden` e não selecionável); `014/FR-009` código com `<script>`/HTML em `html` e em
  `java` vira texto; `\r\n` guardado aparece sem alteração; região rolável com nome e `tabIndex=0` só
  quando transborda; axe sem violações.
- [ ] T016 [P] [US2] Testes primeiro nas telas: `014/US2-1` em
  `apps/web/features/student-activities/components/exercise-result.test.tsx` (resposta e solução de
  referência em `CodeBlock`, Tab move o foco); `014/US2-2` em
  `apps/web/features/activities/components/attempt-review.test.tsx` (resposta do aluno e solução
  esperada); `014/US2-3` em `apps/web/features/activities/components/activity-detail.test.tsx`,
  `apps/web/features/exercises/components/exercise-detail.test.tsx` e
  `apps/web/features/works/components/student-preview.test.tsx` ("Ver como aluno" sem a solução).
- [ ] T017 [US2] `apps/web/components/ui/code/code-block.tsx` (research L4): carrega a gramática,
  `highlightTree` + highlighter → segmentos por linha → `<span>`s em `<pre><code>`, coluna de números
  `aria-hidden`/`select-none`, rótulo acessível, fallback texto puro.
- [ ] T018 [US2] Trocar o código de leitura por `CodeBlock` em
  `apps/web/features/student-activities/components/exercise-result.tsx`,
  `apps/web/features/activities/components/attempt-review.tsx`,
  `apps/web/features/activities/components/activity-questions.tsx`,
  `apps/web/features/exercises/components/exercise-parts.tsx` e
  `apps/web/features/works/components/student-preview.tsx`, com `language.highlight` de cada item.
  T015 e T016 passam.

**Checkpoint**: leitura colorida em todas as telas; o gabarito continua só depois da conclusão.

---

## Phase 5: User Story 3 — Professor escreve código colorido no banco (Priority: P2)

**Goal**: "Código inicial" e "Solução esperada" com `CodeEditor` nos formulários de exercício, rascunho
da IA e trabalho, com o realce da linguagem escolhida.

**Independent Test**: criar um exercício de Código em Python, digitar, trocar para JavaScript (texto
mantido, realce muda), salvar e reabrir.

- [ ] T019 [US3] `apps/web/test/keyboard.ts`: `expectFieldErrorLinked` aceita o campo ligado por
  `aria-labelledby` (conteúdo editável) além de `<label for>`; `apps/web/test/keyboard.test.tsx` cobre
  os dois casos.
- [ ] T020 [P] [US3] Testes primeiro: em `apps/web/features/exercises/components/exercise-form.test.tsx`
  `014/US3-1` os dois campos de código usam o editor com a gramática da linguagem escolhida,
  `014/US3-2` trocar a linguagem muda o realce e mantém o texto, `014/US3-3` erro de solução vazia
  ligado ao editor e foco nele no envio, `014/US3-4` o corpo enviado traz o texto exato; o mesmo
  para o rascunho da IA em `apps/web/features/exercises/components/batch-review.test.tsx` e para a
  questão de Código em `apps/web/features/works/components/work-form.test.tsx`; ainda em
  `work-form.test.tsx`, um trabalho arquivado (formulário só leitura, `<fieldset disabled>`) mostra o
  "Código inicial" e a "Solução esperada" coloridos e **não editáveis** (conteúdo sem
  `contenteditable="true"`, com `aria-disabled`/`aria-readonly`; digitar não muda o valor do
  formulário) — spec, Edge Cases, "Editor desabilitado".
- [ ] T021 [US3] `CodeEditor` num `Field` com `Controller` do React Hook Form (ref de foco, erro, dica)
  em `apps/web/features/exercises/components/exercise-form.tsx`,
  `apps/web/features/exercises/components/draft-editor.tsx` e
  `apps/web/features/works/components/work-question-card.tsx` (o `highlight` vem da linguagem escolhida
  na lista do catálogo); em `work-question-card.tsx` cada `CodeEditor` recebe também
  `disabled={readOnly}` do `work-form` (além da detecção do fieldset no componente); casos de teste
  continuam `TextareaField`. T020 passa.

**Checkpoint**: o professor escreve e lê o gabarito com cores.

---

## Phase 6: User Story 4 — Cores acessíveis em qualquer tema (Priority: P3)

**Goal**: vitrine, documentação e verificações de acessibilidade do conjunto.

**Independent Test**: vitrine e uma questão de Código nos dois temas, alto contraste e leitor de tela.

- [ ] T022 [P] [US4] Design system: entrada `CodeBlock` em `apps/web/features/design-system/registry.ts`,
  vitrine do `CodeEditor` e do `CodeBlock` (Java, Python, sem gramática) em
  `apps/web/features/design-system/components/assessment-showcase.tsx` (ou vitrine nova de código),
  seções em `apps/web/design-system/components.md` e a decisão da biblioteca em
  `apps/web/design-system/exam-mode.md`; `catalog.test.tsx` (axe e Tab) e `docs.test.ts` verdes
  (`014/FR-020`).
- [ ] T023 [P] [US4] Testes em `apps/web/components/ui/code/code-a11y.test.tsx`: `014/US4-1` cada
  categoria usa a sua classe de token nos dois temas (contraste coberto pelo T008); `014/US4-2` o
  conteúdo lido é o texto das linhas, sem nomes de cor nem marcação, com o rótulo incluindo a
  linguagem; `014/US4-3` a folha de estilos tem a regra `forced-colors` para as classes de sintaxe e
  para o contorno de foco do editor e do `CodeBlock` rolável (cor do sistema, ex. `Highlight`, ou o
  contorno padrão sem `outline: none`); `014/FR-018` o código sem as classes é o mesmo texto.

**Checkpoint**: todas as histórias funcionando.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T024 [P] E2E `apps/web/e2e/code-highlighting.spec.ts` (seed do `e2e/support/exercise-points-seed.ts`
  com um exercício de Código em Java): `014/US1-2` spans de sintaxe visíveis no editor do aluno,
  `014/US1-3` Tab e Esc + Tab, `014/US1-4` recarregar devolve o texto idêntico, `014/US2-1` resultado
  colorido, `014/US2-2` tentativa colorida para o professor, `014/US3-2` formulário do banco trocando a
  linguagem, `014/US4-4` 360 px sem rolagem horizontal; `014/SC-001` um exercício em Java colorido e
  um de linguagem com `highlight` NULL (linha do seed alterada só no banco do E2E) sem cor e
  funcionando, no editor do aluno, no resultado e na tentativa; `014/SC-002` ida e volta do texto
  (digitar e colar → recarregar, offline → reconectar, concluir) caractere por caractere, com
  tabulações, espaços no fim da linha, acentos e emoji; `014/SC-006` responder, entrar e sair do
  editor (Tab, Esc + Tab, Shift+Tab) e ler o gabarito só com o teclado, em viewport de desktop e de
  celular; `014/FR-012` em viewport de celular com toque (`hasTouch`): tocar no editor dá o foco,
  digitar e desfazer funcionam; `014/SC-004` com duas medidas na mesma máquina — linha de base com o
  chunk do CodeMirror bloqueado (`page.route` abortando `@codemirror`, o editor fica o textarea) e a
  execução normal: navegação → editor focável e aceitando a primeira tecla ≤ 300 ms a mais que a
  linha de base; teclas digitadas **durante** a troca textarea → CodeMirror não se perdem e nenhuma
  espera mais de 50 ms; ≤ 50 ms por tecla num código de 10 000 caracteres (marcas de performance em
  volta de `keyboard.type`).
- [ ] T025 [P] XSS: `apps/web/test/student-portal-xss.test.tsx` varre também `components/ui/code` e as
  telas trocadas; código com `<script>`/HTML no editor e no `CodeBlock` como texto (`014/SC-003`).
- [ ] T026 [P] `014/SC-007`: comparar o "First Load JS" do `next build` das rotas sem código antes e
  depois (sem aumento) e registrar o resultado em `specs/014-code-syntax-highlighting/research.md`
  (L12); a regra ESLint do T002 impede o retrocesso, e o caso dela em
  `apps/web/test/lint-boundaries.test.ts` leva o título `014/SC-007` (o teste que a rastreabilidade
  encontra).
- [ ] T027 Acrescentar a 014 ao `SPECS` de `apps/api/test/traceability.spec.ts` (4 histórias, cenários
  da spec, `successCriteria` SC-001–SC-007). Cada id já tem o seu teste nas tarefas: SC-001, SC-002 e
  SC-006 no E2E (T024), SC-003 no T025, SC-004 no T024, SC-005 no T008, SC-007 no T002/T026; esta
  tarefa só confere que o guard passa sem título novo.
- [ ] T028 [P] Documentação: `CLAUDE.md` da raiz (014 no estado do projeto, research L1–L14, regras:
  realce só por tokens, gramática como dado do catálogo, CodeMirror só por `load-*.ts`, texto nunca
  alterado; em "Recent Changes", "eight `--syntax-*` tokens" no lugar de "nine", e o mesmo
  ajuste em `plan.md` e em research L5), `apps/api/CLAUDE.md` (`highlight` nos selects de linguagem e nas allowlists),
  `README.md`.
- [ ] T029 Rodar o `quickstart.md` à mão (celular e desktop, tema claro e escuro, alto contraste) e
  revisar `spec.md` × implementação.
- [ ] T030 `pnpm lint && pnpm check-types && pnpm build && pnpm test` e `pnpm --filter web test:e2e`
  verdes.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende do Setup; bloqueia as histórias. T007 depende de T005 e T006;
  T010 depende de T001 e T009.
- **US1 (Phase 3)**: depende da Foundational.
- **US2 (Phase 4)**: depende da Foundational (T010); independe da US1.
- **US3 (Phase 5)**: depende da US1 (o `CodeEditor`).
- **US4 (Phase 6)**: depende da US1 e da US2 (os dois componentes).
- **Polish (Phase 7)**: depende das histórias desejadas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação na ordem das tarefas.
- `code-editor.tsx` é tocado por T013 (e consumido por T021); `answers.tsx` só por T013;
  `exercise-form.tsx`, `draft-editor.tsx` e `work-question-card.tsx` só por T021: sem conflito.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo com T001.
- Foundational: T004, T006, T008 e T009 em paralelo; T005 depois de T004; T007 depois de T005 e T006;
  T010 depois de T009.
- US1: T011 e T012 em paralelo.
- US2 em paralelo com a US1 (outros arquivos); T015 e T016 em paralelo.
- US3: T020 em paralelo com T019.
- US4: T022 e T023 em paralelo.
- Polish: T024–T026 e T028 em paralelo.

## Parallel Example: Foundational

```text
Task: "T004 014-highlight.spec.ts"   Task: "T006 contracts highlight"
Task: "T008 syntax tokens"           Task: "T009 code-pieces.test.ts"
# depois
Task: "T005 migration"  →  Task: "T007 API views"      Task: "T010 grammars/highlighter/theme/loader"
```

## Parallel Example: User Stories 1 and 2

```text
Task: "T011 code-editor.test.tsx"    Task: "T012 answering screen tests"
Task: "T015 code-block.test.tsx"     Task: "T016 reading screens tests"
```

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1 + Phase 2.
2. Phase 3 (US1): o aluno responde com cores.
3. **Parar e validar**: tela de responder, autosave, offline, entrega e conclusão como antes.

### Incremental Delivery

1. Foundational → US1 (MVP) → US2 (leitura) → US3 (banco) → US4 (vitrine e acessibilidade) → Polish.
2. Cada história é testável sozinha; a US2 pode ir junto com a US1.
