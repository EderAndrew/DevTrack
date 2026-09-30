# Data Model: 011 — Banco de Trabalhos

One Prisma migration (`<ts>_work_bank`). Constraints Prisma can't express (CHECKs, composite and
deferred checks, triggers, seed rows) are SQL in the migration. No table, column or constraint of
the 010 exercise bank changes (SC-013). Research W2, W3, W7, W15, W16.

## Enums

| Enum | Values |
|------|--------|
| `work_question_type` | `OPEN_ANSWER`, `MULTIPLE_CHOICE`, `CODE` |
| `work_grading_strategy` | `EXACT_MATCH`, `TEST_CASES`, `AI_REVIEW` |
| `work_difficulty` | `BASIC`, `INTERMEDIATE`, `ADVANCED` (pedagogical; unrelated to `ai_model_tier` and to `exercise_difficulty`) |
| `work_origin` | `MANUAL`, `AI_GENERATED` |
| `work_status` | `DRAFT`, `APPROVED`, `ARCHIVED` |
| `work_test_case_visibility` | `PUBLIC`, `PRIVATE` |

## `works`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `teacher_id` | uuid FK → `users` RESTRICT | owner; every query filters by it |
| `subject_id` | uuid FK → `subjects` RESTRICT | the work's discipline, the teacher's |
| `syllabus_revision_id` | uuid NULL FK → `syllabus_revisions` RESTRICT | the confirmed revision of its topics; NULL iff the work has no topic; NOT NULL when `AI_GENERATED` (CHECK) |
| `title` | text | 1–200 chars, trimmed |
| `title_search_key` | text | `searchKey(title)`, written by the application |
| `description` | text NULL | ≤ 5 000 chars |
| `difficulty` | `work_difficulty` NULL | NOT NULL when `AI_GENERATED` (CHECK) |
| `total_grade` | numeric(5,2) | 0.01–100.00 (CHECK); `total_grade * 100 >= question_count` (CHECK: ≥ 0,01 per question) |
| `question_count` | int | 1–10 (CHECK); equals the number of questions (deferred trigger) |
| `origin` | `work_origin` | never changes (`BEFORE UPDATE` trigger) |
| `status` | `work_status` | |
| `archived_from_status` | `work_status` NULL | set iff `status = ARCHIVED` (CHECK), never `ARCHIVED`; restore target |
| `generation_request_id` | uuid NULL UNIQUE FK → `work_generation_requests` RESTRICT | set iff `AI_GENERATED` (CHECK) |
| `human_reviewed` | boolean default false | true once a user approved it |
| `human_edited` | boolean default false | true once a user changed an AI work's content |
| `reviewed_by_id` | uuid NULL FK → `users` RESTRICT | with `reviewed_at` (CHECK: both or none) |
| `reviewed_at` | timestamptz NULL | |
| `version` | int default 1 | optimistic concurrency of the whole aggregate (W16); ≥ 1 |
| `created_at`, `updated_at` | timestamptz | |

CHECKs: `AI_GENERATED` in `APPROVED` ⇒ `human_reviewed` and reviewer set. UNIQUE `(id,
syllabus_revision_id)` (target of `work_topics`). Indexes `(teacher_id, status, updated_at desc,
id)`, `(teacher_id, subject_id)`, `(teacher_id, created_at)`.

Deferred constraint trigger (fires on `works`, `work_questions`): at commit, the work has
exactly `question_count` questions with positions `0..question_count-1` and `SUM(value) =
total_grade`.

## `work_topics` — Tópico do trabalho (N:N)

| Column | Type | Rules |
|--------|------|-------|
| `work_id` | uuid | PK part |
| `syllabus_item_id` | uuid | PK part |
| `syllabus_revision_id` | uuid | FK `(work_id, syllabus_revision_id)` → `works (id, syllabus_revision_id)` CASCADE; FK `(syllabus_item_id, syllabus_revision_id)` → `syllabus_items (id, revision_id)` RESTRICT |
| `position` | int | selection order, UNIQUE (work, position) |

Both composite FKs make "every topic of a work comes from the work's revision" a database fact.
That the revision is confirmed and of the work's subject is checked by the service (W11): the
revision → document → subject path spans three tables and never changes once confirmed. Deferred
trigger: ≤ 10 topics per work. Index `(syllabus_item_id)` for the topic filter.

## `work_questions`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | UNIQUE `(id, work_id)` (target of question topics) |
| `work_id` | uuid FK → `works` CASCADE | |
| `position` | int | 0-based; UNIQUE (work, position) `DEFERRABLE INITIALLY DEFERRED` (reorder) |
| `type` | `work_question_type` | never changes (`BEFORE UPDATE` trigger) |
| `grading_strategy` | `work_grading_strategy` | CHECK: `MULTIPLE_CHOICE` ⇔ `EXACT_MATCH`, `CODE` ⇔ `TEST_CASES`, `OPEN_ANSWER` ⇔ `AI_REVIEW` |
| `statement` | text | 1–10 000 chars |
| `statement_search_key` | text | `searchKey(statement)`; duplicate detection within a work |
| `value` | numeric(5,2) | ≥ 0.01 (CHECK); computed (W4), never from a request or the AI |
| `explanation` | text NULL | ≤ 10 000 chars |
| `expected_answer` | text NULL | required iff `OPEN_ANSWER` (CHECK) |
| `rubric` | text NULL | only `OPEN_ANSWER`; optional |
| `instructions` | text NULL | only `CODE`; optional |
| `starter_code` | text NULL | only `CODE`; optional |
| `expected_solution` | text NULL | required iff `CODE` |
| `language_id` | uuid NULL FK → `programming_languages` RESTRICT | required iff `CODE` |
| `is_trick_question` | boolean default false | true only for `MULTIPLE_CHOICE` (CHECK) |
| `generation_item_id` | uuid NULL | the proposal item id; UNIQUE with the work |
| `created_at`, `updated_at` | timestamptz | |

A question removed in an edit is deleted (its alternatives, test cases and topic links cascade).
Works themselves are never deleted (archive only).

## `work_question_alternatives`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `question_id` | uuid FK → `work_questions` CASCADE | |
| `position` | int | 0-based, UNIQUE (question, position) `DEFERRABLE INITIALLY DEFERRED` |
| `text` | text | 1–2 000 chars |
| `is_correct` | boolean | partial UNIQUE (question) WHERE `is_correct` |

Deferred trigger (fires on alternatives and on question insert): every `MULTIPLE_CHOICE` has
3–5 alternatives, exactly one correct, distinct normalized texts; other types have none.

## `work_question_test_cases`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `question_id` | uuid FK → `work_questions` CASCADE | only `CODE` questions (trigger) |
| `position` | int | UNIQUE (question, position) `DEFERRABLE INITIALLY DEFERRED` |
| `input` | text | 0–10 000 chars (empty allowed) |
| `expected_output` | text | 0–10 000 chars (empty allowed) |
| `visibility` | `work_test_case_visibility` | |

≤ 20 per question (deferred trigger). A manual code question may have none (warning on approval,
W15); an AI one has at least one (validated in `build`, W13).

## `work_question_topics`

| Column | Type | Rules |
|--------|------|-------|
| `question_id` | uuid | PK part; FK `(question_id, work_id)` → `work_questions (id, work_id)` CASCADE |
| `work_id` | uuid | |
| `syllabus_item_id` | uuid | PK part; FK `(work_id, syllabus_item_id)` → `work_topics` RESTRICT (a question only links topics of its work) |

0–3 per question (deferred trigger). AI questions have 1–3 (validated in `build`).

## `work_generation_requests` — Pedido de geração

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | UNIQUE `(id, syllabus_revision_id)` |
| `teacher_id` | uuid FK → `users` RESTRICT | |
| `subject_id` | uuid FK → `subjects` RESTRICT | |
| `syllabus_revision_id` | uuid FK → `syllabus_revisions` RESTRICT | confirmed (checked at request) |
| `title` | text | 1–200 |
| `description` | text NULL | ≤ 5 000 |
| `difficulty` | `work_difficulty` | |
| `total_grade` | numeric(5,2) | 0.01–100.00; ≥ 0,01 per question (CHECK) |
| `requested_quantity` | int | 1–10 (CHECK) |
| `open_answer_quantity`, `multiple_choice_quantity`, `code_quantity` | int ≥ 0 | sum = requested (CHECK) |
| `trick_question_quantity` | int | 0–3 and ≤ multiple choice (CHECK) |
| `language_id` | uuid NULL FK → `programming_languages` | required iff `code_quantity > 0` (CHECK); copied from the revision |
| `distribution` | text | `AUTO` or `MANUAL` (CHECK) |
| `ai_execution_id` | uuid NULL UNIQUE FK → `ai_executions` RESTRICT | set in the request transaction |
| `regenerated_from_id` | uuid NULL FK → self | |
| `idempotency_key` | uuid | UNIQUE (teacher, key) |
| `generated_at` | timestamptz NULL | set by the materialization (W10) |
| `created_at` | timestamptz | index `(teacher_id, created_at desc, id)` |

**Derived status** (never stored, 010 X13): `GENERATED` when `generated_at` is set; else from the
execution: `QUEUED` / `RUNNING` / `WAITING_TOOL` / `VALIDATING_OUTPUT` → `PENDING`, `FAILED` /
`TIMED_OUT` → `FAILED`, `CANCELLED` → `CANCELLED`. The created work is `works.generation_request_id
= request.id`.

## `work_generation_request_topics`

| Column | Type | Rules |
|--------|------|-------|
| `request_id` | uuid | PK part; FK `(request_id, syllabus_revision_id)` → `work_generation_requests (id, syllabus_revision_id)` CASCADE |
| `syllabus_item_id` | uuid | PK part; FK `(syllabus_item_id, syllabus_revision_id)` → `syllabus_items (id, revision_id)` RESTRICT |
| `syllabus_revision_id` | uuid | |
| `position` | int | 0-based; the tool's ref is `T{position+1}` (W12) |

1–10 per request and ≤ 3 × `requested_quantity` (deferred trigger).

## State transitions — work

| From | To | Who | Notes |
|------|----|-----|-------|
| — | DRAFT | teacher with `trabalhos.criar` ("Salvar como rascunho") / system (materialization) | AI output only lands here |
| — | APPROVED | teacher with `trabalhos.criar` ("Salvar e aprovar") | manual only; sets reviewer |
| DRAFT | APPROVED | teacher with `trabalhos.aprovar` | answer keys complete; sets reviewer, `human_reviewed`; closes an AI proposal APPROVE (or APPROVE_PARTIALLY when generated questions were removed) |
| DRAFT, APPROVED | ARCHIVED | teacher with `trabalhos.arquivar` | `archived_from_status` kept; an AI work never approved closes its proposal REJECT |
| ARCHIVED | previous | teacher with `trabalhos.arquivar` | restore |
| DRAFT, APPROVED | same (content) | teacher with `trabalhos.editar` | edit; status unchanged; AI work → `human_edited` |

Anything else → `409 INVALID_STATE_TRANSITION`; ARCHIVED can't be edited or approved.

## Grading result (rule concept, not persisted — contracts/grading.md)

Per question: `strategy`, `status` (`GRADED` | `SUGGESTED` | `PENDING_TEACHER` | `DECIDED`),
`suggestedCents`, `teacherCents`, `finalCents`, `nature` (`RULE_RESULT` | `SUGGESTION` |
`HUMAN_DECISION`), `pendingReason` (`CODE_RUNNER_UNAVAILABLE`, `CODE_RUNNER_INFRA_ERROR`,
`NO_TEST_CASES`, `AI_REVIEW_FAILED`, `AI_REVIEW_OUT_OF_RANGE`). Per work: `cents`, `partial`. 012
persists it with the student's answer.

## Permissions (seeded)

`trabalhos.visualizar`, `trabalhos.criar`, `trabalhos.editar`, `trabalhos.arquivar`,
`trabalhos.aprovar`, `ia.trabalhos.gerar` → role `TEACHER`.

## AI foundation (registered, not changed)

- Resource type `WORK_GENERATION_REQUEST` (ownership: request `teacher_id` = workspace).
- Agent `work-generator` v1, task `work-generation`, tool `read-work-generation-request`, proposal
  type `WORK_GENERATION` (`approveThroughDomain`, `build`, `materialize` — the existing 010 hook).
