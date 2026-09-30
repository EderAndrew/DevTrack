# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts`, to the list checked by
`audit-coverage.spec.ts` and emitted by `test/helpers/journey.ts`. Written in the same
transaction as the change. Metadata carries only ids, counts, enums and codes — never title,
description, statement, answer, rubric, solution, test case, explanation, alternative text,
grade typed as free text or syllabus text. New target types `WORK` and `WORK_GENERATION_REQUEST`.
Correlation (spec "correlationId"): every event carries the HTTP request's `requestId` (the
existing `audit_events.request_id`); events tied to a generation also carry `executionId` in their
metadata, which leads to the execution's `correlation_id` (006). No new column.

| Type | Name in the request | Actor | Target | Metadata | When |
|------|---------------------|-------|--------|----------|------|
| `work.created` | `WORK_CREATED_MANUALLY` | USER | WORK | `subjectId`, `status`, `questionCount`, `types` (counts per type), `topicCount`, `difficulty` | manual create |
| `work_generation.requested` | `WORK_AI_GENERATION_REQUESTED` | USER | WORK_GENERATION_REQUEST | `executionId`, `subjectId`, `topicCount`, `difficulty`, `total`, `openAnswer`, `multipleChoice`, `code`, `trickQuestions`, `languageKey`, `distribution`, `regeneratedFromId` | request recorded (same transaction as `ai_execution.requested`) |
| `work_generation.generated` | `WORK_AI_GENERATED` | SYSTEM | WORK_GENERATION_REQUEST | `executionId`, `workId`, `questionCount` | DRAFT work materialized |
| `work.edited` | `WORK_EDITED` | USER | WORK | `origin`, `status`, `fields` (names only), `questionCountChanged`, `questionsAdded`, `questionsRemoved`, `reordered` | content changed |
| `work.approved` | `WORK_APPROVED` | USER | WORK | `origin`, `humanEdited`, `generationRequestId`, `warnings` (codes) | DRAFT → APPROVED, or manual save as APPROVED |
| `work.archived` | `WORK_ARCHIVED` | USER | WORK | `from` | → ARCHIVED |
| `work.restored` | — (restored) | USER | WORK | `to` | ARCHIVED → previous |

A failed or cancelled generation is audited by the 006 events (`ai_execution.failed`,
`ai_execution.cancelled`) on the request's execution, which carry the `aiExecutionId` link.
Idempotent no-ops (approve an APPROVED work, archive an ARCHIVED one, repeat a request key) write
no event.
