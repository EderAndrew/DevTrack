# Configuration and Maintenance Jobs: 024

## API environment (Zod-validated at startup)

| Variable | Default | Rule |
|---|---|---|
| `PUSH_ENABLED` | `false` | Kill switch. Off: alerts are written and end `SKIPPED`; nothing is sent. |
| `EXPO_ACCESS_TOKEN` | — | Required when `PUSH_ENABLED=true`; the production config guard refuses to start without it. Never logged. |
| `EXPO_PUSH_BASE_URL` | `https://exp.host` | Only the test/E2E harness overrides it (a local fake). |
| `EXAM_ALERT_INTERVAL_MS` | `1000` | Worker timer; `0` turns the timer and `kick()` off (tests). |
| `EXAM_ALERT_MAX_AGE_SECONDS` | `60` | An alert older than this is never sent (FR-019). |
| `RATE_LIMIT_MOBILE_WRITES_PER_MINUTE` | `30` | `PUT /mobile/device`, `PUT …/exam-alerts`. |

Session lifetimes are constants in `session.service.ts` (MOBILE 30 d idle / 90 d absolute), like the web's.

## App configuration (`apps/mobile`)

| Name | Where | Rule |
|---|---|---|
| `EXPO_PUBLIC_API_ORIGIN` | `app.config.ts` per EAS profile | HTTPS origin of the API (`https://devtrack.nativcode.com.br` for the pilot); `http://10.0.2.2:4000` only in the development profile. |
| EAS project id | `app.config.ts` | Public. |
| FCM credentials | EAS (server side) | Uploaded with `eas credentials`; never in the repository. |

## Maintenance jobs

| Job | What it deletes | Rule |
|---|---|---|
| `exam-alerts` | `exam_alerts` and their `exam_alert_deliveries` | `created_at` older than 7 days |
| `mobile-devices` | `mobile_devices` | the session has expired (a revocation already deleted its device, Y9) |

Both run with the others (`pnpm --filter api maintenance:run [--job <name>]`), in batches of 1 000, and write no
audit event (the run logs the job name and the count).
