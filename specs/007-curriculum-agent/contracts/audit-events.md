# Audit Events Contract: 007 — Curriculum Agent

This adds two types to the catalogs of 001, 003, 004 and 006, under the same rules:
- written in the same transaction as the change;
- the table is append-only;
- `metadata` holds only the listed keys (allowlist in `audit-event-types.ts`).

`metadata` must **never** contain the document, its normalized content, the ementa text,
titles, items, the model output, the proposal content or provider messages (FR-044, FR-045).

`audit-coverage.spec.ts` reads this catalog (add it to its list), and `test/helpers/journey.ts`
emits both types.

| `type` | Spec name | Actor | Target | `metadata` allowed |
|--------|-----------|-------|--------|--------------------|
| `curriculum_ai.analysis_requested` | `CURRICULUM_AI_ANALYSIS_REQUESTED` | USER | SYLLABUS_DOCUMENT | `executionId`, `created`, `discardedProposal` |
| `curriculum_ai.proposal_applied` | `CURRICULUM_AI_PROPOSAL_APPLIED` | USER | SYLLABUS_DOCUMENT | `proposalId`, `revisionId`, `revisionNumber`, `replacedDraft`, `acceptedFields`, `acceptedGroups`, `groupCount`, `itemCount`, `unsupportedCount` |

## Spec events covered by 006 types (research C15)

These rows are written by the foundation in the same transaction as the change. They carry
`agentKey = curriculum-agent` (on `ai_execution.requested` and `ai_proposal.created`) and the
target `SYLLABUS_DOCUMENT` through the execution's resource, so there is no duplicate row:

| Spec name | 006 `type` |
|-----------|------------|
| `CURRICULUM_AI_ANALYSIS_STARTED` | `ai_execution.started` |
| `CURRICULUM_AI_ANALYSIS_COMPLETED` | `ai_execution.completed` |
| `CURRICULUM_AI_ANALYSIS_FAILED` | `ai_execution.failed` (and `ai_execution.cancelled`) |
| `CURRICULUM_AI_PROPOSAL_CREATED` | `ai_proposal.created` |
| `CURRICULUM_AI_PROPOSAL_APPROVED` | `ai_proposal.approved` / `ai_proposal.partially_approved` (written by `decideWithin` in the apply transaction) |
| `CURRICULUM_AI_PROPOSAL_REJECTED` | `ai_proposal.rejected` |

`curriculum_ai.proposal_applied` and the `ai_proposal.approved` (or `partially_approved`) row
of the same application share the transaction and the `requestId`.
