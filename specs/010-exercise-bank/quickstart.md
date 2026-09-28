# Quickstart: 010 — Banco de Exercícios

## 1. Automated checks (no real provider)

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter api test                      # 006–009 suites still pass; 010 bank, generation, views, security
pnpm --filter api test -t "010/"            # the 010 scenarios only (no `--`)
pnpm --filter web test                      # bank, manual set, AI request, batch review, syllabus language
pnpm --filter web test:e2e                  # manual set + AI batch through the OpenRouter mock (resets devtrack_e2e)
```

Check that:

- the boundary rules (3/10 exercises, 3/5 alternatives, one correct, 0–3 tricks ≤ multiple
  choice) hold in manual create, edit and AI output (`exercises/rules/*.spec.ts`);
- no AI output outside the request becomes an exercise (`010-us3-*`);
- the student view has no answer, correct flag, solution or explanation for any type
  (`010-student-view.spec.ts`);
- `modules/exercise-ai` never references tiers, families or catalog keys (guard test).

## 2. Release gates (costs cents; authorized to run without asking)

```bash
OPENROUTER_API_KEY=… EVAL_MODEL=openai-basic EVAL_RECORD=1 pnpm --filter api eval:exercises
OPENROUTER_API_KEY=… EVAL_MODEL=openai-basic EVAL_RECORD=1 pnpm --filter api eval:curriculum   # curriculum-agent v3 (language)
```

For each model that meets the thresholds, add the approval to its catalog entry and commit the
evidence. Until then "Criar com IA" is unavailable outside the automated tests. The generator
starts DISABLED: the admin enables it in "Operação de IA" after the gate.

## 3. Manual run (optional, costs money)

1. As a teacher, open a syllabus draft, choose "Java" in "Linguagem", confirm.
2. "Banco de Exercícios" → "Criar manualmente": three exercises, one of each type; save.
3. "Criar com IA": the subject, the confirmed syllabus, a topic; Intermediário; 10 exercises,
   the three types, "Distribuir automaticamente" (4/3/3), 2 pegadinhas; the language shows Java.
4. The batch turns GENERATED with 10 drafts; edit one, delete one, approve the rest; the bank
   shows 8 approved + the edited one flagged "Editado por você".
5. Filter the bank by the topic and "Gerado por IA"; search a word of a statement.
