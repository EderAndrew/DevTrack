# Quickstart: 013 — Pontuação e Ranking dos Exercícios

Prerequisites: the project's `CLAUDE.md` setup (Docker postgres/postgres-test/mailpit, `.env`).

```bash
pnpm --filter api prisma migrate deploy          # applies <ts>_exercise_points (converts 012 EXERCISE activities)
pnpm build
pnpm --filter api dev & pnpm --filter web dev
```

Manual check (one teacher, one class with three students, exercises of each level approved):

1. Teacher → Turma → Atividades → Nova atividade → Exercício: pick a Básico multiple choice, an
   Intermediário open answer and an Avançado code exercise. No grade, deadline or late policy;
   "Total: 105 pontos". Publish now.
2. Student A → Painel: the activity shows "Sem prazo"; ranking card with three students at 0.
3. Student A answers the multiple choice right, the open answer, leaves the code blank →
   "Concluir exercícios" (dialog: 1 em branco). Result: Certo (15), Aguardando correção, Errado;
   answer key and explanations visible; "Você ganhou 15 pontos".
4. "Refazer", answer everything right, conclude: "Refazer não vale pontos"; still 15.
5. Teacher → the activity → Student A's attempt → open answer "Certo" + comment → ranking shows
   A with 45; student A sees "Certo" and the comment.
6. Teacher applies a second activity with the same Básico exercise; student A concludes it: that
   exercise shows "Já pontuado em outra atividade", 0 points.
7. Student B → "Ver ranking completo": A 1º (45), B and C share 2º with 0; B's row says "Você".
8. Teacher cancels the first activity → A drops to 0 in the ranking.

Automated:

```bash
pnpm --filter api test test/integration/013-   # per story
pnpm --filter api test:security                # 013 isolation, student view, concurrency, rate limits
pnpm --filter web test
pnpm --filter web test:e2e                     # student-portal + exercise-points
```
