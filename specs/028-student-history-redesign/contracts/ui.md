# UI contract: Histórico do aluno redesenhado (028)

Texts live in the web only (XXVI). Design System tokens and components only; dark and light themes; phone width
(360 px) without horizontal page scroll. Reference: the image of 2026-11-19 (layout and texts); the sidebar, menu,
breadcrumb, bell and "Todas as entregas" button of the image are not built.

## Page `/historico?aba=&busca=&materia=`

- Header: the `PageHeader` "Histórico" with the description **"Acompanhe suas entregas, correções e resultados."**
- Address: `aba` = `aguardando` | `corrigidas` (anything else = Todas); `busca` = the search text; `materia` = a class id (as 026).

## Summary cards (top, three columns on wide screens, stacked on phones)

| Card | Icon (decorative) | Number | Caption |
|------|-------------------|--------|---------|
| **Atividades entregues** | `FileText` | `totals.delivered` | "Seu histórico de entregas" |
| **Aguardando correção** | `Clock` | `totals.awaiting` | "Você já fez a sua parte" |
| **Atividades corrigidas** | `Check` | `totals.graded` | "Resultado disponível" (success tone) |

Numbers with two digits minimum ("04"), the full number in the accessible text ("4 atividades entregues").

## Toolbar (inside the list panel)

- `Tabs` **Todas** · **Aguardando** · **Corrigidas**, each with its count (`tabCounts`) in a small badge; the accessible
  name includes it ("Aguardando, 3"). Changing tab: `router.replace` with `aba`, keeping `busca` and `materia`.
- Search: `Input type="search"`, label (visually hidden) **"Buscar atividade"**, placeholder "Buscar atividade…",
  magnifier icon; updates `busca` 300 ms after typing stops or on Enter; maximum 100 characters (`maxLength`).
- Subject filter: `NativeSelect` labelled **"Matéria"** (visible label on phones, visually hidden on wide screens with
  the filter icon); first option **"Todas as matérias"**, then "Minhas turmas" in order with the 026 label
  ("<disciplina> · <turma>", disambiguated as 026). Changing it: `router.replace` with `materia`.

## List

Wide screens: a `Table` with caption "Atividades que você entregou." and the columns **Atividade · Tipo · Turma ·
Entregue em · Situação · Nota** and a last column without title for the arrow.

| Column | Content |
|--------|---------|
| Atividade | the title as a link (primary tone) and, below, **"Ver atividade"** (secondary text, same link target, `aria-hidden` duplicate avoided: one link with the title, "Ver atividade" as its visual caption) |
| Tipo | `Badge` "Trabalho" / "Prova" / "Exercício" |
| Turma | the turma name; below, the subject (secondary); only the turma without a subject |
| Entregue em | "13 de novembro"; below, "Sexta-feira, 16:47"; "com atraso" appended to the second line when late |
| Situação | `Status` pill from `situation`: GRADED → "Corrigida", AWAITING → "Entregue", EXERCISE → "Concluída" (+ " com atraso" when `late`) |
| Nota | GRADED work/exam: **"1,80"** large + "de 3,00", a `Progress` (value = grade/total × 100, clamped 0–100, `aria-label` "Nota 1,80 de 3,00") and the `Badge` "Com feedback" when `hasFeedback`; AWAITING work/exam: **"Aguardando correção"** (warning tone); EXERCISE: "45 de 60 pontos" or "Pontos aguardando correção" (013 `pointsSummary`), never a `Progress` |
| (arrow) | `ChevronRight` link to the activity, accessible name "Abrir <título>" |

Phones (below `md`): the same content as one card per row (title, type badge, turma · disciplina, date line, pill,
grade), the whole card one link.

Footer of the panel: **"Exibindo N de M atividades"** (N = loaded rows, M = `total`) at the left and **"Mais recentes
primeiro"** at the right; "Carregar mais" (secondary button) while `nextCursor` exists.

Below the panel: an info icon and **"As notas aparecem aqui assim que a correção for concluída."**

## States

- Loading: "Carregando seu histórico…" (today's).
- No delivery at all (`totals.delivered = 0`, no search, all classes): `EmptyState` **"Você ainda não entregou nenhuma
  atividade."** (today's), no toolbar.
- Tab empty (no search): **"Nenhuma entrega aguardando correção."** / **"Nenhuma entrega corrigida ainda."**
- Search or class with no match: **"Nenhuma atividade encontrada."** with the button **"Limpar busca e filtro"**
  (clears `busca` and `materia`, keeps `aba`).
- Subject not available (address or `404`): `Alert` (info) **"Essa matéria não está mais disponível para você."** (the
  026 text), then the page as "Todas as matérias".
- Load error: today's `LoadFailed` with "Tentar novamente".

## Accessibility

- Tabs: Radix roving focus (arrow keys), the selected tab announced; the list region labelled by the selected tab.
- Every control has a name; the situation and the grade are text, never colour only; the progress bar has its value
  in text beside it.
- axe (WCAG 2.2 AA) in both themes; contrast tests of the new tones; Tab order: cards are not focusable, then tabs →
  search → subject filter → rows → "Carregar mais".
