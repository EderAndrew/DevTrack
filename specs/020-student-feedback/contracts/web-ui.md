# Web UI Contract: 020

All text is Portuguese and lives in the web (`features/feedback`, `lib/messages/error-messages.ts`).
Statuses and categories are said in words (badge text), never by colour alone. The message is
rendered as text (`white-space: pre-wrap`), never as HTML or Markdown; URLs are not links.

## Student — entry point (`components/layout/student-layout.tsx`)

- Button **"Enviar feedback"** (`MessageSquarePlus` icon) at the bottom of the student menu, shown
  when the session has `feedbacks.enviar`. It lives in the student layout only: present on every
  student page, including the answering of exercises and NORMAL works; absent from the focus layout's
  attempt page of exams and CONTROLLED works (FR-003, SC-006).
- Menu item **"Meus feedbacks"** (`/meus-feedbacks`, `MessagesSquare` icon) when the session has
  `feedbacks.proprios.listar`; area name "Meus feedbacks" in `AREAS`.

## Student — dialog `FeedbackDialog` (`features/feedback`)

- Title "Enviar feedback"; description "Conte o que não funcionou, o que falta ou o que ajudou. Quem
  administra o DevTrack vai ler. Seu professor não vê."
- "Categoria" (required, radio group): Problema — "Algo não funciona como deveria"; Sugestão — "Uma
  ideia para melhorar"; Elogio — "Algo que ajudou você"; Outro.
- "Mensagem" (required, `Textarea`), counter "N de 2.000" (code points, J9), errors "Escreva pelo
  menos 10 caracteres." / "Use no máximo 2.000 caracteres." associated to the field.
- Line "Vamos registrar a tela em que você está para entender o contexto." (no path shown). The
  dialog sends `location.pathname` only when it passes `OriginPathSchema`, otherwise `null` (J2).
- Buttons "Cancelar" and "Enviar" ("Enviando…", disabled, `aria-busy` while pending). The
  `submissionId` is generated when the dialog opens and kept across retries of the same dialog.
- Success: the dialog closes and a toast "Feedback enviado. Obrigado!" with the link "Ver meus
  feedbacks".
- `429`: inline alert "Você já enviou 5 feedbacks nas últimas 24 horas. Tente de novo em N." (from
  `Retry-After`, in hours or minutes); the text stays in the field.
- Network error: inline alert "Não foi possível enviar agora. Tente de novo."; the text stays.

## Student — page "Meus feedbacks" (`/meus-feedbacks`, student layout)

- Heading "Meus feedbacks", the "Enviar feedback" button, the list newest first: category badge,
  date ("25 de out. de 2026"), status badge, the full message; "Carregar mais" for the next page.
- Empty: "Você ainda não enviou feedbacks." with the button.
- Status words: Recebido, Em análise, Resolvido, Arquivado. No history, no ADMIN name.

## ADMIN — menu (`components/shared/app-sidebar.tsx`, `lib/navigation.ts`)

- Item **"Feedbacks"** (`/admin/feedbacks`, `MessagesSquare` icon) when the session has
  `feedbacks.visualizar`, with a badge of the `received` count when above 0, read as "Feedbacks, N
  novos" by screen readers; area "Feedbacks" in `AREAS`.

## ADMIN — list (`/admin/feedbacks`)

- Heading "Feedbacks dos alunos"; filters "Situação" (Todas, Recebido, Em análise, Resolvido,
  Arquivado) and "Categoria" (Todas + the four), native selects kept in the URL with Portuguese values
  (`?situacao=em-analise&categoria=problema`; an unknown or repeated value means Todas).
- Table (it scrolls sideways on a phone, like the other lists): Categoria, Situação, Mensagem (excerpt),
  Aluno, Enviado em; the excerpt links to the detail. "Carregar mais" for the next page.
- Empty: "Nenhum feedback com esses filtros."

## ADMIN — detail (`/admin/feedbacks/[id]`)

- Category and status badges; the full message; "Aluno": name and e-mail; "Tela": the origin path in
  monospace text, or "Não registrada"; "Enviado em".
- "Mudar situação": buttons for the transitions allowed from the current status only (e.g. from
  Recebido: "Em análise", "Resolvido", "Arquivar"; from Resolvido or Arquivado: "Reabrir"). After a
  change: toast "Situação alterada para …" and the badge, the history and the menu count refresh.
  `409`: "Outra pessoa já mudou esta situação. Atualizamos a página." and a refetch.
- "Histórico": list oldest first, "Recebido → Em análise · Nome do ADMIN · data e hora"; "Sem
  mudanças ainda." when empty.

## Keyboard and accessibility

The dialog traps focus and returns it to the button; the radio group moves with arrow keys; errors
use `aria-describedby`; the success toast and the status change are announced (`role="status"`).
Guards: `vitest-axe` on the dialog, the student page, the ADMIN list and detail; the web XSS guard
extended with a feedback message containing HTML and a URL.
