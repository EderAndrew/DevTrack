# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts`, to the list checked by
`audit-coverage.spec.ts` and emitted by `test/helpers/journey.ts`. Metadata carries only ids,
counts, enums and codes — never statement, answer, solution, explanation, alternative text or
syllabus text. New target types `EXERCISE` and `EXERCISE_BATCH`.

| Type | Actor | Target | Metadata | When |
|------|-------|--------|----------|------|
| `exercise.created` | USER | EXERCISE | `type`, `difficulty`, `status`, `setSize`, `syllabusItemId` | manual create (set or single; one event per exercise) |
| `exercise.edited` | USER | EXERCISE | `origin`, `status`, `fields` (names only) | content changed |
| `exercise.approved` | USER | EXERCISE | `origin`, `humanEdited`, `batchId` | DRAFT → APPROVED (the review of an AI exercise) |
| `exercise.discarded` | USER | EXERCISE_BATCH | `exerciseId`, `batchId` | DRAFT of a batch deleted |
| `exercise.archived` | USER | EXERCISE | `from` | → ARCHIVED |
| `exercise.restored` | USER | EXERCISE | `to` | ARCHIVED → previous |
| `exercise_batch.requested` | USER | EXERCISE_BATCH | `executionId`, `difficulty`, `total`, `openAnswer`, `multipleChoice`, `code`, `trickQuestions`, `languageKey`, `distribution`, `regeneratedFromId` | batch recorded (same transaction as `ai_execution.requested`) |
| `exercise_batch.generated` | SYSTEM | EXERCISE_BATCH | `executionId`, `exercises` | drafts materialized (X8) |

A failed or cancelled generation is audited by the 006 events (`ai_execution.failed`,
`ai_execution.cancelled`) on the batch's execution. The 004 `syllabus_revision` save event's
changed-field list gains `languageId`.
