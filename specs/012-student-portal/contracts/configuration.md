# Contract: configuration

New variables in `apps/api/src/platform/config/config.schema.ts`, `.env.example` and
`.env.test.example` (all optional, positive integers):

| Variable | Default | Config key | Scope |
|----------|---------|------------|-------|
| `RATE_LIMIT_ACTIVITY_SAVES_PER_MINUTE` | 60 | `rateLimit.activitySavesPerMinute` | per student, `PUT …/attempt/answers` |
| `RATE_LIMIT_ACTIVITY_SUBMITS_PER_HOUR` | 20 | `rateLimit.activitySubmitsPerHour` | per student, start + submit |
| `RATE_LIMIT_ACTIVITY_TEACHER_WRITES_PER_HOUR` | 300 | `rateLimit.activityTeacherWritesPerHour` | per teacher, every teacher write of 012 |

Over the limit → `429 RATE_LIMITED` (existing code). No other configuration: deadlines, urgency
(48 h) and the progress-audit interval (15 min) are domain constants in `activities/`.
