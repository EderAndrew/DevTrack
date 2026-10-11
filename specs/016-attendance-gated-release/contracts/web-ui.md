# Web UI Contract: 016

## Teacher

### Activity list and detail

- `PRESENT_ONLY` works show "Aguardando chamada" until the first presence, then "n de m presentes".
  The text is always present, never colour only.
- Exercises and older works show nothing new.

### "Chamada" tab

The tab is in the activity detail of a `PRESENT_ONLY` work (`features/attendance`). Since the 012 amendment of 2026-10-11 it opens the activity's "Chamada e alunos" tab, above the roster.

- **Before the release**: a checklist of the class with "Marcar todos" and "Desmarcar todos", the
  counter "n de m selecionados", and the primary button "Liberar para os presentes" (confirm dialog
  "Liberar o trabalho para n alunos?").
- **After the first release**: the list becomes the room panel, refreshed every 5 s. Each student
  shows a status badge with text:

  | Status | Badge | Action |
  |---|---|---|
  | not marked | "Não marcado" | "Marcar presente", which releases at once |
  | present, not started | "Presente" | "Desmarcar" |
  | answering | "Respondendo" | "Pausar aluno" (confirm dialog) |
  | out of the room | "Fora da sala — <motivo>, desde HH:MM (n min)" | primary "Liberar retorno" |
  | submitted | "Entregou" | — |

  Out-of-room rows sort first.
- **Unmark refused** (`409 ATTENDANCE_STARTED`): the message is "O aluno já iniciou. Use Pausar
  aluno."

### Roster (012)

- The status "Ausente".
- The columns "Presença" (HH:MM) and "Pausas" (count and time away; "Fora da sala" when open).

### Attempt review

- The section "Saídas da sala" lists each pause: motivo, quem pausou, saída, retorno, duração.
- An open pause in a closed activity reads "Encerrada com a atividade".

## Student

### List, dashboard and detail

- These views poll every 5 s while visible, so a late student sees the work appear.
- A work the student was not marked for never appears, and the student sees no hint of it.

### Answering (NORMAL and the 015 focus page)

**"Sair da sala"** is a button in the answering header, next to "Sair". It opens a dialog:

- radio options "Ir ao banheiro", "Beber água", "Atender o telefone" and "Outro" (with an optional
  text field of up to 200 characters, under the label "Motivo (opcional, sem dados pessoais)");
- the notice "A atividade ficará pausada até o professor liberar o seu retorno. O prazo continua
  correndo.";
- the buttons "Confirmar saída" and "Cancelar".

When the connection is down, the dialog shows "Sem conexão. Avise o professor antes de sair."
instead of the confirm button.

**Paused notice** (a full page, replacing the questions):

- the title "Atividade pausada";
- the text "Ao voltar, peça ao professor para liberar o seu retorno.";
- the reason and "Saída às HH:MM";
- the deadline, as a reminder.

The page polls every 5 s. When the teacher releases the return, it shows "Retorno liberado" and
the button "Retomar". In CONTROLLED mode, the 015 start notice comes first
("Retomar em modo controlado").

**Pause by the teacher, or `409 ATTEMPT_PAUSED` on a save**: the same notice appears, with the
reason "Pausado pelo professor". Unsent answers stay in the browser and are sent after the resume
(012 FR-019).

### History

A submitted work lists the student's own pauses: reason, exit, return and duration.

## Accessibility and design system

- The dialogs use the design-system `Dialog`/`ExamAlert`, with focus trapped and returned, and
  every action is reachable by keyboard.
- Room badges use `Badge` with text.
- The pause notice is announced with `role="status"`. When the return is released, the
  notification is announced politely.
- Tests: Testing Library with `vitest-axe` and the keyboard helpers.
