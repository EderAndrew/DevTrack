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
nestjs-pino sends logs written outside a request (workers) to the first app created in the process: a
spec that creates several apps and checks those logs should give them all the same `LogCapture`.

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/domain-boundary.spec.ts` pins the Prisma models to the `data-model.md` lists (001, 003 and 004)
  and forbids academic terms of later phases (classes and enrollments are allowed since 003).
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced.
