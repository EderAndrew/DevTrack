# apps/api — test harness and guards

API tests (`apps/api/vitest.config.mts`): the global setup loads `.env.test` (falling back to
`.env.test.example`), generates the Prisma client if it's missing, and runs `migrate deploy` on the
test DB. They refuse to run unless `NODE_ENV=test` and the DB name contains `test`. Test files run
serially against one shared DB. Specs call `resetDb(t.prisma)` in `beforeEach`, which truncates
everything except the seeded roles/permissions and (010) the programming-language catalog, and bypasses the append-only audit trigger only
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
`vitest.eval.config.ts` holds only `test/eval/**/*.eval.ts`, one script per file (`pnpm --filter api
eval:curriculum`, and since 010 `eval:exercises` over `test/fixtures/exercise-generation/`; real provider
through `OpenRouterProvider`, needs `OPENROUTER_API_KEY`; each runs its golden set against the catalog
candidates of its task's tier, or `EVAL_MODEL`), never part of `pnpm test`.
No test app registers `OpenRouterProvider`: only its unit test (injected `fetch`), the 008 secret
test and the eval instantiate it.
Exercise bank (010) fixtures live in `test/helpers/exercises.ts`: `languageId(t, key)` reads the seeded
catalog, `createConfirmedTopic(t, teacherId, { languageKey })` builds a subject, a PROCESSED document and a
CONFIRMED revision with a language and items (the topic is `itemId`), `createGenerationBatch` writes a batch row
(no execution unless given) and `createExercise` an exercise with its alternatives in one transaction, since the
deferred trigger checks 3–5 alternatives and exactly one correct at commit. The 010 permissions are seeded before
their routes: `us7-matrix-completeness.spec.ts` lists them in `SEEDED_BEFORE_ROUTES`, and each leaves that list
with the first route that requires it. Likewise `audit-coverage.spec.ts` reads the 010 `audit-events.md` and
skips the types in `PENDING_010` until the story that emits them; both lists are empty since US5.
Generation (010/US2) tests use `test/helpers/exercise-ai.ts`: `createExerciseAiApp()` registers the 007 and 010
agents (the real `exercise-generator` ACTIVE, where production starts it DISABLED) with one catalog entry approved for
both tasks; `batchRequest(topic, overrides)` builds a request body, `requestBatch` posts it, and
`scriptGeneration(t.provider, batchId, output)` programs the read call then the output (a valid one comes from
`validGeneratedBatch(request)` in `test/fixtures/exercise-generation/valid-batch.ts`). The batch and its execution are
created in one transaction through `AiExecutionsService.request`'s `beforeCreate` option, and the drafts are written by
the agent's `proposal.materialize` hook inside the runner's completing transaction (a throw rolls both back). The
journey (and so the audit-coverage and secret-scan suites) runs on `createExerciseAiApp`.
The generator's `build` checks the output against the batch's request (`generation/validate-generated-batch.ts`, 010/US3):
a refusal throws `ProposalRejected(reason)` and the runner logs `ai.output_invalid` with that code as `rejectReason`, never
content. `createExerciseAiApp({ modelConfigs })` adds catalog entries (e.g. a STANDARD one for the escalation tests; a
production family needs a vendor-prefixed model id such as `anthropic/…`).
The review (010/US4) lives in the bank (`ExercisesService.update`/`approve`/`approveMany`/`deleteDraft`, each under the
exercise's row lock with its `version`); each approval or discard of a batch's draft calls `ExerciseBatchReview.changed`
in the same transaction, and `exercise-ai`'s `ExerciseProposalCloser` (registered on it at startup, so the bank never
imports AI code) decides the generator's proposal once the batch has no DRAFT left. `api(t).delete(path, body)` sends
the `{ version }` body.
The bank (010/US5): `GET /exercises` filters through `exerciseListWhere` (`exercise-query.ts`: the search compares
`searchKey(query)` with `statement_search_key`; ARCHIVED only when `status` asks for it) and pages by keyset on
`updated_at desc, id desc` (20 by default, ≤ 50); `createExercise` takes `updatedAt` to pin the order and
`archivedFromStatus` for an ARCHIVED row. `archive`/`restore` keep `archived_from_status`, move the batch's
`archived_count`, and an archived DRAFT of a batch also calls `ExerciseBatchReview.changed`. Approving an ARCHIVED
exercise is always 409 (ARCHIVED → APPROVED is a restore, never an approval). `010-performance.spec.ts` bulk-inserts
1 000 open answers (no alternatives, so `createMany` passes the deferred trigger).
Student view (010/US6): any future route that shows an exercise to a student (activities, exams) answers only
`toStudentView` (`src/modules/exercises/views/student-view.ts`), which copies an allowlist and never strips the teacher
view; a new field reaches students only when listed there or in its type's `studentFields`.
`test/security/010-student-view.spec.ts` scans every type for the answer markers (`MARCADOR-RESPOSTA-010`,
`MARCADOR-SOLUCAO-010`, `MARCADOR-EXPLICACAO-010`) and the answer keys.
Works (011/US6) follow the same rule: the only student view of a work is `toWorkStudentView`
(`src/modules/works/views/student-view.ts`, an allowlist plus each type's `studentFields`). In 011 it is served only
by the teacher's "Ver como aluno" (`GET /works/:id/student-preview`); the 012 student route must answer that builder
and nothing else. `test/security/011-student-view.spec.ts` scans for `MARCADOR-RESPOSTA-011`, `-RUBRICA-`,
`-SOLUCAO-`, `-PRIVADO-` (private test cases) and `-EXPLICACAO-011` and the answer keys.
Work generation (011/US3) mirrors 010: `modules/work-ai` holds `WorkGenerationRequestsService` (topics through
`WorkTopics`, request + topics + execution in one transaction, hourly limit `work-ai`), the `work-generator` definition,
prompt and `read-work-generation-request` tool (topics by ref `T1…`, never ids, title, description or grade) and
`generation/` (`build-proposal`, `materialize`, which maps refs to the request's topics by position and writes the DRAFT
work through `works/work-content.ts`'s `writeWorkContent`). Tests use `test/helpers/work-ai.ts` (`createWorkAiApp()`
registers the 007, 010 and 011 agents, `workGenerationRequest`, `requestWork`, `scriptWorkGeneration`) and
`validGeneratedWork(shape)` from `test/fixtures/work-generation/valid-work.ts`; the journey (so audit coverage and the
secret scan) runs on `createWorkAiApp`.
The generator's `build` checks the output against the request (`generation/validate-generated-work.ts`, 011/US4), with
the same `ProposalRejected(reason)` logging as 010. The review (011/US5) lives in the bank: `WorksService.update` takes the
whole work back (`toUpdateBody(view)` in `test/helpers/works.ts` builds that body; kept questions by `id`, `work-edit.ts`
diffs them for `work.edited` and a no-op save writes nothing) and `approve`, both under the work's row lock with its
`version`; approving a generated work calls `WorkReview.changed` in the same transaction, and `work-ai`'s
`WorkProposalCloser` decides the proposal (APPROVE, or APPROVE_PARTIALLY with the generated questions that remain).
The bank (011/US7): `GET /works` filters through `workListWhere` (`work-query.ts`: `title_search_key` compared with
`searchKey(query)`, the topic through `work_topics`, the creation period in whole days of UTC-3; ARCHIVED only when
asked) and pages by keyset on `updated_at desc, id desc`; `archive`/`restore` keep `archived_from_status`, and archiving a
never-approved generated work also calls `WorkReview.changed` (the proposal closes REJECT). Suites that need many works
insert them with `createMany` in one transaction with one question each (`011-us7-bank`, `011-performance`).
Grading (011/US8) is pure domain code for 012 in `src/modules/works/grading/`: strategies keyed by `grading_strategy`
in `registry.ts` (`gradeQuestion` never branches on the question type; `registry.spec.ts` scans it), `decideByTeacher`,
`computeWorkGrade`, the `CodeRunnerPort`/`AiReviewPort` interfaces and `UnavailableCodeRunner` (the only runner: nothing
is executed in 011). A TEST_CASES question has no expected-solution field. The fake ports are in
`test/fixtures/works/grading-ports.ts`; the result shapes are `packages/contracts/src/works/grading.ts`.
Module layout (010): `modules/exercises` is the bank (types registry, pure rules, teacher and student views,
`ExercisesService`, `exercise-query.ts`, `ExerciseBatchReview`) and never imports AI code; `modules/exercise-ai`
holds the batches (`ExerciseBatchesService`, the controller of `/exercise-batches` and
`/exercise-generation/availability`), the agent definition, prompt and read tool (`definitions/`), the pure
`generation/` steps (`request-content`, `validate-generated-batch`, `build-proposal`) and `materialize`, the
foundation hook that writes the drafts. `modules/exercise-ai` never names a tier, family or catalog key
(`010-no-model-choice.spec.ts`).
Golden set of the generator (010, research X16): `test/fixtures/exercise-generation/` (README, `golden/<case>/`
`expected.json` + `recorded.json`, the pure `score.ts`, `load-golden.ts`, `run-case.ts`); `010-evaluation.spec.ts`
replays it in CI and `pnpm --filter api eval:exercises` runs it against the real models (the release gate: the
evidence in `test/fixtures/evaluations/exercise-generation/` backs the `openai-basic` approval; `topicCoverage` is
judged over the set). `createConfirmedTopic` also takes `title`, `competencyText`, `groupTitle` and `items`.
010 security suites (`test/security/010-*`): isolation (teacher B's ids → 404 on every route, other roles → 403),
tool scope, injection through the topic (`010-injection.spec.ts`: the text reaches the model only in the untrusted
block; an answer that obeys it is refused whole), concurrency, student view, performance and no model choice; the
journey's topic and exercise texts are scanned out of logs, audit and "Operação de IA" (`secret-leak-scan.spec.ts`,
`006-ai-admin-scan.spec.ts`), and `010-sc003-boundaries.spec.ts` runs every rule boundary on each path.
nestjs-pino sends logs written outside a request (workers) to the first app created in the process: a
spec that creates several apps and checks those logs should give them all the same `LogCapture`.

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/domain-boundary.spec.ts` pins the Prisma models to the `data-model.md` lists (001, 003, 004 and 006; 007 adds only a column; 008 adds `AiTask`;
  009 the policy tables; 010 the exercise bank) and forbids academic terms of later phases (classes and enrollments are
  allowed since 003, questions and exercises since 010).
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced; since 008 the journey app is configured with the OpenRouter
  marker key `sk-or-teste-008-CHAVE-FALSA` (`OPENROUTER_MARKER_KEY` of `journey.ts`), which is also
  searched in every column of every table.
- `test/contracts/endpoint-catalog.spec.ts` requires every Nest route to have exactly one entry in
  `packages/contracts/src/endpoints.ts` and vice versa, and `ContractConformanceInterceptor`
  (`test/helpers/contract-conformance.interceptor.ts`), installed by `createTestApp()`, turns a
  response that doesn't parse against its contract into a 500, so the test fails on its status
  assertion. A new route needs a catalog entry.

Per-feature suites (`test/{integration,security}/0NN-*`):
- 004: the curriculum authorization matrix (`004-curriculum-authorization-matrix.ts` builds a
  complete teacher area; a new 004 route needs a `VALID_BODY` entry and a `MATRIX` row), cross
  links, server-controlled fields, rate limits, immutability of originals and confirmed revisions,
  concurrency and performance. The journey also returns the 004 pedagogical `content`, which the
  secret scan keeps out of logs and audit metadata.
- 006: the AI authorization matrix (`006-ai-authorization-matrix.ts`: teachers A and B and an ADMIN
  over every AI route), the provider boundary (`006-ai-boundary.spec.ts`: provider SDKs and hosts
  only under `src/modules/ai/gateway/providers/**`, enforced by ESLint and a scan of api and web),
  concurrency, resilience, the admin scan (no teacher content, credential or ids in the operations
  responses) and `006-ai-no-real-provider.spec.ts` (production registers no provider, the tests only
  `fake*` ones). The journey runs the 006 flows, and the secret scan looks for the instructions,
  input and output markers and the fake provider's credential in logs, audit and operations
  responses.
- 007: isolation (teachers A and B, the admin and forged document ids given to the read tool), the
  authorization matrix of the 3 routes with the order of the checks, prompt injection through the
  golden documents, concurrency (apply, reject, confirm and request races) and resilience.
  `007-us6-evaluation.spec.ts` replays the golden set in CI (`expected.json` is for a person to
  review). The journey runs the 007 flows (request, failure, proposal, apply, reject), and the
  secret scan also looks for `MARCADOR-EMENTA-007`.
- 008: OpenRouter behind the gateway (US1), model by configuration and invalid policies (US2),
  fallback and its concurrency (US3), the marker key scanned in logs, responses and every table and
  resilience without the key or with a hanging provider (US4), observability (US5), circuit and
  per-agent limit (US6), reuse by a new agent (US7, `reference-routed.ts`). The provider boundary
  guard also checks that `openrouter.ai` appears only in the adapter, that neither app depends on a
  provider SDK, and that the web has nothing of OpenRouter.
- 009: allowlist and decision mode (US1), tier-and-cost selection (US2, plus the pure
  `policy/select-route.spec.ts`), the Curriculum Agent on BASIC (US3), same-tier fallback and
  one-step escalation (US4), lifecycle transitions (US5), cost by task/tier/family and the models and
  tasks views (US6), the admin override (US7), budgets (US8), the registry catalog, the quality gate,
  the model id boundary (no concrete model id outside `definitions/model-catalog.ts`) and policy
  injection (documents and model output never change task, tier, family, model or budget).
- 010: one file per story (`010-us1-manual` … `010-us7-*`) plus the schema's DB rules and the
  security suites described above; the journey creates, generates, reviews, archives and restores
  exercises.

## Modules (moved from the root CLAUDE.md)

- 003 modules (`apps/api/src/modules`): `classes` (`ClassContextPolicy` scopes every lookup to the
  session teacher's own classes → 404 otherwise), `class-invitations` (invite, list, resend, cancel;
  public preview/accept through `RoleGrantAcceptance`, which grants `STUDENT` and creates the
  enrollment) and `enrollments` (the teacher's student list and removal, plus the student's
  `GET /me/classes`). Invitation e-mails go through the `class_invitation_deliveries` outbox: the
  first attempt runs after the commit, then the in-process `ClassInvitationDeliveryWorker` (`FOR
  UPDATE SKIP LOCKED`) retries every `MAIL_RETRY_INTERVAL_SECONDS` (0 disables the timer; tests
  call `runOnce(now)`) with waits of 1 min to 6 h, FAILED after 7 attempts; a retry issues a
  fresh token and supersedes the old link.
- 004 modules: `subjects` (`SubjectContextPolicy`, same 404 scoping as classes; syllabus documents
  and revisions are reached through their subject), `syllabus` (multipart upload through
  `SyllabusFileInterceptor` in `platform/http/upload.ts`, on routes marked `@AcceptsMultipart()` so
  `OriginGuard` lets `multipart/form-data` through; the file is inspected in a worker thread before
  anything is written, then the original goes into `stored_files` (bytea, immutable by trigger)
  through `FileStorage` in `platform/storage`; `SyllabusProcessingWorker` claims `UPLOADED`
  documents every `SYLLABUS_PROCESSING_INTERVAL_SECONDS` (0 disables the timer) with a lease and
  runs extraction in a `worker_threads` worker via `SyllabusWorkerRunner`, with the state machine in
  `syllabus-processing.state-machine.ts`; confirmed revisions are immutable by trigger; worker test
  setup is in `apps/api/CLAUDE.md`) and
  `class-plans` (the class calendar, where the meeting number comes from `row_number()` and is never
  stored; plan and topic state machines; `bumpRevision` in `plan-revision.guard.ts` starts every plan
  write, and `TopicMutations` holds the move/merge/archive operations that both the calendar and the
  topics use; a `COMPLETED` topic (US9) is locked except for archive and "Reabrir aula", can't be
  restored once archived, and "today" comes from `planning-date.ts`, America/Sao_Paulo).
- 006 module `ai` (`apps/api/src/modules/ai`, folders by responsibility, research A3):
  `definitions` (agents, prompts, output schemas, tools, tasks and model configs are code, research A4;
  `productionAiDefinitions(config)` registers the 007 `curriculum-agent`, DISABLED until the admin
  enables it, its `curriculum-extraction` task and, since 009, the model catalog of
  `model-catalog.ts` (008's `openrouter-default`/`openrouter-fallback` configs built from the
  environment are gone); a task with no usable approved model is unavailable and logs
  `ai.task_unavailable` instead of stopping the API, and a changed model is audited as
  `ai_model_config.changed`), `registry` (`AiRegistrySync`
  writes them to the `ai_*` tables at startup under an advisory lock; a used version (`used_at`)
  whose content changed stops the startup, and a trigger refuses the update: publish a new
  version), `gateway` (`ModelGateway` runs the task's route fixed on the execution: the primary with
  its timeout and retries of transient failures, then, after a recoverable failure or an open
  circuit, the fallback once, never back to the primary, each leg written to `ai_model_calls`
  with the served model and the provider's cost; `CircuitBreaker` per model config, in memory,
  audited `ai_circuit.opened`/`closed`; errors normalized; real providers live in
  `gateway/providers/**`, the only place a provider SDK or host may appear: `OpenRouterProvider`,
  008, over native `fetch`),
  `tools` (`AiToolExecutor`: allowlist, enabled, permission, strict input, resource owned by the
  workspace, timeout, strict output, and a result within the model's input limit), `output` (structured output validated by the agent's Zod schema),
  `execution` (`POST /ai/executions` queues, after the per-user limits and, since 008, the
  per-agent hourly limit `AI_AGENT_EXECUTIONS_PER_HOUR`; `AiExecutionWorker` claims `QUEUED` rows with
  `SKIP LOCKED` every `AI_EXECUTION_INTERVAL_SECONDS`, `0` = global kill switch; the runner
  re-authorizes at start and checks cancellation between steps; the workspace is always the
  session user), `proposals` (L2 output becomes a proposal the teacher approves, partially
  approves or rejects; approving never writes domain data), `usage` (tokens and cost in
  `ai_model_calls`), `operations` (admin health, metrics, agents and configs, never content),
  `evaluation` (`AiEvaluationStore`, no routes) and `retention` (maintenance job `ai-records`).
  An agent whose proposal has `approveThroughDomain` (007) is approved only by its domain's apply
  flow through `AiProposalsService.decideWithin`; the 006 decision route accepts only REJECT.
- 009 model policy (`apps/api/src/modules/ai`): `definitions/model-families.ts` (allowlist, tiers,
  modes, lifecycle and its transitions), `definitions/model-catalog.ts` (the only concrete model ids;
  entries with price, capabilities and approvals that point at committed evidence), task policies
  on `ai_tasks` (`policy/task-policy.ts`: minimum, preferred and max tier, families, capabilities,
  fallback, escalation, quality thresholds, typical usage). `policy/select-route.ts` is pure: filter
  (family, mode, capabilities, PRODUCTION with a valid approval, DEPRECATED only when nothing else,
  tier), order (override if usable, estimated cost, unknown price last, priority, key), fallback of
  the same tier preferring another family; health never reorders. `AiPolicyRegistry` feeds it from
  the synced tables (`ai_model_task_approvals`, `ai_task_overrides`) and fixes the route on the
  execution with its tier and reason. The runner escalates once, to the next tier, after an invalid
  output when the task says so. `AiRegistrySync` refuses an invalid lifecycle transition (the entry
  leaves the catalog) and audits `ai_model_config.lifecycle_changed`. The admin override
  (`PUT/DELETE /ai/operations/tasks/:key/override`) accepts only a model the policy admits;
  `usage/ai-budget.monitor.ts` checks the budgets after each recorded call and audits
  `ai_budget.exceeded` once per period (`ai_budget_alerts`). Decision-mode models (TypeSafe's Jev)
  answer through `ModelGateway.decide` (OpenRouter decisions, `contracts/decisions-provider.md`).
- 007 module `curriculum-ai` (`apps/api/src/modules/curriculum-ai`, research C1): the
  `curriculum-agent` definition, its prompt and output schema, the `read-curriculum-document` tool
  (only the execution's own document, normalized by the 004 readers in the worker thread) and the
  `SYLLABUS_DOCUMENT` ownership; `proposal/` (pure: item ids, deterministic grounding check that
  flags `UNSUPPORTED_CONTENT`, source refs kept only when the block has the text);
  `CurriculumAiRequestService` (status and request: per-teacher hourly limit, one active analysis
  per document by a derived idempotency key, a pending proposal discarded only when the teacher
  confirms) and `CurriculumAiApplyService` (locks the document, the proposal and the draft, checks
  the source hash, validates the accepted content as a 004 draft, creates or replaces the draft
  and approves the proposal in one transaction; idempotent). The AI module never writes syllabus
  data.
- 010 modules: `exercises` (the bank: types as a registry, pure rules, teacher and student views
  (`toStudentView` copies an allowlist), `ExercisesService` with optimistic `version` under a row
  lock, keyset list in `exercise-query.ts`, archive/restore, `ExerciseBatchReview` hook; never
  imports AI code) and `exercise-ai` (batches: request with the idempotency key and the execution in
  one transaction; the `exercise-generator` definition, prompt and `read-exercise-generation-request`
  tool; `validate-generated-batch` refuses an answer that doesn't match the request; the
  `proposal.materialize` foundation hook writes the DRAFT exercises in the runner's transaction;
  `ExerciseProposalCloser` decides the proposal once no draft is left). The OpenRouter adapter's
  `sanitizeJsonSchema` writes `oneOf` as `anyOf` (strict structured output refuses `oneOf`).
