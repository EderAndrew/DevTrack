# Contract: Design tokens

Fonte única: `apps/web/design-system/tokens.css` (research V1, V2). Utilitários do
Tailwind entre parênteses. Um só tema, escuro, com a paleta Vice City (FR-013, emenda
2026-10-22; o tema claro e o escuro anterior estão no histórico do git e em research V4).

## Cor

| Token | Valor | Uso |
|-------|-------|-----|
| `--background` (`bg-background`) | `#0B0F2B` | fundo da página |
| `--surface` (`bg-surface`) | `#151A3D` | cartões, painéis, diálogos, campos, menu lateral |
| `--foreground` (`text-foreground`) | `#F2EEFF` | texto principal |
| `--text-secondary` (`text-secondary`) | `#AAA6D4` | texto de apoio, legendas |
| `--primary` (`bg-primary`, `text-primary`) | `#FF5CA8` | ação principal, seleção, progresso, links |
| `--primary-foreground` | `#0B0F2B` | texto sobre `--primary` |
| `--primary-hover` | `#FF85BE` | passar o mouse e pressionado da ação principal |
| `--primary-strong` | `#FFC2DE` | identidade: marca, item ativo do menu |
| `--primary-subtle` | `#3D1747` | fundo de seleção (item ativo, linha selecionada) |
| `--brand-secondary` | `#00F0FF` | só o "Track" da marca DevTrack |
| `--border` | `#2B305E` | divisórias decorativas (não delimita controles) |
| `--border-control` | `#807CB8` | contorno de campos, caixas, opções, interruptor (≥ 3:1) |
| `--ring` | `#00F0FF` | contorno de foco (≥ 3:1) |
| `--success` / `--success-text` / `--success-surface` | `#4ADE9A` / `#4ADE9A` / `#0B2E26` | ícone e borda / texto / fundo |
| `--warning` / `--warning-text` / `--warning-surface` | `#FFB86B` / `#FFB86B` / `#3A2410` | idem |
| `--danger` / `--danger-text` / `--danger-surface` / `--danger-foreground` | `#FF6B6B` / `#FF7B7B` / `#3D0E1A` / `#0B0F2B` | idem, e texto sobre `--danger` |
| `--info` / `--info-text` / `--info-surface` | `#00F0FF` / `#00F0FF` / `#062C3D` | idem |
| `--disabled-bg` / `--disabled-fg` / `--disabled-border` | `#1D2249` / `#9E9AC8` / `#2B305E` | controles desabilitados |
| `--overlay` | `#050714` 70% | fundo de diálogo e painel lateral |

Aliases do shadcn (sem valor próprio): `--card`, `--popover` → `--surface`;
`--card-foreground`, `--popover-foreground`, `--accent-foreground` → `--foreground`;
`--muted`, `--accent` → `--background`; `--muted-foreground` → `--text-secondary`;
`--secondary` → `--surface`; `--secondary-foreground` → `--primary`; `--input` →
`--border-control`; `--destructive` → `--danger`; `--sidebar` → `--surface`;
`--sidebar-foreground` → `--foreground`; `--sidebar-accent` → `--primary-subtle`;
`--sidebar-accent-foreground` → `--primary-strong`; `--sidebar-border` → `--border`;
`--sidebar-ring` → `--ring`; `--sidebar-primary` → `--primary`.

Pares medidos por `test/contrast.test.ts`: cada texto (`--foreground`,
`--text-secondary`, `--primary`, `--*-text`) sobre `--background`, `--surface` e a
`--*-surface` correspondente (4,5); `--primary-foreground` sobre `--primary` e
`--primary-hover`, `--danger-foreground` sobre `--danger` (4,5); `--primary-strong` sobre
`--primary-subtle` (4,5); `--success`, `--warning`, `--danger`, `--info`,
`--border-control` e `--ring` sobre `--background` e `--surface` (3).

## Tipografia

| Token | Tamanho / altura / peso | Família | Uso |
|-------|------------------------|---------|-----|
| `text-wordmark` | 44 / 52 / 600 | Fredoka (`font-brand`) | só a marca DevTrack no login e na senha (emenda 2026-10-22) |
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
