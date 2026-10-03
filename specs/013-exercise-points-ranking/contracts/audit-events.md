# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts`, `audit-coverage.spec.ts` and
`test/helpers/journey.ts` (research K15). Same rules as 012: same transaction, metadata with ids,
counts, enums, booleans and codes only — never answer, answer key, explanation or comment text.

| Type | Actor | Target | Metadata | When |
|------|-------|--------|----------|------|
| `exercise_attempt.completed` (new) | USER | ACTIVITY_ATTEMPT | `activityId`, `classId`, `attemptNumber`, `first`, `questionCount`, `blankCount`, `correctCount`, `pendingCount`, `alreadyScoredCount`, `points` | an EXERCISE attempt concluded |
| `exercise_result.marked` (new) | USER | ACTIVITY_ATTEMPT | `activityId`, `questionId`, `from` (`PENDING_TEACHER` \| `CORRECT` \| `WRONG`), `to`, `points`, `hasComment` | one per mark that changes the result or the comment |
| `activity_attempt.started` (012) | USER | ACTIVITY_ATTEMPT | + `attemptNumber` | first attempt and each retry |
| `activity_submission.rejected` (012) | USER | CLASS_ACTIVITY | `operation` gains `RETRY`, `COMPLETE` | a retry or conclusion refused by a rule |
| `activity.published` (012) | USER | CLASS_ACTIVITY | EXERCISE: `possiblePoints` instead of `totalCents` and `latePolicy` | created |

Idempotent no-ops write nothing: concluding a concluded attempt, retrying when `afterNumber + 1`
already exists, a mark equal to the stored one. Reading the ranking is not audited.
