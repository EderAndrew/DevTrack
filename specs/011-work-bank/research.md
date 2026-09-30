# Research: 011 — Banco de Trabalhos

Decisions W1–W22. Everything reuses the existing stack and the 006–010 AI foundation; no new
dependency, no change to `modules/ai`, `modules/exercises` or `modules/exercise-ai`.

## W1. Two new modules, apart from the exercise bank

**Decision**: `apps/api/src/modules/works` owns the bank (works, questions, alternatives, test
cases, topics, views, rules, grading strategies, list/search, manual create, edit, approve,
archive, restore) and `apps/api/src/modules/work-ai` owns the generation (the request, the agent
definition, its prompt, output schema, read tool, proposal build and materialization). `work-ai`
depends on `works`; never the opposite. Neither imports anything from `modules/exercises` or
`modules/exercise-ai`, and those don't import them (guard test in
`test/works-boundary.spec.ts`, like the 007 layer guards). The web gets `features/works`, apart
from `features/exercises`; contracts get `packages/contracts/src/works/`.

**Rationale**: FR-001 and SC-013 (the Banco de Exercícios doesn't change); US1 works without AI,
so the manual path has no AI dependency (FR-024, SC-001). Same split as `exercises` /
`exercise-ai` and `syllabus` / `curriculum-ai`.

**Alternatives considered**: `Exercise.type = WORK` or a "set of exercises" (forbidden by the
request); a generic "bank item" module shared by exercises and works (couples two domains that
differ in size limits, grade, topics and grading).

**Shared on purpose** (FR-001 allows technical pieces that don't couple the domains): the
`programming_languages` catalog (data, read by a works query and route of its own, W18), `platform/text/search-key.ts`,
the design-system components, and a new pure `splitEvenly(total, k)` in
`packages/contracts/src/common/` (W6). The 010 `distributeExercises` stays as is.

## W2. Relational storage, one question table with type-specific columns

**Decision** (data-model.md): `works`; `work_topics` (N:N work ↔ syllabus item);
`work_questions` with the common columns plus the nullable columns of each type and a CHECK per
type; `work_question_alternatives`; `work_question_test_cases`; `work_question_topics` (question ↔
work topic); `work_generation_requests` and `work_generation_request_topics`. Composite foreign
keys make "every topic of a work comes from the work's single revision" and "a question's topics
are topics of its work" database facts, not only code:
- `works (id, syllabus_revision_id)` UNIQUE ← `work_topics (work_id, syllabus_revision_id)`;
- `syllabus_items (id, revision_id)` (UNIQUE since 010) ← `work_topics (syllabus_item_id, syllabus_revision_id)`;
- `work_topics (work_id, syllabus_item_id)` ← `work_question_topics (work_id, syllabus_item_id)`;
- `work_questions (id, work_id)` UNIQUE ← `work_question_topics (question_id, work_id)`.

Deferred constraint triggers check at commit what spans rows: 1–10 questions with contiguous
positions equal to `question_count`; the sum of question values equal to `total_grade`; 3–5
distinct alternatives with exactly one correct on each multiple choice and none on the other
types; test cases only on code questions; 0–10 topics per work; 0–3 topics per question.

**Rationale**: the answer key, the values and the topic links are important data, queryable and
constrained by the database (constitution V; the 010 precedent X2).

**Alternatives considered**: a JSON `content` per work (no DB constraint on the answer key or
the grade sum); reusing the 010 tables (forbidden, W1).

## W3. Grades are exact decimals: `numeric(5,2)` in the database, integer hundredths in code

**Decision**: `total_grade` and each question's `value` are `numeric(5,2)` (0.01–100.00). In
TypeScript the domain works in **integer hundredths** (`GradeCents`, a branded `number`): 0,50 →
50. Integers up to 10 000 are exact in IEEE doubles, and every operation the feature needs is
integer addition, subtraction, comparison and floor division — never `*0.01` or `/100` on a
float. The wire format is a decimal **string** with a dot and at most two decimals on
input (`"0.5"` or `"0.50"`, `GradeStringSchema = /^\d{1,3}(\.\d{1,2})?$/`, refined to
0.01–100.00) and always exactly two on output (`"0.50"`, `GradeOutputSchema = /^\d{1,3}\.\d{2}$/`); pure helpers
`gradeToCents("0.50") → 50` and `centsToGrade(50) → "0.50"` live in
`packages/contracts/src/works/grade.ts`. Prisma returns `Prisma.Decimal`, converted with
`toFixed(2)` and `gradeToCents` at the repository edge; writes pass the string. The web accepts
"0,50" or "0.50" in the input and sends `"0.50"`. The amount of decimals is validated, never
rounded (US2-5).

**Rationale**: FR-011, SC-004; no float error (0.1 + 0.2), no new dependency (a decimal library
would be the only reason to add one, and integer hundredths cover the whole domain). Same
string-on-the-wire choice as the 009 costs (`DecimalStringSchema`).

**Alternatives considered**: `decimal.js` / `big.js` (new dependency for integer arithmetic);
float `number` with rounding (the error the request forbids); integer column of hundredths in the
database (the request asks for a decimal type, and `numeric` keeps SQL sums readable).

## W4. Value distribution by position

**Decision**: pure `distributeGrade(totalCents, count): GradeCents[]` in
`packages/contracts/src/works/grade.ts`: `base = floor(total / count)`, `rest = total mod count`,
positions `0..rest-1` get `base + 1`, the others `base`. 0,50/3 → 17, 17, 16; 1,00/7 → 15, 15,
14, 14, 14, 14, 14. Precondition `total ≥ count` (FR-011: at least 0,01 per question), enforced by
the contract refinement. The service calls it on every create, edit (grade, count or order
change) and materialization and writes every row's `value`; the deferred trigger (W2) refuses a
commit whose sum differs. The form uses the same function to preview each question's value.

**Tests**: the four named cases (US2-1..3); an exhaustive property test over every total from
1 to 1 000 hundredths × 1..10 questions and a sampled one up to 10 000 (sum = total, max − min ≤ 1,
non-increasing by position) — SC-004; recalculation after add, remove and reorder.

## W5. Question types as a registry (OCP)

**Decision**: `works/types/{open-answer,multiple-choice,code}.ts`, each exporting a
`WorkQuestionTypeDefinition`: structural rules (pure), row mapping, teacher view, student view
(closed field list, W14), the fixed grading strategy (W7) and whether the answer key is complete
(approval, FR-015). Services iterate the registry; a new type is a file, its columns and its
contract variant (FR-004).

## W6. Request rules in contracts, data rules in the API

**Decision**: `packages/contracts/src/works/` holds the bodies as strict Zod schemas with the
structural refinements: 1–10 questions; 3–5 distinct alternatives, exactly one correct; required
answer key per type; ≤ 20 test cases per code question; grade format, range and ≥ 0,01 per
question; 0–10 distinct topics; ≤ 3 topics per question and only topics of the work; AI request:
1–10 topics, 1–10 questions, topics ≤ 3 × questions (FR-021), 1–3 distinct types, manual counts
sum to the total with each chosen type ≥ 1, automatic needs total ≥ types, tricks 0–3 and ≤
multiple choice (0 without it). `distributeWorkQuestions(total, types)` uses the new common
`splitEvenly` with the fixed order OPEN_ANSWER, MULTIPLE_CHOICE, CODE (10 over 3 → 4, 3, 3). The
API validates every input with them (constitution XXVI) and then checks what needs data: topic
ownership (W11), active language, states, version (W16). The same pure rules validate the AI
output (W13).

## W7. Grading strategies are pure domain rules, dispatched by strategy

**Decision** (contracts/grading.md): enum `work_grading_strategy` = `EXACT_MATCH`,
`TEST_CASES`, `AI_REVIEW`, stored on each question with a CHECK tying it to the type
(MULTIPLE_CHOICE ↔ EXACT_MATCH, CODE ↔ TEST_CASES, OPEN_ANSWER ↔ AI_REVIEW), set by the type
registry, never by a request or the AI. `works/grading/` holds:
- `GradingStrategy` (`key`, `grade(question, answer, ports) → QuestionGrading`) and a registry
  keyed by strategy; the dispatcher never switches on the question type (FR-036).
- `exactMatch`: chosen alternative id = the correct one → the full value, else 0; nature
  `RULE_RESULT`, final (FR-037). No port, no AI.
- `testCases`: calls a `CodeRunnerPort` (`run(language, code, testCases) → { status: "PASSED" |
  "FAILED" | "UNAVAILABLE" | "INFRA_ERROR" }`); all passed → full value, any failed → 0
  (`RULE_RESULT`); unavailable, infra error or no test case → `PENDING_TEACHER` (FR-038, FR-040).
  The only implementation shipped is `UnavailableCodeRunner` (always `UNAVAILABLE`); the Code
  Runner spec provides the real one. The strategy never receives the expected solution, so a
  textual comparison is impossible by construction (a test pins the input type).
- `aiReview`: receives an `AiReviewPort` result (`{ suggestedCents, … }` or a failure);
  suggestion in range → `SUGGESTED` with `suggestedCents` and no final grade (`SUGGESTION`);
  failure or out of range → `PENDING_TEACHER` (FR-039, FR-040).
- `decideByTeacher(grading, teacherCents)`: 0 ≤ cents ≤ value, else refused; sets
  `teacherCents` and `finalCents` (`HUMAN_DECISION`), overriding a suggestion.
- `computeWorkGrade(gradings, totalCents) → { cents, partial }`: sum of final grades, questions
  without a final grade make it partial and never count as 0; asserts 0 ≤ cents ≤ total (FR-041).

Nothing is persisted and no route serves it in 011 (FR-042); the tests use simulated answers
(US8). The 012 wires real answers, the WorkEvaluationAgent behind `AiReviewPort`, and the Code
Runner behind `CodeRunnerPort`.

**Rationale**: constitution XI, XII, VIII (OCP); Clarifications option A.

**Alternatives considered**: a `switch (type)` in a grading service (FR-036 forbids); the
strategy derived at read time (the request asks for it registered on the question, and 012 must
not redefine it).

## W8. Difficulty is a work concept, unrelated to model tiers

**Decision**: enum `work_difficulty` (BASIC, INTERMEDIATE, ADVANCED) in the works contracts,
separate from the 010 `exercise_difficulty` (W1) and from `AiModelTier`. Nullable on manual
works, required on AI ones (CHECK). A guard test scans `modules/work-ai` for references to model
tiers, families, catalog keys or `routeFor`, as 010 does; SC-010 is a test that routes the
`work-generation` task for the three difficulties and gets the same route.

## W9. One agent, one task; the policy picks the model

**Decision**: agent `work-generator` v1 (L2, DISABLED until the release gate), task
`work-generation`: GENERATION, tiers BASIC → max STANDARD, families `GENERATION_MODEL_FAMILIES`,
capabilities `structuredOutput` + `tools`, same-tier fallback, escalation `ON_OUTPUT_INVALID`,
`maxOutputTokens` 24 000 (10 questions with code and test cases are larger than the 010 batch),
`timeoutMs` 120 000, limits 3 model calls / 2 tool calls. Quality thresholds reuse the existing
metric names of `task-policy.ts` (W17), so `modules/ai` doesn't change.

## W10. Generation = request → execution → proposal → DRAFT work, in one transaction

**Decision**: the 010 flow (X8) with the existing `proposal.materialize` hook — no foundation
change:
1. `POST /work-generation-requests` validates the body (W6) and the topics (W11), resolves the
   language from the revision, records the request and its topics (idempotency key) and, in the
   same transaction, requests the execution through `AiExecutionsService.request` with resource
   `WORK_GENERATION_REQUEST` and input `{}`.
2. The agent calls its only tool, `read-work-generation-request` (W12).
3. `proposal.build` (pure) validates the structured output against the request (W13) and throws
   `ProposalRejected(reason)` on any mismatch → `AI_OUTPUT_VALIDATION_FAILED` (one escalation).
4. `proposal.materialize(tx, context)` locks the request row, writes the work (DRAFT,
   `AI_GENERATED`, title, description, subject, revision, difficulty and total grade from the
   request; values from W4), its topics, questions, alternatives, test cases and question topics,
   sets `generated_at` and audits `work_generation.generated`. A throw rolls everything back and
   the execution ends FAILED (FR-029).

Proposal type `WORK_GENERATION` with `approveThroughDomain: true`: the 006 decision route refuses
APPROVE. The work's approval closes the proposal in the same transaction
(`AiProposalsService.decideWithin`): APPROVE when no generated question was removed,
APPROVE_PARTIALLY with the items that remain otherwise; archiving a never-approved AI work closes
it REJECT. The closer lives in `work-ai` and registers on a `WorkReview` hook of `works`
(`WorkReview.register`, like the 010 `ExerciseBatchReview`), so `works` never imports `work-ai`.

## W11. Topics: items of one confirmed revision of a subject the teacher owns

**Decision**: bodies carry `subjectId`, `syllabusRevisionId` and `syllabusItemIds` (distinct). One
scoped query loads the items joined to revision, document and subject with `subjects.teacher_id =
session` and `subjects.id = subjectId`; any item missing (nonexistent, another revision, another
subject, another teacher) → `404` with nothing revealed; a draft revision → `422
REVISION_NOT_CONFIRMED`; an archived subject → `409 SUBJECT_ARCHIVED` for the AI request (manual
works in an archived subject stay editable, like the 010 bank); code requested and the revision
without a language → `422 SYLLABUS_LANGUAGE_REQUIRED`. No text field can stand for a topic. All
checks run before any model call (US3-2, US3-3).

## W12. What the model sees

**Decision**: the tool returns, for the execution's own request only: each selected topic as
`{ ref: "T1".."T10", itemText, groupTitle }`, the revision's title, competency and language name
(untrusted block, 006), and the configuration (difficulty, total, counts per type, tricks,
language). The output references topics by `ref`, which `build` maps to item ids (a model copies
short keys more reliably than uuids, and no id leaks into the prompt). The work's title,
description and total grade are **not** sent (FR-025, FR-028). The prompt v1 holds the rules:
structure per type, 1–3 topic refs per question, every topic covered, only the given topics, the
acceptable and forbidden trick-question patterns, exactly the given language, at least one test
case per code question with `PUBLIC`/`PRIVATE` visibility, never answer outside the schema.

## W13. Validation of the AI output against the request

**Decision**: pure `validateGeneratedWork(output, request)` after the schema: total count, count
per type, only requested types, difficulty, tricks only on multiple choice and exactly the
requested number, language of every code question, the per-type structural rules (W6), ≥ 1 test
case per code question, distinct statements after `searchKey`, each question with 1–3 distinct
refs of the selection, every selected ref used at least once. Reasons: `COUNT_MISMATCH`,
`TYPE_MISMATCH`, `DIFFICULTY_MISMATCH`, `TRICK_MISMATCH`, `LANGUAGE_MISMATCH`, `STRUCTURE_INVALID`,
`TEST_CASES_MISSING`, `DUPLICATE_STATEMENT`, `TOPIC_OUT_OF_SCOPE`, `TOPIC_NOT_COVERED`,
`MISSING_REQUEST` — logged, never with content. The output schema has no field for title, grade,
values, ids, status or work topics; unknown fields fail the strict schema (FR-027, FR-028).

## W14. Teacher view × student view

**Decision**: contracts `WorkTeacherViewSchema` (everything, plus computed `warnings`) and
`WorkStudentViewSchema` (strict): title, description, total grade and, per question, position,
type, statement, value, instructions, starter code, language name, `PUBLIC` test cases
`{ input, expectedOutput }` and alternatives `{ id, text }` in presentation order (FR-033). The API
builds it in `works/views/student-view.ts` by **copying allowed fields**, never by deleting from
the teacher view. Served in 011 only by the teacher preview `GET /works/:id/student-preview`
(`trabalhos.visualizar`, "Ver como aluno"), so the network content can be checked (US6); 012 adds
the student route on top of the same builder. Tests: strict schema; a projection per type; a scan
of the serialized preview for every answer marker of the fixtures (SC-007); a test that adds an
unknown column to a fixture row and sees it absent (US6-5).

## W15. States and review

**Decision**: `work_status` DRAFT / APPROVED / ARCHIVED with `archived_from_status` (restore);
transitions in `works/work.state-machine.ts`; invalid → `409 INVALID_STATE_TRANSITION`. Manual
create chooses DRAFT or APPROVED; materialization only DRAFT (CHECK: `AI_GENERATED` in APPROVED ⇒
`human_reviewed` and reviewer set). Approval requires every question's answer key (FR-015; the
contracts already demand it, the check stays in the type registry). Code questions without test
cases produce the teacher-view warning `CODE_QUESTION_WITHOUT_TEST_CASES` (positions), shown in
the approval confirmation; approval proceeds (FR-007). Edits to an AI work set `human_edited`.

## W16. One aggregate, one version

**Decision**: a work and its questions are edited as a whole: `PUT /works/:id` carries the full
header and the ordered questions (existing ones by id, new ones without), with `version`. The
service diffs, rewrites positions, topics and values (W4) in one transaction and bumps
`works.version`; a stale version → `409 WORK_VERSION_CONFLICT` (US5-6). Approve, archive and
restore also carry `version`; approving or archiving something already in that state → 200, no
event. Generation request: UNIQUE (teacher, idempotency key); same key + same body → the same
request (200), another body → `409 AI_IDEMPOTENCY_KEY_REUSED` (006 semantics); "pedir de novo"
creates a new request with `regeneratedFromId`.

**Rationale**: add/remove/reorder all change every value (W4), so per-question routes would need
the same full recalculation and a version per call anyway; one PUT keeps the invariant in one
place.

## W17. Golden set and release gate

**Decision**: `apps/api/test/fixtures/work-generation/` with fictitious cases: POO em Java with
three topics (herança, polimorfismo, classes abstratas) and 10 mixed questions with 2 tricks;
SQL joins without language (no code); listas em Python with code only; one topic with an
injection attempt; seven topics and three questions (coverage stress). `expected.json` per case:
the request, key terms per topic, forbidden patterns. A pure scorer with the existing metric
names: `schemaValidity`, `configMatch` (counts, types, difficulty, language, tricks, test cases,
topic refs within the selection and every topic covered — deterministic), `duplicates` (0),
`topicCoverage` (share of questions citing a key term of one of their topics, ≥ 0.9 over the
whole set), `injectionClean`. Trick-question quality is not lexically measurable: the evidence
lists the trick questions for human reading and the approval note records it. CI replays
`recorded.json`; `pnpm --filter api eval:works` runs a real model with `EVAL_MODEL` /
`EVAL_RECORD` and writes `test/fixtures/evaluations/work-generation/<key>.json` with each case's
latency (SC-002, SC-012). The model's approval note in `model-catalog.ts` records that the trick
questions of the evidence were read by a person (FR-030).

## W18. Permissions and limits

**Decision**: the migration seeds `trabalhos.visualizar`, `trabalhos.criar`, `trabalhos.editar`,
`trabalhos.arquivar`, `trabalhos.aprovar` and `ia.trabalhos.gerar`, granted to TEACHER only. The
request also checks `ia.execucoes.visualizar` (as 007/010). New per-teacher limit
`RATE_LIMIT_WORK_AI_PER_HOUR` (default 10), on top of the 006 per-minute and 008 per-agent limits;
the 009 budgets count the calls. The code-question form reads the shared language catalog through
`GET /works/programming-languages` (`trabalhos.visualizar`), a read of the `programming_languages`
table in the works module: the 010 route `GET /programming-languages` requires
`questoes.visualizar` and stays untouched (SC-013).

## W19. Search and pagination

**Decision**: `works.title_search_key` (`searchKey(title)`, written by the application);
`LIKE '%term%'`; keyset pagination (`cursor`, `nextCursor`, page ≤ 50, default 20, ordered by
`updated_at desc, id`); filters subject, revision, topic (`EXISTS` on `work_topics`), origin,
status (default DRAFT + APPROVED), difficulty, creation period (`createdFrom`, `createdTo`) and
query. Indexes `(teacher_id, status, updated_at desc, id)`, `(teacher_id, subject_id)`,
`work_topics (syllabus_item_id)`. At ≈1 000 works per teacher this meets SC-009 without a
trigram extension (010 X20).

## W20. The code runner is absent and nothing is executed

**Decision**: no code is executed in 011. Test cases are stored text; AI-generated ones are not
checked against the expected solution (spec Assumptions); `CodeRunnerPort` has only
`UnavailableCodeRunner`. A guard test forbids `child_process`, `vm`, `eval`, `new Function` and
`worker_threads` in `modules/works` and `modules/work-ai` (constitution IV).

## W21. Audit

**Decision** (contracts/audit-events.md): target types `WORK` and `WORK_GENERATION_REQUEST`;
events `work.created`, `work.edited`, `work.approved`, `work.archived`, `work.restored`,
`work_generation.requested`, `work_generation.generated`; failures and cancellations through the
006 `ai_execution.*` events of the request's execution. Metadata: ids, counts, enums and codes
only.

## W22. Traceability and web

**Decision**: `011` joins `SPECS` in `apps/api/test/traceability.spec.ts`; tests are titled with
`011/USn-k` and `011/SC-nnn`. Web pages under `/trabalhos` (contracts/web-ui.md), menu item "Banco
de Trabalhos" with `trabalhos.visualizar`, axe and keyboard tests per page; the E2E
`work-bank.spec.ts` runs a manual work and an AI work against the OpenRouter mock (extended with a
work-generation answer).
