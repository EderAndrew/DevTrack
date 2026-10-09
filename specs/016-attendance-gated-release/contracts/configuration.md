# Configuration: 016

| Variable | Default | Meaning |
|---|---|---|
| `RATE_LIMIT_ATTEMPT_PAUSES_PER_HOUR` | 20 | exits a student may declare per hour (research M11) |

It goes in `.env.example` and `config.schema.ts`, and tests lower it per suite.

Constants that are not configurable:

- note ≤ 200 characters;
- batch ≤ 200 ids per list;
- web `ATTENDANCE_POLL_MS = 5000`.
