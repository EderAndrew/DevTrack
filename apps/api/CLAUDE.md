# apps/api — test harness and guards

API tests (`apps/api/vitest.config.mts`): the global setup loads `.env.test` (falling back to
`.env.test.example`), generates the Prisma client if it's missing, and runs `migrate deploy` on the
test DB. They refuse to run unless `NODE_ENV=test` and the DB name contains `test`. Test files run
serially against one shared DB. Specs call `resetDb(t.prisma)` in `beforeEach`, which truncates
everything except the seeded roles/permissions and bypasses the append-only audit trigger only
inside that transaction. Build the app with `createTestApp()` from `test/helpers/test-app.ts`. It listens on
127.0.0.1, swaps in an `InMemoryMailer` (`flushMail()` waits for after-commit emails), and lets you
override config and providers. Use `test/helpers/factories.ts` for fixtures. The permission matrix
lives in `test/security/authorization-matrix.ts`, and `route-declarations.spec.ts` fails for any
route that has no access declaration.

Syllabus files (004) are read in a `worker_threads` worker (`src/modules/syllabus/extraction/extract.worker.ts`,
research E8). The runner gets the compiled entry's path through `SYLLABUS_WORKER_PATH` (production:
`dist/modules/syllabus/extraction/extract.worker.js`). A worker thread loads plain JavaScript, so the
global setup compiles `extraction/` and `syllabus-file-inspector.ts` with `@swc/core` into
`test/.tmp/syllabus/` (gitignored), and `createTestApp` injects that path. Code imported by the worker must
stay free of Nest, Prisma, config and loggers. `writeFakeWorker()` (`test/helpers/syllabus-worker.ts`)
writes stand-in workers that hang, fail or crash. Tests run with the processing timer off
(`processingIntervalSeconds: 0`, which also turns off `kick()`); call `SyllabusProcessingWorker.runOnce(now)`.
Syllabus fixtures live in `test/fixtures/syllabus/` (built by `build-fixtures.ts`, documented in
its README); `poo.pdf`/`poo.docx` carry the marker `MARCADOR-EMENTA-004` that the content scan looks
for. Factories build 004 data directly (`createSubject`, `createSyllabusDocument` with a
`status`, `createConfirmedRevision`, `createMeetings`, `createPlan`, `createTopic`); a plan write
through the API must send the plan's current `revision` as `planRevision`.
AI executions (006) run in `AiExecutionWorker` on the `ai_executions` table. Tests run with its
timer off (`ai.intervalSeconds: 0`, which also turns off `kick()`): call `runOnce(now)` or `drain(t)`
from `test/helpers/ai.ts`. Build the app with `createAiTestApp()` and reset with `resetAiDb(t)`, which
syncs the reference agents, tools, tasks and the fake provider of `test/fixtures/ai`, and closes every
circuit (production, `productionAiDefinitions(config)`, registers only `curriculum-agent`, DISABLED, and
no provider without `OPENROUTER_API_KEY`; `testConfig()` always sets that key to null). Kill switches: `AI_EXECUTION_INTERVAL_SECONDS=0` stops all AI processing (global); disabling an
agent (`AiOperationsService.changeAgentStatus`) refuses new requests and cancels its QUEUED
executions in the same transaction; a disabled model config refuses new requests and fails queued
ones at start, without calling the model. Stub `ModelGateway.timing` to skip retry waits.
Since 008 an agent declares a `taskKey`, and the task routes to a primary and an optional fallback
model config: the reference agents use `reference-default` (no fallback), and
`test/fixtures/ai/reference-routed.ts` is a routed agent with a fallback (fake-default → fake-alt)
that suites register with `createAiTestApp({ agents, tasks })`; a suite needing its own route
defines it the same way. The circuit per model config (`CircuitBreaker`) lives in memory in each
app: `resetAiDb` closes them, `circuit.now` replaces its clock to pass the wait, and a suite whose
many failures shouldn't open it raises `ai.circuit.failureThreshold` in its config. The per-agent
hourly limit is `rateLimit.aiAgentPerHour`; suites that request many executions raise it (and
`aiExecutionsPerMinute`, `curriculumAiPerHour`) in their config.
The fake provider (`test/fixtures/ai/fake-model-provider.ts`, one per app, `t.provider`) answers a
queue of steps: `script(...)` for every request (its last step repeats) and `scriptWhen(match,
...)` for matching ones, with `fakeOutput`, `fakeText`, `fakeEmpty`, `fakeToolCall`,
`fakeError(category)` and `fakeDelay(ms, step)`; `scriptFor(model, ...)` answers the requests to one
model before any other script (a primary and a fallback that behave differently; `scriptFor(model)`
with no steps clears it), `fakeServedModel(model, step)` and `fakeCost(amount, step)` set what the
provider reports, and `new FakeModelProvider("openrouter")` stands in for OpenRouter under its key.
`provider.requests` keeps what the model got,
`provider.health` sets the health answer, and `FAKE_PROVIDER_CREDENTIAL` is the credential the
scans look for. A test that changes the definitions (a new prompt version, another config) uses
another app over the same database with `overrides: [{ provide: AI_DEFINITIONS, useValue }]`,
whose startup syncs them (see `006-us8-versioning.spec.ts`). The reference agents are
`reference-l1`, `reference-l1-continue`, `reference-l2`, `reference-draft` and
`reference-restricted`; `REFERENCE_L2_BUILD` (with a `proposal.build` hook) and other extra
definitions join through `createAiTestApp({agents, tools, modelConfigs, resources})`. The factories
`createAiExecution` and `createAiProposal` write rows straight to the database.
Model policy (009): the test catalog (`test/fixtures/ai/model-configs.ts`) is `fake-default`,
`fake-alt` and `fake-no-price`, family `fake` (only in `TEST_MODEL_FAMILIES`, never production), BASIC,
generation, PRODUCTION. The fixture tasks zero `typicalUsage`, so estimated costs tie and `priority`
decides (`fake-default` 2 → primary, `fake-alt` 1 → fallback, no price last); a suite that needs a
new entry first in the order gives it a higher `priority`. `routedTask(task, [primary, fallback])`
(`test/fixtures/ai/tasks.ts`) registers the task and approves those models for it with
`testApproval(taskKey)` (metrics `{ schemaValidity: 1 }`), read when the app is created.
`test/fixtures/ai/reference-escalation.ts` adds `fake-standard` and `fake-advanced` and tasks and agents
that escalate (or not) for the 009/US4 suites. To simulate a deploy that changes the catalog, sync
other definitions with `new AiRegistrySync(definitions, t.config, t.prisma, t.get(AuditService)).sync()`.
Decision-mode calls go to `t.provider.scriptDecisions(fakeDecision(answers), …)` (or
`fakeDecisionError(category)`), recorded apart in `provider.decisionRequests`. Budgets are null in
`testConfig()`; the monitor reads `t.config.ai.budgets` on every check, so a suite sets them on the
running app (`009-us8-budgets.spec.ts`). The Curriculum Agent's approvals in production need committed
evidence: `EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:curriculum` writes
`test/fixtures/evaluations/<task>/<key>.json` (served model, golden-set version, metrics, real cost;
nothing when a case failed for infrastructure, e.g. `AI_PROVIDER_ERROR`), and
`009-quality-gate.spec.ts` checks that every catalog approval equals its evidence and meets the task's
thresholds. The curriculum test app approves its own configs with `PASSING_CURRICULUM_METRICS`.

Curriculum Agent (007) tests use `test/helpers/curriculum-ai.ts`: `createCurriculumAiApp()` registers
the real `curriculum-agent` (ACTIVE, where production starts it DISABLED; availability tests disable
it through the admin route) and its read tool, with its catalog entries (`anthropic-basic`, `openai-basic`) moved to the fake provider and approved;
`seedProcessedDocument(t, teacherId, fixture)` creates a subject and a PROCESSED document with the
original stored (`TEXT` for PDF/DOCX, `NO_TEXT` for images); `pooOutput()` is a valid agent output for
the POO sample; `scriptCurriculumRun(t.provider, documentId, output)` programs the read call then the
output; `requestAnalysis`, `getCurriculumAiStatus` and `applyProposal` call the 007 routes.
`seedGoldenDocument(t, teacherId, name)` stores a document of the golden set
(`test/fixtures/curriculum-agent/golden/<name>/document.*`, rebuilt by `pnpm --filter api
fixtures:curriculum`, which reuses the 004 PDF/DOCX writers; they carry `MARCADOR-EMENTA-007`), and
`seedDocumentFile(t, teacherId, path)` any PDF/DOCX file; `curriculumTestDefinitions(provider, agent)`
is what a "restart" with another agent version syncs. The read tool normalizes the file in the test
build of the syllabus worker. The golden set (`test/fixtures/curriculum-agent/`): `loadGoldenCases()`,
`recordedSteps(run, documentId)` for the fake provider, `runGoldenCase(t, case, caseId, prepare)` runs one
case through the real runner and stores the score (`scoreCurriculumCase`) with `AiEvaluationStore`.
`vitest.eval.config.ts` holds only `test/eval/**/*.eval.ts` (`pnpm --filter api eval:curriculum`, real
provider through `OpenRouterProvider`, needs `OPENROUTER_API_KEY`; it runs the golden set against
`OPENROUTER_DEFAULT_MODEL` and, when set, `OPENROUTER_FALLBACK_MODEL`), never part of `pnpm test`.
No test app registers `OpenRouterProvider`: only its unit test (injected `fetch`), the 008 secret
test and the eval instantiate it.
nestjs-pino sends logs written outside a request (workers) to the first app created in the process: a
spec that creates several apps and checks those logs should give them all the same `LogCapture`.

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/domain-boundary.spec.ts` pins the Prisma models to the `data-model.md` lists (001, 003, 004 and 006; 007 adds only a column; 008 adds `AiTask`)
  and forbids academic terms of later phases (classes and enrollments are allowed since 003).
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced; since 008 the journey app is configured with the OpenRouter
  marker key `sk-or-teste-008-CHAVE-FALSA` (`OPENROUTER_MARKER_KEY` of `journey.ts`), which is also
  searched in every column of every table.
