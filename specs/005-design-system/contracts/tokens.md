# Contract: Design tokens

Fonte única: `apps/web/design-system/tokens.css` (research V1, V2). Utilitários do
Tailwind entre parênteses. Valores do tema escuro na coluna "Escuro" (research V4).

## Cor

| Token | Claro | Escuro | Uso |
|-------|-------|--------|-----|
| `--background` (`bg-background`) | `#F8FAFC` | `#0B1120` | fundo da página |
| `--surface` (`bg-surface`) | `#FFFFFF` | `#111827` | cartões, painéis, diálogos, campos, menu lateral |
| `--foreground` (`text-foreground`) | `#0F172A` | `#E2E8F0` | texto principal |
| `--text-secondary` (`text-secondary`) | `#64748B` | `#94A3B8` | texto de apoio, legendas |
| `--primary` (`bg-primary`, `text-primary`) | `#2563EB` | `#60A5FA` | ação principal, seleção, progresso, links |
| `--primary-foreground` | `#FFFFFF` | `#0B1120` | texto sobre `--primary` |
| `--primary-hover` | `#1D4ED8` | `#93C5FD` | passar o mouse e pressionado da ação principal |
| `--primary-strong` | `#172554` | `#BFDBFE` | identidade: marca, item ativo do menu |
| `--primary-subtle` | `#EFF6FF` | `#172554` | fundo de seleção (item ativo, linha selecionada) |
| `--border` | `#E2E8F0` | `#334155` | divisórias decorativas (não delimita controles) |
| `--border-control` | `#64748B` | `#7C8AA0` | contorno de campos, caixas, opções, interruptor (≥ 3:1) |
| `--ring` | `#2563EB` | `#60A5FA` | contorno de foco (≥ 3:1) |
| `--success` / `--success-text` / `--success-surface` | `#16A34A` / `#15803D` / `#F0FDF4` | `#4ADE80` / `#4ADE80` / `#052E16` | ícone e borda / texto / fundo |
| `--warning` / `--warning-text` / `--warning-surface` | `#D97706` / `#B45309` / `#FFFBEB` | `#FBBF24` / `#FBBF24` / `#451A03` | idem |
| `--danger` / `--danger-text` / `--danger-surface` / `--danger-foreground` | `#DC2626` / `#B91C1C` / `#FEF2F2` / `#FFFFFF` | `#F87171` / `#F87171` / `#450A0A` / `#0B1120` | ação de perigo, ícone / texto / fundo / texto sobre `--danger` |
| `--info` / `--info-text` / `--info-surface` | `#0284C7` / `#0369A1` / `#F0F9FF` | `#38BDF8` / `#38BDF8` / `#082F49` | idem |
| `--disabled-bg` / `--disabled-fg` / `--disabled-border` | `#F1F5F9` / `#64748B` / `#CBD5E1` | `#1E293B` / `#94A3B8` / `#334155` | controles desabilitados |
| `--overlay` | `#0F172A` 50% | `#000000` 60% | fundo de diálogo e painel lateral |

Aliases do shadcn (sem valor próprio): `--card`, `--popover` → `--surface`;
`--card-foreground`, `--popover-foreground`, `--accent-foreground` → `--foreground`;
`--muted`, `--accent` → `--background`; `--muted-foreground` → `--text-secondary`;
`--secondary` → `--surface`; `--secondary-foreground` → `--primary`; `--input` →
`--border-control`; `--destructive` → `--danger`; `--sidebar` → `--surface`;
`--sidebar-foreground` → `--foreground`; `--sidebar-accent` → `--primary-subtle`;
`--sidebar-accent-foreground` → `--primary-strong`; `--sidebar-border` → `--border`;
`--sidebar-ring` → `--ring`; `--sidebar-primary` → `--primary`.

Pares medidos por `test/contrast.test.ts` (nos dois temas): cada texto (`--foreground`,
`--text-secondary`, `--primary`, `--*-text`) sobre `--background`, `--surface` e a
`--*-surface` correspondente (4,5); `--primary-foreground` sobre `--primary` e
`--primary-hover`, `--danger-foreground` sobre `--danger` (4,5); `--primary-strong` sobre
`--primary-subtle` (4,5); `--success`, `--warning`, `--danger`, `--info`,
`--border-control` e `--ring` sobre `--background` e `--surface` (3).

## Tipografia

| Token | Tamanho / altura / peso | Família | Uso |
|-------|------------------------|---------|-----|
| `text-display` | 32 / 40 / 700 | Inter | título de página de entrada (login) |
| `text-h1` | 28 / 36 / 700 | Inter | título da página (`PageHeader`) |
| `text-h2` | 22 / 30 / 600 | Inter | seção |
| `text-h3` | 18 / 26 / 600 | Inter | subseção, título de cartão |
| `text-body` | 16 / 24 / 400 | Inter | texto padrão |
| `text-body-sm` | 14 / 20 / 400 | Inter | tabelas, texto auxiliar |
| `text-label` | 13 / 18 / 500 | Inter | rótulos, selos |
| `text-caption` | 12 / 16 / 400 | Inter | legendas, metadados |
| `text-code` | 14 / 22 / 400 | JetBrains Mono | código, saída, console |
| `text-reading` | 16 / 1,6 / 400, largura máx. 72ch | Inter | textos longos, enunciados |

Famílias: `font-sans` (`--font-inter`, fallbacks de sistema) e `font-mono`
(`--font-jetbrains-mono`, fallbacks monoespaçados). Pesos: 400, 500, 600, 700.

## Espaçamento

Unidade 4 px. Passos em `p*`, `m*`, `gap*`, `space-*`: `0`, `px`, `1` (4), `2` (8), `3`
(12), `4` (16), `5` (20), `6` (24), `8` (32), `10` (40), `12` (48), `16` (64). Outros
passos e frações: só com `ds-exception`.

Tokens de layout: `--content-max` 1280 px (área principal do AppShell),
`--reading-max` 72ch (layout do aluno e textos longos), `--gutter` 24 px (≥ 1024) / 16 px
(< 1024).

## Borda, raio e sombra

- Borda: 1 px (`border`); 2 px só para destaque de estado (item concluído, questão atual).
- Raio: `rounded-sm` 6, `rounded-md` 8 (botões, campos, cartões), `rounded-lg` 12
  (diálogos, painéis); `rounded-full` só em formas circulares.
- Sombra: `shadow-sm`, `shadow-md`, `shadow-overlay` (diálogo, popover, menu, toast).

## Camadas, pontos de quebra, movimento e foco

- `--z-sticky` 10, `--z-dropdown` 20, `--z-overlay` 30, `--z-modal` 40, `--z-toast` 50,
  `--z-tooltip` 60.
- `sm` 640 (celular grande), `md` 768 (tablet), `lg` 1024 (notebook), `xl` 1280 (desktop);
  nenhum outro prefixo de ponto de quebra.
- `--duration-fast` 120 ms (passar o mouse, foco), `--duration-base` 200 ms (abrir e
  fechar), `--ease-standard`; `prefers-reduced-motion` → 0,01 ms.
- Foco: contorno `--focus-ring-width` 3 px, `--focus-ring-offset` 2 px, cor `--ring`, em
  todo `:focus-visible`.
- Ícones (Lucide, espessura 2): `size-4` = `--icon-sm` 16 (texto e botões), `size-5` =
  `--icon-md` 20 (campos e navegação), `size-6` = `--icon-lg` 24 (estado vazio e avisos).
- Alvo mínimo: 24 × 24 px (WCAG 2.2, 2.5.8); controles de formulário e botões mantêm 44 px
  de altura (`min-h-11`) como hoje.
