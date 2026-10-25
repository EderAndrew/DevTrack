# Maintenance Jobs: 020

| Job | What it deletes | Rule |
|---|---|---|
| `student-feedback` | `student_feedbacks` and their `student_feedback_status_changes` | status `RESOLVED` or `ARCHIVED` and `status_changed_at` older than 24 months |

Runs with the other jobs (`pnpm --filter api maintenance:run [--job student-feedback]`), in batches of
1 000, each batch in one transaction with `SET LOCAL devtrack.feedback_purge = 'on'` (the delete guard
of the feedbacks and the append-only trigger of the history let only this flag delete). `RECEIVED`
and `IN_REVIEW` feedbacks are never deleted. Like the other technical purges it writes no audit
event: the run logs the job name and the count only.
