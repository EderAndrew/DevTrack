# Contract: Layouts e rotas

Nenhuma URL muda. Os grupos de rota só escolhem a moldura (research V13).

| Grupo | Layout | Rotas |
|-------|--------|-------|
| `app/(app)` | `AppShell` | `/turmas/**`, `/disciplinas/**`, `/professores`, `/admin/**` |
| `app/(student)` | `StudentLayout` | `/minhas-turmas` |
| `app/(account)` | `AppShell` ou `StudentLayout` (abaixo) | `/conta/perfil`, `/conta/sessoes` |
| `app/(catalog)` | moldura própria do catálogo | `/design-system` (fora de produção) |
| `app/(auth)`, `app/(public)` | inalterados (tokens novos) | entrar, esqueci a senha, links de e-mail |

## AppShell (`components/layout/app-shell.tsx`)

```text
┌──────────────┬──────────────────────────────────────────────┐
│ DevTrack     │ [≡]  Turmas                         (Topbar)  │
│              ├──────────────────────────────────────────────┤
│ ▸ Minhas     │  Turmas › ADS3                    (Breadcrumb)│
│   disciplinas│  ADS3                                   (h1)  │
│ ▸ Turmas     │  2026.2 · Programação Orientada…  [Editar]    │
│              │  ─────────────────────────────── (PageHeader) │
│              │  conteúdo da página (largura ≤ --content-max) │
│ [AS] Ana   ⇕ │                                               │
│ ana@…        │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

- Menu lateral: o `AppSidebar` atual (itens por permissão, recolhível, lembrado em
  cookie); abaixo de `md` vira `Sheet`.
- Rodapé (emenda de 2026-10-29, pedido do produto, no padrão "NavUser" do shadcn/ui): o menu da
  conta (`components/shared/nav-user.tsx`) com as iniciais, o nome e o e-mail; ao clicar abre um
  `DropdownMenu` com o nome e o e-mail, "Meu perfil" e "Sair". "Meu perfil" saiu da lista de
  itens do menu e só aparece aí. Recolhido, só as iniciais (o nome como dica). O mesmo rodapé no
  `StudentLayout`.
- `Topbar`: botão do menu (`SidebarTrigger`, Ctrl/⌘+B) e o nome da área (mapa de
  navegação de `lib/navigation`, pela rota atual).
- Área principal: `<main id="conteudo" tabIndex={-1}>`, preenchimento `--gutter`,
  conteúdo até `--content-max`; o link "Pular para o conteúdo" continua o primeiro item
  de foco.

## StudentLayout (`components/layout/student-layout.tsx`)

> Emenda de 2026-10-03 (pedido do produto): o layout do aluno passou a usar o mesmo menu
> lateral do AppShell, no lugar da barra superior com os itens em linha. Continua sem itens de
> professor ou administração (FR-024, US5): só muda a forma da navegação.

```text
┌──────────────┬──────────────────────────────────────────────┐
│ DevTrack     │ [≡]  Painel                          (Topbar) │
│              ├──────────────────────────────────────────────┤
│ ▸ Painel     │        Olá, Ana                          (h1) │
│ ▸ Minhas     │        conteúdo (largura ≤ 960 px)            │
│   atividades │                                               │
│ ▸ Histórico  │                                               │
│ ▸ Minhas     │                                               │
│   turmas     │                                               │
│ [AS] Ana   ⇕ │                                               │
│ ana@…        │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

- Menu lateral com os primitivos do `AppSidebar` (recolhível a ícones, escolha lembrada no
  cookie `sidebar_state`, abaixo de `md` vira `Sheet`), dentro de `<nav aria-label="Menu do
  aluno">` com `aria-current="page"`. Itens por permissão, nunca por papel: Painel, Minhas
  atividades e Histórico (`atividades.proprias.visualizar`), Minhas turmas
  (`turmas.proprias.listar`); no rodapé, o menu da conta (emenda de 2026-10-29, abaixo).
- Sem itens de professor ou administração, sem "Usuários", sem "Menu principal".
- `Topbar` do AppShell (botão do menu, Ctrl/⌘+B, e o nome da área); área principal
  `<main id="conteudo" tabIndex={-1}>` com a largura de leitura (960 px).

## Escolha do layout de conta (`app/(account)/layout.tsx`)

- Lê `getMeForNavigation()` (já usado pelos layouts). `AppShell` se o usuário verificado
  tem ao menos uma permissão de `STAFF_AREA_PERMISSIONS` (nova constante em
  `lib/navigation`: `disciplinas.visualizar`, `turmas.visualizar` e as de `USER_AREAS`);
  senão `StudentLayout`. Sem sessão, o `proxy.ts` já redireciona. Só experiência de uso.

## Catálogo (`app/(catalog)/design-system/page.tsx`)

- `notFound()` em produção; sem sessão exigida; dados fixos.
- Índice por grupo (Ações, Formulários, Feedback, Contêineres, Dados, Navegação,
  Layouts), cada seção com os mostruários do registro e um contêiner de 768 px para a
  largura de tablet.
