# Research: 005 — Design System e Identidade Visual

Decisões técnicas da feature (V1–V20). Base: fases 001 (R1–R23), 002 (S1–S19), 003
(D1–D16) e 004 (E1–E23), e a constituição v3.0.0 (stack oficial do frontend: Tailwind CSS,
shadcn/ui, Lucide). Nenhuma dependência npm nova; entram só dois arquivos de fonte (V5).

## Estado atual (levantamento)

- `apps/web/app/globals.css` concentra os tokens: variáveis em `:root` e no tema escuro
  (`prefers-color-scheme: dark`), expostas ao Tailwind 4 por `@theme inline`; estilos base
  de `h1`–`h3`, `p`, listas, links, foco (`:focus-visible` com contorno de 3 px) e
  `prefers-reduced-motion`. `test/contrast.test.ts` mede os pares de cores nos dois temas.
- Fonte Geist (`app/fonts/GeistVF.woff`, `next/font/local`). Nenhuma fonte monoespaçada.
- 18 componentes shadcn em `components/ui` (button, input, textarea, select, checkbox,
  badge, card, alert, table, dialog, alert-dialog, sheet, tooltip, skeleton, progress,
  sidebar, calendar, collapsible, label, separator) e 11 em `components/shared` (menu
  lateral, cabeçalho público, campo com erro, resumo de erros, aviso etc.). O pacote
  `radix-ui` 1.6 já instalado traz popover, dropdown-menu, radio-group, switch, tabs e
  toast.
- Lucide é a única biblioteca de ícones (24 arquivos). Nenhuma cor hexadecimal em
  componentes; 17 arquivos com valores arbitrários do Tailwind (quase todos dentro do
  shadcn: posição, `calc` do menu lateral, `text-[0.8rem]`, `rounded-[2px]`,
  `shadow-[0_0_0_1px_…]`), `bg-black` nos fundos de diálogo e `text-white` num lugar.
- Tamanhos de texto pela escala padrão do Tailwind (`text-xs` a `text-4xl`, 53 usos).
- Controles nativos fora dos componentes: 8 `<select>` em 7 arquivos, 2 caixas de seleção
  e 1 grupo de opções (planejamento, calendário, professores, disciplinas); 11 testes usam
  `userEvent.selectOptions`, que exige `<select>` nativo.
- Rotas autenticadas num único grupo `app/(app)` com o menu lateral e sem barra superior;
  `(auth)` sem moldura e `(public)` com o cabeçalho do site. 20 páginas com `<h1>` próprio.

## V1. Onde ficam os tokens e a documentação

- **Decision**: os tokens saem do `globals.css` para `apps/web/design-system/tokens.css`,
  importado pelo `globals.css` antes do `@theme`. A documentação fica em
  `apps/web/design-system/` (`README.md` com princípios e regras, `tokens.md`,
  `components.md`, `layouts.md`, `exam-mode.md`, `exceptions.md`). Componentes
  fundamentais continuam em `components/ui` (constituição: "Componentes shadcn ficam em
  `apps/web/components/ui`"); layouts e navegação em `components/layout`; o catálogo é uma
  feature, `features/design-system`, com a rota em `app/(catalog)/design-system`.
- **Rationale**: um único arquivo de tokens é a "definição centralizada" (FR-001) e o
  que os testes de contraste e de uso leem; a pasta `design-system/` junta tokens e
  documentação sem mexer na organização por feature (FR-034, "preservar a arquitetura").
- **Alternatives considered**: pacote `packages/ui` (removido pela transição da 002 e sem
  segundo consumidor); tokens em TypeScript gerando CSS (build extra sem ganho: o Tailwind
  4 já lê variáveis CSS).

## V2. Tokens no Tailwind 4: só os oficiais geram utilitários

- **Decision**: no `@theme` do `tokens.css`, zerar as escalas padrão que o Design System
  substitui — `--color-*: initial`, `--text-*: initial`, `--radius-*: initial`,
  `--shadow-*: initial`, `--font-*: initial` — e declarar só os tokens oficiais (V3, V6,
  V8). Assim `bg-red-500`, `text-2xl`, `rounded-xl` ou `shadow-lg` não geram CSS. O
  espaçamento mantém a unidade de 4 px (`--spacing: 0.25rem`), e a escala permitida é
  imposta pela guarda (V9), porque zerá-la quebraria utilitários de tamanho e posição.
- **Rationale**: o Tailwind 4 configura tudo por variáveis CSS; remover as escalas padrão
  torna o valor arbitrário impossível de "funcionar por acaso". Como uma classe inexistente
  falha em silêncio, a guarda de V9 aponta o arquivo e a linha.
- **Alternatives considered**: manter as escalas e só varrer o código (deixa passar
  qualquer classe da escala padrão que a varredura não conheça); plugin do Tailwind
  (dependência e configuração JS que o Tailwind 4 dispensa).

## V3. Paleta semântica e variantes acessíveis

- **Decision**: tokens semânticos com os valores do usuário como base e variantes
  acessíveis onde o uso exige (contraste medido sobre fundo `#F8FAFC` e superfície
  `#FFFFFF`):

  | Token | Claro | Uso | Contraste |
  |-------|-------|-----|-----------|
  | `--background` | `#F8FAFC` | fundo da página | — |
  | `--surface` | `#FFFFFF` | cartões, painéis, diálogos, campos | — |
  | `--foreground` | `#0F172A` | texto principal | 17,1 / 17,9 |
  | `--text-secondary` | `#64748B` | texto de apoio | 4,55 / 4,76 |
  | `--primary` | `#2563EB` | ação principal, seleção, progresso | 4,94 / 5,17; branco sobre ele 5,17 |
  | `--primary-hover` | `#1D4ED8` | passar o mouse / pressionado | branco 6,70 |
  | `--primary-strong` | `#172554` | identidade (marca, item ativo do menu) | 14,0 |
  | `--border` | `#E2E8F0` | divisórias decorativas | 1,2 (decorativo) |
  | `--border-control` | `#64748B` | contorno de campos e controles | 4,55 (≥ 3:1) |
  | `--ring` | `#2563EB` | contorno de foco | 4,94 (≥ 3:1) |
  | `--success` / `--success-text` / `--success-surface` | `#16A34A` / `#15803D` / `#F0FDF4` | ícones e bordas / texto / fundo de aviso | 3,15 / 4,79 / texto sobre fundo 4,79 |
  | `--warning` / `--warning-text` / `--warning-surface` | `#D97706` / `#B45309` / `#FFFBEB` | idem | 3,04 / 4,80 / 4,84 |
  | `--danger` / `--danger-text` / `--danger-surface` | `#DC2626` / `#B91C1C` / `#FEF2F2` | ação de perigo, ícones / texto / fundo | 4,62 (branco 4,83) / 6,18 / 5,91 |
  | `--info` / `--info-text` / `--info-surface` | `#0284C7` / `#0369A1` / `#F0F9FF` | idem | 3,91 / 5,67 / 5,57 |
  | `--disabled-bg` / `--disabled-fg` / `--disabled-border` | `#F1F5F9` / `#64748B` / `#CBD5E1` | controles desabilitados | 4,34 (WCAG isenta controles inativos) |
  | `--overlay` | `#0F172A` a 50% | fundo de diálogos e painéis | — |

  Os nomes que o shadcn usa (`--card`, `--popover`, `--muted`, `--muted-foreground`,
  `--accent`, `--secondary`, `--input`, `--destructive`, `--sidebar-*`) passam a apontar
  para esses tokens, para os componentes existentes continuarem funcionando. A cor
  semântica "cheia" (`--success`, `--warning`, `--info`) só é usada em ícones, bordas e
  elementos gráficos (≥ 3:1); texto usa sempre a variante `-text`.
- **Rationale**: FR-002 pede os valores do usuário; FR-003 e a constituição exigem AA. A
  medição mostrou que sucesso (3,3:1), atenção (3,2:1) e informação (4,1:1) não servem como
  texto, e a borda `#E2E8F0` (1,2:1) não delimita um campo.
- **Alternatives considered**: escurecer os valores base (troca a identidade pedida);
  texto branco sobre sucesso/atenção (3,3:1 e 3,2:1, abaixo de AA).

## V4. Tema escuro mantido

- **Decision**: o tema escuro por `prefers-color-scheme` continua, só com valores de
  tokens: fundo `#0B1120`, superfície `#111827`, texto `#E2E8F0` (15,3), secundário
  `#94A3B8` (7,3), principal `#60A5FA` (7,4; texto `#0B1120` sobre ele 7,4), sucesso
  `#4ADE80`, atenção `#FBBF24`, perigo `#F87171` (texto escuro sobre ele 6,8), informação
  `#38BDF8`, borda decorativa `#334155`, borda de controle `#7C8AA0` (5,4). Um bloco
  `:root[data-theme="dark"]` repete os valores, deixando um seletor manual futuro sem
  mudança de componente (FR-013).
- **Rationale**: a 002 entregou o tema escuro com teste de contraste (`002/US3-4`);
  removê-lo seria regressão. Temas são só troca de valores (FR-013).
- **Alternatives considered**: só tema claro nesta feature (quebra `002/US3-4` e a
  preferência do usuário).

## V5. Fontes Inter e JetBrains Mono

- **Decision**: arquivos variáveis `woff2` só do subconjunto latino (latin + latin-ext:
  cobre o português), copiados uma vez para `apps/web/app/fonts/` a partir dos pacotes
  Fontsource (licença SIL OFL 1.1, com `OFL.txt` ao lado), e carregados por
  `next/font/local` com `display: "swap"`, `adjustFontFallback` e variáveis `--font-inter` e
  `--font-jetbrains-mono`. Fontes substitutas: `system-ui, -apple-system, "Segoe UI",
  Roboto, Arial, sans-serif` e `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`.
  `GeistVF.woff` sai. Só a Inter é pré-carregada; a monoespaçada carrega quando usada.
- **Rationale**: servidas pelo próprio sistema (sem terceiros em tempo de execução, sem
  rede no build, como a Geist hoje); `swap` + métrica ajustada atendem SC-008 sem salto de
  layout perceptível; subconjunto latino mantém cada arquivo pequeno.
- **Alternatives considered**: `next/font/google` (baixa no build, exige rede no CI e em
  builds locais); pacotes `@fontsource-variable/*` como dependência (dependência de runtime
  para dois arquivos estáticos); fonte completa (várias vezes maior, sem ganho para pt-BR).

## V6. Escala tipográfica

- **Decision**: tokens `--text-{display,h1,h2,h3,body,body-sm,label,caption,code}` com
  tamanho, altura de linha e peso (`--text-h1--line-height`, `--text-h1--font-weight`):
  Display 32/40/700, H1 28/36/700, H2 22/30/600, H3 18/26/600, Body 16/24/400, Body Small
  14/20/400, Label 13/18/500, Caption 12/16/400, Code 14/22/400 (monoespaçada). Utilitário
  `text-reading` para textos longos e enunciados: Body com altura de linha 1,6 e largura
  máxima de 72 caracteres. `h1`–`h3` do `@layer base` usam H1–H3. O `text-sm`,
  `text-xs`, `text-lg` etc. atuais são migrados (V2 os remove).
- **Rationale**: FR-006; a combinação de tamanho e peso num único utilitário evita pares
  soltos (`text-lg font-bold`) que divergem entre telas.
- **Alternatives considered**: manter a escala do Tailwind e documentar a equivalência
  (não impede `text-2xl`).

## V7. Espaçamento

- **Decision**: a unidade de 4 px do Tailwind fica; os passos permitidos em
  `p*`, `m*`, `gap*` e `space-*` são 0, 1, 2, 3, 4, 5, 6, 8, 10, 12 e 16 (0 a 64 px), mais
  `px` (1 px) para ajustes de borda. Frações (`gap-1.5`, `px-2.5`, `py-0.5`) e passos
  fora da escala (7, 9, 11, 14…) são recusados pela guarda. Tamanhos (`w`, `h`, `min-h`,
  `size`) não são espaçamento e mantêm a unidade (ex.: `min-h-11` = alvo de 44 px). O
  shadcn existente é ajustado para a escala.
- **Rationale**: FR-007 (múltiplos de 4 da lista do usuário).

## V8. Raios, sombras, camadas, pontos de quebra, movimento e foco

- **Decision**:
  - Raios: `--radius-sm` 6 px, `--radius-md` 8 px, `--radius-lg` 12 px; `rounded-full`
    permitido só para formas circulares (indicadores, avatares).
  - Sombras: `--shadow-sm` (`0 1px 2px` de `#0F172A` a 6%), `--shadow-md` (`0 4px 12px` a
    8%), `--shadow-overlay` (`0 12px 32px` a 16%, diálogos e menus). Nenhuma outra.
  - Camadas (`--z-*`): base 0, sticky 10, dropdown 20, overlay 30, modal 40, toast 50,
    tooltip 60; `skip-link` usa tooltip + 1.
  - Pontos de quebra: `--breakpoint-sm` 640 (celular grande), `--breakpoint-md` 768
    (tablet), `--breakpoint-lg` 1024 (notebook), `--breakpoint-xl` 1280 (desktop); o `2xl`
    do Tailwind é zerado. O `sm` fica porque o código já o usa em 20 lugares, e sem ele
    essas classes deixariam de gerar CSS em silêncio (verificado no Tailwind 4.3
    instalado: com os pontos zerados, `sm:p-4` não gera regra).
  - Ícones: `--icon-sm` 16 px (texto e botões), `--icon-md` 20 px (campos e navegação),
    `--icon-lg` 24 px (estado vazio e avisos); espessura 2 (padrão do Lucide).
  - Movimento: `--duration-fast` 120 ms, `--duration-base` 200 ms, `--ease-standard`
    `cubic-bezier(0.2, 0, 0, 1)`; com `prefers-reduced-motion` tudo vira 0,01 ms (a regra
    global atual passa a usar os tokens).
  - Foco: `--focus-ring-width` 3 px, `--focus-ring-offset` 2 px, cor `--ring`; o
    `:focus-visible` global já existente passa a usar os tokens.
  - Densidade: `data-density="compact"` na tabela reduz o preenchimento das células de
    12/16 para 8/12 px sem mudar a fonte.
- **Rationale**: FR-008 – FR-011, FR-021; menos níveis, mais consistência.

## V9. Guarda automática de valores arbitrários (FR-033)

- **Decision**: um teste de varredura do código-fonte, `apps/web/test/design-system/token-usage.test.ts`,
  lê `app/**`, `features/**` e `components/**` (fora testes) e falha com arquivo e linha
  quando encontra: cor literal (hex, `rgb()`, `hsl()`, `oklch()`), classe de cor da paleta
  padrão (`bg-red-500`, `text-white`, `bg-black`…), valor arbitrário de cor, fonte,
  tamanho de texto, espaçamento, raio ou sombra (`text-[…]`, `p-[…]`, `rounded-[…]`,
  `shadow-[…]`, `font-[…]`, `bg-[#…]`), tamanho de texto, raio ou sombra da escala padrão
  (`text-2xl`, `rounded-xl`, `shadow-lg`), passo de espaçamento fora de V7 e `style={{…}}`
  com cor, fonte ou espaçamento, prefixo de ponto de quebra que não existe (`2xl:`,
  `max-*:`, `min-[…]:`) e `size-*` em ícone Lucide fora de `size-4`, `size-5` e `size-6`.
  A varredura tem duas regras com testes próprios: `valores` (tudo acima) e `controles`
  (elementos recriados, abaixo), para a migração dos controles nativos (US2) não
  bloquear a US1. Exceção: comentário `ds-exception: <motivo>` na linha ou
  na anterior; a guarda exige que cada exceção esteja listada em
  `design-system/exceptions.md` e vice-versa. Ícones: `no-restricted-imports` no ESLint
  recusa `react-icons`, `@heroicons/*`, `@radix-ui/react-icons`, `@fortawesome/*`,
  `@tabler/icons-react` e `@phosphor-icons/react`, e bibliotecas de UI paralelas
  (`@mui/*`, `@chakra-ui/*`, `@mantine/*`, `antd`, `@headlessui/*`, `react-bootstrap`,
  `@nextui-org/*`, `@heroui/*`, FR-035); camadas (FR-034): `components/ui/**` não importa
  `@/components/layout`, `@/components/shared`, `@/features/*` nem `@/app`, e
  `components/layout/**` não importa `@/features/*/components` nem `@/app` (tudo coberto
  por `lint-boundaries.test.ts`).
  Componente fundamental recriado: a varredura recusa `<button>`, `<select>`,
  `<textarea>`, `<input type="checkbox|radio">` e `<table>` fora de `components/ui`.
- **Rationale**: o mesmo padrão das guardas existentes (varredura de código com lista
  explícita de exceções, como `audit-coverage` e `duplication`); roda no `pnpm test` e no CI
  sem ferramenta nova.
- **Alternatives considered**: regra customizada de ESLint (plugin próprio e
  manutenção maior para o mesmo resultado); Stylelint (não vê as classes no TSX).

## V10. Controles nativos como componentes fundamentais

- **Decision**: `components/ui` ganha `native-select.tsx` (o `<select>` nativo com os
  tokens de campo, variante do shadcn), e `checkbox.tsx` e `radio.tsx` passam a ser
  `<input>` nativos estilizados (`accent-color: var(--primary)`, tamanho e foco oficiais),
  substituindo o `Checkbox` Radix que não é usado em nenhuma tela. Os 8 `<select>`, 2 caixas
  e 1 grupo de opções das features migram para eles. O `Select` Radix continua para listas
  ricas; `Switch` (Radix) entra novo.
- **Rationale**: o nativo é o controle mais acessível e mantém os 11 testes com
  `selectOptions` e as asserções de `.checked`; a guarda de V9 passa a valer sem exceção.
- **Alternatives considered**: migrar tudo para o `Select` Radix (reescreve testes e muda
  a interação por teclado das telas atuais, contra FR-036).

## V11. Componentes fundamentais que faltam

- **Decision**: novos em `components/ui`, a partir das primitivas do `radix-ui` já
  instalado ou de marcação simples: `radio` (V10), `switch`, `native-select` (V10),
  `form-field` (`FormField`, agrupador: rótulo, descrição, mensagem, ligação
  `aria-describedby`/`aria-invalid`; o `Field` de `components/shared/field.tsx` continua,
  com a mesma API, reconstruído sobre ele), `field-message`, `toast` (Radix Toast + `useToast`),
  `spinner` (ícone Lucide `LoaderCircle` com `role="status"`), `empty-state`,
  `popover`, `dropdown-menu`, `tabs`, `pagination`, `breadcrumb`, `status` (indicador de
  situação: ponto/ícone + texto). `drawer` é o `sheet` existente (o shadcn Drawer depende de
  `vaul`). O `button` ganha as variantes `primary`, `secondary`, `outline`, `ghost`,
  `danger` (a `link` atual fica como `link`) e a propriedade `loading` (desabilita,
  `aria-busy`, spinner). `alert` ganha `info`, `success`, `warning`, `danger` com ícone
  obrigatório. `table` ganha `density`.
- **Rationale**: FR-014 – FR-019 sem biblioteca nova (FR-035); Toast do Radix em vez do
  `sonner` evita dependência.
- **Alternatives considered**: `sonner` e `vaul` (dependências novas para o que o Radix já
  cobre).

## V12. AppShell

- **Decision**: `components/layout/app-shell.tsx` compõe `SidebarProvider`, o
  `AppSidebar` atual (recolhível para ícones, 004), `Topbar` e `<main id="conteudo">`
  com largura máxima de conteúdo (`--content-max` 1280 px) e preenchimento oficial. A
  `Topbar` fixa no topo tem o botão do menu e o nome da área atual (o mesmo mapa de
  navegação do menu: "Turmas", "Minhas disciplinas"…). O `PageHeader`
  (`components/layout/page-header.tsx`) fica em cada página: trilha (`Breadcrumb`),
  `<h1>`, descrição opcional e ações. As 20 páginas trocam o `<h1>` próprio pelo
  `PageHeader` com o mesmo texto.
- **Rationale**: FR-022 – FR-023; o `<h1>` continua com o mesmo nome acessível, então os
  testes e o E2E que buscam o título continuam valendo.
- **Alternatives considered**: trilha na `Topbar` (o layout não conhece a página sem
  contexto global ou portal); menu de conta na `Topbar` (tiraria "Sair" do menu lateral e
  mudaria o comportamento testado).

## V13. Layout do aluno e escolha do layout por área

- **Decision**: grupos de rota separados, sem mudar URLs: `app/(app)` (AppShell: turmas,
  disciplinas, professores, administração), `app/(student)/minhas-turmas`
  (`StudentLayout`: barra superior com a marca, navegação "Minhas turmas" e "Meu perfil",
  "Sair", conteúdo com largura de leitura) e `app/(account)/conta/*` (perfil e sessões),
  cujo layout de servidor escolhe `StudentLayout` quando o usuário não tem nenhuma
  permissão das áreas do professor ou da administração e `AppShell` caso contrário, com a
  mesma lista de permissões que o menu já usa (`lib/navigation`). Tudo continua
  experiência de uso; o `proxy.ts` e a API não mudam.
- **Rationale**: FR-024 e US5-3; o layout segue a área e as permissões do menu, nunca o
  nome do papel.
- **Alternatives considered**: escolher pelo papel (`STUDENT`) no navegador (proibido pela
  constituição); um único layout com itens escondidos (o aluno veria a estrutura
  administrativa).
- **Emenda (2026-10-03)**: a navegação do `StudentLayout` passou da barra superior para o
  menu lateral do AppShell (mesmos primitivos, recolhível, `Sheet` em tela estreita), só com
  os itens do aluno, a pedido do produto: a mesma forma de navegar em todas as áreas. Os
  grupos de rota, a escolha por permissões e a ausência de itens administrativos não mudam.

## V14. Catálogo visual

- **Decision**: rota `app/(catalog)/design-system/page.tsx` (e seções por âncora),
  montada a partir de `features/design-system/components/*-showcase.tsx`, que mostram
  cada componente com variantes, estados, erro, carregando, desabilitado e a largura de
  tablet (contêiner de 768 px). A página chama `notFound()` quando
  `process.env.NODE_ENV === "production"`; fica fora do `proxy.ts` (não exige sessão) e só
  usa dados fixos de exemplo. Os testes renderizam os mostruários diretamente
  (`vitest-axe` + teclado). Um registro (`features/design-system/registry.ts`) lista os
  componentes e layouts do catálogo; a guarda de documentação (V17) confere que cada item
  está documentado.
- **Rationale**: FR-031 sem Storybook (dezenas de dependências de desenvolvimento e
  configuração própria para Next 16 + Tailwind 4); o catálogo usa exatamente o mesmo CSS e
  os mesmos componentes do produto.
- **Alternatives considered**: Storybook (peso e manutenção; a spec pede "se compatível"
  e o projeto evita ferramentas pesadas); Ladle (dependência nova, mesma objeção).

## V15. Contrato do modo avaliação

- **Decision**: [contracts/exam-mode.md](./contracts/exam-mode.md) é o contrato visual
  (regiões, hierarquia, estados, textos, anúncios, tokens e ícones Lucide de cada
  componente) e é publicado, com o mesmo conteúdo, em `apps/web/design-system/exam-mode.md`.
  Nenhum componente de avaliação é implementado (Q1 → C). O contrato não cria tokens
  próprios para estados de questão: usa os tokens semânticos e forma/ícone/texto.
- **Rationale**: US6, FR-025 – FR-030; evita abstração sem uso (Princípio IX).

## V16. Estratégia de migração das telas (Q2 → A)

- **Decision**: em ordem: (1) tokens e fontes (todas as telas mudam de aparência de uma
  vez); (2) componentes fundamentais ajustados e novos; (3) migração mecânica das classes
  removidas por V2 e V7 nas features, guiada pela guarda de V9 até zerar; (4) AppShell,
  `PageHeader`, layout do aluno e grupos de rota; (5) catálogo e documentação. Textos,
  rotas, nomes acessíveis e ordem de foco não mudam, para os testes existentes seguirem
  valendo sem ajuste de comportamento.
- **Rationale**: FR-036 e FR-037; cada passo deixa `pnpm test` verde.

## V17. Testes

- **Decision**:
  - `test/contrast.test.ts` passa a ler `design-system/tokens.css` e mede todos os pares
    de V3/V4 nos dois temas (texto 4,5; ícones, bordas de controle e foco 3).
  - `test/design-system/token-usage.test.ts` (V9) com testes da própria heurística.
  - `test/design-system/docs.test.ts`: cada item do registro do catálogo tem seção em
    `components.md`/`layouts.md`; cada componente de FR-026 e cada estado de questão tem
    seção em `exam-mode.md`; `exceptions.md` bate com as exceções do código.
  - Testes de componente para os fundamentais novos e alterados (variantes, estados,
    `loading`, foco, nomes acessíveis, `vitest-axe`), para o AppShell, o `PageHeader`, a
    `Topbar` e a escolha de layout (`(account)`), e para o catálogo (axe e teclado em todos
    os mostruários).
  - Todos os testes, o E2E e as guardas existentes seguem valendo (SC-006).
  - `apps/api/test/traceability.spec.ts` ganha a 005 em `SPECS` (cenários `005/USn-k`).
- **Rationale**: SC-001 – SC-006 automatizados; SC-007 e SC-009 por revisão.

## V18. Desempenho

- **Decision**: nenhuma dependência de runtime nova; só a Inter pré-carregada; ícones por
  importação nomeada do `lucide-react` (tree-shaking); o catálogo não entra no bundle de
  produção (rota com `notFound()` e mostruários importados só por ela). O contrato do modo
  avaliação exige componentes de atualização frequente isolados (FR-030), a implementar
  na feature de avaliações.
- **Rationale**: FR-005, seção 38 da descrição.

## V19. Documentação

- **Decision**: `apps/web/design-system/README.md` (princípios, regra 80/15/5, regras
  contra UI genérica, arquitetura em camadas), `tokens.md` (tabela de cada token e uso),
  `components.md` (cada componente: variantes, estados, quando usar, quando não usar,
  exemplo, acessibilidade), `layouts.md`, `exam-mode.md` (V15) e `exceptions.md` (V9).
  `CLAUDE.md` passa a apontar para ela.
- **Rationale**: FR-032.

## V20. Menu e áreas futuras

- **Decision**: os itens do menu continuam os de hoje (permissões de `lib/navigation`);
  nenhum item de área futura é criado. O mapa de navegação ganha o nome de cada área para a
  `Topbar` (V12).
- **Rationale**: US3-5.
