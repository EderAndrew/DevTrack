# HTTP API Contract: 010 — Banco de Exercícios

The conventions of 001–009 apply:
- base `/api`, JSON;
- an allowed `Origin` and `Content-Type: application/json` on unsafe methods;
- strict schemas: an unknown field → `400 VALIDATION_ERROR` (including `teacherId`, `origin`,
  `status`, `humanReviewed`, `reviewedById`, `model`, `provider`, `tier`, `task`, free topic
  text);
- check order: origin → session (401) → verified e-mail (403) → permission (403) → validation
  (400) → context (404) → rule (409/422/429);
- errors are `{statusCode, code, message}`.

Schemas live in `packages/contracts/src/exercises/` (`exercises.ts`, `exercise-batches.ts`,
`programming-languages.ts`) and every route has an entry in `endpoints.ts`.

## Shared shapes

```ts
ExerciseType = "OPEN_ANSWER" | "MULTIPLE_CHOICE" | "CODE"
ExerciseDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED"
CognitiveObjective = "RECOGNIZE" | "UNDERSTAND" | "APPLY" | "ANALYZE" | "CREATE"

// Input of one exercise (manual create, add, edit): discriminated by `type`.
ExerciseInput =
  | { type: "OPEN_ANSWER", statement, explanation, difficulty, cognitiveObjective, syllabusItemId?, expectedAnswer }
  | { type: "MULTIPLE_CHOICE", statement, explanation, difficulty, cognitiveObjective, syllabusItemId?,
      alternatives: { text, isCorrect }[] /* 3–5, distinct, exactly one isCorrect */,
      isTrickQuestion?: boolean /* default false */ }
  | { type: "CODE", statement, explanation, difficulty, cognitiveObjective, syllabusItemId?,
      instructions, starterCode?, expectedSolution, languageId }

ExerciseTeacherView = ExerciseInput & {
  id, origin, status, version, language: { id, name } | null,
  topic: { syllabusItemId, itemText, subjectId, subjectName, syllabusRevisionId } | null,
  isTrickQuestion, humanReviewed, humanEdited, reviewedBy: { name } | null, reviewedAt,
  batchId, createdAt, updatedAt,
  alternatives?: { id, text, isCorrect, position }[]
}

// Built by allowlist on the server (research X12); served by no route in 010.
ExerciseStudentView = {
  id, type, statement, difficulty,
  instructions?, starterCode?, language?: { name },
  alternatives?: { id, text }[]            // presentation order; never isCorrect
}
```

## Programming languages

`GET /programming-languages` — any of `ementas.visualizar`, `questoes.visualizar`. `200 { id,
key, name }[]`, active only, ordered by name.

## Syllabus revision (004, changed)

`PUT /syllabus-revisions/:id` body gains `languageId: uuid | null` (omitted = none, the save
replaces the whole draft); `400 VALIDATION_ERROR` when the language is unknown or inactive (the
one the draft already has stays valid if it was deactivated since). A new revision based on a
confirmed one starts with its language. `SyllabusRevisionView` gains `language: { id, name } |
null`. Confirmed revisions stay immutable (`409 REVISION_CONFIRMED`).

## Exercises (`questoes.*`)

| Route | Permission | Body / query | Result |
|-------|------------|--------------|--------|
| `GET /exercises` | `questoes.visualizar` | `subjectId?, syllabusRevisionId?, syllabusItemId?, difficulty?, cognitiveObjective?, type?, origin?, status?` (default: DRAFT + APPROVED), `languageId?, query?` (≤ 200), `cursor?, pageSize?` (≤ 50) | `200 { items: ExerciseTeacherView[], nextCursor }` |
| `GET /exercises/:id` | `questoes.visualizar` | — | `200 ExerciseTeacherView`; other teacher → 404 |
| `POST /exercises/sets` | `questoes.criar` | `{ exercises: ExerciseInput[] /* 3–10 */, status: "DRAFT" | "APPROVED" }` | `201 { items }`; all or nothing |
| `POST /exercises` | `questoes.criar` | `ExerciseInput & { status }` | `201 ExerciseTeacherView` (single exercise, US5-6) |
| `PUT /exercises/:id` | `questoes.editar` | `ExerciseInput & { version }` (type can't change) | `200`; ARCHIVED → 409; stale version → `409 EXERCISE_VERSION_CONFLICT` |
| `POST /exercises/:id/approve` | `questoes.aprovar` | `{ version }` | `200`; already APPROVED → 200 no event |
| `POST /exercises/:id/archive` | `questoes.editar` | `{ version }` | `200` |
| `POST /exercises/:id/restore` | `questoes.editar` | `{ version }` | `200` back to `archivedFromStatus` |
| `DELETE /exercises/:id` | `questoes.editar` | `{ version }` | `200`; only DRAFT of a batch (else 409) |
| `POST /exercise-batches/:id/approve` | `questoes.aprovar` | `{ exerciseIds: uuid[] /* DRAFTs of the batch */ }` | `200 { items }`; approve several at once |

Validation codes: set size, alternatives, correct count, required fields per type →
`400 VALIDATION_ERROR` (contract refinements); language inactive/unknown → `400
VALIDATION_ERROR` (the catalog fixes one status per code); `syllabusItemId` missing or not the
teacher's → `404`, an item of the teacher's draft revision → `422 REVISION_NOT_CONFIRMED`
(research X9). The whole set is refused on any of them; nothing is written.

## Generation batches (`ia.exercicios.gerar` + `ia.execucoes.visualizar`)

`GET /exercise-generation/availability` → `{ availability: "AVAILABLE" | "AGENT_DISABLED" |
"MODEL_UNAVAILABLE" | "PAUSED" }` (006 semantics, no reason text).

`POST /exercise-batches` — 202:

```ts
{
  syllabusRevisionId: uuid, syllabusItemId: uuid,          // the topic (research X9)
  difficulty: ExerciseDifficulty,
  total: 3..10,
  types: ExerciseType[],                                    // 1–3 distinct
  distribution: { mode: "AUTO" } | { mode: "MANUAL", counts: Partial<Record<ExerciseType, 1..10>> },
  trickQuestions: 0..3,                                     // ≤ multiple choice; 0 without it
  idempotencyKey: uuid,
  regeneratedFromId?: uuid
}
→ 202 ExerciseBatchView
```

No `language` field: it comes from the revision (`422 SYLLABUS_LANGUAGE_REQUIRED` when code is
requested and the revision has none). Topic errors: `404` (not found / not the teacher's),
`422 REVISION_NOT_CONFIRMED`, `409 SUBJECT_ARCHIVED`. Limits: `429` (006 per minute, 008 per
agent, `RATE_LIMIT_EXERCISE_AI_PER_HOUR`). Availability errors: `409 AI_AGENT_DISABLED`,
`503 AI_MODEL_UNAVAILABLE`. Same key + same body → the same batch (200); same key + another body
→ `409 AI_IDEMPOTENCY_KEY_REUSED`.

```ts
ExerciseBatchView = {
  id, status: "PENDING" | "GENERATED" | "FAILED" | "CANCELLED",
  topic: { syllabusItemId, itemText, subjectName }, difficulty, total,
  counts: { OPEN_ANSWER, MULTIPLE_CHOICE, CODE }, trickQuestions, language: { name } | null,
  distribution: "AUTO" | "MANUAL", createdAt, generatedAt, failureCode: AiErrorCode | null,
  approved, discarded, archived, pendingReview, regeneratedFromId
}
```

`GET /exercise-batches` (`questoes.visualizar`) — cursor page of the teacher's batches.
`GET /exercise-batches/:id` (`questoes.visualizar`) — `{ batch: ExerciseBatchView, exercises:
ExerciseTeacherView[] }`.

The 006 routes keep working for the generator's execution (`GET /ai/executions/:id`); `POST
/ai/proposals/:id/decision` with APPROVE on an `EXERCISE_GENERATION` proposal → `409
AI_PROPOSAL_APPLY_REQUIRED` (research X15).

## New error codes

`EXERCISE_VERSION_CONFLICT` (409), `SUBJECT_ARCHIVED` (409), `SYLLABUS_LANGUAGE_REQUIRED` (422);
each with a web message in `lib/messages/error-messages.ts`.

## Curriculum Agent (007, changed)

`CurriculumProposalContent` gains `language: { key, name } | null` and its grounding flag; the
apply body's accepted fields gain `"language"` (research X18).
