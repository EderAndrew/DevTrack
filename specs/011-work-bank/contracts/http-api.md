# HTTP API Contract: 011 — Banco de Trabalhos

The conventions of 001–010 apply:
- base `/api`, JSON;
- an allowed `Origin` and `Content-Type: application/json` on unsafe methods;
- strict schemas: an unknown field → `400 VALIDATION_ERROR` (including `teacherId`, `origin`,
  `status` where not accepted, `value`, `gradingStrategy`, `humanReviewed`, `reviewedById`,
  `model`, `provider`, `tier`, `family`, `task`, `instructions` for the AI, free topic text);
- check order: origin → session (401) → verified e-mail (403) → permission (403) → validation
  (400) → context (404) → rule (409/422/429);
- errors are `{statusCode, code, message}`.

Schemas live in `packages/contracts/src/works/` (`enums.ts`, `grade.ts`, `works.ts`,
`work-generation.ts`, `grading.ts`) and every route has an entry in `endpoints.ts`. Nothing of
`packages/contracts/src/exercises/` changes.

## Shared shapes

```ts
WorkQuestionType = "OPEN_ANSWER" | "MULTIPLE_CHOICE" | "CODE"
WorkDifficulty = "BASIC" | "INTERMEDIATE" | "ADVANCED"
WorkOrigin = "MANUAL" | "AI_GENERATED"
WorkStatus = "DRAFT" | "APPROVED" | "ARCHIVED"
WorkGradingStrategy = "EXACT_MATCH" | "TEST_CASES" | "AI_REVIEW"
TestCaseVisibility = "PUBLIC" | "PRIVATE"
Grade = string   // input: "0.5" or "0.50" (dot, 0–2 decimals), 0.01–100.00; output: always "0.50" (research W3)

WorkTopicsInput = {
  syllabusRevisionId: uuid,            // a confirmed revision of the work's subject
  syllabusItemIds: uuid[]              // 1–10 distinct items of that revision
} | null                               // no topic

// One question (create and edit): discriminated by `type`. `id` only on edit, for an existing one.
WorkQuestionInput =
  | { id?, type: "OPEN_ANSWER", statement, explanation?, topicItemIds?: uuid[] /* 0–3 of the work */,
      expectedAnswer, rubric? }
  | { id?, type: "MULTIPLE_CHOICE", statement, explanation?, topicItemIds?,
      alternatives: { text, isCorrect }[] /* 3–5, distinct, exactly one isCorrect */,
      isTrickQuestion?: boolean /* default false */ }
  | { id?, type: "CODE", statement, explanation?, topicItemIds?,
      instructions?, starterCode?, expectedSolution, languageId,
      testCases?: { input, expectedOutput, visibility }[] /* 0–20 */ }

WorkInput = {
  subjectId: uuid, title /* 1–200 */, description? /* ≤ 5 000 */,
  difficulty?: WorkDifficulty | null, totalGrade: Grade,
  topics: WorkTopicsInput,
  questions: WorkQuestionInput[]        // 1–10, in order; totalGrade ≥ 0.01 × count
}
```

Positions come from the array order; values are computed (research W4) — the body has no
`value` or `position`.

```ts
WorkTeacherView = {
  id, subject: { id, name }, syllabusRevisionId: uuid | null,
  topics: { syllabusItemId, itemText, groupTitle }[],
  title, description, difficulty, totalGrade: Grade, questionCount,
  origin, status, archivedFromStatus, version,
  humanReviewed, humanEdited, reviewedBy: { name } | null, reviewedAt,
  generationRequestId: uuid | null,
  warnings: { code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions: int[] }[],
  questions: {
    id, position, type, gradingStrategy, value: Grade, statement, explanation,
    topicItemIds: uuid[],
    expectedAnswer?, rubric?,                                          // OPEN_ANSWER
    alternatives?: { id, position, text, isCorrect }[], isTrickQuestion, // MULTIPLE_CHOICE
    instructions?, starterCode?, expectedSolution?, language?: { id, name },
    testCases?: { id, position, input, expectedOutput, visibility }[]  // CODE
  }[],
  createdAt, updatedAt
}

// Built by allowlist on the server (research W14).
WorkStudentView = {
  id, title, description, totalGrade: Grade,
  questions: {
    id, position, type, value: Grade, statement,
    instructions?, starterCode?, language?: { name },
    publicTestCases?: { input, expectedOutput }[],                      // PUBLIC only
    alternatives?: { id, text }[]                                       // presentation order; never isCorrect
  }[]
}

WorkSummary = { id, subject: { id, name }, title, difficulty, totalGrade, questionCount, origin,
  status, topics: { syllabusItemId, itemText }[], humanEdited, createdAt, updatedAt }
```

## Works (`trabalhos.*`)

| Route | Permission | Body / query | Result |
|-------|------------|--------------|--------|
| `GET /works` | `trabalhos.visualizar` | `subjectId?, syllabusRevisionId?, syllabusItemId?, origin?, status?` (default DRAFT + APPROVED; `ARCHIVED` only when asked), `difficulty?, createdFrom?, createdTo?` (dates), `query?` (≤ 200), `cursor?, pageSize?` (≤ 50, default 20) | `200 { items: WorkSummary[], nextCursor }` |
| `GET /works/:id` | `trabalhos.visualizar` | — | `200 WorkTeacherView`; another teacher's → 404 |
| `GET /works/:id/student-preview` | `trabalhos.visualizar` | — | `200 WorkStudentView` ("Ver como aluno"; the same builder 012 serves to students) |
| `POST /works` | `trabalhos.criar` | `WorkInput & { status: "DRAFT" \| "APPROVED" }` | `201 WorkTeacherView`; origin MANUAL; all or nothing; no AI |
| `PUT /works/:id` | `trabalhos.editar` | `Omit<WorkInput, "subjectId"> & { version }` (question `type` can't change for an existing `id`) | `200 WorkTeacherView`; values recalculated; ARCHIVED → `409 INVALID_STATE_TRANSITION`; stale version → `409 WORK_VERSION_CONFLICT` |
| `POST /works/:id/approve` | `trabalhos.aprovar` | `{ version }` | `200`; already APPROVED → 200 no event; ARCHIVED → 409 |
| `POST /works/:id/archive` | `trabalhos.arquivar` | `{ version }` | `200`; already ARCHIVED → 200 no event |
| `POST /works/:id/restore` | `trabalhos.arquivar` | `{ version }` | `200` back to `archivedFromStatus`; not ARCHIVED → 409 |

Validation (all → `400 VALIDATION_ERROR` from the contract refinements, nothing written): 0 or
more than 10 questions; alternatives count, distinct texts, correct count; required answer key
per type; more than 20 test cases; grade format, range or less than 0,01 per question; more than
10 topics or a repeated one; a question's topics not among the work's or more than 3;
`isTrickQuestion` on a non multiple choice.
Data checks: a language unknown or inactive → `400 VALIDATION_ERROR` (an inactive one already on
the question stays valid); subject, revision or item not the teacher's or not related → `404`; a
draft revision → `422 REVISION_NOT_CONFIRMED`; an `id` that isn't a question of this work → `404`.

## Generation (`ia.trabalhos.gerar` + `ia.execucoes.visualizar`)

`GET /work-generation/availability` → `{ availability: "AVAILABLE" | "AGENT_DISABLED" |
"MODEL_UNAVAILABLE" | "PAUSED" }` (006 semantics, no reason text).

`POST /work-generation-requests` — 202:

```ts
{
  subjectId: uuid,
  syllabusRevisionId: uuid, syllabusItemIds: uuid[],      // 1–10 distinct; ≤ 3 × total (FR-021)
  title, description?,
  difficulty: WorkDifficulty,                             // required
  totalGrade: Grade,                                      // ≥ 0.01 × total
  total: 1..10,
  types: WorkQuestionType[],                              // 1–3 distinct
  distribution: { mode: "AUTO" } | { mode: "MANUAL", counts: Partial<Record<WorkQuestionType, 1..10>> },
  trickQuestions: 0..3,                                   // ≤ multiple choice; 0 without it
  idempotencyKey: uuid,
  regeneratedFromId?: uuid
}
→ 202 WorkGenerationRequestView
```

No `language`, model, provider, tier, family, task or instruction field. The language comes from
the revision (`422 SYLLABUS_LANGUAGE_REQUIRED` when code is requested without one). Topic errors:
`404`, `422 REVISION_NOT_CONFIRMED`, `409 SUBJECT_ARCHIVED`. Limits: `429` (006 per minute, 008 per
agent, `RATE_LIMIT_WORK_AI_PER_HOUR`). Availability: `409 AI_AGENT_DISABLED`, `503
AI_MODEL_UNAVAILABLE`. Same key + same body → the same request (200); another body → `409
AI_IDEMPOTENCY_KEY_REUSED`.

```ts
WorkGenerationRequestView = {
  id, status: "PENDING" | "GENERATED" | "FAILED" | "CANCELLED",
  subject: { id, name }, syllabusRevisionId, topics: { syllabusItemId, itemText }[],
  title, description, difficulty, totalGrade: Grade, total,
  counts: { OPEN_ANSWER, MULTIPLE_CHOICE, CODE }, trickQuestions, language: { name } | null,
  distribution: "AUTO" | "MANUAL", executionId, createdAt, generatedAt,
  failureCode: AiErrorCode | null, workId: uuid | null, regeneratedFromId
}
```

`GET /work-generation-requests` (`trabalhos.visualizar`) — cursor page of the teacher's requests.
`GET /work-generation-requests/:id` (`trabalhos.visualizar`) — `WorkGenerationRequestView`
(polled while PENDING).

The 006 routes keep working for the execution (`GET /ai/executions/:id`); `POST
/ai/proposals/:id/decision` with APPROVE on a `WORK_GENERATION` proposal → `409
AI_PROPOSAL_APPLY_REQUIRED`.

## Programming languages (shared catalog)

`GET /works/programming-languages` — `trabalhos.visualizar`. `200 { id, key, name }[]`, active
only, ordered by name (the same shape as the 010 route, whose schema is reused from
`@repo/contracts`). The 010 `GET /programming-languages` doesn't change (research W18).

## New error codes

`WORK_VERSION_CONFLICT` (409), with a web message in `lib/messages/error-messages.ts`. The other
codes (`REVISION_NOT_CONFIRMED`, `SUBJECT_ARCHIVED`, `SYLLABUS_LANGUAGE_REQUIRED`,
`INVALID_STATE_TRANSITION`, the `AI_*` codes) already exist.

## No student route in 011

No route serves a work to a STUDENT; STUDENT, ADMIN and MANAGER get `403` on every route above
(FR-034, FR-035). The student route, the class assignment and the release of results are 012.
