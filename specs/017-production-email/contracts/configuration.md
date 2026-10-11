# Configuration: 017

| Variable | Default | Meaning |
|---|---|---|
| `SMTP_URL` | (001) | production: `smtps://…:465` or `smtp://…:587?requireTLS=true` |
| `MAIL_FROM` | (001) | `DevTrack <nao-responda@<domínio>>` |
| `MAIL_REPLY_TO` | — | optional reply address |
| `MAIL_MESSAGE_ID_DOMAIN` | domain of `MAIL_FROM` | right side of the Message-ID (research N5) |
| `MAIL_SENDS_PER_MINUTE` | 120 | sends of all instances per minute; `0` pauses sending |
| `MAIL_SEND_TIMEOUT_SECONDS` | 20 | SMTP timeout per message |
| `MAIL_RETRY_INTERVAL_SECONDS` | 30 (003) | worker period; `0` turns the timer off |
| `MAIL_NOTICE_PROVIDER` | `none` | `resend` \| `ses` \| `none` |
| `MAIL_NOTICE_SECRET` | — | Resend signing secret (`whsec_…`); required with `resend` |
| `MAIL_SES_TOPIC_ARN` | — | SNS topic ARN; required with `ses` |
| `RATE_LIMIT_MAIL_NOTICES_PER_MINUTE` | 600 | per IP, notice route |
| `MAIL_RECORDS_RETENTION_DAYS` | 180 | final deliveries kept this long |

With `NODE_ENV=production` the API refuses to start when `SMTP_URL` has no TLS, points to
`localhost`, a private address or `mailpit`, `MAIL_FROM` has no domain, or `MAIL_NOTICE_PROVIDER`
is `none` (FR-025). The error names the variable, never its value.

All of them go in `apps/api/.env.example`; `.env.test.example` and the E2E keep Mailpit and
`MAIL_NOTICE_PROVIDER=resend` with a fixed test secret.

Constants (not configurable): 7 attempts and the 003 waits; notice body ≤ 256 KB; Resend timestamp
tolerance ± 5 min; SNS certificate fetch timeout 5 s.
