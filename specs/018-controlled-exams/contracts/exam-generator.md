# Agent Contract: `exam-generator` v1 (018)

- **Risk level**: L2 (proposal). Its output becomes one DRAFT exam; only the teacher approves.
- **Status at registration**: DISABLED.
- **Permission**: `ia.provas.gerar`.
- **Task** `exam-generation`: mode GENERATION, minimum/preferred tier BASIC, max STANDARD, families
  `GENERATION_MODEL_FAMILIES`, capabilities `structuredOutput` and `tools`, fallback SAME_TIER,
  escalation ON_OUTPUT_INVALID, typical usage 6 000 in / 14 000 out, max output 32 000, timeout
  150 s. Quality gate: schema validity 1, config match 1, duplicates 0, topic coverage 0.9,
  injection clean 1. The model comes from the 009 policy; the request never names one.
- **Tool**: `read-exam-generation-request` (L1): the request's configuration and the chosen topics'
  titles and descriptions, as untrusted data blocks. Ownership: the request's teacher.
- **Output** `GeneratedExamSchema`:

```text
{ title, questions: { type, statement, explanation?, difficulty, topicIds: uuid[1..3],
    OPEN_ANSWER: { expectedAnswer, rubric? } | MULTIPLE_CHOICE: { alternatives[3..5], correctIndex, isTrickQuestion }
    | CODE: { languageId, instructions?, starterCode?, expectedSolution, testCases[0..20] } }[1..20] }
```

- **Validation** (`exam-ai/generation/validate-generated-exam.ts`, deterministic): count and
  per-type distribution equal to the request; trick count ≤ requested; every `topicId` among the
  request's; every question has a key and a difficulty; no duplicate statements; code language
  active in the catalog. A failure rejects the proposal (`exam_generation.rejected`, written by the
  agent's `proposal.rejected` hook in the transaction that ends the execution; the code is the
  validation's, or `OUTPUT_SCHEMA_INVALID`) and the 009 escalation may retry one tier up.
- **Materialize**: one `exams` row, `origin = AI_GENERATED`, `status = DRAFT`, values computed by
  the 011 rule, never from the output.
- **Release gate**: `OPENROUTER_API_KEY=… EVAL_MODEL=<key> EVAL_RECORD=1 pnpm --filter api eval:exams`
  writes `apps/api/test/fixtures/evaluations/exam-generation/<key>.json`; golden cases in
  `apps/api/test/fixtures/exam-generator/`; `EVAL_REPLAY=1` rewrites `recorded.json` for CI.
