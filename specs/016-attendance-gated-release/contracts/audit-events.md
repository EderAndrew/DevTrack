# Audit Events: 016

Metadata holds only ids, enums, counts and durations. It never holds the text of the "Outro" note.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `attendance.marked` | USER (teacher) | CLASS_ACTIVITY | `classId`, `studentUserId` |
| `attendance.unmarked` | USER (teacher) | CLASS_ACTIVITY | `classId`, `studentUserId` |
| `attempt_pause.started` | USER (student or teacher) | ACTIVITY_ATTEMPT | `activityId`, `pauseId`, `initiatedBy`, `reason` |
| `attempt_pause.released` | USER (teacher) | ACTIVITY_ATTEMPT | `activityId`, `pauseId`, `seconds` |
| `attempt_pause.write_refused` | USER (student) | ACTIVITY_ATTEMPT | `activityId`, `pauseId`, `operation` (`EVENTS` \| `HELP`) |

Changes to existing events:

- `activity.published` gains `releaseMode`.
- `activity.closed` and `activity.cancelled` gain `pausedCount`, the number of open pauses the
  close or the cancellation ended (research M7).
- `activity_submission.accepted_by_teacher` gains `pauseEnded: boolean`, true when the accepted
  attempt had an open pause.
- `student_access.denied` gains the reason `NOT_PRESENT`.
- A write refused by an open pause is always audited:
  - save and submit write `activity_submission.rejected` with `code: ATTEMPT_PAUSED`, in the 012
    pattern;
  - the 015 events and the 015 help write the new type below.

Each batch writes one `attendance.marked` or `attendance.unmarked` per student it actually
changes (SC-009). No-ops write nothing.
