# UI: 025

All texts in Portuguese, in the web (`apps/web/features/exam-nudge/schemas/exam-nudge.ts`) and in the app
(`apps/mobile/features/exam-room/schemas/exam-room.ts`); never in the API or contracts. No text says "fraude",
"cola" or "violação"; no state by colour only.

## Student — exam page (web)

- `ExamNudgeDialog` (`components/ui/alert-dialog.tsx`, `role="alertdialog"`, focus trapped):
  - Title: "Mensagem do professor" (never "Aviso", reserved for the 018 "Aviso n de 3")
  - Description: `${studentName}, o professor está acompanhando suas ações. Não tente fazer algo que possa prejudicar sua nota.`
  - One action: "Entendi" (Escape does the same). The dialog closes at once; the dismissal is sent and, on a network
    error, retried in the background (with the 015 offline buffer's back-off) until the server accepts; the nudge id
    is remembered in `sessionStorage` so the poll never re-shows it on this device (spec Edge Cases, FR-011, FR-013).
  - The dialog closes without dismissing when the poll returns `null` (dismissed in another tab) or the exam stops
    running (pause, hold, end).
- Mounted by `exam-shell.tsx` only while the exam is running; waits while the 018 `WarningDialog` is open; inactivity
  suspended while open (N8). The timer stays visible in the header.

## Teacher — mobile app

- Room row and student detail: a Lucide `Bell` button, only when `nudge.canSend` (or a pending one, shown disabled):
  - Accessible name: "Enviar aviso para ${name}".
  - Confirmation (`components/ui/dialog.tsx`): "Enviar aviso para ${name}?" · body "Só ${name} verá o aviso na tela
    da prova." · actions "Enviar aviso" / "Cancelar".
  - Pending: bell disabled with the label "Aviso enviado — aguardando o aluno".
  - After a dismissal: helper line "Último aviso fechado às HH:MM" (server time).
  - `409`: "Não é possível enviar o aviso agora." and the room is read again.
- Student detail (timeline), between the occurrences by time: "Aviso do professor enviado — HH:MM" and "Aviso
  fechado pelo aluno — HH:MM" / "Aguardando o aluno" / "Não visto". Marked "Não é uma ocorrência".

## Teacher — web

- Exam monitor (`exam-room-panel.tsx`): per student, when `pendingSince` → badge "Aviso do professor pendente"; when
  `sentCount` > 0 → "Avisos do professor enviados: n". No send button.
- Attempt records / review (`attempt-records.tsx`): the same timeline entries as the app.
