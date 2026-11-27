# Quickstart: 032 (dev environment)

Prerequisites: `docker compose up -d postgres postgres-test mailpit`, `pnpm --filter api prisma migrate deploy`,
`pnpm dev`; a teacher with a disciplina da turma, a confirmed exam in the Banco de Provas, a work, and two enrolled students.

1. **Exam with a period (US1)**: apply the exam "Agora" with Término 30 min ahead and duration 20 min. The form has no
   "Limite para iniciar". The detail shows "Período: … → …"; the monitor "Termina às …".
2. **Late arrival (US1-2)**: after 15 min, mark student A present; A starts and the timer shows ~15 min (capped, US2-1).
3. **Cap (US2-2)**: let the period end; A's save is refused as time over and the attempt settles on the next touch.
4. **Attendance after the end (US1-3)**: mark student B → "O período terminou…", B still has no access.
5. **Extension (US1-7)**: apply another exam, start A, then "Estender término" 10 min later → A's timer grows; try an
   earlier time → refused.
6. **Work (US3)**: apply a work with a period; no "Prazo"/"Política de atraso"; after the end saves and hand-in are refused.
7. **Migration (US4)**: on a copy of a pre-032 database, run the migration and compare each exam's `deadline` with the old
   `publish_at + window + duration` and each work's `deadline`/`late_policy`; a legacy `ACCEPT_MARKED` work still accepts a
   late hand-in marked late.
8. **Mobile**: the installed app lists the exam with "Encerra às" = the period's end and opens the room unchanged.
