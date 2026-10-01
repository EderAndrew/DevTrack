# Contract: server configuration

Parsed by `config.schema.ts`; never sent to the web.

| Variable | Default | Rules |
|----------|---------|-------|
| `RATE_LIMIT_WORK_AI_PER_HOUR` | `10` | int ≥ 1; work-generation requests per teacher per hour, on top of the 006 per-minute and 008 per-agent limits |

The generation uses the existing AI settings (interval, limits, OpenRouter key, budgets); no
model, provider or key setting is added.
