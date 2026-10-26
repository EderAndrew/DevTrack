# Quickstart: 020 — Feedback dos Alunos

Local check of the feature after implementation (`docker compose up -d postgres postgres-test
mailpit`, `pnpm build`, `pnpm --filter api prisma migrate deploy`, `pnpm dev`).

## Tests

```bash
pnpm --filter api test -t "020/"                                   # integration + security of 020
pnpm --filter api test test/feedback-boundary.spec.ts              # no AI, mail, grading; no text in audit/logs
pnpm --filter web test -t "020/"                                   # dialog, student page, ADMIN list/detail, axe, XSS
pnpm --filter web test:e2e student-feedback                        # needs postgres-test + mailpit and `pnpm build`
```

## By hand

1. As a student (accept a class invitation from Mailpit), open "Painel", click **Enviar feedback**,
   choose "Problema", write a message and send: the toast says "Feedback enviado. Obrigado!".
2. Open **Meus feedbacks**: the feedback is "Recebido".
3. Open an exercise: "Enviar feedback" is there. Start a CONTROLLED work: its attempt page has no
   "Enviar feedback".
4. Send four more feedbacks; the sixth shows "Você já enviou 5 feedbacks nas últimas 24 horas…".
5. As the ADMIN, the menu shows **Feedbacks** with the count 5. Filter by "Problema", open the
   feedback: name, e-mail, the screen `/painel`, the message. Click "Em análise", then "Resolvido":
   the history has two rows and the count drops.
6. As the student, **Meus feedbacks** shows "Resolvido".
7. As a teacher, `GET /api/feedbacks` answers `403`, and the menu has no "Feedbacks".

## Retention

```bash
pnpm --filter api build && pnpm --filter api maintenance:run --job student-feedback
```

Deletes only RESOLVED/ARCHIVED feedbacks whose last status change is older than 24 months; logs the
count.
