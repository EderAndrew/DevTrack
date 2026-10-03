# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts`, to the list checked by
`audit-coverage.spec.ts` and emitted by `test/helpers/journey.ts`. Written in the same transaction
as the change (the denied/rejected events, which have no change, in their own). Metadata carries
only ids, counts, enums, booleans and codes — never instructions, statement, answer, alternative
text, answer key, test case, feedback or a grade as free text (grades go as integer hundredths).
New target types `CLASS_ACTIVITY`, `ACTIVITY_ATTEMPT`, `ACTIVITY_SUBMISSION`. Correlation: the
existing `audit_events.request_id`.

| Type | Name in the spec | Actor | Target | Metadata | When |
|------|------------------|-------|--------|----------|------|
| `activity.published` | `ACTIVITY_PUBLISHED` | USER | CLASS_ACTIVITY | `classId`, `type`, `executionMode`, `sourceWorkId` \| `sourceExerciseCount`, `questionCount`, `totalCents`, `latePolicy`, `scheduled`, `outOfScopeTopicCount`, `hasPlan` | created |
| `activity.updated` | — | USER | CLASS_ACTIVITY | `classId`, `fields` (names only) | PATCH that changes something |
| `activity.closed` | — | USER | CLASS_ACTIVITY | `classId`, `submittedCount`, `missedCount` | ACTIVE → CLOSED |
| `activity.cancelled` | — | USER | CLASS_ACTIVITY | `classId`, `from`, `submittedCount` | → CANCELLED |
| `activity_attempt.started` | `ACTIVITY_ATTEMPT_STARTED` | USER | ACTIVITY_ATTEMPT | `activityId`, `classId`, `afterDeadline` | attempt inserted |
| `activity_attempt.progress_saved` | `ACTIVITY_PROGRESS_SAVED` | USER | ACTIVITY_ATTEMPT | `activityId`, `answeredCount`, `questionCount` | a save, at most once per 15 min per attempt |
| `activity_submission.created` | `ACTIVITY_SUBMITTED` | USER | ACTIVITY_SUBMISSION | `activityId`, `attemptId`, `late`, `blankCount`, `questionCount`, `pendingTeacherCount` | submission inserted |
| `activity_submission.rejected` | `ACTIVITY_SUBMISSION_REJECTED` | USER | CLASS_ACTIVITY | `operation` (`START` \| `SAVE` \| `SUBMIT`), `code` | a start, save or submit refused by a rule (409) |
| `student_access.denied` | `STUDENT_ACCESS_DENIED` | USER | CLASS_ACTIVITY \| ACTIVITY_ATTEMPT \| ACTIVITY_SUBMISSION (the resource's type) | `route` (pattern, not the URL), `reason` (`NOT_ENROLLED` \| `OTHER_STUDENT` \| `NOT_PUBLISHED` \| `CANCELLED`) | an existing out-of-context id |
| `activity_submission.graded` | `SUBMISSION_GRADED` | USER | ACTIVITY_SUBMISSION | `activityId`, `decidedCount`, `overriddenRuleCount`, `gradeCents`, `partial`, `afterRelease`, `generalFeedbackChanged` | teacher grades saved |
| `activity_submission.accepted_by_teacher` | `SUBMISSION_ACCEPTED_BY_TEACHER` | USER | ACTIVITY_SUBMISSION | `activityId`, `attemptId`, `reason` (`DEADLINE_PASSED` \| `ACTIVITY_CLOSED`), `blankCount`, `questionCount`, `pendingTeacherCount` | teacher accepted an unsubmitted attempt (FR-006b) |
| `activity_result.released` | `ACTIVITY_RESULT_RELEASED` | USER | CLASS_ACTIVITY | `classId`, `submittedCount`, `completeCount` | release |
| `activity_result.viewed` | `ACTIVITY_RESULT_VIEWED` | USER | ACTIVITY_SUBMISSION | `activityId` | first student read of a visible result |

Idempotent no-ops (start an existing attempt, repeat a submit, accept an attempt already submitted, close a CLOSED activity, cancel a
CANCELLED one, release a released one, a save with every answer UNCHANGED) write no event.
