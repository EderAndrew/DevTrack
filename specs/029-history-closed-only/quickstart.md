# Quickstart: Histórico só com provas e trabalhos encerrados ou cancelados (029)

## Automated

```bash
POSTGRES_PORT=5434 docker compose up -d postgres postgres-test mailpit
pnpm build
pnpm --filter api test -t "029/"
pnpm --filter api test -t "028/"              # the 028 tests updated by 029
pnpm --filter web test -t "029/"
pnpm --filter api test test/traceability.spec.ts
pnpm test                                     # whole suite (029/SC-005)
pnpm --filter web test:e2e student-history    # consent for the devtrack_e2e reset
```

## Manual check (local)

1. As a teacher, in one disciplina with an enrolled student, apply: work A, work B, exam C, work D and an exercise E.
2. As the student: deliver A and B, conclude E. Leave C and D undelivered.
3. As the teacher: close A (release its grade), close C, cancel D; leave B active.
4. As the student, `/minhas-atividades`: B ("Entregue") and E ("Concluída") are there, also under "Entregues/
   concluídas"; A, C and D are not.
5. `/historico`: A in "Corrigidas" with the grade; C in "Não entregues" with "Encerrada em …"; D in "Canceladas" with
   "Cancelada em …", "—" and no link; cards: entregues 1, aguardando 0, corrigidas 1. B and E are not there.
6. Painel: "Concluídas" shows 3 and opens the Histórico.
7. As the teacher, close B: within 5 s B leaves "Minhas atividades" and appears in "Aguardando".
8. As the student, open D's address directly (`/minhas-atividades/<id>`): not found.
