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
syncs the reference agents, tools and the fake provider of `test/fixtures/ai` (production,
`productionAiDefinitions(config)`, registers only `curriculum-agent`, DISABLED, and no provider without
`ANTHROPIC_API_KEY`; `testConfig()` always sets that key to null). Kill switches: `AI_EXECUTION_INTERVAL_SECONDS=0` stops all AI processing (global); disabling an
agent (`AiOperationsService.changeAgentStatus`) refuses new requests and cancels its QUEUED
executions in the same transaction; a disabled model config refuses new requests and fails queued
ones at start, without calling the model. Stub `ModelGateway.timing` to skip retry waits.
The fake provider (`test/fixtures/ai/fake-model-provider.ts`, one per app, `t.provider`) answers a
queue of steps: `script(...)` for every request (its last step repeats) and `scriptWhen(match,
...)` for matching ones, with `fakeOutput`, `fakeText`, `fakeEmpty`, `fakeToolCall`,
`fakeError(category)` and `fakeDelay(ms, step)`. `provider.requests` keeps what the model got,
`provider.health` sets the health answer, and `FAKE_PROVIDER_CREDENTIAL` is the credential the
scans look for. A test that changes the definitions (a new prompt version, another config) uses
another app over the same database with `overrides: [{ provide: AI_DEFINITIONS, useValue }]`,
whose startup syncs them (see `006-us8-versioning.spec.ts`). The reference agents are
`reference-l1`, `reference-l1-continue`, `reference-l2`, `reference-draft` and
`reference-restricted`; `REFERENCE_L2_BUILD` (with a `proposal.build` hook) and other extra
definitions join through `createAiTestApp({agents, tools, modelConfigs, resources})`. The factories
`createAiExecution` and `createAiProposal` write rows straight to the database.
Curriculum Agent (007) tests use `test/helpers/curriculum-ai.ts`: `createCurriculumAiApp()` registers
the real `curriculum-agent` (ACTIVE, where production starts it DISABLED; availability tests disable
it through the admin route) and its read tool, with only its model config moved to the fake provider;
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
provider, needs `ANTHROPIC_API_KEY`), never part of `pnpm test`.
nestjs-pino sends logs written outside a request (workers) to the first app created in the process: a
spec that creates several apps and checks those logs should give them all the same `LogCapture`.

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/domain-boundary.spec.ts` pins the Prisma models to the `data-model.md` lists (001, 003, 004 and 006; 007 adds only a column)
  and forbids academic terms of later phases (classes and enrollments are allowed since 003).
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced.
