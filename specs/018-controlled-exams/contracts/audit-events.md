# Audit Events: 018

Metadata holds only ids, enums, counts, durations and times. It never holds a statement, an answer,
a key or the text of an event.

## New

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `exam.created` | USER | EXAM | `subjectId`, `origin`, `status`, `questionCount` |
| `exam.edited` | USER | EXAM | `fields` (names), `questionCountChanged` |
| `exam.approved` | USER | EXAM | `origin`, `humanEdited` |
| `exam.archived` / `exam.restored` | USER | EXAM | `fromStatus` |
| `exam_generation.requested` | USER | EXAM_GENERATION_REQUEST | `subjectId`, `quantity`, `topicCount` |
| `exam_generation.completed` | SYSTEM | EXAM_GENERATION_REQUEST | `examId`, `aiExecutionId` |
| `exam_generation.rejected` | SYSTEM | EXAM_GENERATION_REQUEST | `aiExecutionId`, `code` |
| `exam_attempt.held` | SYSTEM | ACTIVITY_ATTEMPT | `activityId`, `holdId`, `occurrenceOrdinal` |
| `exam_attempt.cancel_confirmed` | USER | ACTIVITY_ATTEMPT | `activityId`, `holdId`, `submissionId` |
| `exam_attempt.returned` | USER | ACTIVITY_ATTEMPT | `activityId`, `holdId`, `secondsLeft` |
| `exam_attempt.not_cancelled` | USER | ACTIVITY_ATTEMPT | `activityId`, `holdId`, `submissionId` |
| `exam_attempt.time_expired` | SYSTEM | ACTIVITY_ATTEMPT | `activityId`, `submissionId`, `endReason`, `blankCount` |
| `exam_attempt.write_refused` | USER | ACTIVITY_ATTEMPT | `activityId`, `operation` (`EVENTS`), `code` |

`exam_attempt.held` is written in the transaction of the events batch that opened the hold.
Occurrences themselves are not audited one by one: they are facts in `attempt_integrity_events`
and rule results in `exam_occurrences` (015 kept events out of the audit the same way).

## Changed

| Type | Metadata added |
|---|---|
| `activity.published` | `type: EXAM`, `durationMinutes`, `inactivityLimitSeconds`, `startWindowMinutes`, `sourceExamId` |
| `activity_attempt.started` | `rulesAccepted: true` for EXAM |
| `activity_submission.created` | `endReason: STUDENT_SUBMITTED` for EXAM |
| `activity_submission.rejected` | codes `EXAM_TIME_OVER`, `EXAM_ATTEMPT_ON_HOLD`, `EXAM_START_CLOSED` |
| `activity_result.released` | refused while decisions are pending (no event on the refusal) |
| `attempt_pause.write_refused` | — (unchanged; the student exit refused for EXAM writes `activity_submission.rejected` with `operation: EXIT`, `code: EXIT_NOT_ALLOWED`) |

SC-010: each hold, cancellation, return and do-not-cancel writes exactly one event; a repeated
decision writes none.
