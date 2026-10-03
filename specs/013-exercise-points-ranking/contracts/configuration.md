# Contract: configuration

New variable in `apps/api/src/platform/config/config.schema.ts`, `.env.example` and
`.env.test.example` (optional, positive integer):

| Variable | Default | Config key | Scope |
|----------|---------|------------|-------|
| `RATE_LIMIT_EXERCISE_ATTEMPTS_PER_HOUR` | 60 | `rateLimit.exerciseAttemptsPerHour` | per student: start, retry and complete of EXERCISE activities |

Over the limit → `429 RATE_LIMITED`. The 012 limits keep their scope: submits (start + submit of
ASSIGNMENT), saves (both types), teacher writes (marks included). The point values (15/30/60) are
the domain constant `EXERCISE_POINTS` in `@repo/contracts`, not configuration.
