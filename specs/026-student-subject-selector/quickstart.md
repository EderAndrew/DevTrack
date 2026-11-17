# Quickstart: Matéria atual do aluno (026)

## Automated

```bash
docker compose up -d postgres postgres-test mailpit
pnpm build
pnpm --filter api test -t "026/"              # API integration + security of this feature
pnpm --filter web test -t "026/"              # switcher, Painel, "Minhas atividades", "Minhas turmas"
pnpm --filter api test test/traceability.spec.ts
pnpm test                                     # whole suite: SC-005 (no change without the class)
```

## Manual check (local)

1. As a teacher, have two classes of two subjects (e.g. "Programação Orientada a Objetos" and "Banco de Dados") and
   invite the same student to both; apply one work in each and release a grade in one of them.
2. As that student, open `/minhas-atividades`: the card "Matéria" shows the most recent enrollment's subject; only its
   activities and summary cards appear.
3. Switch the subject: the list, count and summary cards change; the address gets `materia=`; reload keeps it. Time it
   (from choosing the option to the new list on screen, normal connection): target ≤ 2 s (`026/SC-003`).
4. Open `/painel`: counters, next activities and ranking are of the chosen subject; a counter opens "Minhas
   atividades" in the same subject.
5. Edit the address to a random UUID: the page falls back to the first subject with "Essa matéria não está mais
   disponível para você."
6. As the teacher, end the student's enrollment in the subject being viewed; within 5 s the student's page falls back
   with the notice.
7. Open `/minhas-turmas`: each class shows its subject.
