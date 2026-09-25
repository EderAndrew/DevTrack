# Tokens

Fonte única: [`tokens.css`](./tokens.css). Cada token vira um utilitário do Tailwind (entre
parênteses); as escalas padrão do Tailwind foram zeradas, então só estes existem. O tema
claro é o oficial; o escuro vem da preferência do sistema (`prefers-color-scheme: dark`) ou
de `data-theme="dark"` no `<html>` e troca só os valores. `test/design-system/docs.test.ts`
confere que cada token de `tokens.css` aparece aqui.

## Cor

| Token | Claro | Escuro | Uso permitido |
|-------|-------|--------|---------------|
| `--background` (`bg-background`) | `#F8FAFC` | `#0B1120` | fundo da página |
| `--surface` (`bg-surface`) | `#FFFFFF` | `#111827` | cartões, painéis, diálogos, campos, menu lateral, barras |
| `--foreground` (`text-foreground`) | `#0F172A` | `#E2E8F0` | texto principal |
| `--text-secondary` (`text-text-secondary`) | `#64748B` | `#94A3B8` | texto de apoio, descrições, legendas |
| `--primary` (`bg-primary`, `text-primary`, `border-primary`) | `#2563EB` | `#60A5FA` | ação principal, seleção, progresso, links |
| `--primary-foreground` | `#FFFFFF` | `#0B1120` | texto e ícone sobre `--primary` |
| `--primary-hover` | `#1D4ED8` | `#93C5FD` | passar o mouse e pressionado da ação principal |
| `--primary-strong` | `#172554` | `#BFDBFE` | identidade: texto do item ativo do menu, página atual da paginação |
| `--primary-subtle` | `#EFF6FF` | `#172554` | fundo de seleção (item ativo, página atual) |
| `--border` (`border-border`) | `#E2E8F0` | `#334155` | divisórias decorativas; nunca o limite de um controle |
| `--border-control` (`border-border-control`) | `#64748B` | `#7C8AA0` | contorno de campos, caixas, opções e interruptor (≥ 3:1) |
| `--ring` | `#2563EB` | `#60A5FA` | contorno de foco (≥ 3:1) |
| `--success` | `#16A34A` | `#4ADE80` | ícone, borda e gráfico de sucesso |
| `--success-text` | `#15803D` | `#4ADE80` | texto de sucesso (≥ 4,5:1) |
| `--success-surface` | `#F0FDF4` | `#052E16` | fundo de aviso e selo de sucesso |
| `--warning` | `#D97706` | `#FBBF24` | ícone, borda e gráfico de atenção |
| `--warning-text` | `#B45309` | `#FBBF24` | texto de atenção |
| `--warning-surface` | `#FFFBEB` | `#451A03` | fundo de aviso e selo de atenção |
| `--danger` | `#DC2626` | `#F87171` | ícone, borda e gráfico de erro ou risco; borda do campo com erro |
| `--danger-text` | `#B91C1C` | `#F87171` | texto de erro e da ação destrutiva |
| `--danger-surface` | `#FEF2F2` | `#450A0A` | fundo de aviso de erro e passar o mouse da ação destrutiva |
| `--danger-foreground` | `#FFFFFF` | `#0B1120` | texto sobre `--danger` |
| `--info` | `#0284C7` | `#38BDF8` | ícone, borda e gráfico de informação |
| `--info-text` | `#0369A1` | `#38BDF8` | texto de informação |
| `--info-surface` | `#F0F9FF` | `#082F49` | fundo de aviso e selo de informação |
| `--disabled-bg` | `#F1F5F9` | `#1E293B` | fundo de controle desabilitado |
| `--disabled-fg` | `#64748B` | `#94A3B8` | texto de controle desabilitado |
| `--disabled-border` | `#CBD5E1` | `#334155` | borda de controle desabilitado |
| `--overlay` (`bg-overlay`) | `#0F172A` a 50% | `#000000` a 60% | fundo atrás de diálogo e painel lateral |

A distribuição (80% neutros, 15% identidade, 5% semânticas) está no
[README](./README.md#cores-e-a-regra-80155). Pares medidos por `test/contrast.test.ts` nos
dois temas: cada texto sobre `--background`, `--surface` e a `--*-surface` correspondente
(4,5:1); `--primary-foreground` sobre `--primary` e `--primary-hover` e
`--danger-foreground` sobre `--danger` (4,5:1); `--primary-strong` sobre
`--primary-subtle` (4,5:1); as cores semânticas base, `--border-control` e `--ring` sobre
`--background` e `--surface` (3:1).

### Aliases do shadcn/ui

Sem valor próprio: existem para os componentes do shadcn continuarem funcionando. Em
código novo, prefira o token oficial.

| Alias | Aponta para |
|-------|-------------|
| `--card`, `--popover`, `--secondary`, `--sidebar` | `--surface` |
| `--card-foreground`, `--popover-foreground`, `--accent-foreground`, `--sidebar-foreground` | `--foreground` |
| `--muted`, `--accent` | `--background` |
| `--muted-foreground` | `--text-secondary` |
| `--secondary-foreground`, `--sidebar-primary` | `--primary` |
| `--sidebar-primary-foreground` | `--primary-foreground` |
| `--input` | `--border-control` |
| `--destructive` | `--danger` |
| `--sidebar-accent` | `--primary-subtle` |
| `--sidebar-accent-foreground` | `--primary-strong` |
| `--sidebar-border` | `--border` |
| `--sidebar-ring` | `--ring` |

## Tipografia

| Token (utilitário) | Tamanho / altura / peso | Família | Uso |
|--------------------|------------------------|---------|-----|
| `--text-display` (`text-display`) | 32 / 40 / 700 | Inter | título de página de entrada (login) |
| `--text-h1` (`text-h1`) | 28 / 36 / 700 | Inter | título da página (`PageHeader`) |
| `--text-h2` (`text-h2`) | 22 / 30 / 600 | Inter | seção |
| `--text-h3` (`text-h3`) | 18 / 26 / 600 | Inter | subseção, título de cartão e de estado vazio |
| `--text-body` (`text-body`) | 16 / 24 / 400 | Inter | texto padrão, botões |
| `--text-body-sm` (`text-body-sm`) | 14 / 20 / 400 | Inter | tabelas, texto auxiliar, menu |
| `--text-label` (`text-label`) | 13 / 18 / 500 | Inter | rótulos de campo, selos, cabeçalho de tabela |
| `--text-caption` (`text-caption`) | 12 / 16 / 400 | Inter | legendas, metadados, descrição de campo |
| `--text-code` (`text-code`) | 14 / 22 / 400 | JetBrains Mono | código, saída de execução, console |
| `text-reading` | 16 / 1,6 / 400, até `--reading-max` | Inter | textos longos e enunciados (nunca menor que Body) |

Cada `--text-*` tem `--text-*--line-height` e `--text-*--font-weight` no mesmo bloco.

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-sans` (`font-sans`) | `--font-inter`, depois fontes do sistema | todo o texto |
| `--font-mono` (`font-mono`) | `--font-jetbrains-mono`, depois monoespaçadas do sistema | código e elementos técnicos |
| `--font-weight-normal` (`font-normal`) | 400 | texto |
| `--font-weight-medium` (`font-medium`) | 500 | rótulos |
| `--font-weight-semibold` (`font-semibold`) | 600 | botões, títulos de seção, item ativo |
| `--font-weight-bold` (`font-bold`) | 700 | títulos de página e marca |

As fontes são locais (`app/fonts`, SIL OFL 1.1), com `display: swap`; só a Inter é
pré-carregada.

## Espaçamento

Unidade de 4 px (a do Tailwind). Passos permitidos em `p*`, `m*`, `gap*` e `space-*`: `0`,
`px`, `1` (4), `2` (8), `3` (12), `4` (16), `5` (20), `6` (24), `8` (32), `10` (40), `12`
(48), `16` (64). Outros passos e frações (`gap-1.5`, `p-7`) só com `ds-exception`.

| Token | Valor | Uso |
|-------|-------|-----|
| `--content-max` (`max-w-(--content-max)`) | 1280 px | largura máxima da área principal do AppShell |
| `--reading-max` | 72ch | textos longos (`text-reading`), estado vazio |
| `--gutter` (`px-(--gutter)`) | 16 px; 24 px a partir de `lg` | margem lateral das molduras |

O layout do aluno limita o conteúdo a 960 px (`max-w-240`).

## Raios

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` (`rounded-sm`) | 6 px | itens de menu, marcadores pequenos |
| `--radius-md` (`rounded-md`) | 8 px | botões, campos, cartões, tabelas, avisos |
| `--radius-lg` (`rounded-lg`) | 12 px | diálogos e painéis |

`rounded-full` só em formas circulares (ponto do `Status`, interruptor).

## Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` (`shadow-sm`) | `0 1px 2px` a 6% | controles que se destacam do fundo (gatilho de lista) |
| `--shadow-md` (`shadow-md`) | `0 4px 12px` a 8% | elemento elevado raro; cartão não usa sombra por padrão |
| `--shadow-overlay` (`shadow-overlay`) | `0 12px 32px` a 16% | diálogo, popover, menu suspenso, notificação |

## Camadas

| Token | Valor | Uso |
|-------|-------|-----|
| `--z-base` | 0 | conteúdo |
| `--z-sticky` (`z-(--z-sticky)`) | 10 | `Topbar` e cabeçalhos fixos |
| `--z-dropdown` (`z-(--z-dropdown)`) | 20 | popover e menu suspenso |
| `--z-overlay` (`z-(--z-overlay)`) | 30 | fundo de diálogo e painel |
| `--z-modal` (`z-(--z-modal)`) | 40 | diálogo e painel lateral |
| `--z-toast` (`z-(--z-toast)`) | 50 | notificações |
| `--z-tooltip` (`z-(--z-tooltip)`) | 60 | dicas |

## Pontos de quebra

| Token | Valor | Faixa |
|-------|-------|-------|
| `--breakpoint-sm` (`sm:`) | 40rem (640 px) | celular grande |
| `--breakpoint-md` (`md:`) | 48rem (768 px) | tablet; abaixo dele o menu lateral vira painel |
| `--breakpoint-lg` (`lg:`) | 64rem (1024 px) | notebook; `--gutter` passa a 24 px |
| `--breakpoint-xl` (`xl:`) | 80rem (1280 px) | desktop |

Nenhum outro prefixo (`2xl:`, `max-*:`, `min-[…]:`) é aceito pela guarda.

## Movimento

| Token | Valor | Uso |
|-------|-------|-----|
| `--duration-fast` (`duration-(--duration-fast)`) | 120 ms | passar o mouse, foco, troca de cor |
| `--duration-base` (`duration-(--duration-base)`) | 200 ms | abrir e fechar diálogo, painel, menu |
| `--ease-standard` (`ease-standard`) | `cubic-bezier(0.2, 0, 0, 1)` | toda transição |

Com `prefers-reduced-motion: reduce`, `app/globals.css` leva as durações a 0,01 ms e
remove transições e animações; o que gira ou pulsa usa também `motion-safe:`.

## Foco

| Token | Valor | Uso |
|-------|-------|-----|
| `--focus-ring-width` | 3 px | espessura do contorno de `:focus-visible` |
| `--focus-ring-offset` | 2 px | distância do contorno |

O contorno usa `--ring` e vale para todo elemento interativo (`app/globals.css`). Quem
esconde o contorno (`outline-hidden`) precisa de um `focus-visible:ring-*` no lugar.

## Ícones

Só Lucide (`lucide-react`, espessura 2), importados pelo nome.

| Token | Valor | Utilitário | Uso |
|-------|-------|------------|-----|
| `--icon-sm` | 16 px | `size-4` | ícone em texto e botões |
| `--icon-md` | 20 px | `size-5` | campos e navegação |
| `--icon-lg` | 24 px | `size-6` | estado vazio e avisos |

Ícone decorativo leva `aria-hidden="true"`; ícone sozinho num botão exige `aria-label` e
dica.
