# Contract: `exercise-generator` agent and `exercise-generation` task

Research X7, X8, X10, X11, X15, X16. Registered in code
(`apps/api/src/modules/exercise-ai/definitions/`), synced by the 006 registry.

## Task `exercise-generation` (009 policy)

```ts
{ key: "exercise-generation", mode: "GENERATION",
  minimumTier: "BASIC", preferredTier: "BASIC", maxTier: "STANDARD",
  allowedFamilies: ["openai", "anthropic"], requiredCapabilities: ["structuredOutput", "tools"],
  fallback: "SAME_TIER", escalation: "ON_OUTPUT_INVALID",
  quality: { schemaValidity: 1, configMatch: 1, duplicates: 0, topicCoverage: 0.9, injectionClean: 1 },
  typicalUsage: { inputTokens: 4_000, outputTokens: 6_000 },
  maxOutputTokens: 16_000, timeoutMs: 90_000 }
```

The exercise's difficulty never appears in the task; no code in `exercise-ai` reads tiers,
families or catalog keys (guard test).

## Agent `exercise-generator` v1

- `riskLevel: "L2_PROPOSAL"`, `initialStatus: "DISABLED"` (enabled by the admin after the release
  gate), `requiredPermission: "ia.exercicios.gerar"`.
- `resourceTypes: ["EXERCISE_GENERATION_BATCH"]`, `input: z.strictObject({})`.
- `toolKeys: ["read-exercise-generation-request"]`, `onToolDenied: "fail"`,
  `limits: { maxModelCalls: 3, maxToolCalls: 2 }`.
- `prompt: exercise-generation v1` — role, the structural rules of each type, the
  acceptable/forbidden trick-question patterns, "only the given topic", "use exactly the
  language given", "never answer outside the output schema".
- `output: { version: 1, schema: GeneratedExerciseBatchSchema }`.
- `proposal: { type: "EXERCISE_GENERATION", approveThroughDomain: true, build, materialize }`.

## Tool `read-exercise-generation-request`

L1, reads only the execution's own batch (006 ownership + `batch.ai_execution_id =
executionId`). Output:

```ts
{ topic: { itemText, groupTitle, syllabusTitle, competency },     // untrusted block
  request: { difficulty, total, counts: { OPEN_ANSWER, MULTIPLE_CHOICE, CODE },
             trickQuestions, language: string | null } }
```

## Output schema `GeneratedExerciseBatchSchema` (strict)

```ts
{ exercises: (
    | { type: "OPEN_ANSWER", statement, explanation, difficulty, cognitiveObjective, expectedAnswer }
    | { type: "MULTIPLE_CHOICE", statement, explanation, difficulty, cognitiveObjective,
        alternatives: { text, isCorrect }[], isTrickQuestion: boolean }
    | { type: "CODE", statement, explanation, difficulty, cognitiveObjective,
        instructions, starterCode: string | null, expectedSolution, language }
  )[] }
```

No field for ids, topic or batch: those come from the batch (FR-031).

## `build(output, { toolResults })` — pure

Takes the `request` of the tool's result and runs `validateGeneratedBatch` (research X10). On
success: `{ content: { exercises: [...with itemId] }, itemIds }` (item ids derived
deterministically from the execution and the position). Throws `ProposalRejected(reason)` with
one of `COUNT_MISMATCH`, `TYPE_MISMATCH`, `DIFFICULTY_MISMATCH`, `TRICK_MISMATCH`,
`LANGUAGE_MISMATCH`, `STRUCTURE_INVALID`, `DUPLICATE_STATEMENT`, `MISSING_REQUEST`.

## `materialize(tx, { proposalId, executionId, workspaceId, resource, content, get })`

Locks the batch row (`FOR UPDATE`), checks it is the teacher's, not yet generated, and linked to
this execution; inserts one `exercises` row (DRAFT, AI_GENERATED, topic/difficulty/batch/language
from the batch, `generation_item_id`) and its alternatives per content item; sets
`generated_at`; audits `exercise_batch.generated`. Any throw → the runner's transaction rolls back
and the execution ends FAILED.

## Release gate

`OPENROUTER_API_KEY=… EVAL_MODEL=<key> EVAL_RECORD=1 pnpm --filter api eval:exercises` runs the
golden set (`test/fixtures/exercise-generation/`) on one catalog entry and writes
`test/fixtures/evaluations/exercise-generation/<key>.json`; a model that meets the thresholds
gets the approval in `model-catalog.ts` (009 quality gate). The agent stays DISABLED until the
admin enables it.
