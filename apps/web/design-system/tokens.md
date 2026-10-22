# Tokens

Fonte única: [`tokens.css`](./tokens.css). Cada token vira um utilitário do Tailwind (entre
parênteses); as escalas padrão do Tailwind foram zeradas, então só estes existem. Há um só
tema, escuro, com a paleta Vice City (Ocean Night `#0B0F2B`, Sunset Pink `#FF5CA8`, Vice Cyan
`#00F0FF`, Neon Purple `#BC6CFF`, Miami Peach `#FFB86B`; 005 FR-013, emenda de 2026-10-22); ele não
muda com a preferência do sistema. `test/design-system/docs.test.ts`
confere que cada token de `tokens.css` aparece aqui.

## Cor

| Token | Valor | Uso permitido |
|-------|-------|---------------|
| `--background` (`bg-background`) | `#0B0F2B` | fundo da página |
| `--surface` (`bg-surface`) | `#151A3D` | cartões, painéis, diálogos, campos, menu lateral, barras |
| `--foreground` (`text-foreground`) | `#F2EEFF` | texto principal |
| `--text-secondary` (`text-text-secondary`) | `#AAA6D4` | texto de apoio, descrições, legendas |
| `--primary` (`bg-primary`, `text-primary`, `border-primary`) | `#FF5CA8` | ação principal, seleção, progresso, links |
| `--primary-foreground` | `#0B0F2B` | texto e ícone sobre `--primary` |
| `--primary-hover` | `#FF85BE` | passar o mouse e pressionado da ação principal |
| `--primary-strong` | `#FFC2DE` | identidade: texto do item ativo do menu, página atual da paginação |
| `--primary-subtle` | `#3D1747` | fundo de seleção (item ativo, página atual) |
| `--brand-secondary` (`text-brand-secondary`) | `#00F0FF` | só o "Track" da marca DevTrack (`Wordmark`); "Dev" usa `--primary` |
| `--border` (`border-border`) | `#2B305E` | divisórias decorativas; nunca o limite de um controle |
| `--border-control` (`border-border-control`) | `#807CB8` | contorno de campos, caixas, opções e interruptor (≥ 3:1) |
| `--ring` | `#00F0FF` | contorno de foco (≥ 3:1) |
| `--success` | `#4ADE9A` | ícone, borda e gráfico de sucesso |
| `--success-text` | `#4ADE9A` | texto de sucesso (≥ 4,5:1) |
| `--success-surface` | `#0B2E26` | fundo de aviso e selo de sucesso |
| `--warning` | `#FFB86B` | ícone, borda e gráfico de atenção |
| `--warning-text` | `#FFB86B` | texto de atenção |
| `--warning-surface` | `#3A2410` | fundo de aviso e selo de atenção |
| `--danger` | `#FF6B6B` | ícone, borda e gráfico de erro ou risco; borda do campo com erro |
| `--danger-text` | `#FF7B7B` | texto de erro e da ação destrutiva |
| `--danger-surface` | `#3D0E1A` | fundo de aviso de erro e passar o mouse da ação destrutiva |
| `--danger-foreground` | `#0B0F2B` | texto sobre `--danger` |
| `--info` | `#00F0FF` | ícone, borda e gráfico de informação |
| `--info-text` | `#00F0FF` | texto de informação |
| `--info-surface` | `#062C3D` | fundo de aviso e selo de informação |
| `--disabled-bg` | `#1D2249` | fundo de controle desabilitado |
| `--disabled-fg` | `#9E9AC8` | texto de controle desabilitado |
| `--disabled-border` | `#2B305E` | borda de controle desabilitado |
| `--overlay` (`bg-overlay`) | `#050714` a 70% | fundo atrás de diálogo e painel lateral |

A distribuição (80% neutros, 15% identidade, 5% semânticas) está no
[README](./README.md#cores-e-a-regra-80155). Pares medidos por `test/contrast.test.ts`: cada texto sobre `--background`, `--surface` e a `--*-surface` correspondente
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

### Sintaxe do código

Cores do realce de sintaxe (014): só no código do `CodeEditor` e do `CodeBlock`, nunca em outro
texto. O texto comum do código usa `--foreground`; os números de linha, `--text-secondary`. O
destacador mapeia as tags do Lezer para estas classes (014 research L5).

| Token | Valor | Categoria |
|-------|-------|-----------|
| `--syntax-keyword` (`text-syntax-keyword`) | `#D29BFF` | palavra-chave, modificador, nome de tag HTML |
| `--syntax-string` (`text-syntax-string`) | `#7CF0B0` | texto entre aspas, caractere, expressão regular |
| `--syntax-number` (`text-syntax-number`) | `#FFB86B` | número, booleano, `null`, átomo |
| `--syntax-comment` (`text-syntax-comment`) | `#9E9AC8` | comentário de linha, de bloco e de documentação |
| `--syntax-type` (`text-syntax-type`) | `#00F0FF` | tipo, classe, namespace, atributo HTML |
| `--syntax-function` (`text-syntax-function`) | `#FF8FC4` | nome de função ou método chamado ou declarado, macro |
| `--syntax-operator` (`text-syntax-operator`) | `#FF8A80` | operador aritmético, lógico e de comparação |
| `--syntax-punctuation` (`text-syntax-punctuation`) | `#C8C4EA` | pontuação, parênteses, colchetes, separadores |

Contraste (`test/contrast.test.ts`): cada `--syntax-*` e o `--foreground` sobre
`--background`, `--surface`, `--primary-subtle` e `--disabled-bg` (4,5:1). **Seleção e editor
desabilitado**: a seleção do editor pinta o fundo com `--primary-subtle` e o texto **mantém** a cor
de sintaxe (por isso esses pares estão no teste); o editor desabilitado usa `--disabled-bg`. O
editor não destaca a linha ativa. Em alto contraste (`forced-colors: active`) as classes
`text-syntax-*` passam a `CanvasText`: o código sem cores é o mesmo código.

### Gráficos

Cores das marcas dos gráficos (`components/ui/chart.tsx`, 006 emenda 2026-10-22): barras e
quadrados da legenda, nunca texto. Valores, nomes e eixos usam `--foreground` e
`--text-secondary`; a grade, `--border`.

| Token | Valor | Uso |
|-------|-------|-----|
| `--chart-1` (`bg-chart-1`, `fill`) | `#A66BFF` | a série única de um gráfico (Neon Purple trazido para a faixa de luminosidade do tema escuro, OKLCH L 0,48–0,67) |

Séries de situação (concluída, falha, tempo esgotado, cancelada) usam as cores de estado
(`--success`, `--danger`, `--warning`, `--text-secondary`) nessa ordem fixa, que nunca põe
concluída e tempo esgotado lado a lado (ΔE 6,6 para protanopia), e sempre com ícone e nome na
legenda. Uma 2ª paleta categórica só entra validada pelo `validate_palette.js` do dataviz.

Contraste (`test/contrast.test.ts`): `--chart-1` sobre `--background` e `--surface` (3:1).

## Tipografia

| Token (utilitário) | Tamanho / altura / peso | Família | Uso |
|--------------------|------------------------|---------|-----|
| `--text-wordmark` (`text-wordmark`) | 44 / 52 / 600 | Fredoka | só a marca DevTrack nas telas de login e de senha (`Wordmark size="lg"`) |
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
| `--font-brand` (`font-brand`) | `--font-fredoka`, `ui-rounded`, depois a Inter e fontes do sistema | só a marca DevTrack (`components/shared/wordmark.tsx`; `identity.test.ts` confere) |
| `--font-weight-normal` (`font-normal`) | 400 | texto |
| `--font-weight-medium` (`font-medium`) | 500 | rótulos |
| `--font-weight-semibold` (`font-semibold`) | 600 | botões, títulos de seção, item ativo |
| `--font-weight-bold` (`font-bold`) | 700 | títulos de página e marca |

As fontes são locais (`app/fonts`, SIL OFL 1.1), com `display: swap`; a Inter e a Fredoka
(subconjunto latino, só para a marca, que todo quadro mostra) são pré-carregadas.

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
| `--shadow-sm` (`shadow-sm`) | `0 1px 2px` preto a 30% | controles que se destacam do fundo (gatilho de lista) |
| `--shadow-md` (`shadow-md`) | `0 4px 12px` preto a 40% | elemento elevado raro; cartão não usa sombra por padrão |
| `--shadow-overlay` (`shadow-overlay`) | `0 12px 32px` preto a 55% | diálogo, popover, menu suspenso, notificação |

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
