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
│ ▸ Meu perfil │  ─────────────────────────────── (PageHeader) │
│              │  conteúdo da página (largura ≤ --content-max) │
│ Ana Souza    │                                               │
│ [Sair]       │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

- Menu lateral: o `AppSidebar` atual (itens por permissão, recolhível, lembrado em
  cookie); abaixo de `md` vira `Sheet`.
- `Topbar`: botão do menu (`SidebarTrigger`, Ctrl/⌘+B) e o nome da área (mapa de
  navegação de `lib/navigation`, pela rota atual).
- Área principal: `<main id="conteudo" tabIndex={-1}>`, preenchimento `--gutter`,
  conteúdo até `--content-max`; o link "Pular para o conteúdo" continua o primeiro item
  de foco.

## StudentLayout (`components/layout/student-layout.tsx`)

```text
┌────────────────────────────────────────────────────────────┐
│ DevTrack      Minhas turmas   Meu perfil          [Sair]    │
├────────────────────────────────────────────────────────────┤
│        Minhas turmas                                  (h1) │
│        conteúdo (largura ≤ --reading-max… 960 px)          │
└────────────────────────────────────────────────────────────┘
```

- Sem menu lateral, sem itens de professor ou administração, sem "Usuários".
- `<nav aria-label="Menu do aluno">` com `aria-current="page"`; em telas estreitas os
  itens quebram linha, sem menu escondido.

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
