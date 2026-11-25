# UI contract: "Minhas turmas" do aluno redesenhada (030)

Texts live in the web only (XXVI). Design System tokens and components only; dark and light themes; phone width
(360 px) without horizontal page scroll. Reference: the image of 2026-11-25 (layout and texts); the sidebar, the
breadcrumb, the bell, "Mensagens", "Precisa de ajuda?" and "Minha conta" of the image are the student layout, which
does not change.

## Page `/minhas-turmas?ano=&busca=` (`bem-vindo=1` kept from 003)

- The page (`app/(student)/minhas-turmas/page.tsx`) only checks the session and the permission; the `PageHeader` is
  rendered by the client component `MyClasses`, which holds the list and the chosen year.
- `PageHeader` **"Minhas turmas"** (the only `h1`) with description **"Suas disciplinas, professores e rankings em um só
  lugar."**
- `actions`: the card **"Ano letivo"** (caption in small caps, `CalendarDays` icon, the year in large type) — the chosen
  year, or the most recent with "Todos os anos". Hidden when the student has no turma.
- `?bem-vindo=1`: the 003 `Notice` "Você agora faz parte da turma." above everything, as today.

## Toolbar

- `Tabs` with one tab **"Todas as turmas"** and a count badge = cards of the chosen year (ignores the search); accessible
  name "Todas as turmas, <n>".
- Search: `Input type="search"`, visually hidden label **"Buscar turma ou disciplina"**, placeholder "Buscar turma ou
  disciplina", `Search` icon, `maxLength` 100; updates `busca` 300 ms after typing stops or on Enter (`router.replace`,
  keeping `ano`).
- Year: `NativeSelect` labelled **"Ano"** (shown "Ano: 2026" as the option text), options the student's years (most
  recent first) then **"Todos os anos"**; changing it updates `ano` (`router.replace`, keeping `busca`).

## Card (one per disciplina; `article` labelled by its `h2`)

Two columns on `md+` (data | ranking panel), stacked below.

| Part | Content |
|------|---------|
| Top line | `Badge` with the turma code, then the turma name (secondary text); "Encerrada"/"Arquivada" `Badge` when `cardStatusBadge` gives one |
| Heading `h2` | the disciplina name (display size); below, "Disciplina" (muted). Without a subject name: the turma name, no "Disciplina" |
| Separator | — |
| Facts (3 columns on `md+`, stacked on phones) | `User` **Professor** / teacher name; `CalendarDays` **Ano** / year; `BookOpen` **Período** / period or "—" |
| Entry | `Clock` **Entrada na turma** `formatDateTime(enrolledAt)` |
| Actions | primary `Button` link **"Acessar turma"** + `ArrowRight` → `/minhas-atividades?materia=<classId>` (aria-label "Acessar <disciplina · turma>"); text **"Código da turma: <code>"** |
| Ranking panel (with `ranking.turma.visualizar` only) | `Trophy` in a tinted square; **"Ranking da turma"** (`h3`); "Confira a classificação e acompanhe sua posição nesta turma."; separator; outline `Button` link **"Ver ranking"** + `ArrowRight` → the 013 ranking of the class (aria-label "Ver ranking de <disciplina · turma>") |

A turma without disciplinas: same top line, heading the turma name, Ano/Período/Entrada, and "Ainda não há disciplinas
nesta turma." instead of the actions; no ranking panel.

## Footer

Left **"Mostrando N de M turmas"** (`turma` when M = 1; N = cards shown, M = cards of the chosen year); right **"Entrada
mais recente primeiro"**. Both muted small text; `aria-live="polite"` on the left one.

## States

| State | Shows |
|-------|-------|
| Loading | `Skeleton` cards, `aria-busy` |
| Error | `role="alert"` with the error message and "Tentar novamente" (as today) |
| No turma | "Você ainda não participa de nenhuma turma." only (no card "Ano letivo", toolbar or footer) |
| Filter/search empty | "Nenhuma turma encontrada." and a `Button` **"Limpar busca e filtro"** (clears `busca`, `ano` → most recent) |
