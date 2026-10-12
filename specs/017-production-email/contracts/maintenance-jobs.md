# Maintenance Jobs: 017

| Job | What it deletes | Rule |
|---|---|---|
| `mail-records` | `mail_notices` | older than 90 days |
| `mail-records` | `mail_deliveries` | final state (`DELIVERED`, `UNDELIVERED`, `FAILED`, `DISCARDED`, `SUPERSEDED`) older than `MAIL_RECORDS_RETENTION_DAYS` (180), except the latest delivery of a `PENDING` invitation |

Runs with the other jobs (`pnpm --filter api maintenance:run [--job mail-records]`), in batches of
1 000, each batch in one transaction with `SET LOCAL devtrack.mail_purge = 'on'` (the notices'
append-only trigger lets the job delete them and clear `delivery_id`). Like the other technical
purges (`ai-records`, `rate-limit-counters`) it writes no audit event: the run logs the job name and
the count only. Ages: a notice by `received_at`, a delivery by `updated_at` (when it reached its
final state).
