# Web UI Contract: 015

## Teacher

- **Nova atividade (Trabalho)** (`features/activities/components/new-activity.tsx`): fieldset
  "Como os alunos respondem" with two checkboxes — "Modo controlado" ("O aluno responde em tela
  cheia; saídas da tela e tentativas de copiar ou colar ficam registradas. Copiar e colar ficam
  bloqueados.") and "Ajuda da IA (3 perguntas por aluno)" ("A IA orienta sem dar a resposta. Você
  verá as perguntas e as orientações na correção."). When `GET /work-help/availability` is not
  available: checkbox disabled with "A ajuda da IA está indisponível: <motivo>". Hidden for
  Exercício. The edit form shows them disabled with "Não é possível mudar depois que um aluno
  iniciou." once started.
- **Detalhe da atividade**: badges "Modo controlado" and "Ajuda da IA" (text); roster columns
  "Saídas da tela" (count + time away), "Quedas de conexão" (count + time offline), "Copiar/colar bloqueados" and "Ajudas" ("2 de 3").
- **Correção da tentativa** (`attempt-review.tsx`): section "Registros do modo controlado" with
  the note "Registros de saída da tela. Uma saída não significa, sozinha, uso indevido." and the
  timeline (time, event, duration); in each question, "Ajuda da IA" with the student's question,
  the guidance (text + `CodeBlock`) and its status ("Bloqueada pela verificação" / "Fora do
  assunto" / "Falhou").

## Student

- **Detalhe** (012 page): for CONTROLLED, the notice "Este trabalho é feito em modo controlado"
  (tela cheia quando disponível; saídas da tela e tentativas de copiar/colar registradas e vistas
  pelo professor; nada é bloqueado ou entregue sozinho) and "Iniciar em modo controlado".
- **Responder em modo controlado** (`app/(focus)/minhas-atividades/[id]/responder`): no menu;
  header with title, `SaveStatus`, help counter and "Sair" (`ExamAlert` dialog "Sair da
  avaliação?", also on the browser back button; closing or reloading shows the browser's own
  prompt); `FocusViolationWarning` after each exit (texts of `exam-mode.md`, time from the
  server, else "Estamos registrando este evento"), with "Voltar para tela cheia" after a
  fullscreen exit; clipboard block message as an inline `Alert` near the field; typing-limit
  message on the answer.
- **Pedir ajuda** (both modes when enabled; amendment 2026-10-31): while the attempt is open, one chat icon fixed on the
  right of the screen, with the helps left, opens a `Sheet` on the right, in chat form. It holds the note "A IA orienta, mas
  não dá a resposta. Não escreva seu nome ou dados pessoais.", "Ajudas restantes: n de 3", every question and reply of the
  attempt oldest first, each labeled "Questão n", in an `aria-live` log, and a textarea (500, counter) with "Enviar" about the
  question on screen; the panel stays open after sending. Pending: "A IA está preparando uma orientação…". Each finished reply
  ends with the helps left, a fixed text of the screen and never of the model: "Ainda restam 2 ajudas.", "Ainda resta 1
  ajuda.", "Não restam mais ajudas."; an out-of-scope reply also says "Esta pergunta não usou uma ajuda."; unavailable/blocked:
  "A ajuda está indisponível agora; tente de novo em instantes." with "Nenhuma ajuda foi usada."; exhausted: no field, "Você já
  usou as 3 ajudas deste trabalho", the conversation still readable. Whoever may not ask (a group reader, 023) reads it with no
  field. After the submission, the orientations stay under each question as `HelpGuidance`, and there is no icon.
- **Histórico** (012): the delivered guidance per question and "Saídas da tela registradas: n"
  with times.

All with loading/empty/error/offline states, keyboard operable (dialog focus trap, Esc closes,
focus returns to the chat icon), design-system tokens only, text never rendered as HTML.
