# Research: 010 — Banco de Exercícios

Decisions X1–X20. Everything reuses the existing stack; no new dependency.

## X1. Two modules, like 004/007

**Decision**: `apps/api/src/modules/exercises` owns the bank (exercises, alternatives, the
programming-language catalog read, views, rules, list/search, manual create, edit, approve,
archive) and `apps/api/src/modules/exercise-ai` owns the generation (the batch, the agent
definition, its prompt, output schema, read tool, proposal build and the materialization of
drafts), mirroring `syllabus` + `curriculum-ai`. `exercise-ai` depends on `exercises`; never the
opposite. The AI module (`modules/ai`) gains one generic hook (X8) and nothing specific to
exercises.

**Rationale**: the bank works without AI (spec US1); keeping generation apart keeps the manual
path free of AI dependencies (FR-024, SC-001) and follows the 007 precedent.

**Alternatives considered**: one module with an `ai/` folder (blurs the "manual never touches
AI" boundary); generation inside `modules/ai` (the AI module would write domain data).

## X2. Relational storage per type, one table with type-specific columns

**Decision**: `exercises` holds the common fields plus the nullable columns of each type
(`expected_answer`; `instructions`, `starter_code`, `expected_solution`, `language_id`), with a
CHECK per type (e.g. `type = 'CODE'` ⇔ instructions, expected solution and language not null;
`type = 'OPEN_ANSWER'` ⇔ expected answer not null; the other type's columns null).
Alternatives live in `exercise_alternatives` (text, `is_correct`, position) with UNIQUE
(exercise, position), a partial UNIQUE index "one correct per exercise" and a deferred trigger
checking 3–5 alternatives and exactly one correct at commit for `MULTIPLE_CHOICE`.

**Rationale**: the request asks for relational data over JSON for important data (spec §25);
the answer key and the alternatives must be queryable and constrained by the database, not only
by code (constitution V).

**Alternatives considered**: a JSON `content` column per type (no DB constraint on the answer
key); a table per type (joins on every read, more migrations per new type).

## X3. Types as a registry in code (OCP)

**Decision**: `exercises/types/{open-answer,multiple-choice,code}.ts`, each exporting one
`ExerciseTypeDefinition`: its structural rules (pure), how it maps to rows, its teacher view
and its student view (closed list of fields, X12). The services iterate the registry; adding a
type is a new file, its columns (migration) and its contract variant.

**Rationale**: constitution VIII (OCP) and FR-001.

## X4. Shared rules in the contracts package, deterministic domain checks in the API

**Decision**: `packages/contracts/src/exercises/` defines the request bodies as Zod schemas
with the structural refinements (3–10 exercises per set; 3–5 alternatives, distinct texts,
exactly one correct; trick questions 0–3 and ≤ multiple choice; distribution sum = total, each
chosen type ≥ 1; required fields per type) and a pure `distributeExercises(total, types)`
(X6). The API validates every input with them (constitution XXVI) and then runs the checks that
need data: language active in the catalog, topic owned (X9), state transitions, version (X14).
The same pure rules (`exercises/rules/`) validate the AI output against the batch (X10).

**Rationale**: one definition of each rule for web, API and AI output; the backend never trusts
the interface or the model (FR-006).

## X5. Difficulty, cognitive objective and model tier are unrelated types

**Decision**: enums `exercise_difficulty` (BASIC, INTERMEDIATE, ADVANCED) and
`cognitive_objective` (RECOGNIZE, UNDERSTAND, APPLY, ANALYZE, CREATE) live in the exercises
contracts; the AI tier (`AiModelTier`) stays in `ai/enums.ts`. No code maps one to the other;
a guard test scans `modules/exercise-ai` for any reference to model tiers, families, catalog
keys or `routeFor` (the policy is the only chooser, 009).

**Rationale**: spec FR-007, SC-009 and the user's first architectural decision.

## X6. Automatic distribution

**Decision**: `distributeExercises(total, types)`: types in the fixed order OPEN_ANSWER,
MULTIPLE_CHOICE, CODE (only the chosen ones); each gets `floor(total / k)`, and the first
`total mod k` get one more. 10 over 3 types → 4, 3, 3; 5 over 2 → 3, 2. Pure, in contracts, so
the form previews exactly what the server records.

**Rationale**: FR-019 (difference ≤ 1, deterministic).

## X7. One agent, one task; the policy picks the model

**Decision**: agent `exercise-generator` (L2, DISABLED until the release gate, like 007) runs
task `exercise-generation`: GENERATION, preferred and minimum tier BASIC, max STANDARD,
escalation `ON_OUTPUT_INVALID`, same-tier fallback, capabilities `structuredOutput` + `tools`,
families of generation (`openai`, `anthropic`), quality thresholds from the golden set (X16),
`maxOutputTokens` 16 000, limits 3 model calls / 2 tool calls. Difficulty is a field of the
request, never of the task.

**Rationale**: 009 decides tier and model from evaluations (FR-025); one task per difficulty
would re-create the difficulty→model link the user wants to avoid.

## X8. Generation = batch → execution → proposal → drafts, in one transaction

**Decision**:
1. `POST /exercise-batches` (teacher) validates the request (X4, X9), resolves the language
   from the topic's revision, records the batch (idempotency key) and, in the same
   transaction, requests the execution through `AiExecutionsService.request` with resource
   `EXERCISE_GENERATION_BATCH` (the batch) and input `{}` (as 007).
2. The agent calls its only tool, `read-exercise-generation-request`, which returns the
   batch's configuration and the authorized syllabus context (X11) for the execution's own
   batch.
3. The output (structured, validated by the agent's Zod schema) goes to `proposal.build`
   (pure): it checks the output against the configuration returned by the tool (X10) and throws
   on any mismatch → `AI_OUTPUT_VALIDATION_FAILED` (so the 009 escalation applies once). The
   proposal content is the normalized exercises with server-assigned item ids.
4. **New foundation hook** `proposal.materialize(tx, context)` on the agent definition: the
   runner calls it in the transaction that creates the proposal. `exercise-ai` writes the DRAFT
   exercises and alternatives (origin `AI_GENERATED`, topic, difficulty and batch from the
   batch row, language from the batch) and sets `generated_at` on the batch. A throw rolls the
   whole transaction back and the execution ends FAILED.

**Rationale**: FR-028–FR-032 (never persist free output; batch, exercises and alternatives
all-or-nothing); the AI module still never knows the exercise tables; the drafts appear as
soon as the execution completes (US2-1).

**Alternatives considered**: the teacher "applies" the proposal first (007 style) — an extra
step the spec doesn't have (generated exercises are born DRAFT); a polling ingest worker (new
worker, eventual consistency, more states).

## X9. The topic is a syllabus item of a confirmed revision the teacher owns

**Decision**: the request carries `syllabusRevisionId` and `syllabusItemId`. The service loads
the item joined to its revision, document and subject in one scoped query (`subjects.teacher_id
= session`), and refuses — `404` when anything is missing or not the teacher's, `422
REVISION_NOT_CONFIRMED` (004 code) when the revision is a draft, `409 SUBJECT_ARCHIVED` for an
archived subject, `422 SYLLABUS_LANGUAGE_REQUIRED` when code is requested and the revision has
no language — before any model call. No text field can stand for a topic.

**Rationale**: FR-017, US2-2 (anti-enumeration: other teachers' resources are "not found").

## X10. Validation of the AI output against the batch (in `proposal.build`)

**Decision**: pure `validateGeneratedBatch(output, request)`: schema already passed; then total
count, count per type, only requested types, every exercise's difficulty equals the request's,
trick questions only on multiple choice and exactly the requested number, every code exercise's
language equals the batch's, the per-type structural rules (X4), distinct alternative texts, and
no two statements equal after `searchKey` normalization (`platform/text/search-key.ts`). Any
violation throws with a machine reason (logged, no content). Ids, topic and difficulty in the
output are ignored; the output schema doesn't even have fields for ids or topic.

**Rationale**: FR-029–FR-031, SC-004.

## X11. What the model sees

**Decision**: the tool returns, for the execution's own batch only: the item text, its group
title, the revision's title and competency text, the language name, the difficulty, the counts
per type, the trick-question count, and the pedagogical rules (including the acceptable and
forbidden trick-question patterns of the spec) as fixed text of the prompt version. The syllabus
text goes in the untrusted block (006); the instructions say to stay within the topic. Nothing
of students, classes, other syllabi or other teachers.

**Rationale**: FR-026, FR-027; constitution XIV–XV (least privilege, grounded).

## X12. Teacher view × student view

**Decision**: contracts `ExerciseTeacherViewSchema` (everything) and `ExerciseStudentViewSchema`
(strict; only statement, type, difficulty, instructions, starter code, language name and the
alternatives as `{ id, text }` in presentation order). The API builds the student view in
`exercises/views/student-view.ts` by **copying the allowed fields** (never by deleting from the
teacher view). No route serves it in 010; tests pin it: strict schema, a projection test per type,
and a scan that the serialized student view contains none of the answer markers of the fixtures.

**Rationale**: FR-036, FR-037, SC-006, the user's third decision. An allowlist makes a new
column invisible to students by default.

## X13. States

**Decision**: `exercise_status` DRAFT / APPROVED / ARCHIVED with `archived_from_status` to
restore; transitions in `exercises/exercise.state-machine.ts`; invalid → `409
INVALID_STATE_TRANSITION`. A DRAFT deleted from a batch is removed (it was never in the bank)
and the batch's `discarded_count` goes up in the same transaction. Batch status is derived and
never stored twice: `PENDING` (execution not finished), `GENERATED` (`generated_at` set),
`FAILED` / `CANCELLED` (the execution's terminal status without `generated_at`).

**Rationale**: constitution XVI; one source of truth per state.

## X14. Concurrency and idempotency

**Decision**: `exercises.version` (optimistic): edit, approve, archive, restore and delete carry
`version`; a stale one → `409 EXERCISE_VERSION_CONFLICT`. Approve/archive of something already in
that state → 200, no event. Batch request: UNIQUE (teacher, idempotency key); the same key with
another body → `409 AI_IDEMPOTENCY_KEY_REUSED` (006 semantics). Regeneration creates a new batch
with `regenerated_from_id`.

## X15. The proposal follows the batch review

**Decision**: the generator's proposal type `EXERCISE_GENERATION` has `approveThroughDomain`
(007): the 006 decision route refuses APPROVE. When the last DRAFT of a batch is approved,
deleted or archived, the service closes the proposal in the same transaction through
`AiProposalsService.decideWithin`: APPROVE if all were approved, APPROVE_PARTIALLY with the
approved exercises' item ids, REJECT if none. An expired proposal is left as is (the drafts are
domain data and stay reviewable).

**Rationale**: the proposal metrics of "Operação de IA" (007/009) keep meaning; no AI result is
approved without a human decision.

## X16. Golden set and release gate

**Decision**: `apps/api/test/fixtures/exercise-generation/` with fictitious topics (e.g.
herança em Java, listas em Python, flexbox em HTML & CSS, SQL joins without language, an
injection topic) and `expected.json` per case (requested configuration, key terms of the topic,
forbidden patterns). A pure scorer: `schemaValidity`, `configMatch` (counts, types, difficulty,
language, tricks), `duplicates` (must be 0), `topicCoverage` (share of exercises citing a key
term, ≥ 0.9), `injectionClean`. CI replays `recorded.json`; `pnpm --filter api eval:exercises`
runs the real models with `EVAL_MODEL`/`EVAL_RECORD` and writes evidence to
`test/fixtures/evaluations/exercise-generation/<key>.json`, as in 009. Approval of a model for
the task follows the 009 quality gate.

**Rationale**: constitution XIX; FR-033; SC-010.

**Implementation notes (T047–T049)**: six cases (the four above, trick questions on Java Strings
and a 10-exercise Java batch for SC-002). `topicCoverage` is a lexical proxy, so its 0.9 threshold
is judged over every exercise of the set, never per case (on a batch of 4 it would mean 100%); a
case passes on schema, configuration, duplicates and injection. The evidence also records each
case's latency from request to drafts (SC-002). The first real run found that strict structured
output refuses `oneOf`, which Zod writes for the discriminated union of exercise types: the
OpenRouter adapter's `sanitizeJsonSchema` now writes it as `anyOf` (the `type` literal still tells
the variants apart, and Zod validates the answer). `openai-basic` passed and is approved for the
task; `anthropic-basic` was not evaluated (OpenRouter answered 402 to its 16 000-token calls for
lack of credit, as in 009).

## X17. Programming-language catalog

**Decision**: table `programming_languages` (`id`, `key` slug, `name`, `aliases text[]`, `active`)
seeded by the migration with the 13 entries (Angular, C, C++, Go, HTML & CSS, Java, JavaScript,
Nest, Node, PHP, Python, Rust, TypeScript); read-only route `GET /programming-languages` (active
ones, ordered by name) for any teacher permission of the syllabus or the bank. No write route
(admin management is a future spec). `syllabus_revisions.language_id` nullable FK; the 004 save
body gains `languageId`; the existing immutability trigger already freezes it once confirmed.

**Rationale**: constitution XXI (data, not enum); spec FR-038, FR-039.

## X18. Curriculum Agent v3 proposes the language

**Decision**: the read tool also returns the active catalog (`{ key, name, aliases }`); the
output schema v2 gains `languageKey: string | null`; `build` keeps it only if it is in the
returned catalog (else null) and flags it `UNSUPPORTED_CONTENT` when neither the name nor an
alias appears in the document text (normalized, word-bounded); the proposal gains the
`language` field, accepted or not like `title`, and the apply writes `language_id` on the draft
revision. Agent v3, prompt v2, golden `expected.json` gain `languageKey`; the scorer gains
`languageMatch`; the release gate runs again for `curriculum-extraction` and the evidence is
refreshed.

**Rationale**: FR-041, SC-012; a new version because the output changes (006 FR: used versions
are immutable).

## X19. Permissions and limits

**Decision**: migration seeds `questoes.visualizar`, `questoes.criar`, `questoes.editar`,
`questoes.aprovar` and `ia.exercicios.gerar`, granted to TEACHER only. The batch request also
checks `ia.execucoes.visualizar` (as 007). New per-teacher limit
`RATE_LIMIT_EXERCISE_AI_PER_HOUR` (default 10) on top of the 006 per-minute and 008 per-agent
limits; the 009 budgets count the generation's calls.

## X20. Search and pagination

**Decision**: `exercises.statement_search_key` (the `searchKey` normalization, written by the
application, as subjects and classes) with `LIKE '%term%'`; keyset pagination (`cursor`,
`nextCursor`, page size ≤ 50, ordered by `updated_at desc, id`) like the 003 lists; indexes
`(teacher_id, status, updated_at desc, id)` and `(teacher_id, syllabus_item_id)`. At the target
volume (≈1 000 per teacher) this answers well under the SC-008 second without a trigram
extension.

**Rationale**: no new infrastructure (constitution IX); same pattern as the existing lists.
