# Quickstart: Turmas do gestor e disciplinas da turma (027)

Prerequisites as in `CLAUDE.md` (Node 24, pnpm 11, Docker; `docker compose up -d postgres postgres-test mailpit`).

```bash
pnpm --filter api prisma migrate deploy        # applies the 027 migration = the transition (research Q9)
pnpm build && pnpm dev
```

## Walkthrough (manual)

1. **Gestor** (a MANAGER, or the ADMIN): `/gestao/turmas` → "Nova turma" "ADS 3NA", code `ADS-3NA`, 2026, `2026.2`.
2. On the cohort page: "Adicionar aluno" with a new e-mail → "Enviar convite"; Mailpit (`:8025`) shows the invitation
   naming only the turma. Accept it in a private window → the student is enrolled.
3. "Adicionar aluno" with the e-mail of an existing student → "Incluir na turma"; Mailpit shows the notice (no link
   token); the student sees the cohort in "Minhas turmas" at once.
4. **Professor**: `/turmas/nova` → search "ads 3na" → pick it, pick "Banco de Dados" → the disciplina da turma opens
   with calendar, plan and activities as today; the "Alunos" tab is read-only.
5. A second teacher adds "Redes" to the same cohort. The student's "Matéria" card offers both.
6. The teacher sets the calendar's end in the past (or advance the clock in tests) → "Encerrar disciplina" and
   "Arquivar disciplina" appear; before it, `POST /classes/:id/status` answers `409 CLASS_CALENDAR_NOT_ENDED`.
7. The gestor "Encerra" the cohort at the end of the year → the student sees it under 2026 as "Encerrada" and opens
   its activities read-only; the card no longer offers it.

## Tests

```bash
pnpm --filter api test test/integration/027-        # cohorts, invitations, direct enrollment, classes, transition
pnpm --filter api test test/security/027-           # permission matrix, isolation, lookup rate limit, concurrency
pnpm --filter api test test/cohorts-boundary.spec.ts
pnpm --filter web test -t "027/"
pnpm --filter web test:e2e manager-classes          # local only
pnpm --filter api test                              # SC-005: the 004–026 suites still pass (factories updated)
```
