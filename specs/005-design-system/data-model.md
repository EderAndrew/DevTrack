# Data Model: 005 — Design System e Identidade Visual

Esta feature não cria tabelas, migrações, rotas nem contratos da API: nada muda no
PostgreSQL nem em `packages/contracts` (FR-036). As "entidades" são estruturas estáticas
do front, versionadas no repositório e verificadas por testes.

## Design token (`apps/web/design-system/tokens.css`)

| Campo | Regra |
|-------|-------|
| nome | variável CSS semântica (`--primary`, `--text-h2`, `--radius-md`, `--z-modal`…), nunca o nome de uma cor |
| categoria | cor, tipografia, espaçamento, borda, raio, sombra, camada, ponto de quebra, movimento, foco |
| valor por tema | tema claro em `:root`; tema escuro em `@media (prefers-color-scheme: dark)` e `:root[data-theme="dark"]` (mesmos nomes) |
| utilitário | exposto ao Tailwind pelo `@theme` só quando vira classe (`bg-primary`, `text-h2`, `rounded-md`, `shadow-overlay`) |
| uso permitido | documentado em `tokens.md` (ex.: `--success` só em ícone e borda; `--success-text` em texto) |

Regras:
- Um token de cor de texto tem par medido com cada fundo em que aparece (≥ 4,5:1; ≥ 3:1
  para texto grande, ícones de estado, bordas de controle e foco) nos dois temas
  (`test/contrast.test.ts`).
- As escalas padrão do Tailwind substituídas pelo Design System são zeradas no `@theme`
  (research V2).
- Os nomes que os componentes shadcn esperam (`--card`, `--popover`, `--muted`,
  `--accent`, `--input`, `--destructive`, `--sidebar-*`) são aliases de tokens
  semânticos, sem valor próprio.

Catálogo completo de tokens: [contracts/tokens.md](./contracts/tokens.md).

## Componente (registro do catálogo, `features/design-system/registry.ts`)

| Campo | Regra |
|-------|-------|
| `id` | identificador estável (`button`, `native-select`, `app-shell`) |
| `name` | nome exibido no catálogo e usado como título da seção na documentação |
| `group` | `actions`, `forms`, `feedback`, `containers`, `data`, `navigation`, `layouts` |
| `source` | caminho do componente (`components/ui/button.tsx`, `components/layout/app-shell.tsx`) |
| `showcase` | mostruário que renderiza variantes e estados |
| `variants` / `states` | listas declaradas; o mostruário renderiza todas |

Regras:
- Cada componente fundamental de FR-014 – FR-019 e cada layout construído (AppShell,
  aluno) tem uma entrada (SC-005).
- Cada entrada tem seção em `design-system/components.md` ou `layouts.md` com o mesmo
  nome (guarda `test/design-system/docs.test.ts`).
- Componentes de avaliação (FR-026) não entram no registro: são contrato
  ([contracts/exam-mode.md](./contracts/exam-mode.md)).

## Layout

| Layout | Onde fica | Telas | Regiões |
|--------|-----------|-------|---------|
| `AppShell` | `components/layout/app-shell.tsx`; grupo `app/(app)` | turmas, disciplinas, professores, administração; conta quando o usuário tem área do professor ou da administração | menu lateral, `Topbar`, `<main id="conteudo">` com `PageHeader` |
| `StudentLayout` | `components/layout/student-layout.tsx`; grupo `app/(student)` | "Minhas turmas"; conta quando o usuário não tem área do professor ou da administração | barra superior do aluno, `<main id="conteudo">` com `PageHeader` |
| `AccountLayout` | `app/(account)/layout.tsx` | perfil, sessões | escolhe `AppShell` ou `StudentLayout` pelas permissões de navegação (research V13) |
| Exam Mode | só contrato ([contracts/exam-mode.md](./contracts/exam-mode.md)) | — (feature de avaliações) | cabeçalho, progresso, questão, resposta, salvamento, navegação, cronômetro |

`(auth)` e `(public)` mantêm as molduras atuais, agora com os tokens e o `PageHeader`
onde houver título.

## Exceção de valor (`apps/web/design-system/exceptions.md`)

| Campo | Regra |
|-------|-------|
| arquivo e trecho | onde o valor fora da escala aparece, com o comentário `ds-exception: <motivo>` |
| motivo | por que o token não serve (ex.: largura do menu recolhido calculada pelo shadcn) |

Regra: a lista do documento e os comentários do código são iguais (guarda V9).

## Estado visual de questão (só no contrato)

`atual`, `não respondida`, `respondida`, `marcada para revisão`, `bloqueada`,
`invalidada`, cada um com cor, forma, ícone Lucide, texto e anúncio acessível
([contracts/exam-mode.md](./contracts/exam-mode.md)). Não há transições aqui: os estados
reais pertencem às features de avaliação.
