# UI contract: Matéria atual do aluno (026)

Texts live in the web only (XXVI). Design System tokens and components only; dark and light themes; phone width.

## `SubjectSwitcher` (Painel and "Minhas atividades")

- Position (amended 2026-11-17): in the page header's actions, at the right of the title on wide screens — beside
  "Olá, <nome>" on the Painel and beside "Minhas atividades" — and under the title, full width, on phones; so it comes
  before the counters/summary cards. A compact card of fixed width on wide screens.
- A card with the decorative `BookOpen` icon and a `NativeSelect` labelled **"Matéria"** (`<label for>`).
- Options: the student's classes from "Minhas turmas", in its order. Text: `"<disciplina> · <turma>"`; only `"<turma>"`
  without a subject; when two options read the same: `"<disciplina> · <turma> · <período> · <professor>"`.
- One option only: the select shows it and the card's caption says **"Sua única matéria"**.
- Changing the option: `router.replace` to the same page with `materia=<classId>`, keeping `situacao` and `tipo`.
- Not shown when the student has no ACTIVE enrollment (empty states of today).
- Fallback notice (FR-011), an `Alert` (info) under the page header, full width, before the page's content:
  **"Essa matéria não está mais disponível para você."**
  Shown when the address names a class not in the list, or when the list/dashboard answered `404` for it.
- While "Minhas turmas" loads: the page's loading state of today ("Carregando suas atividades…").

## "Minhas atividades" (`/minhas-atividades?materia=&situacao=&tipo=`)

- Summary cards, "Exibindo N atividades", the list and "Carregar mais" use the chosen class.
- "Limpar filtros" clears `situacao` and `tipo` only; it never removes `materia`.
- Empty states unchanged ("Você ainda não tem atividades." / "Nenhuma atividade com esses filtros.").

## Painel (`/painel?materia=`)

- Counters, "Próximas atividades", "Atrasadas — ainda aceitam entrega" and "Ranking das turmas" use the chosen class.
- Counter links and "Ver todas" go to `/minhas-atividades?materia=<classId>[&situacao=…]`.

## "Minhas turmas" (`/minhas-turmas`)

- Each class shows its subject name ("Disciplina: <nome>") when it has one.

## Accessibility

- The select has a visible label and is fully operable by keyboard; the subject is always written in text.
- axe (WCAG 2.2 AA) and the Tab order tests of each page include the switcher before the counters/filters.
