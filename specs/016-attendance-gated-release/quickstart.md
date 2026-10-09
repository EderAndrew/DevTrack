# Quickstart: 016 — Lista de Chamada e Liberação do Trabalho aos Presentes

Prerequisites: the setup in the root CLAUDE.md (Node 24, Docker, `apps/api/.env`, migrations
applied).

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build && pnpm --filter api prisma migrate deploy
pnpm --filter api test -t "016/"                    # stories, schema, security suites
pnpm --filter web test -t "016/"
pnpm --filter web test:e2e attendance               # teacher + 2 students, E2E
```

Manual check with `pnpm dev`. You need two browsers or one private window, and a class with 3
students:

1. As the teacher, apply an approved work. The activity shows "Aguardando chamada".
2. As student A, the work does not appear in "Minhas atividades".
3. As the teacher, open "Chamada", mark A and B, and choose "Liberar para os presentes". Within
   about 5 s, A sees the work without reloading. Student C (not marked) still sees nothing.
4. As A, start the work, answer one question, and choose "Sair da sala" → "Beber água". The page
   shows "Atividade pausada". Open the same work in another browser: only the notice appears, and
   a save there fails.
5. As the teacher, the panel shows "Fora da sala — Beber água, desde HH:MM". Choose "Liberar
   retorno". A sees "Retomar" and continues with the answer intact.
6. Mark C late. The work appears for C.
7. Close the activity. The roster shows C, A and B with their statuses and pauses. Any unmarked
   student is "Ausente", not "Não entregou".
8. Exercises: publish an exercise activity. Every student sees it, and there is no "Chamada" tab.
