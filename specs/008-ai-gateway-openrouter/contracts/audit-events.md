# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts` and to the 006 `contracts/audit-events.md`
list checked by `audit-coverage.spec.ts`; each is emitted by `test/helpers/journey.ts`. No
metadata key carries content, a credential or a provider message.

| Type | Actor | Target | Metadata | When |
|------|-------|--------|----------|------|
| `ai_execution.fallback_used` | SYSTEM | `AI_EXECUTION` | `primaryConfigKey`, `fallbackConfigKey`, `reason` (`PROVIDER_FAILURE` \| `CIRCUIT_OPEN`), `primaryErrorCode` (nullable) | same transaction as the fallback leg's `ai_model_calls` row |
| `ai_circuit.opened` | SYSTEM | `AI_MODEL_CONFIG` | `configKey`, `provider`, `model`, `failures` | own transaction, once per CLOSED/HALF_OPEN → OPEN |
| `ai_circuit.closed` | SYSTEM | `AI_MODEL_CONFIG` | `configKey`, `provider`, `model` | own transaction, once per HALF_OPEN → CLOSED |
| `ai_model_config.changed` | SYSTEM | `AI_MODEL_CONFIG` | `configKey`, `provider`, `previousModel`, `model` | registry sync transaction, when an existing config's model changes |

Changed, not new: `ai_execution.rate_limited` accepts `scope: "agent"`;
`ai_execution.requested` gains `taskKey` and `fallbackModelConfigKey` in its metadata.
