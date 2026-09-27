# Contract: server configuration

Research H2, H16. Parsed by `config.schema.ts`; never sent to the web.

| Variable | Default | Rules |
|----------|---------|-------|
| `OPENROUTER_API_KEY` | — | unchanged (008) |
| `OPENROUTER_BASE_URL` | — | unchanged (008); its origin also serves the decisions route |
| `OPENROUTER_TIMEOUT_MS` | `60000` | unchanged; ceiling of each catalog entry's `timeoutMs` |
| `AI_BUDGET_DAILY_USD` | — | optional decimal > 0 |
| `AI_BUDGET_MONTHLY_USD` | — | optional decimal > 0 |
| `AI_BUDGET_PER_USER_MONTHLY_USD` | — | optional decimal > 0 |
| `AI_BUDGET_PER_AGENT_MONTHLY_USD` | — | optional decimal > 0 |

Removed: `OPENROUTER_DEFAULT_MODEL`, `OPENROUTER_FALLBACK_MODEL` (models come from the catalog).
A value still set is ignored and logged once (`ai.config_ignored`, the variable name only).
Budgets only warn (spec Q3). Invalid numbers stop the startup like any config error.
