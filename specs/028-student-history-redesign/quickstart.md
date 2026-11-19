# Quickstart: Histórico do aluno redesenhado (028)

## Automated

```bash
POSTGRES_PORT=5434 docker compose up -d postgres postgres-test mailpit
pnpm build
pnpm --filter api test -t "028/"              # API integration + security of this feature
pnpm --filter web test -t "028/"              # Histórico: cards, tabs, search, class filter, rows, states
pnpm --filter api test test/traceability.spec.ts
pnpm test                                     # whole suite: SC-005 (the other student routes unchanged)
pnpm --filter web test:e2e student-history    # E2E (consent for the devtrack_e2e reset)
```

## Manual check (local)

1. As a MANAGER, have a turma with two disciplinas (two teachers or two subjects) and one student enrolled.
2. As the teachers: apply a work in each disciplina, an exam in one and an exercise with an open question in the
   other; release one work's grade with feedback; grade the other work without releasing it.
3. As the student: deliver everything, conclude the exercise. Open `/historico`:
   - cards: entregues 4, aguardando 3 (unreleased work, exam, exercise waiting for the teacher), corrigidas 1;
   - rows newest first; the released work shows "x,xx de y,yy", the bar and "Com feedback"; the graded-but-unreleased
     one shows "Aguardando correção" and no number; the exercise shows "Concluída" and "Pontos aguardando correção".
4. Click "Corrigidas" (1 interaction, `028/SC-003`): only the released work; the address has `aba=corrigidas`; reload
   keeps it.
5. Type part of a title with different case/accents: rows and tab counts follow, cards don't. Time it: ≤ 2 s
   (`028/SC-004`).
6. Choose a disciplina in "Matéria": cards, counts and rows narrow to it. Edit the address to a random UUID: the notice
   "Essa matéria não está mais disponível para você." and "Todas as matérias".
7. As the teacher, release the second work: within 5 s (page visible) it moves to "Corrigidas" and the cards update.
8. Phone width (360 px) and light theme: no horizontal scroll; rows become cards; everything readable.
