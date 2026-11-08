# Quickstart: 025

Prerequisites: the 024 setup (API, web, `apps/mobile` dev build) and `docker compose up -d postgres postgres-test
mailpit`.

```bash
pnpm --filter api prisma migrate deploy        # applies <ts>_025_exam_student_nudge
pnpm build
pnpm --filter api test test/integration/025-us1-send.spec.ts
pnpm --filter api test -t "025/"               # every 025 test
pnpm --filter web test -t "025/"
pnpm --filter mobile test -t "025/"
pnpm --filter web test:e2e exam-nudge          # student dialog (local)
```

## Manual check

1. Web, as a teacher: apply an exam to a class, mark a student present.
2. Web, as the student: start the exam and leave the tab twice ("Aviso 2 de 3").
3. App, as the teacher: open the room — the student shows the bell; tap → confirm.
4. Student's page: within 10 s the dialog "Mensagem do professor" with their name; "Entendi" closes it; no new "Aviso n
   de 3", fullscreen kept.
5. App: the bell is back with "Último aviso fechado às …"; the student detail lists "Aviso do professor enviado" and
   "Aviso fechado pelo aluno".
6. Web monitor: "Avisos do professor enviados: 1", no send button. `curl` the send route with the web cookie → `403
   MOBILE_SESSION_REQUIRED`.
