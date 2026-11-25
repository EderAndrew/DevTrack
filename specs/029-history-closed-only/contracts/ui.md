# UI contract: Histórico só com provas e trabalhos encerrados ou cancelados (029)

Everything of the 028 UI contract stays except what follows. Texts live in the web only.

## Histórico (`/historico`)

- Header description: **"Provas e trabalhos encerrados ou cancelados pelo professor."**
- Tabs: **Todas · Aguardando · Corrigidas · Não entregues · Canceladas** (`?aba=canceladas`, accessible name
  "Canceladas, N"), each with its count.
- Cancelled row: pill **"Cancelada"** (`Status` neutral variant, text), Nota **"—"**, no link: the title is plain text,
  no "Ver atividade", no arrow; on phones the card is not a link.
- Date column ("Data"): with a delivery, as 028 ("13 de novembro" / "Sexta-feira, 16:47", "com atraso"); without one,
  **"Encerrada em 13 de novembro"** or **"Cancelada em 13 de novembro"** with the weekday and time below.
- Rows are never exercises: the "Exercício" badge and the points column text no longer appear here.
- Empty states: nothing at all (no search, all subjects) → **"Nenhuma atividade encerrada ainda."**; tab "Canceladas"
  empty → **"Nenhuma atividade cancelada."**; the others as 028.
- The three cards and the note "As notas aparecem aqui assim que a correção for concluída." unchanged.

## Minhas atividades

- The situation filter is again **Todas · Pendentes · Em andamento · Atrasadas · Entregues/concluídas**;
  `?situacao=concluidas` selects the last.
- Delivered active works and exams show their 012 status ("Entregue", "Corrigida"); exercises "Concluída".

## Painel

- "Concluídas" shows `counts.completed` (the Histórico's rows) and links to `/historico?materia=`; "Atrasadas" counts
  every overdue of the list. Nothing else changes.

## Accessibility

As 028: tabs announced with counts, situation as text, rows without a link are not focusable, axe in both themes.
