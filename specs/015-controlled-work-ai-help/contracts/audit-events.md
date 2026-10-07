# Audit Events: 015

Metadata holds only ids, enums, counts, durations and codes — never the question, the guidance,
an answer or the answer key.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `activity.settings_changed` | USER (teacher) | CLASS_ACTIVITY | `executionMode`, `aiHelpAllowance` |
| `attempt_integrity.recorded` | USER (student) or SYSTEM | ACTIVITY_ATTEMPT | `eventType`, `buffered` |
| `work_help.requested` | USER (student) | WORK_HELP_REQUEST | `attemptId`, `executionId`, `questionPosition` |
| `work_help.delivered` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `used` |
| `work_help.out_of_scope` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId` |
| `work_help.blocked` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `reasonCode` |
| `work_help.failed` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `errorCode` |

Changed 006 events: `ai_proposal.approved` / `ai_proposal.rejected` may have `actorType: SYSTEM`
with `settledBy: "DOMAIN_RULE"` (research F9). The 012 `activity.created` metadata gains
`executionMode` and `aiHelpAllowance`. Denied student access keeps `student_access.denied`.
