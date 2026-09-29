# Contract: model catalog and quality gate

Research H2–H4, H6, H12.

## Catalog (`apps/api/src/modules/ai/definitions/model-catalog.ts`)

The only place with concrete model ids. Each entry: `key` (stable, e.g. `anthropic-basic`),
`family`, `model` (OpenRouter id), `tier`, `mode`, `lifecycle`, `price`, `contextWindow`,
`capabilities`, `priority`, `maxOutputTokens`, `timeoutMs`, `approvals`.

Startup checks (a failing entry is skipped and logged `ai.catalog_entry_rejected`, never stops
the API):

- `family` ∈ allowlist; when `model` has a `/`, its prefix equals `family`; an id without a
  prefix only for a family outside the production allowlist (tests);
- `model` matches `^[a-z0-9-]+/[a-z0-9._:-]+$`, not `openrouter/*`;
- one entry per `model`; unique `key`;
- `mode = DECISION` ⇒ no `structuredOutput`/`tools`.

Changing a model's version = a new entry (new key) or a changed `model` on an entry (audited
`ai_model_config.changed`, 008). Agents and task policies never change for it (FR-019).

## Lifecycle

`CANDIDATE → EVALUATING → PRODUCTION → DEPRECATED`, and back to `EVALUATING` from
`DEPRECATED` for a re-evaluation; every change is a code change, synced and audited
(`ai_model_config.lifecycle_changed`, with `from`, `to`). A candidate whose evaluation already passed
may go straight to `PRODUCTION` in the change that adds its approval, and `EVALUATING` may go
back to `CANDIDATE` (evaluation given up); any other change (e.g. `PRODUCTION → CANDIDATE`,
`DEPRECATED → PRODUCTION`) is refused by the startup check against the registry: the entry is
left out of the catalog and logged `ai.catalog_entry_rejected` with
`LIFECYCLE_TRANSITION_INVALID` (decided during implementation, 2026-09-27). A task left with only
a `DEPRECATED` model runs on it and logs `ai.model_deprecated_in_use` (task, catalog key) at
startup. The admin's `DISABLED` (006 status)
overrides any lifecycle. No transition is automatic; nothing from OpenRouter enters the catalog
by itself (FR-004, FR-018).

## Quality gate

A model serves a task in production only if:

1. `lifecycle = PRODUCTION` (or `DEPRECATED` with no alternative);
2. it has an approval for the task;
3. the approval's metrics meet every threshold of the task's `quality`;
4. (CI) the approval matches its evidence file.

Evidence file (`apps/api/test/fixtures/evaluations/<taskKey>/<modelKey>.json`), written by
`EVAL_RECORD=1 EVAL_MODEL=<modelKey> pnpm --filter api eval:curriculum`:

```json
{
  "task": "curriculum-extraction",
  "model": "anthropic/claude-haiku-4.5",
  "servedModel": "anthropic/claude-haiku-4.5-20251001",
  "goldenSetVersion": 1,
  "evaluatedAt": "2026-09-27T12:00:00Z",
  "metrics": { "itemRecall": 0.94, "schemaValidity": 1, "unsupportedWithoutWarning": 0, "inventedFields": 0, "injectionClean": 1 },
  "cost": { "total": "0.0123", "currency": "USD", "perExecution": "0.0015" }
}
```

The metrics are those of the 007 scorer. `curriculum-extraction.quality` =
`{ itemRecall: 0.9, schemaValidity: 1, unsupportedWithoutWarning: 0, inventedFields: 0,
injectionClean: 1, languageMatch: 1 }` (the 007 SC-005/SC-006 thresholds; `languageMatch`, the
share of golden cases whose proposed language is the expected one, since 010 SC-012 and golden
set v2).

`009-quality-gate.spec.ts` (CI): every approval has an evidence file with equal metrics and the
same model; every evidence file meets its task's thresholds and records the served model and the
cost of a real run; no `PRODUCTION` model lacks an approval for at least one task. An approval
never comes from answers without provenance (e.g. the 007 `recorded.json`).
