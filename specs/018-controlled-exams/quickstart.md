# Quickstart: 018 — Prova em Modo Restrito com Avisos e Decisão do Professor

Prerequisites: the setup in the root CLAUDE.md (Node 24, Docker, `apps/api/.env`, migrations
applied).

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build && pnpm --filter api prisma migrate deploy
pnpm --filter api test -t "018/"                    # stories, schema, security suites
pnpm --filter web test -t "018/"
pnpm --filter web test:e2e exam                     # teacher + 2 students, E2E
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:exams   # release gate
```

Manual check with `pnpm dev`. You need two browsers (or a private window) and a class with 3
students:

1. As the teacher, open "Banco de Provas", create an exam with 3 questions (one of each type), each
   with a difficulty and a topic, and approve it.
2. Apply it to the class: duração 5 min, inatividade 30 s, limite para iniciar 2 min. Check the
   coverage tables before confirming.
3. Open "Chamada e prova", mark A and B. C sees nothing.
4. As A, read the rules and start. The timer shows 5:00 counting down. Switch tabs: back on the
   exam, "Aviso 1 de 3". Try to paste: "Aviso 2 de 3". Stay 31 s still: "Aviso 3 de 3".
5. Switch tabs again: "Prova encerrada por excesso de avisos…". In the teacher's panel, A shows
   "Encerrada por avisos — aguardando decisão" within ~5 s. Choose "Devolver prova": A sees
   "Retomar" with the remaining time. One more occurrence ends it again.
6. As B, start, answer one question and wait. In the last 10 s the countdown appears; at 0,
   "Tempo esgotado", and the review shows only the saved answer graded. (The 10- and 5-minute
   alerts need a longer exam: check them in a separate 12-minute exam.)
7. As the teacher, pause B during an exam with time left: B sees "Prova pausada pelo professor"; the
   timer keeps running in the panel. Release: B resumes.
8. After the end, A's hold offers "Confirmar cancelamento" or "Não cancelar". Confirm: A is
   "Cancelada — nota zero". "Liberar resultado" works only after every decision.
9. Mark C after the start limit: C sees "O prazo para iniciar esta prova terminou".
