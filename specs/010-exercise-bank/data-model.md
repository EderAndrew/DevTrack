# Data Model: 010 — Banco de Exercícios

One Prisma migration (`<ts>_exercise_bank`). Constraints Prisma can't express (CHECKs, partial
indexes, deferred triggers, seed rows) are SQL in the migration. Research X2, X13, X17.

## Enums

| Enum | Values |
|------|--------|
| `exercise_type` | `OPEN_ANSWER`, `MULTIPLE_CHOICE`, `CODE` |
| `exercise_difficulty` | `BASIC`, `INTERMEDIATE`, `ADVANCED` (pedagogical; unrelated to `ai_model_tier`) |
| `cognitive_objective` | `RECOGNIZE`, `UNDERSTAND`, `APPLY`, `ANALYZE`, `CREATE` |
| `exercise_origin` | `MANUAL`, `AI_GENERATED` |
| `exercise_status` | `DRAFT`, `APPROVED`, `ARCHIVED` |

## `programming_languages` (new, seeded)

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `key` | text UNIQUE | slug, e.g. `java`, `html-css`, `cpp` |
| `name` | text UNIQUE | shown to the teacher, e.g. `HTML & CSS` |
| `aliases` | text[] | lowercase terms for the 007 grounding (e.g. `node.js`, `nodejs`) |
| `active` | boolean default true | inactive entries stay valid where used, hidden for new choices |
| `created_at` | timestamptz | |

Seed: Angular, C, C++, Go, HTML & CSS, Java, JavaScript, Nest, Node, PHP, Python, Rust,
TypeScript. No write route (admin management is a future spec).

## `syllabus_revisions` (changed, 004)

| Column | Type | Rules |
|--------|------|-------|
| `language_id` | uuid NULL FK → `programming_languages` RESTRICT | one language per syllabus; frozen with the revision by the existing immutability trigger |

## `exercises` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `teacher_id` | uuid FK → `users` RESTRICT | owner; every query filters by it |
| `type` | `exercise_type` | never changes after creation |
| `difficulty` | `exercise_difficulty` | |
| `cognitive_objective` | `cognitive_objective` | |
| `origin` | `exercise_origin` | never changes (trigger refuses update) |
| `status` | `exercise_status` default `DRAFT` | |
| `archived_from_status` | `exercise_status` NULL | set iff `status = ARCHIVED` (CHECK); restore target |
| `statement` | text | 1–10 000 chars |
| `statement_search_key` | text | `searchKey(statement)`, written by the application |
| `explanation` | text | 1–10 000 chars |
| `expected_answer` | text NULL | required iff `OPEN_ANSWER` (CHECK) |
| `instructions` | text NULL | required iff `CODE` |
| `starter_code` | text NULL | only `CODE`; optional |
| `expected_solution` | text NULL | required iff `CODE` |
| `language_id` | uuid NULL FK → `programming_languages` RESTRICT | required iff `CODE` |
| `is_trick_question` | boolean default false | true only for `MULTIPLE_CHOICE` (CHECK) |
| `syllabus_item_id` | uuid NULL FK → `syllabus_items` RESTRICT | the topic; required iff `origin = AI_GENERATED` (CHECK) |
| `generation_batch_id` | uuid NULL FK → `exercise_generation_batches` RESTRICT | required iff `AI_GENERATED` (CHECK) |
| `generation_item_id` | uuid NULL | the proposal item id (X15); UNIQUE with the batch |
| `human_reviewed` | boolean default false | true once a user approved it |
| `human_edited` | boolean default false | true once a user changed its content after generation |
| `reviewed_by_id` | uuid NULL FK → `users` | set with `reviewed_at` (CHECK: both or none) |
| `reviewed_at` | timestamptz NULL | |
| `version` | int default 1 | optimistic concurrency (X14) |
| `created_at`, `updated_at` | timestamptz | |

CHECKs: the type columns (above); `AI_GENERATED` in `APPROVED` ⇒ `human_reviewed` and
reviewer set. Indexes: `(teacher_id, status, updated_at desc, id)`, `(teacher_id,
syllabus_item_id)`, `(generation_batch_id)`.

## `exercise_alternatives` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `exercise_id` | uuid FK → `exercises` CASCADE | only `MULTIPLE_CHOICE` exercises |
| `position` | int | 0-based, UNIQUE (exercise, position) |
| `text` | text | 1–2 000 chars |
| `is_correct` | boolean | partial UNIQUE (exercise) WHERE `is_correct` |

A `DEFERRABLE INITIALLY DEFERRED` constraint trigger checks, at commit, that every
`MULTIPLE_CHOICE` exercise has 3–5 alternatives with exactly one correct and distinct texts
(normalized), and that no other type has alternatives.

## `exercise_generation_batches` (new)

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `teacher_id` | uuid FK → `users` | |
| `syllabus_item_id` | uuid FK → `syllabus_items` RESTRICT | the topic (confirmed revision) |
| `syllabus_revision_id` | uuid FK → `syllabus_revisions` RESTRICT | the item's revision (composite FK with the item) |
| `difficulty` | `exercise_difficulty` | |
| `requested_quantity` | int | 3–10 (CHECK) |
| `open_answer_quantity`, `multiple_choice_quantity`, `code_quantity` | int ≥ 0 | sum = requested (CHECK) |
| `trick_question_quantity` | int | 0–3 and ≤ multiple choice (CHECK) |
| `language_id` | uuid NULL FK | required iff `code_quantity > 0` (CHECK); copied from the revision |
| `distribution` | text | `AUTO` or `MANUAL` (how the counts were chosen) |
| `ai_execution_id` | uuid UNIQUE FK → `ai_executions` RESTRICT | set in the request transaction |
| `regenerated_from_id` | uuid NULL FK → self | |
| `idempotency_key` | text | UNIQUE (teacher, key) |
| `generated_at` | timestamptz NULL | set by the materialization (X8) |
| `approved_count`, `discarded_count`, `archived_count` | int default 0 | maintained in the review transactions |
| `created_at` | timestamptz | |

**Derived status** (X13, never stored): `GENERATED` when `generated_at` is set; else from the
execution: `QUEUED`/`RUNNING`/`WAITING_TOOL`/`VALIDATING_OUTPUT` → `PENDING`,
`FAILED`/`TIMED_OUT` → `FAILED`, `CANCELLED` → `CANCELLED`.

## State transitions — exercise

| From | To | Who | Notes |
|------|----|-----|-------|
| — | DRAFT | teacher (manual, "salvar como rascunho") / system (materialization) | AI output only ever lands here |
| — | APPROVED | teacher (manual save) | manual only |
| DRAFT | APPROVED | teacher with `questoes.aprovar` | sets reviewer, `human_reviewed` |
| DRAFT | (deleted) | teacher with `questoes.editar` | batch `discarded_count + 1` |
| DRAFT, APPROVED | ARCHIVED | teacher with `questoes.editar` | `archived_from_status` kept |
| ARCHIVED | previous | teacher with `questoes.editar` | restore |

Anything else → `409 INVALID_STATE_TRANSITION`.

## Permissions (seeded)

`questoes.visualizar`, `questoes.criar`, `questoes.editar`, `questoes.aprovar`,
`ia.exercicios.gerar` → role `TEACHER`.

## AI foundation (changed, 006)

- `AgentDefinition.proposal.materialize?(tx, context)` — the domain hook of X8; called by the
  runner inside the transaction that creates the proposal.
- New resource type `EXERCISE_GENERATION_BATCH` (ownership: batch `teacher_id` = workspace).
- New agent `exercise-generator` v1, task `exercise-generation`, tool
  `read-exercise-generation-request`, proposal type `EXERCISE_GENERATION`.
- `curriculum-agent` v3 (prompt v2, output schema v2 with `languageKey`), X18.
