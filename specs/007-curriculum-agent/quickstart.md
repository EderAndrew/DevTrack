# Quickstart: 007 — Curriculum Agent

This is a validation script for the feature, run locally.

## 1. Automated checks (no real provider)

```bash
docker compose up -d postgres postgres-test mailpit
pnpm install                                   # adds @anthropic-ai/sdk to apps/api
pnpm --filter api prisma migrate deploy        # AI_ASSISTED + syllabus_revisions.ai_proposal_id
pnpm build
pnpm --filter api test -- test/integration/007-   # US1–US7 with the fake provider
pnpm --filter api test:security                    # matrices, isolation, injection, scans, no-real-provider
pnpm --filter api test -- src/modules/curriculum-ai src/modules/ai/gateway/providers   # grounding, refs, build, provider mapping (local mock)
pnpm --filter web test -- curriculum-ai
pnpm lint && pnpm check-types
```

What to expect:
- every 007 scenario (`007/USn-k`, `007/SC-00n`) appears in a test title, and the
  traceability guard includes 007;
- `007-us6-evaluation.spec.ts` prints the golden-set metrics and passes the SC-005 and SC-006
  thresholds with the recorded responses;
- the secret scan finds no `MARCADOR-EMENTA-007` or fake key in logs, audit or admin responses.

Result on 2026-09-26 (T069), Node 24.12, PostgreSQL 17: `pnpm lint` and `pnpm check-types` pass;
`pnpm test` passes — api 2708 tests (136 files, `test:security` 1341 of them), web 974, contracts
107. `pnpm --filter web test:e2e` passes 17 journeys, among them `curriculum-ai.spec.ts` (upload →
"Preencher com IA" → review → apply without a group → edit → confirm) against the local Anthropic
mock (`apps/web/e2e/anthropic-mock.ts`, started by Playwright on port 4180).

## 2. Manual run with the real provider (optional, costs money)

```bash
cp apps/api/.env.example apps/api/.env      # set ANTHROPIC_API_KEY=...
pnpm --filter api build && pnpm --filter api dev
pnpm --filter web dev
```

0. As ADMIN, enable `curriculum-agent` in "Operação de IA" (it is registered disabled). Before
   that, the teacher sees "Preencher com IA" unavailable.
1. Log in as a teacher and open a subject. Upload `apps/api/test/fixtures/syllabus/poo.pdf`
   and wait for "Processado".
2. Click "Preencher com IA". The stages change without a reload, and "Proposta pronta para
   revisão." appears in well under 2 minutes (SC-008).
3. "Revisar proposta": four groups of four items, in order, with "página N" sources and no
   "Não encontrado no documento" warnings.
4. Uncheck one group → "Aplicar à ementa". The 004 editor opens with an `AI_ASSISTED` draft
   and without that group. Edit an item and confirm: a new confirmed revision exists, and the
   earlier one is intact.
5. Upload a PNG. The button is disabled with the "precisa de um documento com texto" reason,
   and "Preencher manualmente" works.
6. As ADMIN, open "Operação de IA": the `curriculum-agent` row shows executions, proposals,
   approvals, tokens and cost, and no content.
7. Stop the API, remove the key, and start it again: the button shows "indisponível no
   momento", and the manual flow still works (SC-007).

## 3. Release gate (constitution XIX, FR-051)

```bash
ANTHROPIC_API_KEY=... pnpm --filter api eval:curriculum                 # real provider, prints per-case metrics, stores results
ANTHROPIC_API_KEY=... EVAL_RECORD=1 pnpm --filter api eval:curriculum   # also rewrites recorded.json for review (commit after review)
```

The agent is registered disabled. The admin enables `curriculum-agent` in "Operação de IA"
only after the run meets:
- 0 unsupported items accepted without a warning;
- 0 invented fields;
- ≥ 95 % of expected items found in order;
- 100 % of injection cases clean.

Run it again for any new model config, prompt version or schema version.
