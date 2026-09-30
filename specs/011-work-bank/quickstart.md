# Quickstart: 011 — Banco de Trabalhos

## 1. Automated checks (no real provider)

```bash
docker compose up -d postgres-test mailpit
pnpm build
pnpm --filter api test                      # 006–010 suites still pass unchanged (SC-013); 011 bank, grade, generation, views, grading, security
pnpm --filter api test -t "011/"            # the 011 scenarios only (no `--`)
pnpm --filter @repo/contracts test          # grade helpers, distribution, boundary/duplication guards
pnpm --filter web test                      # bank, manual work, AI request, requests, work page
pnpm --filter web test:e2e                  # manual work + AI work through the OpenRouter mock (resets devtrack_e2e)
```

Check that:

- the boundaries hold in manual create, edit and AI output: 0/1/10/11 questions, 2/3/5/6
  alternatives, 0/1/2 correct, 0/3/4 tricks and tricks above multiple choice, topics of another
  revision, subject or teacher (`works/rules/*.spec.ts`, `011-sc003-boundaries.spec.ts`);
- the grade sum equals the total for 0,50/10, 1,00/10, 0,50/5, 0,50/3 (0,17 · 0,17 · 0,16) and for
  every total × 1–10 questions, also after add, remove and reorder (`packages/contracts/test/work-grade.spec.ts`, `011-us2-grade.spec.ts`,
  `011-us2-recalculation.spec.ts`, SC-004); the
  database refuses a commit whose sum differs (deferred trigger test);
- no AI output outside the request becomes a work (`011-us4-*`), and no AI path reaches
  APPROVED (`011-us5-*`);
- the student preview has no answer key for any type (`011-student-view.spec.ts`, SC-007);
- the grading rules: multiple choice without AI, code never compared as text, technical failure
  never 0, no final open-answer grade without the teacher (`works/grading/*.spec.ts`, SC-011);
- `modules/works` and `modules/work-ai` import nothing from the exercise modules, execute no code
  and never reference tiers, families or catalog keys (guard tests).

## 2. Release gate (costs cents; authorized to run without asking)

```bash
OPENROUTER_API_KEY=… EVAL_MODEL=openai-basic EVAL_RECORD=1 pnpm --filter api eval:works
```

For a model that meets the thresholds, add the approval for `work-generation` to its catalog
entry and commit the evidence. Read the trick questions listed in the evidence before approving.
Until then "Criar trabalho com IA" is unavailable outside the automated tests. The generator
starts DISABLED: the admin enables it in "Operação de IA" after the gate.

## 3. Manual run (optional, costs money)

1. As a teacher with a confirmed Java syllabus: "Banco de Trabalhos" → "Criar trabalho
   manualmente": nota 0,50, three questions (one of each type) → the cards show 0,17 · 0,17 ·
   0,16; save as draft; approve (the code question without tests shows the warning).
2. "Ver como aluno": no expected answer, correct alternative, solution or private test case.
3. "Criar trabalho com IA": herança, polimorfismo, classes abstratas; Intermediário; nota 2,00;
   10 questions, three types, "Distribuir automaticamente" (4/3/3), 2 pegadinhas.
4. The request turns GENERATED with a DRAFT work linked to the three topics; edit a question,
   remove one (values recalculated to 0,23 · … summing 2,00), approve; the work shows "Editado
   por você" and origin "Gerado por IA".
5. Filter the bank by a topic and "Gerado por IA"; archive the work and restore it.
