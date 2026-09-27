# Contract: audit events

Added to `src/modules/audit/audit-event-types.ts` and to the 006 `contracts/audit-events.md`
list checked by `audit-coverage.spec.ts`; each emitted by `test/helpers/journey.ts`. No metadata
carries content, credential, user id in clear or provider message.

| Type | Actor | Target | Metadata | When |
|------|-------|--------|----------|------|
| `ai_execution.escalated` | SYSTEM | `AI_EXECUTION` | `taskKey`, `fromTier`, `toTier`, `reason`, `modelConfigKey` | same transaction as the first escalated leg |
| `ai_model_config.lifecycle_changed` | SYSTEM | `AI_MODEL_CONFIG` | `configKey`, `from`, `to` | registry sync, when a catalog entry's lifecycle changes |
| `ai_task_override.set` | USER | `AI_TASK` | `taskKey`, `modelConfigKey`, `previousModelConfigKey` | override set or changed |
| `ai_task_override.removed` | USER | `AI_TASK` | `taskKey`, `modelConfigKey` | override removed |
| `ai_budget.exceeded` | SYSTEM | — | `scope`, `period`, `limit`, `spent`, `agentKey` (nullable) | first crossing of a budget in its period |

Changed, not new: `ai_execution.requested` gains `tier` and `selectionReason`;
`ai_registry.synced` gains `catalogModels`. New target type `AI_TASK`.
