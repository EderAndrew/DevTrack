# Audit Events: 025

Metadata holds only ids, enums, codes and counts — never the student's name, the teacher's name or the text of the
nudge (`exam-nudges-boundary.spec.ts`, SC-006).

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `exam_nudge.sent` | USER (teacher) | ACTIVITY_ATTEMPT | `activityId`, `nudgeId`, `occurrenceCount` |
| `exam_nudge.send_refused` | USER (teacher) | ACTIVITY_ATTEMPT | `activityId`, `reason` (`NOT_IN_PROGRESS`, `ON_HOLD`, `PAUSED`, `TOO_FEW_OCCURRENCES`) |
| `exam_nudge.dismissed` | USER (student) | ACTIVITY_ATTEMPT | `activityId`, `nudgeId` |

`exam_nudge.sent` is written in the transaction that inserts the row; an idempotent send (a pending one existed)
writes nothing. `exam_nudge.send_refused` is written in its own transaction after the refusal (like
`attempt_pause.write_refused`); `404`s write nothing. `exam_nudge.dismissed` is written in the transaction of the
update; a repeated dismissal writes nothing. The student's poll is a read and writes nothing.
