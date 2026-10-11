# Maintenance Jobs: 017

| Job | What it deletes | Rule |
|---|---|---|
| `mail-records` | `mail_notices` | older than 90 days |
| `mail-records` | `mail_deliveries` | final state (`DELIVERED`, `UNDELIVERED`, `FAILED`, `DISCARDED`, `SUPERSEDED`) older than `MAIL_RECORDS_RETENTION_DAYS` (180), except the latest delivery of a `PENDING` invitation |

Runs with the other jobs (`pnpm --filter api maintenance:run [--job mail-records]`), in batches of
1 000, audited as the other jobs (`maintenance.job_completed`, counts only).
