# UI contract (031)

Texts live in the web only (`features/class-calendar/schemas/day-kinds.ts`, `features/student-calendar/schemas/`).

## Kinds

| Key | Label | Hint of the field | Encontro | Dot token (CK9) |
|-----|-------|-------------------|----------|-----------------|
| `CLASS` | Aula | — (no field) | yes | primary |
| `EXAM` | Prova | "Qual prova? Ex.: P1 — Herança" | yes | danger |
| `ASSIGNMENT` | Trabalho | "Entrega ou apresentação de qual trabalho?" | yes | warning |
| `REVIEW` | Revisão | "Revisão de quê?" | yes | info |
| `MAKEUP` | Reposição | "Reposição de qual aula?" | yes | info |
| `HOLIDAY` | Feriado | "Qual feriado?" | no | muted-foreground |
| `RECESS` | Recesso | "Qual recesso?" | no | muted-foreground |
| `SPECIAL_EVENT` | Evento especial | "Qual evento? Ex.: palestra, workshop" | no | success |
| `TEACHER_ABSENCE` | Falta do professor | "Motivo (só você vê)" + "Aviso para a turma (opcional)" | no | danger-text, hollow |

## Teacher: "Calendário" of the disciplina (changed)

- The month calendar of 004; each marked day shows the kind's short label or icon (accessible name "16 de novembro: Prova
  — aula 12") and encontros keep their number; a legend of the nine kinds under the calendar.
- Activating a day of the period (click, Enter/Space) opens the `Dialog` "Marcar dia — segunda-feira, 16 de novembro de
  2026": radio group of the nine kinds (Aula first and default on an unmarked day), the conditional field(s) with hint,
  counters of characters, the Falta note "Os alunos veem “Falta do professor” e o aviso, nunca o motivo.", buttons
  "Confirmar", "Cancelar" and, on a marked day, "Desmarcar dia". Focus returns to the day on close.
- "Total de aulas selecionadas: N" counts encontros; beside it "Outros dias marcados: M".
- The meeting list (004) shows the kind and description of each encontro; the non-meeting days are listed apart
  ("Dias sem aula") with kind and description (and the reason for a Falta, only here).
- "Salvar calendário": if a saved meeting with topics is leaving the meeting condition, the 004 `TopicResolutionDialog`
  opens for it first; then one request. Success "Calendário salvo."; errors through `messageForError`.

## Student: card "Seu calendário de aulas" in the Painel (new)

- In the Painel's main column after "Próximas" (and "Atrasadas"), only with the 026 matéria and
  `calendario.turma.visualizar`.
- Header: "Seu calendário de aulas"; below it the week range ("16–22 nov"); on the right the month and year of the Monday
  ("Novembro 2026"), the matéria name with a dot, and the buttons "Semana anterior" / "Próxima semana" (disabled at the
  period's first/last week).
- Seven day buttons Mon–Sun ("SEG 16"), `aria-pressed` on the chosen one, "hoje" in the accessible name of today, a dot in
  the kind's color when marked; accessible name "Segunda-feira, 16 de novembro: Aula" / "…: sem marcação".
- Detail region (`aria-live="polite"`) under the week: "Segunda-feira, 16 de novembro"; the kind label; the text when there
  is one; "<matéria> · Prof. <nome>"; unmarked → "Nada marcado neste dia."; nothing chosen → "Escolha um dia para ver o
  que há nele."
- States: loading skeleton; error "Não foi possível carregar o calendário." + "Tentar novamente"; no marks "O professor
  ainda não publicou o calendário desta matéria."; a `404` falls back as the 026 card does.
- 360 px: the seven days fit (compact cells), no horizontal page scroll; both themes.
