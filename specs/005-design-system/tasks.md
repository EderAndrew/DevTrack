---

description: "Task list for 005 — Design System e Identidade Visual (Fundação de UI/UX)"
---

# Tasks: 005 — Design System e Identidade Visual (Fundação de UI/UX)

**Input**: Design documents from `/specs/005-design-system/`
**Prerequisites**: plan.md, spec.md, research.md (V1–V20), data-model.md, contracts/
(tokens, components, layouts, exam-mode), quickstart.md

**Tests**: obrigatórios (Constituição VII; SC-001 – SC-006, SC-010). Os testes de cada
história são escritos antes da implementação e falham antes dela. Títulos de
`describe`/`it` levam o id da spec 005 com prefixo (`005/US2-3`, `005/FR-033`,
`005/SC-002`), que `apps/api/test/traceability.spec.ts` passa a procurar na fase final.
Nenhum teste existente muda de expectativa de comportamento (FR-036): textos, rotas,
nomes acessíveis e ordem de foco continuam os mesmos. Cada fase termina com
`pnpm lint && pnpm check-types && pnpm test` verde (as fases 2 e 3 são a exceção
documentada abaixo).

**Organization**: tarefas agrupadas por user story, na ordem das dependências reais.
A Foundational troca os tokens e zera as escalas padrão do Tailwind (research V2), o que
deixa classes antigas sem efeito até a migração; por isso US7 (a guarda que aponta cada
classe fora do padrão) vem logo depois, e US1 (migração das telas) zera a lista. A partir
daí US2 (componentes), US3 (AppShell), US5 (aluno), US4 (catálogo e documentação) e US6
(contrato do modo avaliação) são incrementos independentes.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: pode rodar em paralelo (arquivos diferentes, sem dependência pendente)
- **[Story]**: user story da tarefa (US1…US7)
- Caminhos relativos à raiz do repositório; o web é `apps/web`

---

## Phase 1: Setup (infraestrutura compartilhada)

**Purpose**: arquivos de fonte, pastas e o utilitário de varredura das guardas.

- [X] T001 Copiar as fontes variáveis (subconjuntos latin e latin-ext, peso variável, estilo normal) dos pacotes npm `@fontsource-variable/inter` e `@fontsource-variable/jetbrains-mono` (baixados com `npm pack`, sem virar dependência) para `apps/web/app/fonts/`: `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2`, `jetbrains-mono-latin-wght-normal.woff2`, `jetbrains-mono-latin-ext-wght-normal.woff2`, e o texto da licença em `apps/web/app/fonts/OFL.txt` (research V5)
- [X] T002 [P] Criar `apps/web/design-system/` com `README.md` (títulos: Princípios, Cores e a regra 80/15/5, Regras contra UI genérica, Arquitetura em camadas, Como usar), `tokens.md`, `components.md`, `layouts.md` e `exceptions.md` (tabela vazia com colunas Arquivo, Trecho, Motivo), só com títulos por enquanto (research V19)
- [X] T003 [P] Criar `apps/web/test/design-system/scan.ts`: lista os arquivos `.ts`/`.tsx` de `apps/web/app`, `apps/web/features` e `apps/web/components` (fora `*.test.*`), devolve linhas com número e o texto sem comentários de bloco, e lê os marcadores `ds-exception: <motivo>` da linha e da linha anterior (base de T009, T010 e T044)

---

## Phase 2: Foundational (pré-requisitos bloqueantes)

**Purpose**: a fonte única de tokens, as fontes novas e o teste de contraste. Ao fim desta
fase o app compila, mas classes da escala padrão do Tailwind (`text-sm`, `rounded-xl`,
`shadow-lg`, cores da paleta) deixam de gerar CSS; as fases 3 e 4 as migram.

- [X] T004 Reescrever `apps/web/test/contrast.test.ts` (título `005/SC-002 005/US1-2 contraste AA dos tokens do tema %s`, mantendo `002/US3-3 002/US3-4` no título) para ler `apps/web/design-system/tokens.css`, extrair o tema claro (`:root`), o escuro (`@media (prefers-color-scheme: dark)`) e conferir que `:root[data-theme="dark"]` repete o escuro; medir todos os pares de `specs/005-design-system/contracts/tokens.md` (texto 4,5; `--success`, `--warning`, `--danger`, `--info`, `--border-control` e `--ring` 3) e resolver aliases (`--card: var(--surface)`) antes de medir. Deve falhar antes de T005
- [X] T005 Criar `apps/web/design-system/tokens.css` conforme `contracts/tokens.md`: cores do tema claro em `:root`, do escuro em `@media (prefers-color-scheme: dark) { :root {…} }` e `:root[data-theme="dark"]`, aliases do shadcn, e um bloco `@theme inline` que zera `--color-*`, `--text-*`, `--radius-*`, `--shadow-*`, `--font-*` e `--breakpoint-*` (`: initial`) e declara só os oficiais (pontos `sm`, `md`, `lg`, `xl`): cores (`--color-background`, `--color-surface`, `--color-foreground`, `--color-text-secondary`, `--color-primary`…, incluindo os aliases que o shadcn usa como utilitário), tipografia `--text-{display,h1,h2,h3,body,body-sm,label,caption,code}` com `--line-height` e `--font-weight`, `--font-sans`/`--font-mono`, `--radius-{sm,md,lg}`, `--shadow-{sm,md,overlay}`, `--breakpoint-{sm,md,lg,xl}`, `--icon-{sm,md,lg}`, e ainda `--z-*`, `--duration-*`, `--ease-standard`, `--focus-ring-*`, `--content-max`, `--reading-max`, `--gutter`; `@utility text-reading` (Body, altura 1,6, `max-width: var(--reading-max)`) (research V2–V8)
- [X] T006 Atualizar `apps/web/app/globals.css`: importar `../design-system/tokens.css` depois de `tailwindcss`, remover o `:root`, o tema escuro e o `@theme inline` antigos; no `@layer base`, `h1`–`h3` com `text-h1`–`text-h3`, `body` com `text-body`, `code, kbd, samp, pre` com `font-mono`, `:focus-visible` com `--focus-ring-width`/`--focus-ring-offset`/`--ring`, `.skip-link` com `z-index: calc(var(--z-tooltip) + 1)` e o bloco `prefers-reduced-motion` zerando as durações pelos tokens
- [X] T007 Atualizar `apps/web/app/layout.tsx`: `next/font/local` para a Inter (arquivos latin e latin-ext, `variable: "--font-inter"`, `display: "swap"`, `preload: true`, `adjustFontFallback: "Arial"`) e a JetBrains Mono (`variable: "--font-jetbrains-mono"`, `display: "swap"`, `preload: false`); `<body>` com as duas variáveis; apagar `apps/web/app/fonts/GeistVF.woff`; manter o comentário do shell e o link "Pular para o conteúdo"
- [X] T008 Rodar `pnpm --filter web test -- test/contrast.test.ts` e `pnpm --filter web build`: contraste verde nos dois temas e build sem erro (as classes antigas sem efeito são esperadas até a Phase 4)

**Checkpoint**: tokens e fontes no lugar; T004 verde.

---

## Phase 3: User Story 7 - Novas telas não conseguem introduzir valores visuais arbitrários (Priority: P2, antecipada)

**Goal**: guarda automática contra valores fora dos tokens, ícones de outra biblioteca e
controles recriados (FR-033). Vem antes de US1 porque é a lista de migração.

**Independent Test**: spec.md US7 (Independent Test) e quickstart §2.

### Tests for User Story 7 ⚠️

- [X] T009 [P] [US7] Testes da heurística em `apps/web/test/design-system/token-usage.test.ts` (`005/US7-1`, `005/US7-3`, `005/FR-033`): a partir de trechos de exemplo, recusa cor literal (hex, `rgb()`, `hsl()`, `oklch()`), classe da paleta padrão (`bg-red-500`, `text-white`, `bg-black`), valor arbitrário de texto, espaçamento, raio, sombra, fonte ou cor (`text-[13px]`, `p-[7px]`, `rounded-[4px]`, `shadow-[…]`, `font-[…]`, `bg-[#…]`), escala padrão (`text-sm`, `text-2xl`, `rounded-xl`, `shadow-lg`), passo de espaçamento fora de research V7 (`gap-1.5`, `px-2.5`, `p-7`, `-mt-3.5`), `style={{ color … }}`/`fontSize`/`padding`, prefixo de ponto de quebra inexistente (`2xl:`, `max-sm:`, `min-[900px]:`; `sm:`/`md:`/`lg:`/`xl:` aceitos) e `size-*` fora de `size-4`/`size-5`/`size-6` em ícone Lucide (regra `valores`); e `<button`, `<select`, `<textarea`, `<input type="checkbox|radio"` e `<table` fora de `components/ui` (regra `controles`); aceita `min-h-11`, `size-5`, `top-[50%]`, `max-h-[90vh]`, `w-[calc(…)]` (tamanho e posição) e qualquer linha com `ds-exception: <motivo>` na própria linha ou na anterior; falha com `arquivo:linha` na mensagem
- [X] T010 [US7] Na mesma suíte, dois testes do repositório, um por regra — `valores` (`005/US1-1 005/SC-001 nenhum valor fora dos tokens em app, features e components`, lista de trabalho de US1) e `controles` (`005/US2-6 nenhum controle recriado fora de components/ui`, lista de trabalho de US2) — e o de sincronia (`005/US7-3 exceções do código = design-system/exceptions.md`); implementar as regras em `apps/web/test/design-system/scan.ts`. Os dois testes do repositório falham agora, listando cada ocorrência
- [X] T011 [P] [US7] Em `apps/web/test/lint-boundaries.test.ts`, casos `005/US7-2` para `import { FaBeer } from "react-icons/fa"`, `@heroicons/react/24/solid`, `@radix-ui/react-icons`, `@fortawesome/react-fontawesome`, `@tabler/icons-react` e `@phosphor-icons/react` (recusados) e `lucide-react` (permitido); casos `005/FR-035` para `@mui/material`, `@chakra-ui/react`, `@mantine/core`, `antd`, `@headlessui/react`, `react-bootstrap`, `@nextui-org/react` e `@heroui/react` (recusados)
- [X] T012 [P] [US7] Em `apps/web/test/lint-boundaries.test.ts`, casos `005/FR-034` das camadas: em `components/ui/a.tsx`, imports de `@/components/layout/app-shell`, `@/components/shared/field`, `@/features/x/components/y` e `@/app/x` recusados; em `components/layout/a.tsx`, `@/features/x/components/y` e `@/app/x` recusados e `@/components/ui/button` e `@/lib/navigation` permitidos

### Implementation for User Story 7

- [X] T013 [US7] Em `apps/web/eslint.config.js`: acrescentar ao grupo `STACK` do `no-restricted-imports` as bibliotecas de ícones de T011 ("Use Lucide (lucide-react), a biblioteca oficial de ícones (005/FR-012)") e as de UI paralela ("UI usa shadcn/ui sobre radix-ui (005/FR-035)"); e blocos por pasta para as camadas de T012 (`components/ui/**` e `components/layout/**`, mensagem "Camadas do Design System: tokens → ui → layout → features → app (005/FR-034)"), preservando os padrões que já valem nessas pastas; T009, T011 e T012 verdes (os testes do repositório de T010 continuam listando o que US1/US2 migram)

**Checkpoint**: a guarda existe e mostra a lista de migração.

---

## Phase 4: User Story 1 - Professor e aluno reconhecem uma identidade única em todas as telas (Priority: P1) 🎯 MVP

**Goal**: todas as telas existentes só com tokens oficiais, com a identidade nova e o
mesmo comportamento (FR-001 – FR-013, FR-036, FR-037).

**Independent Test**: spec.md US1 (Independent Test) e quickstart §4 e §7.

### Tests for User Story 1 ⚠️

- [X] T014 [P] [US1] `apps/web/test/design-system/identity.test.ts` (ambiente node, lendo `design-system/tokens.css`, `app/globals.css` e `app/layout.tsx`): `005/US1-3` o `:focus-visible` usa `--focus-ring-width`, `--focus-ring-offset` e `--ring`, e nenhuma regra remove `outline` sem alternativa; `005/US1-4` `font-mono` só em `code, kbd, samp, pre` do `@layer base` e em `components/ui` (varredura); `005/US1-5` `--font-sans` e `--font-mono` terminam em fontes de sistema e `layout.tsx` usa `display: "swap"`; `005/US1-6 005/SC-010` o bloco `prefers-reduced-motion` zera `--duration-*`, `transition` e `animation`

### Implementation for User Story 1

- [X] T015 [US1] Migrar a tipografia em `apps/web/app/**`, `apps/web/features/**/components/**` e `apps/web/components/shared/**` pela lista de T010: `text-xs` → `text-caption`, `text-sm` → `text-body-sm`, `text-base` → `text-body`, `text-lg`/`text-xl` → `text-h3`, `text-2xl` → `text-h2` ou `text-h1` conforme a hierarquia da tela, `text-4xl` → `text-display`; remover `font-bold`/`font-semibold` que a categoria já traz; títulos continuam no mesmo nível de cabeçalho
- [X] T016 [US1] Migrar espaçamento fora da escala de research V7 nos mesmos diretórios (frações e passos 7, 9, 11, 14…) para o passo oficial mais próximo, sem alterar tamanhos de alvo (`min-h-11`, `size-*`)
- [X] T017 [US1] Migrar em `apps/web/components/ui/**` os valores da lista de T010: `text-[0.8rem]`/`text-[0.9rem]`/`text-[1.1rem]` → tokens de texto, `rounded-[2px]`/`rounded-[4px]` → `rounded-sm`, `shadow-[0_0_0_1px_var(--sidebar-border)]` → `ring-1 ring-sidebar-border`, `bg-black/50` → `bg-overlay`, `text-white` → `text-primary-foreground`, escala padrão de raio e sombra → oficiais, espaçamento fora da escala → passo oficial; os `calc(var(--sidebar-width…))` e `var(--radix-…)` que são tamanho ou posição ficam; o que for fora da escala e necessário recebe `// ds-exception: <motivo>` e uma linha em `apps/web/design-system/exceptions.md`
- [X] T018 [US1] Rodar `pnpm --filter web test` e `pnpm --filter web test:e2e`: o teste `valores` de T010 verde (o `controles` continua listando os controles nativos que US2 migra), e todos os testes existentes verdes sem mudar expectativas

**Checkpoint**: MVP visual — todas as telas com a identidade nova, sem mudança de
comportamento.

---

## Phase 5: User Story 2 - Os mesmos significados têm sempre a mesma aparência nos componentes (Priority: P1)

**Goal**: componentes fundamentais com variantes e estados padronizados (FR-014 –
FR-021; contracts/components.md; research V10, V11).

**Independent Test**: spec.md US2 (Independent Test).

### Tests for User Story 2 ⚠️

- [X] T019 [P] [US2] `apps/web/components/ui/button.test.tsx`: `005/US2-1` variantes `primary` (e o alias `default`), `secondary`, `outline`, `ghost`, `danger` (e o alias `destructive`), `link`, tamanhos `sm`/`md`/`icon`, estado `loading` (`aria-busy`, desabilitado, um clique só dispara uma vez, rótulo mantido, spinner `aria-hidden`), desabilitado; `005/US2-2` `danger` com texto explícito e aparência distinta de `primary`; axe
- [X] T020 [P] [US2] `apps/web/components/ui/form-controls.test.tsx`: `Input`, `Textarea`, `NativeSelect`, `Checkbox`, `Radio` (grupo em `fieldset`/`legend`), `Switch` (`role="switch"`), `Label`, `FieldMessage`, `FormField`; estados desabilitado, erro e sucesso; `005/US2-3` erro com `aria-invalid`, `aria-describedby` apontando para a mensagem, ícone e texto; `selectOptions` e `.checked` funcionam nos nativos; axe e teclado
- [X] T021 [P] [US2] `apps/web/components/ui/feedback.test.tsx`: `005/US2-4` `Alert` `info`/`success`/`warning`/`danger` com ícone e título e o `role` certo; `Toast` anunciado, pausa com foco, erro fica até fechar; `Progress` com `aria-valuenow` e rótulo; `Spinner` com `role="status"` e texto; `EmptyState`; `Skeleton` em contêiner `aria-busy`; `005/US2-5` `Tooltip` aparece no foco e o botão só de ícone tem nome acessível; axe
- [X] T022 [P] [US2] `apps/web/components/ui/containers-data.test.tsx`: `Card`; `Dialog`/`AlertDialog` (foco preso e devolvido, ação `danger`); `Sheet`; `Popover` e `DropdownMenu` (Esc, setas, Home/End); `Table` com `density` e `scope`; `Pagination` com `aria-current="page"`; `Badge` e `Status` com texto (nunca só o ponto); `Tabs` com setas e `aria-selected`; `Breadcrumb` com `aria-current="page"` e sem link na página atual; axe (o `005/US2-6` é o teste `controles` de T010)

### Implementation for User Story 2

- [X] T023 [US2] `apps/web/components/ui/button.tsx`: variantes e tamanhos de contracts/components.md com `cva`, aliases `default` → `primary` e `destructive` → `danger`, propriedade `loading` (`disabled`, `aria-busy`, `LoaderCircle` `aria-hidden` com `motion-safe:animate-spin`); T019 verde
- [X] T024 [P] [US2] Campos em `apps/web/components/ui/`: ajustar `input.tsx` e `textarea.tsx` (borda `--border-control`, fundo `--surface`, estados, `data-state="success"`); criar `native-select.tsx` (select nativo + `ChevronDown`); reescrever `checkbox.tsx` como `<input type="checkbox">` nativo (`accent-color: var(--primary)`, 20 px, mesma API de rótulo) no lugar do Radix não usado; criar `radio.tsx` (nativo) e `switch.tsx` (Radix `Switch` do pacote `radix-ui`); T020 parcial
- [X] T025 [P] [US2] `apps/web/components/ui/label.tsx` (`text-label`, marca "obrigatório" em texto), `apps/web/components/ui/field-message.tsx` (descrição ou erro com `CircleAlert`) e `apps/web/components/ui/form-field.tsx` (rótulo, controle, descrição e mensagem ligados por `aria-describedby`/`aria-invalid`); refazer `apps/web/components/shared/field.tsx` sobre eles mantendo `Field`, `fieldHintId`, `fieldErrorId` e as props atuais; T020 verde
- [X] T026 [P] [US2] Feedback em `apps/web/components/ui/`: `alert.tsx` com as quatro variantes (ícone obrigatório, `--*-surface`, borda à esquerda, `role` por variante); `toast.tsx` (Radix Toast do `radix-ui`: `Toaster`, `useToast`, variantes, 5 s, erro persistente) montado em `apps/web/app/providers.tsx`; `spinner.tsx`; `empty-state.tsx`; ajustes de `progress.tsx`, `skeleton.tsx` (pulso só `motion-safe`) e `tooltip.tsx` (`--z-tooltip`); T021 verde
- [X] T027 [P] [US2] Contêineres e dados em `apps/web/components/ui/`: ajustar `card.tsx` (sem sombra padrão, `rounded-md`), `dialog.tsx`, `alert-dialog.tsx` e `sheet.tsx` (`bg-overlay`, `rounded-lg`, `shadow-overlay`, `--z-modal`); criar `popover.tsx`, `dropdown-menu.tsx` e `tabs.tsx` (Radix do `radix-ui`); `table.tsx` com `density` (`comfortable`/`compact`); criar `pagination.tsx`, `status.tsx` e `breadcrumb.tsx`; `badge.tsx` com `neutral`/`info`/`success`/`warning`/`danger`; T022 verde
- [X] T028 [US2] Migrar os controles nativos das features para os fundamentais, mantendo `id`, rótulos, nomes acessíveis e valores: `<select>` → `NativeSelect` em `features/class-calendar/components/topic-resolution-dialog.tsx`, `features/class-plan/components/{topic-actions,plan-syllabus-picker,topic-form-dialog,split-topic-dialog}.tsx`, `features/teachers/components/teachers-admin.tsx`, `features/subjects/components/link-class-dialog.tsx`; caixas e opções → `Checkbox`/`Radio` em `topic-actions.tsx`, `item-picker.tsx` e `topic-resolution-dialog.tsx`; remover as constantes `SELECT_CLASS` locais; o teste `controles` de T010 fica verde
- [X] T029 [US2] Alinhar os usos de variantes nas features aos nomes oficiais (`destructive` → `danger`, variantes de `Badge` e `Alert` pelo significado, `Notice` sobre `Alert` `info`), sem mudar textos; os dois testes do repositório de T010 verdes; `pnpm --filter web test` e `test:e2e` verdes

**Checkpoint**: componentes fundamentais completos; a guarda do repositório zerada.

---

## Phase 6: User Story 3 - Professor e administração trabalham num AppShell organizado (Priority: P1)

**Goal**: AppShell com menu lateral, `Topbar` e `PageHeader` em todas as telas internas
(FR-022, FR-023; contracts/layouts.md; research V12, V20).

**Independent Test**: spec.md US3 (Independent Test) e quickstart §4.

### Tests for User Story 3 ⚠️

- [X] T030 [P] [US3] `apps/web/components/layout/app-shell.test.tsx` (com `SidebarProvider`, `matchMedia` e `ResizeObserver` falsos como em `app-sidebar.test.tsx`): `005/US3-1` regiões `navigation` "Menu principal", `banner` com o nome da área e `main#conteudo`; `005/US3-2` item da área atual com `aria-current="page"` e estilo ativo; `005/US3-3` recolhido só com ícones e nomes acessíveis, escolha gravada no cookie `sidebar_state`; `005/US3-4` sem permissão a área não aparece; `005/US3-5` nenhum item de área futura (exercícios, avaliações, banco de questões, resultados); `005/US3-6` com `matchMedia` de tela estreita o menu abre como painel (`Sheet`); axe
- [X] T031 [P] [US3] `apps/web/components/layout/page-header.test.tsx` e `topbar.test.tsx`: `PageHeader` com `<h1>` (`text-h1`), trilha opcional (`nav` "Trilha", página atual sem link), descrição e ações; `Topbar` com o botão do menu (nome acessível) e o nome da área pela rota (`/turmas/abc/planejamento` → "Turmas"); axe e ordem de foco

### Implementation for User Story 3

- [X] T032 [US3] `apps/web/lib/navigation.ts`: `AREAS` (prefixo de rota → nome da área: `/disciplinas` "Minhas disciplinas", `/turmas` "Turmas", `/professores` "Professores", `/admin/managers` "Gestores", `/admin/usuarios` "Usuários", `/conta` "Minha conta", `/minhas-turmas` "Minhas turmas"), `areaFor(pathname)` e `STAFF_AREA_PERMISSIONS` (`disciplinas.visualizar`, `turmas.visualizar` e as permissões de `USER_AREAS`)
- [X] T033 [P] [US3] `apps/web/components/layout/topbar.tsx` (`SidebarTrigger` + nome da área via `usePathname`/`areaFor`, `sticky`, `--z-sticky`) e `apps/web/components/layout/page-header.tsx` (props `title`, `breadcrumb?`, `description?`, `actions?`, usando `components/ui/breadcrumb`); T031 verde
- [X] T034 [US3] `apps/web/components/layout/app-shell.tsx` (compõe `SidebarProvider` com `defaultOpen` do cookie, `AppSidebar`, `SidebarInset` com `Topbar` e `<main id="conteudo" tabIndex={-1}>` com `--gutter` e `--content-max`), `app/(app)/layout.tsx` passa a usá-lo; `components/shared/app-sidebar.tsx` com item ativo `bg-sidebar-accent text-sidebar-accent-foreground` (tokens `--primary-subtle`/`--primary-strong`); T030 verde
- [X] T035 [US3] Trocar o `<h1>` próprio pelo `PageHeader` (mesmo texto; trilha nas páginas de detalhe, ex.: "Turmas › ADS3"; ações de cabeçalho no `actions`) em todas as páginas e componentes de página de `apps/web/app/(app)/**` e em `apps/web/features/classes/components/class-details.tsx` (cabeçalho da turma com as abas); `(auth)` e `(public)` mantêm a moldura, com `PageHeader` onde houver título
- [X] T036 [US3] Rodar `pnpm --filter web test` e `pnpm --filter web test:e2e`: testes de páginas e jornadas verdes sem mudar expectativas (títulos continuam acessíveis pelo mesmo nome)

**Checkpoint**: telas internas no AppShell.

---

## Phase 7: User Story 5 - O aluno usa um ambiente simples e focado (Priority: P2)

**Goal**: layout do aluno em "Minhas turmas" e escolha do layout das telas de conta pelas
permissões do menu (FR-024; research V13).

**Independent Test**: spec.md US5 (Independent Test) e quickstart §5.

### Tests for User Story 5 ⚠️

- [X] T037 [P] [US5] `apps/web/components/layout/student-layout.test.tsx`: `005/US5-1` `banner` com a marca, `nav` "Menu do aluno" com "Minhas turmas" e "Meu perfil" (`aria-current` na atual) e "Sair", `main#conteudo`; nenhum item de professor ou administração nem menu lateral; axe e teclado
- [X] T038 [P] [US5] `apps/web/components/layout/account-layout.test.ts`: `005/US5-2 005/US5-3` a função pura `accountLayoutFor(me)` devolve `"app-shell"` com qualquer permissão de `STAFF_AREA_PERMISSIONS` (professor, gestor, administrador, professor que também é aluno) e `"student"` para quem só tem permissões de aluno ou e-mail não verificado

### Implementation for User Story 5

- [X] T039 [US5] `apps/web/components/layout/student-layout.tsx` (barra superior com a marca, navegação do aluno, `LogoutButton`, conteúdo até `--reading-max`/960 px) e `apps/web/components/layout/account-layout.ts` (`accountLayoutFor`); T037 e T038 verdes
- [X] T040 [US5] Mover `apps/web/app/(app)/minhas-turmas/` para `apps/web/app/(student)/minhas-turmas/` com `apps/web/app/(student)/layout.tsx` (`StudentLayout`, lendo `getMeForNavigation()`), e `apps/web/app/(app)/conta/` para `apps/web/app/(account)/conta/` com `apps/web/app/(account)/layout.tsx` (escolhe `AppShell` ou `StudentLayout` por `accountLayoutFor`); URLs e `proxy.ts` inalterados; `PageHeader` nessas páginas
- [X] T041 [US5] Rodar `pnpm --filter web test` e `pnpm --filter web test:e2e` (jornadas de aluno e troca de conta verdes)

**Checkpoint**: aluno no layout próprio.

---

## Phase 8: User Story 4 - A equipe valida o Design System num catálogo e numa documentação (Priority: P2)

**Goal**: catálogo `/design-system` fora de produção e documentação completa (FR-031,
FR-032; research V14, V19).

**Independent Test**: spec.md US4 (Independent Test) e quickstart §3 e §6.

### Tests for User Story 4 ⚠️

- [X] T042 [P] [US4] `apps/web/features/design-system/components/catalog.test.tsx`: `005/US4-1 005/SC-005` cada entrada de `registry.ts` aparece com seu nome e mostruário, e o registro tem todos os componentes de contracts/components.md e os layouts `AppShell` e `StudentLayout`; `005/US4-2` cada mostruário declara e renderiza variantes e estados (incluindo erro, carregando e desabilitado quando se aplicam) e há uma faixa de 768 px; `005/SC-003 005/SC-004` axe sem violações e todos os controles alcançáveis por Tab com foco visível
- [X] T043 [P] [US4] `apps/web/app/(catalog)/design-system/page.test.tsx`: `005/US4-4` com `NODE_ENV=production` a página chama `notFound()`; em desenvolvimento renderiza o índice por grupo
- [X] T044 [P] [US4] `apps/web/test/design-system/docs.test.ts`: `005/US4-3 005/FR-032` `README.md` tem as seções de T002; `tokens.md` cita cada token de `tokens.css`; cada entrada do registro tem seção com o mesmo nome em `components.md` ou `layouts.md`, com os subtítulos "Variantes", "Estados", "Quando usar", "Quando não usar", "Exemplo" e "Acessibilidade"

### Implementation for User Story 4

- [X] T045 [US4] `apps/web/features/design-system/registry.ts` (tipo `CatalogEntry`: `id`, `name`, `group`, `source`, `showcase`, `variants`, `states`) e os mostruários em `apps/web/features/design-system/components/`: `actions-showcase.tsx`, `forms-showcase.tsx`, `feedback-showcase.tsx`, `containers-showcase.tsx`, `data-showcase.tsx`, `navigation-showcase.tsx`, `layouts-showcase.tsx` (AppShell e StudentLayout em moldura reduzida com dados fixos) e `tablet-frame.tsx` (768 px); T042 verde
- [X] T046 [US4] `apps/web/app/(catalog)/layout.tsx` (moldura simples com `main#conteudo`) e `apps/web/app/(catalog)/design-system/page.tsx` (`notFound()` em produção, índice por grupo com âncoras, mostruários do registro); nada no `proxy.ts`; T043 verde
- [X] T047 [US4] Escrever a documentação em `apps/web/design-system/`: `README.md` (princípios da spec, regra 80/15/5, regras contra UI genérica, camadas tokens → ui → layout → features → app, como usar), `tokens.md` (cada token, valor claro/escuro e uso permitido, incluindo pontos de quebra e tamanhos de ícone), `components.md` e `layouts.md` (seção por entrada do registro com os subtítulos de T044) e `exceptions.md` (igual às exceções do código); T044 e T010 (sincronia) verdes

**Checkpoint**: catálogo e documentação completos.

---

## Phase 9: User Story 6 - As features de avaliação recebem o contrato visual do modo avaliação (Priority: P2)

**Goal**: contrato visual publicado e verificado, sem componentes (FR-025 – FR-030;
research V15).

**Independent Test**: spec.md US6 (Independent Test).

### Tests for User Story 6 ⚠️

- [X] T048 [US6] Em `apps/web/test/design-system/docs.test.ts`, para `apps/web/design-system/exam-mode.md`: `005/US6-1` seção "Layout" com as regiões e a ordem de prioridade; `005/US6-2 005/FR-027` tabela de estados com as seis linhas (atual, não respondida, respondida, marcada para revisão, bloqueada, invalidada) e as colunas Cor, Forma, Ícone, Texto visível e Anúncio preenchidas; `005/US6-3 005/FR-028` tabela do `SaveStatus` com salvando, salvo e erro ao salvar; `005/US6-4 005/FR-029` tabela de avisos com as seis situações e as colunas Registro e O que fazer; `005/US6-5` seção do `CodeAnswer` com enunciado, editor, saída, erros e resultado; `005/US6-6 005/FR-030` seção "Atualizações frequentes"; `005/FR-026 005/SC-007` uma seção por componente de FR-026; todo `--token` citado existe em `tokens.css` e todo ícone citado é export de `lucide-react`

### Implementation for User Story 6

- [X] T049 [US6] Publicar `specs/005-design-system/contracts/exam-mode.md` em `apps/web/design-system/exam-mode.md` (mesmo conteúdo; links relativos apontando para `tokens.md` e `components.md` da pasta) e citá-lo no `README.md`; T048 verde

**Checkpoint**: contrato do modo avaliação pronto para a feature de avaliações.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T050 [P] `apps/api/test/traceability.spec.ts`: acrescentar a 005 a `SPECS` (`path: "specs/005-design-system/spec.md"`, `stories: 7`, `scenarios: 34`, `rows: 26`, `rowsWithoutIds: []`, `successCriteria` com SC-001 – SC-005 e SC-010; SC-006 é a suíte inteira, SC-007 e SC-009 por revisão, SC-008 medido no quickstart §4) e ajustar os títulos que faltarem
- [ ] T051 [P] `DEPENDENCIES.md`: seção de fontes (Inter e JetBrains Mono, SIL OFL 1.1, origem Fontsource, arquivos em `apps/web/app/fonts`, sem dependência npm); remover a menção à Geist se houver
- [ ] T052 [P] `CLAUDE.md`: estado do projeto com a 005; em Architecture, os tokens em `apps/web/design-system/tokens.css` (escalas padrão do Tailwind zeradas), a documentação e o catálogo `/design-system`, `components/layout` (AppShell, `Topbar`, `PageHeader`, `StudentLayout`, escolha de layout de conta), e as guardas `token-usage`, `docs`, `identity` e o contraste nos dois temas; em "Rules that are easy to get wrong", "UI só com tokens e componentes do Design System; exceção só com `ds-exception` listada em `exceptions.md`"
- [ ] T053 Percorrer `specs/005-design-system/quickstart.md` §1–§7 (inclusive tema escuro, zoom de 200%, 768 px, movimento reduzido e a verificação do SC-008 com a fonte bloqueada em §4) e corrigir o que aparecer
- [ ] T054 Rodar `pnpm lint && pnpm check-types && pnpm build && pnpm test` e `pnpm --filter web test:e2e`; tudo verde

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sem dependências.
- **Foundational (Phase 2)**: depende de T001 (fontes); bloqueia tudo.
- **US7 (Phase 3)**: depende da Foundational e de T003; gera a lista de migração.
- **US1 (Phase 4)**: depende de US7 (lista de T010); fecha o MVP visual.
- **US2 (Phase 5)**: depende de US1 (T017 já ajustou os tokens dos componentes `ui`).
- **US3 (Phase 6)**: depende de US2 (`Breadcrumb`, `Sheet`, variantes).
- **US5 (Phase 7)**: depende de US3 (`PageHeader`, `STAFF_AREA_PERMISSIONS`, `AppShell` para a conta).
- **US4 (Phase 8)**: depende de US2, US3 e US5 (mostra componentes e layouts prontos).
- **US6 (Phase 9)**: depende só da Foundational (tokens) e de T044 (arquivo de testes de documentação); pode correr em paralelo a US2–US5.
- **Polish (Phase 10)**: depois de todas.

### Within Each User Story

- Testes primeiro, falhando; depois a implementação; fecha com a suíte do web verde.
- Migrações (T015 – T017, T028, T029, T035, T040) não mudam textos, rotas, nomes
  acessíveis nem ordem de foco.

### Parallel Opportunities

- Setup: T002 e T003 em paralelo com T001.
- US7: T009, T011 e T012.
- US2: testes T019 – T022 juntos; implementações T024 – T027 em arquivos diferentes.
- US3: T030 e T031; T033 em paralelo a T032.
- US5: T037 e T038.
- US4: T042 – T044.
- US6 inteira em paralelo a US2 – US5.
- Polish: T050 – T052.

---

## Parallel Example: User Story 2

```bash
# Testes juntos (arquivos diferentes):
Task: "T019 button.test.tsx"
Task: "T020 form-controls.test.tsx"
Task: "T021 feedback.test.tsx"
Task: "T022 containers-data.test.tsx"

# Depois, implementações independentes:
Task: "T024 campos (input, textarea, native-select, checkbox, radio, switch)"
Task: "T025 label, field-message, form-field, shared/field"
Task: "T026 alert, toast, spinner, empty-state, progress, skeleton, tooltip"
Task: "T027 card, dialog, alert-dialog, sheet, popover, dropdown-menu, tabs, table, pagination, status, breadcrumb, badge"
```

---

## Implementation Strategy

### MVP First (Foundational → US7 → US1)

1. Setup e Foundational: tokens e fontes.
2. US7: a guarda e a lista de migração.
3. US1: todas as telas com a identidade nova, mesmo comportamento.
4. **Parar e validar** com o quickstart §1, §2, §4 e §7.

### Incremental Delivery

1. MVP → US2 (componentes) → US3 (AppShell) → US5 (aluno) → US4 (catálogo e
   documentação), cada uma validada pela seção correspondente do quickstart.
2. US6 (contrato do modo avaliação) a qualquer momento depois da Foundational.
3. Polish: rastreabilidade, dependências, `CLAUDE.md`, quickstart e a suíte completa.

---

## Notes

- **[P]**: arquivos diferentes, sem dependência pendente.
- Nomes de teste com o id da 005 (`005/USn-k`, `005/FR-…`, `005/SC-…`).
- Nenhuma dependência npm nova; nenhuma mudança na API, no banco ou em `packages/contracts`.
- Nenhum componente do modo avaliação é implementado nesta feature (Clarifications Q1).
- Commit ao fim de cada fase, só quando o usuário pedir.
