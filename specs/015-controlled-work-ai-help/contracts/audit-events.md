# Audit Events: 015

Metadata holds only ids, enums, counts, durations and codes — never the question, the guidance,
an answer or the answer key.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `activity.published` | USER | CLASS_ACTIVITY | 012 metadata + `aiHelpAllowance` (0 or 3) |
| `activity.settings_changed` | USER | CLASS_ACTIVITY | `classId`, `executionMode`, `aiHelpAllowance` |
| `attempt_integrity.recorded` | USER \| SYSTEM | ACTIVITY_ATTEMPT | `eventType`, `buffered` |
| `work_help.requested` | USER | WORK_HELP_REQUEST | `attemptId`, `executionId`, `questionPosition` |
| `work_help.delivered` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `used` |
| `work_help.out_of_scope` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId` |
| `work_help.blocked` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `reasonCode` |
| `work_help.failed` | SYSTEM | WORK_HELP_REQUEST | `attemptId`, `executionId`, `errorCode` |

Changed 006 events: `ai_proposal.approved` / `ai_proposal.rejected` may have `actorType: SYSTEM`
with `settledBy: "DOMAIN_RULE"` (research F9). The 012 `activity.published` metadata gains
`aiHelpAllowance` next to its `executionMode` (row above). `activity.settings_changed` is written by
the teacher's edit (USER, teacher) and carries the values after the change. Denied student access keeps `student_access.denied`.
