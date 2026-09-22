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

API-only guards that fail when the spec and the code drift apart (the traceability guard is in the
root CLAUDE.md):
- `test/security/audit-coverage.spec.ts` requires `contracts/audit-events.md` and
  `src/modules/audit/audit-event-types.ts` to list the same types and metadata keys, and every
  type to be emitted by `test/helpers/journey.ts`. A new audit type needs all three updated.
- `test/security/no-academic-domain.spec.ts` pins the Prisma models to the `data-model.md` list.
- `test/security/secret-leak-scan.spec.ts` runs the same journey and scans the logs and audit
  trail for every secret it produced.
