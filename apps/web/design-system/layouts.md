# Layouts

Uma seção por layout construído (entradas do grupo "Layouts" do catálogo). Nenhuma URL muda
por causa do layout: os grupos de rota só escolhem a moldura.

| Grupo de rota | Layout | Rotas |
|---------------|--------|-------|
| `app/(app)` | `AppShell` | `/turmas/**`, `/disciplinas/**`, `/professores`, `/admin/**` |
| `app/(student)` | `StudentLayout` | `/minhas-turmas` |
| `app/(account)` | `AppShell` ou `StudentLayout`, por `accountLayoutFor` | `/conta/perfil`, `/conta/sessoes` |
| `app/(catalog)` | moldura simples | `/design-system` (fora de produção) |
| `app/(auth)`, `app/(public)` | molduras próprias | entrar, esqueci a senha, links de e-mail |

O tema (022) não é de nenhum layout: o layout raiz (`app/layout.tsx`) lê `GET /me` e põe
`<html data-theme="light">` quando `me.theme` é `LIGHT`, e `dark` com `DARK` ou sem sessão. Todas as
molduras acima, a tela de foco e os portais (diálogos, menus, avisos) seguem esse atributo; o catálogo tem
um seletor "Tema do catálogo" que só o troca durante a visita.

O layout de avaliação (Exam Mode) é só contrato nesta fase e será construído com a feature
de avaliações.

## AppShell

`components/layout/app-shell.tsx`

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

### Variantes

Menu expandido ou recolhido para ícones; abaixo de `md` o menu vira painel (`Sheet`).
`preview` só no catálogo (a área de conteúdo vira `div`). Página larga: a raiz da página com
`data-layout="wide"` tira o limite de `--content-max` e ocupa a largura toda, mantendo o
`--gutter`; só para telas de tabelas e listas largas (hoje, "Operação de IA", "Minhas disciplinas" e o detalhe da disciplina, "Minhas turmas" e as telas da turma, os bancos de exercícios, trabalhos e provas).

### Estados

Menu expandido, recolhido (lembrado no cookie `sidebar_state`) e aberto como painel em
telas estreitas; item da área atual ativo.

### Quando usar

Em toda tela do professor, do gestor e do administrador, e nas telas de conta de quem tem
alguma dessas áreas. As páginas começam com `PageHeader`.

### Quando não usar

Na área do aluno (`StudentLayout`); nas telas públicas e de entrada; na avaliação (Exam
Mode).

### Exemplo

```tsx
// app/(app)/layout.tsx
const [me, cookieStore] = await Promise.all([getMeForNavigation(), cookies()]);
return (
  <AppShell me={me} defaultOpen={cookieStore.get("sidebar_state")?.value !== "false"}>
    {children}
  </AppShell>
);
```

### Acessibilidade

Regiões: `nav` "Menu principal", `banner` (`Topbar`) e `<main id="conteudo" tabIndex={-1}>`,
alvo do link "Pular para o conteúdo" (primeiro item de foco). O menu mostra só as áreas que
existem e que o usuário pode abrir; Ctrl/⌘+B alterna o menu. No rodapé, o menu da conta
(`NavUser`, padrão do shadcn/ui): iniciais, nome e e-mail; Enter ou clique abre "Meu perfil" e
"Sair" (setas, Home/End e Esc do `DropdownMenu`).

## StudentLayout

`components/layout/student-layout.tsx`

```text
┌──────────────┬──────────────────────────────────────────────┐
│ DevTrack     │ [≡]  Painel                          (Topbar) │
│ ▸ Painel     ├──────────────────────────────────────────────┤
│ ▸ Minhas     │        Olá, Ana                          (h1) │
│   atividades │        conteúdo (largura ≤ 960 px)            │
│ ▸ Histórico  │                                               │
│ ▸ Minhas     │                                               │
│   turmas     │                                               │
│ [AS] Ana   ⇕ │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

### Variantes

O mesmo menu lateral do `AppShell` (primitivos de `components/ui/sidebar`), só com os itens
do aluno, a `Topbar` e o conteúdo até 960 px. Página larga: a raiz com `data-layout="wide"` ocupa a largura
toda, mantendo o `--gutter` (hoje, o "Painel", com o ranking das turmas numa coluna à direita a partir de `xl`). `defaultOpen` vem do cookie `sidebar_state`,
como no AppShell; `preview` só no catálogo.

### Estados

Expandido, recolhido a ícones (os nomes ficam como nomes acessíveis e dicas) e, em telas
estreitas, aberto como painel pelo botão da `Topbar`. Item atual com `aria-current="page"` e o
estilo ativo. Sem e-mail confirmado, nenhum item aparece; "Meu perfil" fica no menu da conta.

### Quando usar

Nas telas do aluno ("Minhas turmas") e nas telas de conta de quem não tem nenhuma área do
professor ou da administração (`accountLayoutFor(me) === "student"`, pelas permissões de
`STAFF_AREA_PERMISSIONS`, nunca pelo nome do papel).

### Quando não usar

Nas telas do professor e da administração (`AppShell`); na avaliação (Exam Mode, com
moldura própria sem navegação).

### Exemplo

```tsx
// app/(student)/layout.tsx
const me = await getMeForNavigation();
return <StudentLayout me={me}>{children}</StudentLayout>;
```

### Acessibilidade

Regiões: o menu lateral com `nav` "Menu do aluno", a `Topbar` (`banner`) e `<main
id="conteudo" tabIndex={-1}>`; ordem de foco: marca, itens do menu, menu da conta, botão do menu
e conteúdo. Nenhum item de professor ou administração.
