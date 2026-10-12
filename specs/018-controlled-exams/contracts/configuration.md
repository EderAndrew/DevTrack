# Configuration: 018

| Variable | Default | Meaning |
|---|---|---|
| `RATE_LIMIT_EXAM_DECISIONS_PER_MINUTE` | 60 | hold decisions per teacher per minute (research T17) |
| `RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR` | 10 | "Criar prova com IA" requests per teacher per hour (as 011) |

They go in `.env.example` and `config.schema.ts`; tests lower them per suite.

Constants that are not configurable:

- `EXAM_MAX_QUESTIONS = 20`; duration 1–120 min; inactivity 30–60 s (default 60); start window
  0–60 min (default 15);
- `EXAM_WARNINGS = 3` (the 4th occurrence opens the hold);
- `EXAM_END_GRACE_MS = 2000`, `OCCURRENCE_GROUP_WINDOW_MS = 2000`;
- web: alerts at 600 s and 300 s, countdown at 10 s, polling `ATTENDANCE_POLL_MS = 5000`.

The `exam-generator` agent is registered DISABLED; the admin enables it after the release gate
(`contracts/exam-generator.md`).
