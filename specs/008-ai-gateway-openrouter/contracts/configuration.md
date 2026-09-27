# Contract: server configuration

Parsed by `apps/api/src/platform/config/config.schema.ts` (research G16). Never sent to the
web; `OPENROUTER_API_KEY` is redacted from logs (`*.openrouter`) and scanned for by the secret
scan.

| Variable | Default | Rules |
|----------|---------|-------|
| `OPENROUTER_API_KEY` | — | optional; absent → provider not registered, AI unavailable, API starts |
| `OPENROUTER_BASE_URL` | — | optional http(s) URL; only the local E2E sets it (mock) |
| `OPENROUTER_DEFAULT_MODEL` | `anthropic/claude-opus-5` | `vendor/model`; not `openrouter/*` |
| `OPENROUTER_FALLBACK_MODEL` | — | optional; same format; ≠ default |
| `OPENROUTER_TIMEOUT_MS` | `60000` | positive int; ceiling of each call (model config `timeoutMs`) |
| `AI_CIRCUIT_FAILURE_THRESHOLD` | `5` | positive int |
| `AI_CIRCUIT_OPEN_SECONDS` | `60` | positive int |
| `AI_AGENT_EXECUTIONS_PER_HOUR` | `100` | positive int, per agent, all users |

An invalid model variable leaves the task unavailable and logs `ai.task_unavailable` with
`reason` (`MODEL_INVALID`, `FALLBACK_EQUALS_PRIMARY`, `PROVIDER_NOT_REGISTERED`); it does not stop
the API. An invalid number stops the startup like any other config error.

Removed: `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`. The `OPENAI_API_KEY` placeholder in
`.env.example` is removed too (no OpenAI provider exists).

Tests: `testConfig()` sets `openrouter.apiKey` to null regardless of the shell; the E2E sets a
fictitious key and `OPENROUTER_BASE_URL` to the local mock.
