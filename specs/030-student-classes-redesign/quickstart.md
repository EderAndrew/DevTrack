# Quickstart: "Minhas turmas" do aluno redesenhada (030)

Prerequisites: the root CLAUDE.md setup (`docker compose up -d postgres postgres-test mailpit`, `pnpm build`).

## Automated

```bash
pnpm --filter @repo/contracts build && pnpm --filter @repo/contracts test
pnpm --filter api test test/integration/030-my-classes.spec.ts     # enrolledAt, own enrollment only, order (US1, US3)
pnpm --filter api test -t "030/"
pnpm --filter web test -t "030/"                                    # cards, filters, states, a11y (US1–US3)
pnpm --filter api test test/traceability.spec.ts
```

## Manual (dev)

1. `pnpm dev`; as a MANAGER, create a turma "Turma de Teste" (code QA001, year 2026, period 2026-2) and enroll a student;
   as a teacher, add a disciplina "Object Oriented Programming" to it. Add a second turma in 2025 for the same student.
2. As the student, open `/minhas-turmas`: header, subtitle, card "Ano letivo 2026", tab "Todas as turmas 1", one card
   with QA001, the disciplina, Professor, Ano 2026, Período 2026-2, "Entrada na turma" with the enrollment's date and
   time, "Acessar turma" (→ Minhas atividades of that subject) and "Ver ranking" (→ the ranking).
3. Choose "Ano: 2025" and "Todos os anos"; type "orient" and "qa0"; reload and go back — the choices stay.
4. Type "zzz": "Nenhuma turma encontrada." and "Limpar busca e filtro".
5. Light theme and a 360 px window: no horizontal scroll, the ranking panel below the data.
