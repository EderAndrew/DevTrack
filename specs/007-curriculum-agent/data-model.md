# Data Model: 007 — Curriculum Agent

One Prisma migration, `<ts>_curriculum_agent`. It adds **no new table**: this feature writes
to the 004 revision tables (one new column) and the 006 `ai_*` tables (rows only). Everything
else it reads or computes lives in existing tables or in memory.

## Changes to existing tables

### `syllabus_revision_source` (enum, 004)

| Value | Meaning |
|---|---|
| `EXTRACTION`, `MANUAL`, `REVISION` | unchanged (004) |
| **`AI_ASSISTED`** | a draft created (or rewritten) by applying a Curriculum Agent proposal (FR-031) |

`ALTER TYPE … ADD VALUE 'AI_ASSISTED'` runs in its own migration step, before the constraint
below uses it.

`SyllabusRevisionSourceSchema` in `@repo/contracts` gains the value.
`CreateSyllabusRevisionRequestSchema` refuses it (`400`): only the apply flow creates
`AI_ASSISTED` revisions.

### `syllabus_revisions` (004)

| Column | Type | Rule |
|---|---|---|
| **`ai_proposal_id`** | uuid? FK → `ai_proposals.id` (`ON DELETE RESTRICT`) | `UNIQUE` (one revision per proposal, FR-034); `CHECK ((source = 'AI_ASSISTED') = (ai_proposal_id IS NOT NULL))` |

- The draft partial unique index (`document_id WHERE status = 'DRAFT'`) is unchanged: there
  is still at most one draft per document.
- Rewriting an existing draft in place (research C10) updates `source`, `ai_proposal_id`,
  `title`, `syllabus_text`, `competency_text` and replaces its groups and items, as the 004
  `save` does. The row id and `number` stay. The confirmed-revision immutability trigger is
  unchanged, and a `CONFIRMED` row can never gain an `ai_proposal_id`: the trigger already
  refuses any change to a confirmed row.
- `SyllabusRevisionViewSchema` and the revision list in `SyllabusDocumentDetailSchema` gain
  `aiProposalId: uuid | null`.

### `ai_*` tables (006)

No DDL. Rows written by this feature:

| Table | Rows |
|---|---|
| `ai_agents`, `ai_agent_versions`, `ai_prompt_versions`, `ai_output_schema_versions` | `curriculum-agent` v1, prompt `curriculum-extraction` v1, schema v1 (registry sync) |
| `ai_tools`, `ai_tool_versions`, `ai_agent_tools` | `read-curriculum-document` and its allowlist entry |
| `ai_model_configs` | `curriculum-extraction-default` (`anthropic` / `claude-opus-5`, price 5 / 25 USD per MTok) |
| `ai_executions` (+ transitions, model calls, tool calls) | one per analysis; `resource_type = 'SYLLABUS_DOCUMENT'`, `resource_id` = document |
| `ai_proposals` | `proposal_type = 'CURRICULUM_EXTRACTION'`, target = the document, `payload` = [proposal content](#proposal-content-curriculum_extraction) |
| `ai_evaluation_cases`, `ai_evaluation_results` | the golden set and its runs (research C17) |

An L2 execution that ends `COMPLETED` with `proposal_id IS NULL` is new in practice
("nothing identified", research C6). The 006 schema already allows it (`proposal_id` is
nullable, and no `CHECK` ties it to the risk level).

## Proposal content (`CURRICULUM_EXTRACTION`)

This is the immutable `ai_proposals.payload`. It is written once by `proposal.build`
(research C6) and parsed by `CurriculumProposalContentSchema`:

```ts
{
  extraction: CurriculumExtractionOutput,          // the validated model output (schema v1), sourceRefs already filtered (C9)
  grounding: {
    unsupported: Array<{ field: "title" | "syllabusText" | "competencyText" | "groupTitle" | "item",
                         groupIndex: int | null, itemIndex: int | null }>,
  },
  source: { documentId: uuid, sha256: hex(64), readerVersion: 1 },
}
```

`itemIds` (006) are derived from `extraction`: `"title"`, `"syllabusText"` and
`"competencyText"` when the field is not null, then `"group:<i>"` for each group. The
teacher's selection is `acceptedItemIds` ⊆ `itemIds`, stored by the foundation decision.

### `CurriculumExtractionOutput` (output schema v1)

| Field | Type | Rule |
|---|---|---|
| `title` | string(1–200) \| null | null when not found (FR-022) |
| `syllabusText` | string(1–10 000) \| null | |
| `competencyText` | string(1–10 000) \| null | |
| `groups` | array(0–200) of `{title: string(1–300) \| null, items: array(1–200) of {text: string(1–1000), sourceRef: string(1–20) \| null}}` | total items ≤ `MAX_ITEMS_PER_REVISION` (500); document order |
| `warnings` | array(0–50) of `{code: CurriculumWarningCode, field: "title" \| "syllabusText" \| "competencyText" \| "groups" \| null, groupIndex: int(0–199) \| null}` | codes are a closed list |

`CurriculumWarningCode`: `FIELD_NOT_FOUND`, `AMBIGUOUS_STRUCTURE`, `LOW_DOCUMENT_QUALITY`,
`INCOMPLETE_SECTION`, `UNREADABLE_CONTENT`, `POSSIBLE_DUPLICATE_CONTENT`. The system warning
`UNSUPPORTED_CONTENT` is never in the output: it comes from `grounding` (FR-021).

## Normalized document content (in memory, never stored)

This is what `read-curriculum-document` returns (research C7, C11):

| Field | Type |
|---|---|
| `documentId` | uuid |
| `subjectName` | string |
| `mediaType` | `"PDF" \| "DOCX"` |
| `readerVersion` | `1` |
| `sha256` | hex(64), of the stored original |
| `blocks` | array(1–5000) of `{ref: string, kind: "heading" \| "group" \| "item" \| "text", text: string(1–4000)}` in document order; `ref` = `p<page>.<line>` (PDF) or `par<n>` (DOCX) |

It is recomputed from the immutable original on each tool call by the 004 readers in a worker
thread. The whole result is capped at 200 KB (006 limits).

## States and transitions

The state machines are the ones of 004 and 006, unchanged:

```text
execution   QUEUED → RUNNING ⇄ WAITING_TOOL → VALIDATING_OUTPUT → COMPLETED (with or without proposal)
            └──────→ FAILED | TIMED_OUT | CANCELLED

proposal    READY_FOR_REVIEW → APPROVED | PARTIALLY_APPROVED     (apply route only, same tx as the draft)
                             → REJECTED                           (reject, or a new analysis that discards it)
                             → EXPIRED                            (TTL, worker sweep)

revision    DRAFT (source AI_ASSISTED, ai_proposal_id) → CONFIRMED   (004 confirm, unchanged)
```

In this feature, `APPROVED`/`PARTIALLY_APPROVED` is never reached through
`POST /ai/proposals/:id/decision`. That route refuses approval of `CURRICULUM_EXTRACTION`
proposals with `409 AI_PROPOSAL_APPLY_REQUIRED`: the foundation checks a new optional agent
flag, `proposal.approveThroughDomain: true`. This way, an approved curriculum proposal always
has its draft. Rejection through that route stays allowed.

## Invariants

1. A revision with `source = AI_ASSISTED` has exactly one proposal, and a proposal has at most
   one revision (`UNIQUE`, `CHECK`).
2. A curriculum proposal is `APPROVED`/`PARTIALLY_APPROVED` iff a revision references it
   (same transaction, research C10).
3. The draft's accepted content is a projection of `payload.extraction` onto
   `acceptedItemIds`. Later edits happen in the draft, never in the proposal.
4. `payload.source.sha256` equals the analysed document's `sha256` at application time.
   Otherwise the answer is `CURRICULUM_SOURCE_CHANGED`.
5. Confirmed revisions never change (004 trigger). Applying never confirms.
6. At most one active `curriculum-agent` execution per teacher and document. This is
   enforced by the derived idempotency key (research C13), not by an index.

## Guards touched

- `test/security/domain-boundary.spec.ts`: add a 007 entry. There are no new models, only the
  column `SyllabusRevision.aiProposalId`, the enum value `AI_ASSISTED` and the model
  relation `AiProposal ↔ SyllabusRevision`.
- The 004 migration trigger tests: a confirmed revision can't get `ai_proposal_id`.
