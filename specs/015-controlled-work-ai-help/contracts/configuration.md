# Configuration: 015

| Variable | Default | Meaning |
|---|---|---|
| `CONTROLLED_TYPING_BURST_CHARS` | 400 | characters an answer may grow in one save regardless of time (research F7) |
| `CONTROLLED_TYPING_CHARS_PER_SECOND` | 15 | extra growth allowed per second since the answer's last save |
| `RATE_LIMIT_ATTEMPT_EVENTS_PER_MINUTE` | 120 | integrity events per student |
| `RATE_LIMIT_WORK_HELP_PER_HOUR` | 20 | help requests per student (any outcome) |
| `AI_WORK_HELP_EXECUTIONS_PER_HOUR` | 1500 | hourly limit of the `work-helper` agent, all students together (F12) |

All in `.env.example` and `config.schema.ts`; tests lower them per suite.
