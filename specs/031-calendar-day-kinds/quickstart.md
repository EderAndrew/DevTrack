# Quickstart: Calendário com tipos de data (031)

Prerequisites: `docker compose up -d postgres postgres-test mailpit`, `pnpm --filter api prisma migrate deploy`,
`pnpm build`, `pnpm dev`. A teacher with a disciplina da turma from 2026-08-03 to 2026-12-11 with a confirmed syllabus,
two topics on the meeting of 2026-11-18 (one completed), and a student enrolled in that turma.

## Teacher (US1, US2)

1. Open the disciplina → "Calendário". The days saved before 031 show as Aula with the same numbers (FR-011).
2. Click 2026-11-16 → modal "Marcar dia"; choose Prova, try "Confirmar" with an empty description (refused), type
   "P1 — Herança e polimorfismo", confirm.
3. Click 2026-11-20 (unmarked) → Feriado "Consciência Negra". Click 2026-11-27 → Evento especial "Semana acadêmica".
4. Click 2026-11-18 → Falta do professor, reason "Consulta médica", notice "Atividade no portal.".
5. "Salvar calendário": the resolution dialog lists the two topics of 18/11; the completed one offers only "Arquivar";
   move the other to 2026-11-25. Save → "Calendário salvo.".
6. Check: "Total de aulas selecionadas" dropped by one (18/11 left, 16/11 still counts), 20/11 and 27/11 are not numbered,
   the legend and the "Dias sem aula" list; Planejamento's "mover para aula" does not offer 18/11, 20/11 or 27/11.
7. Change 16/11 from Prova to Revisão: no resolution asked, its topics remain.

## Student (US3, US4)

1. Log in as the student → Painel with that matéria. The card "Seu calendário de aulas" opens on this week with today
   chosen.
2. Navigate to the week of 16–22 nov: dots on 16, 18, 20; 16 → "Revisão" + text; 18 → "Falta do professor" + "Atividade
   no portal." (never "Consulta médica"); 20 → "Feriado — Consciência Negra"; a normal class → only "Aula"; an unmarked day
   → "Nada marcado neste dia.".
3. Devtools → `GET /api/me/classes/<id>/calendar`: no topics, numbers, statuses or reason.
4. `GET /api/me/classes/<another class id>/calendar` → `404`; as the teacher → `403`.
5. Resize to 360 px and switch to the light theme: the week fits without horizontal scroll.

## Tests

```bash
pnpm --filter api test test/integration/031-       # API stories and security
pnpm --filter api test test/student-calendar-boundary.spec.ts
pnpm --filter @repo/contracts test
pnpm --filter web test 031/
pnpm --filter web test:e2e calendar               # local only
```
