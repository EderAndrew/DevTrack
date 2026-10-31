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
running app (`009-us8-budgets.spec.ts`). Production approvals need committed eval evidence
(skill `ai-release-gate`). The curriculum test app approves its own configs with `PASSING_CURRICULUM_METRICS`.

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
The on-demand evals (`eval:*`, real models) and the golden sets: skill `ai-release-gate`; never part of `pnpm test`.
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
Grading rules the 012 submission flow must keep (011/FR-036–FR-042): the strategy is fixed per question when it is
saved (MULTIPLE_CHOICE → `EXACT_MATCH`, CODE → `TEST_CASES`, OPEN_ANSWER → `AI_REVIEW`; `gradingStrategyOf` in
`types/`) and only the registry dispatches it; `EXACT_MATCH` is all or nothing with no AI; `TEST_CASES` is all or
nothing by an isolated Code Runner (its own spec), never a text comparison, and goes to the teacher with no runner or
no test case; `AI_REVIEW` only suggests a grade (0 to the question's value) that the teacher confirms or changes
through `decideByTeacher`; a technical failure (AI unavailable, invalid AI answer, runner down) leaves the question
pending, never zero; the work's grade is `computeWorkGrade`, the sum of the final grades in hundredths, partial while
a question has none.
Grades (011/US2, research W3/W4) are integer hundredths in code (`GradeCents`, `gradeToCents`/`centsToGrade` and
`distributeGrade` in `packages/contracts/src/works/grade.ts`), `numeric(5,2)` in the database and a decimal string on
the wire; `works/grade/grade-values.ts`'s `withValues` rewrites every question's value from the total on each create,
edit and materialization (the first positions carry the remainder: 0,50 in 3 → 0,17 · 0,17 · 0,16), never from a
request or the AI. `works-boundary.spec.ts` forbids `parseFloat`, `Number(` and `.toNumber()` in `works`/`work-ai`; a
test compares a Prisma `Decimal` with `.toFixed(2)`.
Work bank (011) fixtures live in `test/helpers/works.ts`: `workLanguageId(t, key)`, `createConfirmedSyllabus(t,
teacherId, { languageKey, groups, title, competencyText, subjectStatus })` (an ACTIVE subject, a PROCESSED document
and a CONFIRMED revision; `itemIds` in order), `createWork(t, teacherId, options)` (work, topics, questions,
alternatives, test cases and question topics in one transaction, since the deferred triggers check the question
count, the values' sum and 3–5 alternatives with one correct at commit; default a MANUAL APPROVED work with one
multiple-choice question worth 1.00), `createWorkGenerationRequest` (a request row with its topics, no execution
unless given) and `toQuestionEdit`/`toUpdateBody` (a teacher view back into a `PUT /works/:id` body).
011 security suites (`test/security/011-*`): isolation (teacher B's ids → 404 on every route, other roles → 403),
tool scope (`read-work-generation-request` sees only the request's topics as refs), injection through the item, its
group and the competency (`011-injection.spec.ts`: the text reaches the model only in the untrusted block; an answer
that obeys it, in quantity, types, difficulty, grade, language, topics or approval, is refused whole), concurrency,
student view, no answer-key route, performance (1 000 works) and no model choice; `011-sc003-boundaries.spec.ts`
runs every rule boundary on each path. The journey creates, generates, edits, approves, archives and restores works,
and its work texts are scanned out of logs, audit and "Operação de IA" (`secret-leak-scan.spec.ts`,
`006-ai-admin-scan.spec.ts`); `audit-coverage.spec.ts` also checks that the `work.*`/`work_generation.*` metadata
holds only ids, counts, enums and codes.
`createConfirmedTopic` also takes `title`, `competencyText`, `groupTitle` and `items`.
010 security suites (`test/security/010-*`): isolation (teacher B's ids → 404 on every route, other roles → 403),
tool scope, injection through the topic (`010-injection.spec.ts`: the text reaches the model only in the untrusted
block; an answer that obeys it is refused whole), concurrency, student view, performance and no model choice; the
journey's topic and exercise texts are scanned out of logs, audit and "Operação de IA" (`secret-leak-scan.spec.ts`,
`006-ai-admin-scan.spec.ts`), and `010-sc003-boundaries.spec.ts` runs every rule boundary on each path.
Class activities (012) fixtures live in `test/helpers/activities.ts`: `createActivity(t, schoolClass, options)` writes an
activity and its snapshot in one transaction (default an EXERCISE published a day ago, due in a week, REJECT; an
ASSIGNMENT needs `sourceWorkId` and `sourceSubjectId`, CHECK), `createAttemptRow` an attempt and optionally its
submission (no gradings), `createClassWithStudents` and `createCompletedTopics` (the taught scope); the route helpers are
`applyWork`/`applyExercises`, `startAttempt`, `saveAnswers`, `submitAttempt`, `getAttempt`, `gradeAttempt`,
`acceptSubmission` and `releaseResult`. Suites pass `createTestApp({ clock })` a `FixedClock` (`test/helpers/clock.ts`,
`set`/`advance`, `MINUTE`/`HOUR`/`DAY`): the server clock decides deadlines, phases and statuses, never the test's
real time. Triggers to remember when writing rows by hand: an answer can't be written once its attempt is SUBMITTED
(write the answers, then mark the attempt and insert the submission), `deadline > publish_at`, the question count and
the values' sum are checked at commit, and a submission's submitted facts are immutable.
The save protocol (research P8): each answer carries the `baseRevision` the tab read; equal content → UNCHANGED, the
stored revision → SAVED with `revision + 1`, otherwise CONFLICT with the server's answer, all under the attempt's row
lock. The submit (P9) writes the pending answers by the same rule (a CONFLICT aborts it with
`409 ANSWER_CHANGED_ELSEWHERE`), then `registerSubmission` (`activities/submission/`), shared with the teacher's
"Aceitar como entrega": attempt SUBMITTED, blanks counted, multiple choice graded by the 011 registry with no AI and no
runner (`NO_AUTOMATION_PORTS`), the rest pending for the teacher, the grade summed in hundredths. The teacher's grades
(`AttemptsReviewService.grade`) go through `decideByTeacher` at the submission's `version`; release is the whole
activity; the student's `result` exists only when released, complete and with `notas.proprias.visualizar`, and its
first read writes `activity_result.viewed` once (conditional UPDATE of `result_viewed_at`).
012 suites: one per story (`012-us1-apply` … `012-us6-history`), `012-schema`, and in `test/security/` isolation
(teachers A and B, students A1, A2, B1, scheduled and cancelled activities), student view (answer-key markers
`MARCADOR-RESPOSTA-012`, `-RUBRICA-`, `-SOLUCAO-`, `-PRIVADO-`, `-EXPLICACAO-012` in every situation), boundaries
(server fields in bodies, sizes, 0/1/10/11 answers), rate limits, concurrency, XSS and performance (10 classes × 50
activities, a roster of 60, 100 saves). `test/activities-boundary.spec.ts` keeps `activities`/`student-activities` (API
and web) away from the exercise and AI modules, allows only `works/grading` and `works/types` of the work bank, forbids
code execution and float arithmetic, keeps the student portal on the student view, and keeps exams, controlled mode and
focus/fullscreen/clipboard monitoring out (SC-012).
Exercise points (013) change EXERCISE activities only: `createActivity(t, schoolClass, { type: "EXERCISE", questions })`
writes no grade, deadline or late policy, and each question gets a bank exercise (`sourceExerciseId`, default a new
APPROVED one) with its `difficulty` and `points`; the route helpers are `completeAttempt(client, id, number, answers)`
("Concluir exercícios"), `retryAttempt(client, id, afterNumber)` ("Refazer") and `getExerciseAttempt`. An EXERCISE is
never submitted, graded or released (`…/attempt/submit`, `…/grades`, `…/accept-submission`, `…/release` → 409): a
conclusion writes the answers, sets the attempt SUBMITTED with `completed_at` and one `exercise_question_results` row per
question (composite key `(attempt_id, question_id)`, no id or version; rows can't be deleted, so a suite that needs a
fresh slot uses a new bank exercise). Attempt 1's rows take the class slot (`scoring`, partial UNIQUE per student,
class and bank exercise); later attempts and an exercise already scored in another activity get `scoring = false`.
Teacher marks (`PUT …/attempts/:attemptId/marks`) touch only scoring open-answer and code rows. The ranking
(`modules/ranking`, pure `rank.ts`) sums the scoring rows of non-cancelled activities over the class's ACTIVE
enrollments on every read. The rate limits (exercise attempts per hour, marks among the teacher's writes) count in
`rate_limit_counters` with the database's `now()`, so a `FixedClock` doesn't move their window. Bulk data for the
ranking (`013-performance`) needs a `student_profiles` row per user: enrollments reference the profile, not `users`.
013 suites: one per story (`013-us1-apply` … `013-us5-teacher-ranking`), `013-schema`, `013-migration` (the 012 data
converted in a scratch schema), and in `test/security/` isolation (A on B's ranking, attempts and marks; A1 on B's ranking
and activity, on A2's attempts by number; roles), student view (`MARCADOR-RESPOSTA-013`, `-SOLUCAO-`, `-EXPLICACAO-`
only in the student's own concluded attempt, `-RUBRICA-` and `-PRIVADO-` never), boundaries (server fields `points`,
`result`, `scoring`, `first`, `totalGrade`, `deadline` → 400, comment ≤ 2 000, 1–10 marks), rate limits, concurrency (10
conclusions, 10 retries, two activities with one exercise, save × complete, mark × cancel) and performance (a ranking of
200 < 300 ms, a dashboard of 10 classes < 1 s, conclusion p95 < 500 ms).
Code highlighting (014) adds only data: `programming_languages.highlight` (text NULL, CHECK
`^[a-z][a-z0-9-]{0,31}$`, seeded for the 13 languages) is selected with every language
(`exercise-query.ts`, `work-query.ts`, `activity-query.ts`, `activities/views/rows.ts`, the language lists) and
copied into the teacher views and, listed explicitly, into the three student allowlists
(`exercises`, `works` and `activities` `views/student-view.ts`); it carries no answer key.
`014-highlight.spec.ts` checks every route that returns a language. The request bodies never take it (400).
AI help (015/US3): `modules/work-help` holds `WorkHelpService` (request + execution in one transaction through
`beforeCreate`, under the attempt's `FOR UPDATE`; reads reconcile a request whose execution ended without completing to
FAILED), the `work-helper` definition (DISABLED in production; `proposal.settle: "ON_MATERIALIZE"`, its rule injected by
`work-help.definitions.ts` so `definitions/` never imports `help/`), prompt and
`read-work-help-request` tool (only the student's view of the question, alternatives by letter), and `help/` (the pure
`leak-check.ts` of research F10, `materialize`, `reconcile`, `views`). Tests use `test/helpers/work-help.ts`
(`createWorkHelpApp()` registers the 007, 010, 011 and 015 agents ACTIVE, `requestHelp`, `getHelp`, `scriptHelp`,
`validGuidance`); the journey (so audit coverage and the secret scan) runs on `createWorkHelpApp`. Golden set:
`test/fixtures/work-help/` (25 cases, `score.ts` scores the model's own output before the server's check),
`015-evaluation.spec.ts` replays it and `pnpm --filter api eval:help` runs it against the real models (`EVAL_MODEL`,
`EVAL_RECORD`, `EVAL_REPLAY`; evidence in `test/fixtures/evaluations/work-help/`, with the p95 latency of 015/SC-007).
`test/security/015-answer-key-scan.spec.ts` keeps the 012 answer-key markers out of `provider.requests`, and
`015-injection.spec.ts` keeps instructions in the statement, the answer and the question in the untrusted block.
Exam generation (018/US7) mirrors 011: `modules/exam-ai` holds `ExamGenerationRequestsService` (topics through
`ExamTopics`, request + topics + execution in one transaction, hourly limit `exam-ai` = `RATE_LIMIT_EXAM_GENERATIONS_PER_HOUR`),
the `exam-generator` definition (DISABLED in production), prompt and `read-exam-generation-request` tool (the chosen
topics **by id**, since `GeneratedExamSchema` cites `topicIds`, and the language `{ id, name }`; never the title or grade),
`generation/` (`validate-generated-exam` over the exam rules, `build-proposal`, `materialize` writing the DRAFT through
`exams/exam-content.ts`, `rejected`) and `ExamProposalCloser` on the bank's `ExamReview` hook. Foundation extension:
`proposal.rejected(tx, context)` runs in the transaction that ends a FAILED execution whose output was refused (schema,
`build` or `materialize`; `reason` is the code or `OUTPUT_SCHEMA_INVALID`), which audits `exam_generation.rejected`.
Tests use `test/helpers/exam-ai.ts` (`createExamAiApp`, `examGenerationRequest`, `requestExamGeneration`,
`scriptExamGeneration`) and `validGeneratedExam(shape)` from `test/fixtures/exam-generator/valid-exam.ts`;
`createWorkHelpApp` (the journey's app) also registers the exam generator. Golden set: `test/fixtures/exam-generator/`
(recorded ids as `{{requestId}}`, `{{topic:n}}`, `{{languageId}}`), `018-evaluation.spec.ts` replays it and
`pnpm --filter api eval:exams` runs it against the real models.
Controlled mode (015/US2, US4, US5): `modules/attempt-integrity` holds `FocusEventsService` (the student's events, 1–50 per
batch, idempotent by `(attempt_id, client_event_id)`, recorded only on an open CONTROLLED attempt with the server's
`recorded_at`, one `attempt_integrity.recorded` each; `own` reads them back, also after the submission),
`IntegrityReviewService` (the teacher's per-student summary and one attempt's timeline), the pure `timeline.ts` (exits and
durations derived on every read, never stored) and `typing-allowance.ts`, and `ControlledAnswerGuard`, registered on the
012 `AnswerSaveGuard` hook: a save or submission whose text grows faster than `controlledMode` allows is refused per answer
(`TYPING_LIMIT_EXCEEDED`, the stored answer unchanged) and recorded as a SYSTEM event. The activity modules never import
`attempt-integrity` or `work-help`; those register on `AnswerSaveGuard` and `HelpAvailability`. Tests use
`test/helpers/integrity.ts` (`integrityEvent`, `recordEvents`, `getOwnIntegrity`, `getIntegritySummary`, `getTimeline`)
and the `createActivity` options `executionMode`/`aiHelpAllowance`; `attempt_integrity_events` is append-only and written
only while the attempt is IN_PROGRESS (trigger), so a suite that needs events on a submitted attempt inserts them first.
Foundation extensions of 015 (research F9, F12): an agent may declare `proposal.settle: "ON_MATERIALIZE"` (its
`materialize` returns the domain rule's decision and the runner approves or rejects the proposal in the same transaction,
audited `ai_proposal.*` with actor SYSTEM and `settledBy: "DOMAIN_RULE"`) and `hourlyLimit(config)` in place of
`aiAgentPerHour` (`work-helper` uses `AI_WORK_HELP_EXECUTIONS_PER_HOUR`).
Attendance (016): `modules/attendance` holds `AttendanceService` (the room of the class's ACTIVE students and the
mark/unmark batch, all or nothing, one `attendance.marked`/`unmarked` per student actually changed; unmark only
without an attempt), `PausesService` (the teacher pauses a student, releases a return keyed by the pause and
idempotent, and reads an attempt's pauses), `MyPauseService` ("Sair da sala" in the save/submit transaction shape:
activity `FOR SHARE`, attempt `FOR UPDATE`; the open pause for the polling), the pure `room-status.ts` and `views.ts`
(`roomStatus`, a pause's end and `seconds` derived with the server's `now`). The activity modules never import it:
they read `activity_attendances` and `attempt_pauses` in their own scoped queries (visibility through an indexed
`EXISTS`, the pause in the student view and the roster). `release_mode` is set on create (a new ASSIGNMENT is
`PRESENT_ONLY`, never from the body); defense triggers refuse answer, submission, integrity-event and help writes
while a pause is open. Tests use `test/helpers/attendance.ts` (`getRoom`, `postAttendance`, `markPresent`, `unmark`,
`markAllPresent`, `declareExit`, `getMyPause`, `releasePause`, `pauseStudent`, `getAttemptPauses`), the
`createActivity` option `releaseMode`, and `applyWork`, which marks the whole class present unless
`attendance: "NONE"`, so the 012/013/015 suites see a new work as before 016.
Exams (018) fixtures live in `test/helpers/exams.ts`: `createExam(t, teacherId, options)` writes an exam with its
topics, questions, alternatives and test cases in one transaction (the deferred triggers check them at commit;
default a MANUAL APPROVED exam with one BASIC multiple-choice question worth 1.00),
`examBody`/`postExam`/`approvedExam` go through `POST /exams`, `toExamUpdateBody` turns a teacher view into a
`PUT /exams/:id` body, `applyExam(client, classId, examId, overrides)` applies through the 012 route and marks the
whole class present unless `attendance: "NONE"` (a forbidden field such as `executionMode` goes in as given, for
the 400 tests), `startExam` sends `{ acceptRules: true }`, `holdByHand` writes four occurrences and the hold
straight to the database, and `getExamMonitor`/`decideHold` call the US5 routes; `createActivity(t, class, { type:
"EXAM" })` writes an applied exam directly. Suites that return a held exam start their `FixedClock` at the real
time (to the minute): the return's trigger compares the end with the database's `now()`, so a clock in the past
makes the return a 500.
Code Runner (019): `modules/code-runs` is the student's side (the three routes, `RunnerAvailability` reading the
heartbeats and registered on the activities' `CodeRunAvailability` hook so the student view's `execution` needs no
import of it, `views/student-run-view.ts` as an allowlist, `settle-stale.ts` with conditional UPDATEs shared with the
worker, the pure `compare-output.ts`, `verdict.ts` and `run-state.ts`, and the maintenance job
`content-retention.job.ts`). The worker lives in `src/code-runner` (`main.ts` boots `CodeRunnerModule` as a Nest
application context, `worker.ts` claims with `FOR UPDATE SKIP LOCKED`, runs and writes the result by claim token,
`heartbeat.ts`, `profiles.ts` with the pinned images and commands, `sandbox/` with `SandboxPort`, `DockerSandbox` and
`FakeSandbox`); nothing outside it imports it (`code-runner-boundary.spec.ts`). Tests never start Docker: they drive
the worker in-process through `test/helpers/code-runs.ts` — `createCodeExercise(t, class, { languageKey, testCases })`
(an EXERCISE with one CODE question and `DOUBLE_CASES`, two PUBLIC around a PRIVATE carrying `PRIVATE_RUN_MARKER`),
`seedHeartbeat(t, at, { executions, limits })` (a live worker, so the profile is available), `createRunWorker(t, clock,
{ sandbox, workerId })` and `drainRuns`, `requestRun`/`getLatestRun`/`getRun`, `doubles` (the right answer as a
`FakeSandbox` script) and `HeldSandbox` (a run held mid-case). `FakeSandbox` scripts `scriptCases(...)`,
`failCompilation(message)` and `failDaemon()`; a daemon failing before the worker's first heartbeat serves nothing, so
beat first (`heartbeat.beat()`) to get a `SANDBOX_ERROR`. Runs created in the same instant of a `FixedClock` tie on
`created_at`: advance the clock between runs whose order matters. `code_runs` rows can't be inserted final (insert
QUEUED, then update) and a final row accepts only the purge. Suites: `019-us1-run` … `019-us4-languages`,
`019-schema`, `019-worker`, and in `test/security/` isolation, private cases (SC-002), concurrency, rate limits,
invariance of 013 points (SC-004), retention (`code-run-content` with a `FixedClock`), boundaries and performance;
`pnpm --filter api test:sandbox` runs `test/sandbox/019-{languages,verdicts,hostile,timing}` against the real
`DockerSandbox` (`runc`, the pinned images), never part of `pnpm test`. The journey runs executed, compilation-error,
failed and rate-limited runs whose program, case, output, stderr and compiler message carry `MARCADOR-CODIGO-019`.
Code Runner in works (021): `createCodeWork(t, class, { languageKey, testCases, codeExecutionAllowed, … })` in
`test/helpers/code-runs.ts` writes an ASSIGNMENT with a CODE question (`DOUBLE_CASES`) and a multiple-choice one,
`codeExecutionAllowed` true by default and ALL_ENROLLED unless `releaseMode` says otherwise; `createActivity` takes
`codeExecutionAllowed` and `applyWork` the body's `codeExecution`. The teacher's summary is
`GET /classes/:classId/activities/:activityId/attempts/:attemptId/code-runs` (`code-run-review.{service,controller}.ts`,
`entregas.visualizar`, `ClassContextPolicy`, the student's stale runs settled first), read through
`getAttemptCodeRuns`. Suites: `021-schema`, `021-us1-run-work` … `021-us4-rules`, and in `test/security/` isolation,
refusals, private cases, concurrency, invariance (0 or 50 runs → the same submission, grading, grade and release,
SC-003), audit (`MARCADOR-CODIGO-021` out of audit and logs, SC-009) and performance (run creation and a summary of 10
questions × 200 runs, p95 < 150 ms); the journey runs executed and compilation-error runs on a work with
`MARCADOR-CODIGO-021` and one refused while paused.
Group work (023): the group lives in the activity modules, not in a module of its own. `activities/group/settle-group.ts`
(`readGroup`, `settleGroup`) and `activities/group-settlement.ts` (`GroupSettlement`, run first by every touch, in its
own transaction), `student-activities/group-work.service.ts` (candidates, `changeEditing`, the inclusion),
`group-eligibility.ts` (`eligibleClassmates`, `lockActivityGroups`: `pg_advisory_xact_lock(hashtext('activity-group'), …)`,
taken by the start and the inclusion before re-checking the ids) and `group-refusal.ts` (`activity_group.write_refused` after
the rollback). Every attempt has `attempt_participants` rows (one for the owner, backfilled); only a group has `attempt_groups`.
Reads that used to go through `activity_attempts.student_user_id` for "my attempt" go through the participants. `changeEditing`
and the inclusion count in the `activity-saves` limit. Tests use `test/helpers/group-work.ts` (`applyGroupWork`, `startGroup`,
`startAlone`, `getCandidates`, `addMembers`, `handEditing`, `takeBackEditing`, `returnEditing`, `getAttemptGroup`) and the
`createActivity`/`applyWork` option `groupSize` (`createActivity` needs `releaseMode: "PRESENT_ONLY"`, CHECK). Suites:
`023-schema`, `023-us1-apply` … `023-us7-options`, and in `test/security/` isolation, concurrency (`023/SC-002`), boundaries,
invariance (`023/SC-007`), audit (`MARCADOR-GRUPO-023` in names and answers, out of audit and logs) and performance; the
journey forms a group, passes, takes back and submits with those markers.
Student feedback (020): `modules/student-feedback` holds `StudentFeedbackService` (`create` under
`pg_advisory_xact_lock(hashtext('student-feedback'), hashtext(studentId))`: an existing `submissionId` returns the first
feedback, then the 24 h count by the injected `Clock`, `INSERT … ON CONFLICT DO NOTHING`; the limit's refusal rolls back
and writes `student_feedback.rate_limited` in its own transaction; `listMine`), `AdminFeedbackService` (keyset list of
50 on `(created_at DESC, id DESC)`, `summary`, `detail`, `changeStatus` under `FOR UPDATE` with the pure
`feedback-state.ts`), `views/` (the student's and the ADMIN's allowlists, `excerpt.ts` cuts 140 code points), and the
maintenance job `feedback-retention.job.ts`. The text columns are immutable and only the job deletes (triggers; a test
that deletes by hand runs `SET LOCAL devtrack.feedback_purge = 'on'` in the same transaction, as `resetDb` does). Tests
use `test/helpers/feedback.ts` (`feedbackBody`, `sendFeedback`); a suite that sends more than 5 moves its `FixedClock` or
uses more students. Suites: `020-schema`, `020-us1-send` … `020-us3-own`, and in `test/security/` isolation (TEACHER,
MANAGER, roles), concurrency (same `submissionId`, the limit, two ADMINs), audit (`MARCADOR-FEEDBACK-020` out of audit and
logs, SC-004), retention (`student-feedback` with a `FixedClock`) and performance; the journey sends, passes the limit
and changes a status with `MARCADOR-FEEDBACK-020`/`MARCADOR-TELA-020`.
nestjs-pino sends logs written outside a request (workers) to the first app created in the process: a
spec that creates several apps and checks those logs should give them all the same `LogCapture`.

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/domain-boundary.spec.ts` pins the Prisma models to the `data-model.md` lists (001, 003, 004 and 006; 007 adds only a column; 008 adds `AiTask`;
  009 the policy tables; 010 the exercise bank; 011 the work bank) and forbids academic terms of later phases (classes and
  enrollments are allowed since 003, questions and exercises since 010, works since 011).
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced; since 008 the journey app is configured with the OpenRouter
  marker key `sk-or-teste-008-CHAVE-FALSA` (`OPENROUTER_MARKER_KEY` of `journey.ts`), which is also
  searched in every column of every table.
- `test/contracts/endpoint-catalog.spec.ts` requires every Nest route to have exactly one entry in
  `packages/contracts/src/endpoints.ts` and vice versa, and `ContractConformanceInterceptor`
  (`test/helpers/contract-conformance.interceptor.ts`), installed by `createTestApp()`, turns a
  response that doesn't parse against its contract into a 500, so the test fails on its status
  assertion. A new route needs a catalog entry.

Per-feature suites (`test/{integration,security}/0NN-*`): one file per story (`0NN-usN-…`), a `0NN-schema` for the
DB rules (CHECKs, enums, triggers) and, in `test/security/`, isolation, boundaries, concurrency, rate limits and
performance; read the feature's files for what each covers. What they need from new code:
- A new 004 route needs a `VALID_BODY` entry and a `MATRIX` row in `004-curriculum-authorization-matrix.ts`.
- The journey (`test/helpers/journey.ts`) runs every feature's flows; each feature's `MARCADOR-*` text (statement,
  answer, note, orientation…) must stay out of logs, audit metadata and "Operação de IA" (`secret-leak-scan.spec.ts`,
  `006-ai-admin-scan.spec.ts`), and `audit-coverage.spec.ts` checks its audit metadata holds only ids, enums, counts
  and codes.
- Provider SDKs and hosts only under `src/modules/ai/gateway/providers/**` (ESLint + `006-ai-boundary.spec.ts`;
  `openrouter.ai` only in the adapter, nothing of OpenRouter in the web); no concrete model id outside
  `definitions/model-catalog.ts` (009).
- Maintenance job `mail-records` (017) purges with `SET LOCAL devtrack.mail_purge = 'on'`; `code-run-content` (019)
  empties final runs (500 per transaction) instead of deleting them; `student-feedback` (020) deletes closed feedbacks
  with `SET LOCAL devtrack.feedback_purge = 'on'`, their history in cascade.

## Modules (moved from the root CLAUDE.md)

The modules live in `src/modules` (and `src/platform` for mail, storage, http, config); read them for the layout.
What the code alone doesn't make obvious:

- Scoping: `ClassContextPolicy` (003) and `SubjectContextPolicy` (004) scope every lookup to the session teacher → 404;
  student routes start from the session user's ACTIVE enrollments (`StudentActivityLoader`) → 404 and
  `student_access.denied`. Syllabus documents and revisions are reached only through their subject.
- Mail (017): `MailOutbox.schedule(tx, kind, subjectId)` in the request's transaction, `attemptNow` after the commit
  (`attemptSync` in the admin bootstrap CLI), then `MailDeliveryWorker` retries (1 min to 6 h, FAILED after 7) within
  `MAIL_SENDS_PER_MINUTE`; `MAIL_RETRY_INTERVAL_SECONDS=0` disables the timer and tests call `runOnce(now)`. Each owner
  module's `MailSubject.prepare` discards a dead link or rotates the token for the retry. Tests: `t.flushMail()`,
  `InMemoryMailer.failNext(n, "permanent")`, and notices signed by `test/helpers/mail-notices.ts`, never a real provider.
  The 003 `ClassInvitationDeliveryWorker`/`class_invitation_deliveries` are gone.
- Dev helper (017, runs dist/): `pnpm --filter api mail:notice --kind bounced --delivery <id> [--bad-signature]` posts
  a Resend notice signed with `MAIL_NOTICE_SECRET`; kinds `delivered|bounced|complained|failed`.
- Syllabus (004): multipart only on `@AcceptsMultipart()` routes (so `OriginGuard` lets it through); the file is
  inspected in the worker before anything is written; `stored_files` and confirmed revisions are immutable by trigger.
- Class plans (004): the meeting number comes from `row_number()`, never stored; every plan write starts with
  `bumpRevision`; a COMPLETED topic is locked except archive and "Reabrir aula" and can't be restored once archived;
  "today" is America/Sao_Paulo (`planning-date.ts`).
- AI (006–009): definitions are code synced at startup under an advisory lock; a used version whose content changed
  stops the startup (a trigger refuses it): publish a new version. A task with no usable approved model is unavailable
  (`ai.task_unavailable`) instead of stopping the API. The gateway tries the primary then the fallback once, never back;
  circuits are in memory per model config. `AI_EXECUTION_INTERVAL_SECONDS=0` is the global kill switch; the runner
  re-authorizes at start and the workspace is always the session user. Approving a proposal never writes domain data;
  an agent with `approveThroughDomain` (007) is approved only by its domain's apply flow
  (`AiProposalsService.decideWithin`), and the 006 decision route accepts only REJECT. `policy/select-route.ts` is pure
  and health never reorders. Decision-mode models (Jev) answer through `ModelGateway.decide`. The OpenRouter adapter's
  `sanitizeJsonSchema` writes `oneOf` as `anyOf` (strict structured output refuses `oneOf`).
- The AI module never writes syllabus data; the banks (`exercises`, `works`, `exams`) never import AI code (their
  AI modules register on the bank's review hook), and the AI modules never name a tier, family or catalog key
  (`0NN-no-model-choice.spec.ts`). `work-content.ts`/`exam-content.ts` are the only writers of a work's/exam's content.
- Activities (012/013): `activity-types.ts` is the type registry (`scoring`, `hasDeadline`, `attempts`) so services
  don't branch on EXERCISE. The ranking (`ranking`) is one SQL query then the pure `rankClass`, reading results,
  enrollments and users only.
- Code Runner (019): the API only writes `code_runs` (QUEUED) and reads results; it never has the Docker socket. The
  worker reads the same `.env` (the whole config schema) and in production connects with its own PostgreSQL role
  (`docs/deploy/code-runner.md`). A run's case input and expected output are never copied into it: they are read from
  the activity snapshot when the run is shown.
- Exams (018): the exam's time lives in `activities/status/exam-time.ts` and its settlement in
  `activities/submission/settle-exam.ts` behind `ExamSettlement`, which every touch (student routes, the 015 events and
  review, the teacher's reads) runs first in its own transaction. `exam-sessions` grades only through
  `activities/submission` and calls no AI. The occurrence counting (`attempt-integrity/exam-occurrences.ts`) runs in
  `FocusEventsService`'s batch transaction under the attempt's `FOR UPDATE`.
- Preferences (022): `PATCH /me/preferences` (`auth/me.controller.ts`, `MeService`) takes only `{ theme }`
  (`DARK`/`LIGHT`, strict body) and writes `users.theme` of the session's user; session access like `GET /me`
  (unverified accounts too), no permission, no audit event, and a repeat of the same value does not rewrite the row.
  `GET /me` and the login's `user` carry `theme`.
