# Audit Events: 020

Metadata holds only ids and enums. It never holds the message, the excerpt or the origin path
(`feedback-boundary.spec.ts`, SC-004). The USER of `student_feedback.submitted` and
`student_feedback.rate_limited` is the student; the USER of `student_feedback.status_changed` is the
ADMIN.

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `student_feedback.submitted` | USER | STUDENT_FEEDBACK | `category` |
| `student_feedback.rate_limited` | USER | — | `scope` (always `"student-feedback"`) |
| `student_feedback.status_changed` | USER | STUDENT_FEEDBACK | `fromStatus`, `toStatus` |

`student_feedback.submitted` and `status_changed` are written in the transaction that creates the
feedback or applies the change. A returned existing feedback (`200`, same `submissionId`) and a
refused transition (`409`) write nothing. `rate_limited` is written in its own transaction after the
refused create rolls back (J4).

Reading feedbacks (lists, detail, summary) writes no event, like the other ADMIN reads.
