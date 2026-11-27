# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Features 001–032 in `specs/` are implemented. Later work starts a
new feature through `/speckit-specify`.

Each feature is summarized by its own `specs/NNN-*/spec.md` (list: `ls specs/`).

Take-home works and grading by the Code Runner or AI are later features. The rules of 012–031 that are
easy to break are under "Rules that are easy to get wrong" below.

AI agents (`curriculum-agent`, `exercise-generator`, `work-generator`, `work-helper`, `exam-generator`) are
registered DISABLED until the admin enables them. All five tasks are BASIC; each task's primary and fallback come from the 009
catalog, backed by the release-gate evidence in `apps/api/test/fixtures/evaluations/` (current
results per model: skill `ai-release-gate`).

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions with a per-feature letter prefix, e.g. R1 in 001, L1 in 014), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first. If `feature.json` names a feature that is already merged, there is no active
feature: new behavior starts with `/speckit-specify`, not in that feature's specs.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.
When a new feature starts implementation, add it to `SPECS` in `apps/api/test/traceability.spec.ts`
at its first phase (otherwise its scenario ids are never checked), with the stories and SC ids still to
come in `pending`; each leaves `pending` with the test that covers it (a pending id a test already
covers fails), so the list is empty when the feature ends. `/speckit-specify` already points
`.specify/feature.json` at it.

`.claude/settings.json` hooks (`.claude/hooks/security-check.sh`) track every audited code file changed
by Write/Edit or Bash; at the end of the turn the Stop hook asks for the `owasp-security-auditor` skill
on those files with the given `SESSION_ID` (audit only, no code changes during it), and
`.claude/hooks/audit-complete.sh <SESSION_ID>` records the confirmation. A new edit invalidates a
previous audit. The log is `.claude/hooks/security.log`. A `medium` finding asks for human review unless it cites, in
`exception`, a risk acceptance approved by a person in `docs/security/exceptions/` (`exceptions.json` + the document,
ADR-0005 §9) with the same rule and file, a `maxSeverity` at least the finding's and not expired, already merged into
`main` on `origin` (a local commit does not count); the auditor never creates one. The policy's
cases: `bash .claude/hooks/tests/security-policy.test.sh`.

`.specify/memory/constitution.md` (v4.1.0) is non-negotiable and overrides everything else; every
plan has a Constitution Check gate, and deviations must be justified in *Complexity Tracking*.
Amend it only via `/speckit-constitution`.

`docs/adr/` records architecture decisions (ADR-0001: the multi-model AI architecture of 006–009).
ADRs only describe what the constitution and the specs decide; they never change a rule, and when
they diverge the spec wins and the ADR is fixed.

`.specify/scripts/bash/update-agent-context.sh` rewrites the `## Active Technologies` and
`## Recent Changes` sections of this file in place — keep those headings; everything else here is
hand-maintained.

## Active Technologies
- TypeScript 7 on Node.js 24 LTS + web: Next.js 16, React 19, React Hook Form 7, shadcn/ui, Lucide; new: CodeMirror 6 (`@codemirror/{state,view,language,commands}`, `@lezer/highlight`, `@codemirror/lang-{java,python,javascript,cpp,php,rust,go,html}`), lazy-loaded (014-code-syntax-highlighting)
- Recharts 3.10.1 in `apps/web`, only through `components/ui/chart.tsx` and the Indicadores charts of Operação de IA (006 amendment 2026-10-22)

## Stack notes

If TS 7 rejects Nest decorators, the documented fallback (R1) is pinning `typescript@~5.9` in
`apps/api` only.

## Commands

Prerequisites: Node 24, pnpm 11 (`corepack enable`), Docker. Without `OPENROUTER_API_KEY` the API
still boots; the AI actions just show as unavailable and the manual flows keep working.

```bash
docker compose up -d postgres postgres-test mailpit     # dev DB :5432, test DB :5433 (tmpfs), Mailpit SMTP :1025 / UI :8025
                                                        # ports overridable when taken on the host (e.g. POSTGRES_PORT=5434):
                                                        # POSTGRES_PORT, POSTGRES_TEST_PORT, MAILPIT_*_PORT
pnpm dev | pnpm build | pnpm lint | pnpm check-types | pnpm test   # turbo across workspaces
pnpm format                                             # prettier on ts/tsx/md

# apps/api (port 4000) — copy .env.example to .env first (fill APP_HMAC_SECRET: openssl rand -base64 48;
# the API refuses to start if a required var is missing); tests use .env.test.example and refuse
# any DB whose name lacks "test". Web: copy apps/web/.env.example to .env.local
pnpm --filter api prisma generate                       # client -> src/generated/prisma (gitignored); also runs on `pnpm install`
pnpm --filter api prisma migrate deploy                 # migrations also seed roles/permissions; prisma.config.ts loads apps/api/.env
pnpm --filter api dev                                   # swc watch into dist/ + node --watch
pnpm --filter api test                                  # all unit + integration + security (needs postgres-test up)
pnpm --filter api test test/integration/003-us6-enrollments.spec.ts      # single file (no `--`: pnpm 11 passes it on and vitest drops the filter)
pnpm --filter api test -t "<test name>"                          # single test, or an id prefix such as "009/"
pnpm --filter api test:security                         # test/security only
pnpm --filter api test:sandbox                          # 019: real Docker sandbox (test/sandbox), CI job `sandbox`; `pnpm test` uses the FakeSandbox
pnpm --filter api code-runner:images                    # 019: pull the pinned runner images (runs dist/)
pnpm --filter api code-runner:start                     # 019: the worker process (dist/code-runner/main.js); `pnpm dev` already runs code-runner:dev
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN (runs dist/, build first)
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs (runs dist/)
pnpm --filter api fixtures:syllabus                     # rebuild test/fixtures/syllabus/* (004 upload/extraction fixtures)
pnpm --filter api fixtures:curriculum                   # rebuild test/fixtures/curriculum-agent/golden/*/document.* (007)
pnpm --filter api eval:*                                # AI release-gate evals (real models, cost cents): skill `ai-release-gate`
pnpm --filter api mail:notice ...                       # 017 dev helper: see apps/api/CLAUDE.md

# apps/web (port 3000) — API_ORIGIN (default http://localhost:4000) is the rewrite target
pnpm --filter web dev
pnpm --filter web test                                  # Vitest + jsdom + Testing Library + vitest-axe
pnpm --filter web test test/contrast.test.ts            # single file (no `--`, same as the API)
pnpm --filter web test -t "<test name>"                 # single test, or an id prefix such as "014/"

# packages/contracts
pnpm --filter @repo/contracts build                     # tsc -> dist/ (api and web import it)
pnpm --filter @repo/contracts test                      # boundary, duplication, zod-version guards

# apps/mobile (024; stack, layers and tests: apps/mobile/CLAUDE.md; EAS and push: docs/deploy/mobile.md)
pnpm --filter mobile start | android | test | lint | check-types
pnpm --filter @repo/design-tokens generate              # tokens.css -> packages/design-tokens/src/generated.ts (committed)

# E2E (Playwright, local only; first-run setup in apps/web/CLAUDE.md)
pnpm --filter web test:e2e                              # needs postgres-test + mailpit up and `pnpm build` first
pnpm --filter web test:e2e work-bank                    # one spec by path regex
```

The API builds with SWC into `dist/`; `tsc` only type-checks (`check-types`). The CLI scripts run
compiled code, so run `pnpm --filter api build` before them. Root `pnpm check-types`/`pnpm test`
build `packages/contracts` first (turbo `^build`); a filtered run (`pnpm --filter api check-types`)
needs `pnpm build` beforehand.

CI (`.github/workflows/ci.yml`, actions pinned by SHA) runs `pnpm lint`, `check-types`, `build` and
`test` against a PostgreSQL 17 service on every push and pull request. Its second job, `sandbox` (019), pulls
the Code Runner images and runs `test:sandbox` on the runner's Docker. Its third job, `semgrep` (ADR-0007), tests
the project rules in `.semgrep/` and fails on any finding of those rules and the registry packs. E2E runs locally only.
`prisma migrate reset` (used by the E2E `e2e/prepare-db.ts`) refuses to run under an AI agent
unless the user consents; the E2E aborts unless the DB name contains `e2e`.

The beta runs on a Hostinger VPS shared with other sites (`devtrack.nativcode.com.br`): nginx + certbot,
web and API under PM2 as the `devtrack` user on 127.0.0.1 (`HOST=127.0.0.1`), PostgreSQL 17 in Docker on
127.0.0.1:5433, Code Runner off. Guide `docs/deploy/hostinger.md`, files in `deploy/hostinger/`.
`.github/workflows/deploy-hostinger.yml` deploys it after the CI of each push to `main` passes: SSH as
`devtrack` with a key whose forced command is `deploy/hostinger/update.sh` (repository secrets
`VPS_HOST`, `VPS_PORT`, `VPS_USER`, `SSH_KEY`), then checks `/entrar` and `/api/health/ready`.

API test harness, API-only guards and the per-feature security suites (test DB setup, `resetDb`,
`createTestApp`, audit/secret scans, 004–011 suites): see `apps/api/CLAUDE.md`, loaded when working
under `apps/api`.

Cross-cutting guards that fail when the spec and the code drift apart:
- `apps/api/test/traceability.spec.ts` parses the `spec.md` of each feature listed in its `SPECS`
  (001, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017, 018, 019, 020, 021, 022, 023, 024, 025, 026, 027, 028, 029, 030, 031 and 032; the on-demand evals' `apps/api/test/eval/*.eval.ts` counts
  too). Every `USn-k` scenario, every traceability row and the listed SC ids must appear
  in a `describe`/`it`/`test` title (API, web unit, `apps/web/e2e` and `apps/mobile`), so name new tests with
  their scenario or SC/FR id. 001 ids are bare; later features carry their number (`003/US1-1`,
  `003/SC-004`), which never covers the bare 001 id. A new feature is checked once it's added to
  `SPECS`.
- Boundary guards: `apps/api/test/*-boundary.spec.ts` (works, activities, exams, attendance, work-help, mail,
  code-runner, feedback, exam-alerts, exam-nudges, cohorts, student-calendar), `packages/contracts/test/` and the web
  guards (`apps/web/CLAUDE.md`) fail on forbidden imports, code execution, float arithmetic on grades and texts in
  audit/logs; read the one for a module before changing it. API suites and the endpoint catalog: `apps/api/CLAUDE.md`.

Unsafe HTTP methods need both an allowed `Origin` and `Content-Type: application/json` (send
`{}` if there's no body), even from curl or scripts. Otherwise the API returns
`403 ORIGIN_NOT_ALLOWED` (`OriginGuard`, R6).

Transitive vulnerabilities are patched via `overrides` in `pnpm-workspace.yaml`. The reasons and
the removal conditions are in `DEPENDENCIES.md`.

## Architecture

- `apps/api` (NestJS): `AppModule.forRoot(config, …)` is built from the
  Zod-validated config (`src/platform/config`); `app.setup.ts` applies the HTTP setup shared by
  `main.ts` and the tests.
- `apps/web` (Next.js App Router) calls the API through a same-origin rewrite `/api/* → API`
  (`next.config.js`, which also sets `Referrer-Policy: no-referrer` on token-bearing pages, and
  raises the rewrite's body limit, `experimental.proxyClientMaxBodySize`, so a 10 MB syllabus
  upload is not cut; the API enforces the real limit).
  `proxy.ts` only redirects for UX and never authorizes. Design system, layers and the web stack:
  see `apps/web/CLAUDE.md`.
- `packages/contracts` (`@repo/contracts`, constitution principle XXVI) holds every API↔web
  contract as Zod schemas, one directory per API domain (`mail` holds only the notice route's
  provider param — the notice body stays the provider's, parsed in the API adapters; the exam's
  fields of the activity, attempt and integrity shapes live in `activities` and
  `attempt-integrity`, not `exams`; `code-runs` holds the run, and the question's `execution` lives in
  `activities`, with the program convention as a key, never text; `feedback` holds both the student's
and the ADMIN's shapes, the student's with no history, origin path or `submissionId`), with types derived through `z.infer`
  (`XxxSchema` / `Xxx`). `endpoints.ts` catalogs every route with its request and response
  schemas. Responses describe the JSON on the wire (dates are ISO strings). The package holds no
  Prisma, service or UI-state types and no user-facing messages. One Zod version comes from the
  pnpm catalog. API controllers validate input with the contract schemas and services return the
  contract types. The package builds to `dist/`, which api and web import.
- Protected request pipeline: `OriginGuard → SessionGuard (401) → VerifiedGuard (403) →
  PermissionsGuard (403) → ZodValidationPipe (400) → controller → service (scoped queries → 404;
  rule violations → 409/422) → AuditService (same transaction)`. Guards are global and
  deny-by-default: every route needs `@Public()` or `@RequirePermissions()`/`@AllowUnverified()`.
- API modules (003, 004, 006, 007, 009, 010, 011, 012, 013, 015, 016, 017 `platform/mail`, 018, 019
  `code-runs` and the `code-runner` worker): see `apps/api/CLAUDE.md`, loaded when working
  under `apps/api`.
- Auth is opaque, revocable server-side sessions (cookie `__Host-devtrack_session`), not JWT. All
  session revocation goes through `SessionService.revokeAllForUser(userId, reason, tx)`.

## Rules that are easy to get wrong

- Authorization = explicit permission (`recurso.acao`, e.g. `professores.convidar`) **and**
  resource context. Never check role names or `isAdmin`-style flags. Missing capability → `403`;
  has capability but resource outside the user's context → `404` (don't reveal existence).
- One `User` identity with many roles via `User → UserRole → Role → RolePermission → Permission`;
  never a `users.role` column. No public self-signup (constitution 3.0.0): student accounts come only from
  accepting a class invitation (spec 003; since 027 sent by a MANAGER/ADMIN from the turma, never by a teacher); `POST
  /auth/signup` and `/cadastro` are gone (FR-048). The 027 direct enrollment only adds an existing student account.
  `TEACHER`/`MANAGER` come only from invitations; the first `ADMIN` only from the CLI (no endpoint,
  seed, default password or env credentials). The last active `ADMIN` can't be removed.
- Workflows use explicit state enums, not boolean flags; invalid transitions → `409
  INVALID_STATE_TRANSITION`. Critical operations must be idempotent and concurrency-safe
  (unique/partial indexes, `SELECT … FOR UPDATE`, `pg_advisory_xact_lock`, conditional `UPDATE …
  RETURNING`).
- Anti-enumeration: auth flows return identical responses for existing/non-existing emails; emails
  are sent after commit, off the response path.
- Audit events are written in the same transaction and the table is append-only (DB trigger).
  Never log passwords, tokens, cookies or secrets; tokens are stored only as hashes.
- Layering: thin controllers → services → Prisma repositories. `*.controller.ts` can't import
  Prisma, `PrismaService` or the transaction helpers (ESLint-enforced). No business rules in
  React components.
- Errors are always `{statusCode, code, message}` with no stack traces or internals.
- Schema changes only via Prisma migrations. Subjects/languages/technologies are data, never enums
  or conditionals in code.
- No Redis, queues, WebSockets or new dependencies without a spec that requires them.
- Students never see a grade or feedback before the release with complete grading (and
  `notas.proprias.visualizar`), and never an answer key of a work; an exercise's key reaches them
  only in their own concluded attempt (013 K10). Every student shape is built in
  `activities/views/student-view.ts` by copying an allowlist, never by stripping the teacher view.
  Deadlines, publication phases and statuses come from the injected server `Clock`, never the
  browser's; statuses are derived on every read, never stored.
- Exercise points are never a grade (013): no `notas.*` permission, grade, deadline or late policy
  on an EXERCISE activity; points are integers fixed by difficulty (`EXERCISE_POINTS`, 15/30/60),
  copied into the snapshot. The first conclusion is attempt number 1 concluded (one open attempt at
  a time, attempt n only after n − 1 is concluded), never a flag; a bank exercise scores once per
  student and class (partial UNIQUE on `exercise_question_results … WHERE scoring`), and a
  cancelled activity's points stop counting without moving elsewhere. The ranking is derived on
  every read and carries only position, name, points and `isViewer`.
- Controlled mode and AI help (015): events and helps are facts for the teacher, never a grade,
  discount, block, auto-submit or "fraud" label; times come from the server clock (a buffered event
  keeps the browser's time only as `clientOccurredAt`), and exits and durations are derived on read,
  never stored. Mode and help are fixed once a student starts (`409 ACTIVITY_ALREADY_STARTED`). The
  `work-helper` sees exactly the student's view of the question, never the answer key; the leak check
  (`work-help/help/leak-check.ts`) runs where the key lives and blocks before delivery. Only DELIVERED
  counts toward the 3 (one REQUESTED per attempt, a DB trigger caps DELIVERED at 3); out-of-scope,
  blocked and failed requests cost nothing. Audit metadata carries ids, enums and codes, never the
  question or the orientation.
- Attendance and pauses (016): only a `PRESENT_ONLY` work takes attendance; `release_mode` is set by
  the server when the work is created (a new ASSIGNMENT is `PRESENT_ONLY`, an EXERCISE and every older
  work `ALL_ENROLLED`) and never sent in a body; the routes of an `ALL_ENROLLED` activity answer
  `409 ATTENDANCE_NOT_REQUIRED`. A student not marked present gets the same `404` as an activity of
  another class (`student_access.denied` with `NOT_PRESENT`) on every route, list and dashboard.
  Unmarking is allowed only before the student starts (`409 ATTENDANCE_STARTED`). Presence is only the
  teacher's mark: no location, network, QR code, camera or device. A pause belongs to the attempt, not
  the session: while it is open the student routes return no statement or answer and every write
  (save, submit, 015 events, help) is refused with `409 ATTEMPT_PAUSED`, enforced by DB triggers too;
  only the teacher ends it ("Liberar retorno"), and a close, cancellation or accepted submission ends
  it by derivation. PAUSED, `roomStatus`, the end and the durations are derived on read, never stored;
  the deadline never moves for a pause, and a pause is never a grade, discount or fraud label. Audit
  metadata carries ids and enums, never the note of "Outro". Changes reach the other side by 5 s
  polling (`ATTENDANCE_POLL_MS`), never WebSockets.
- E-mail (017): every e-mail of the seven kinds (027 added `CLASS_ENROLLMENT_NOTICE`) goes through the outbox (`MailOutbox.schedule` in the
  request's transaction, `mail_deliveries`); only the outbox calls `Mailer.send`. Nothing of the
  e-mail is stored (no address, subject, link or token): each attempt rebuilds it with a fresh link
  through the owner module's `MailSubject`, and the Message-ID `<deliveryId.attempt@domain>` is the
  only link to the provider. A provider notice only changes the delivery (never the invitation, the
  account or a permission) and is never a suppression list. `POST /mail/notices/:provider` is public
  and authenticated only by the provider's signature on the raw body, before any database access;
  it never takes a session or an `Origin`. Account e-mails never show a delivery situation, and the
  public flows answer exactly as before (anti-enumeration).
- Exams (018): an EXAM activity is always CONTROLLED, with no AI help and only for the students
  marked present; its body never takes `latePolicy`, `startWindowMinutes`, `executionMode`, `aiHelpAllowance` or
  `releaseMode` (400) and requires the period's end `deadline` (032). Duration 1–120 min, inactivity 30–60 s; the start
  needs `{ acceptRules: true }` and one attempt per student, and after the period's end `409 EXAM_START_CLOSED`.
  The end is the server's (`startedAt` + duration capped by the period's end, or the activity's close or cancellation
  if earlier, against the injected `Clock`; saves and the hand-in get a 2 s grace): time-out, PAUSED and "awaiting decision" are derived on read, and an
  expired attempt is settled by the next touch (`exam_attempt.time_expired`, SYSTEM), never by a job.
  Countable occurrences (screen, fullscreen, clipboard, `INACTIVITY` with `idleSeconds` 30–60) are
  grouped within 2 s; occurrences 1–3 are warnings and the 4th opens the hold in the events batch's
  transaction (`exam_attempt.held`), exactly once even with simultaneous batches. While held, no
  statement or answer is served, events are stored without counting and every write is refused
  (`409 EXAM_ATTEMPT_ON_HOLD`). The system never cancels or zeroes an exam: only the teacher's
  decision does — cancel (zero), return (only while time is left and the activity is active, enforced
  by a DB trigger too; the end never moves) or "Não cancelar" (only after the end) — and a repeated
  decision is `409 INVALID_STATE_TRANSITION` with no second event. The result release answers
  `409 EXAM_DECISIONS_PENDING` while a hold is open; before it the student reads `WARNINGS` for both
  decisions. Only the teacher pauses an exam ("Sair da sala" → `409 EXIT_NOT_ALLOWED`) and the time
  keeps running. No AI call happens during an attempt; `exam-sessions` grades only through
  `activities/submission`. No text says "fraude", "cola" or "violação"; audit metadata carries ids,
  enums, counts and times, never a statement or an answer.
- Activity period (032): a work and an exam are applied for a period, `publishAt` (null = now) → `deadline` (the end,
  required for ASSIGNMENT and EXAM, inclusive); `deadline > publishAt` and an exam's period holds at least its
  duration, else `422 INVALID_SCHEDULE` (pure `activities/status/period.ts`: `validPeriod`, `canChangeEnd`,
  `acceptsAttendanceMark`). No body takes `latePolicy` (400): the server stores `REJECT` on every new work, and
  `ACCEPT_MARKED` exists only on works applied before 032, which keep accepting late submissions (marked late) and
  attendance marks after the end until the teacher closes them (web badge "Aceita entrega atrasada (regra anterior)").
  Whoever is marked present during the period starts any time in it; after the end nobody starts, saves, submits, asks
  for help or runs code (`DEADLINE_PASSED`, never an automatic submission) and a mark is refused
  (`409 ACTIVITY_PERIOD_ENDED`; the room's `periodEnded`). A work's end changes freely while ACTIVE; a scheduled exam's
  too; a published exam's end only extends (`422 EXAM_END_CANNOT_MOVE_EARLIER`, DB trigger once a student started) and
  not after it passed (`409 ACTIVITY_PERIOD_ENDED`). The monitor, the mobile list and the student's `startDeadline` /
  `closesAt` are the `deadline`. Exercises are unchanged (no period).
- Code Runner (019): student code never runs in the API process. Only the worker (its own process,
  never imported by the API) talks to Docker, through `DockerSandbox`; each step (check/compile, then
  each PUBLIC case) is a fresh container with no network, a read-only root, a tmpfs `/tmp`, memory, CPU,
  pids and time limits and an unprivileged user, the program on stdin and nothing mounted. Production
  requires `CODE_RUNNER_DOCKER_RUNTIME=runsc` (config guard). The run body is only `{ sourceCode }`
  (≤ 65 536 UTF-8 bytes → `413 SOURCE_TOO_LARGE`); activity, question, attempt, profile and cases come
  from the server, only on an EXERCISE CODE question of the student's attempt in progress with public
  cases (WORK/EXAM → 404). One pending run per student (partial UNIQUE; a new request returns it, `200`),
  10 new runs per minute (`429`, audited). The worker claims with `FOR UPDATE SKIP LOCKED` and writes the
  result once, keyed by the claim token; stale runs (queue deadline 60 s, lease 90 s, kill switch) end
  FAILED with a reason, settled by the worker and by the API on read. Availability is a fresh heartbeat
  (15 s) listing the profile; `CODE_RUNNER_ENABLED` is the kill switch. A private case never reaches a
  student (not its count, not in a run: the worker runs only PUBLIC cases, a trigger refuses others).
  Verdicts and the output comparison (trailing spaces and trailing empty lines ignored, the rest exact)
  are the pure `verdict.ts`/`compare-output.ts`, never AI. A run never touches the answer, the attempt,
  points, results or the ranking. Audit and logs carry ids, enums, counts and durations, never code,
  input or output; the job `code-run-content` empties code and outputs 24 h after the end (rows stay,
  triggers refuse any other change). Languages with execution are the catalog column `execution`;
  code knows only the profile keys. Output is rendered as text in `CodeBlock`, never HTML.
- Code Runner in works (021): a work runs code only with `class_activities.code_execution_allowed` (set on
  apply or by the 015 options PATCH before any attempt, `409 ACTIVITY_ALREADY_STARTED` after; EXERCISE/EXAM bodies
  refuse `codeExecution`, 400). The run routes are the 019 ones: an EXAM or a work without the option → 404, a
  paused attempt → `409 ATTEMPT_PAUSED` (`attempt_pause.write_refused` with `operation: "CODE_RUN"`, also the
  `code_runs_paused` trigger), a save the 012 `decideOperation("SAVE")` would refuse → the save's code. The pending
  run and the per-minute limit are shared with exercises. A run never touches the answer, the submission, the
  grading or the release (`021/SC-003`); the teacher's summary is an allowlist (`views/teacher-run-summary.ts`) of
  counts, statuses and verdicts, the same before and after the 24 h purge, and is not audited.
- Student feedback (020): the feedbacks belong to the platform, read and handled only with
  `feedbacks.visualizar`/`feedbacks.alterar_situacao` (ADMIN); no teacher (not even the student's) or
  MANAGER sees them (403). The student's routes take only their own (`/me/feedbacks`, no id of a
  feedback). The body is strict: `submissionId` (idempotency, `UNIQUE (student_id, submission_id)`: the
  same id returns the first feedback, `200`), category, message trimmed and counted in code points
  (10–2 000, no NUL) and an `originPath` that is only a portal path (no query, fragment or `..`; the web
  sends `null` otherwise); never `studentId`, `status` or a time. 5 per student in 24 h by the injected
  clock under `pg_advisory_xact_lock` (`429` with `Retry-After`, `student_feedback.rate_limited` in its own
  transaction). The text is immutable (trigger); the status goes RECEIVED → IN_REVIEW/RESOLVED/ARCHIVED,
  IN_REVIEW → RESOLVED/ARCHIVED, RESOLVED/ARCHIVED → IN_REVIEW (pure `feedback-state.ts` and a trigger;
  else `409 INVALID_STATE_TRANSITION` with no history or event), under `SELECT … FOR UPDATE`, one history
  row per applied change. Only the job `student-feedback` deletes (`SET LOCAL devtrack.feedback_purge =
  'on'`, RESOLVED/ARCHIVED 24 months after `status_changed_at`). Student and ADMIN shapes are allowlists
  (`views/`); the text is rendered as text, never in audit or logs. The badge refetches on focus and
  invalidation, never polling. No AI, mail, grade or points.
- Group work (023): one attempt for the group (`attempt_groups`, `attempt_participants`); an individual attempt is the
  owner alone with no group row, and an individual work, an exercise and an exam read as before 023 (`023/SC-007`: no
  `group`, `memberCount`, `groupSize` or `submittedById` in their audit metadata, no `savedBy`). `groupSize` 2–5 only on an
  ASSIGNMENT that takes attendance (`422 GROUP_NEEDS_ATTENDANCE`), fixed once a student starts. A student has one place per
  activity: the start and "Incluir integrantes" run under `lockActivityGroups` (advisory lock) with the UNIQUE per
  activity, student and attempt number underneath; a start needs `{ memberIds }` (1 to `groupSize − 1`) or `{ alone: true }`,
  and a chosen classmate no longer eligible refuses the whole request (`409 GROUP_MEMBERS_UNAVAILABLE`). Only the effective
  editor saves or asks for help (`409 GROUP_NOT_EDITOR`), only the leader holding the editing submits; there is no route
  to leave or remove. `settleGroup` runs first on every touch and moves the editing or the leadership when someone is
  paused or lost the class (SYSTEM events, `EDITING_RESET`, `LEADER_CHANGED`), never by a job. 015 events, 016 pauses and
  019/021 runs stay per student (a member reads only their own); the 3 AI helps are the attempt's; a run needs no editing
  and saves nothing. Saves are logged in `activity_answer_saves` (append-only), never as audit events, and those records
  are never a grade: one grade for the group. A classmate is shown only by id and name, never e-mail or RA. Changes reach
  the others by 5 s polling (`GROUP_POLL_MS`), never WebSockets.
- Mobile exam monitor (024): the app is read-only except the 025 nudge — it reads only `GET /me`, `GET /mobile/exams` and the 018 monitor and timeline;
  decisions, attendance and pauses stay on the computer. A session has a fixed `client` (`WEB` cookie / `MOBILE`
  bearer, `Authorization: Bearer`, never a cookie); a bearer works only on routes marked `@MobileAccess()` (elsewhere
  `403 MOBILE_ROUTE_NOT_ALLOWED`), and only `POST /auth/mobile/sessions` is `@MobileEntry()` (teachers only,
  `chamada.registrar`, else `403 MOBILE_NOT_ALLOWED`; it shares the web login limits). A MOBILE session lives 30 d idle
  / 90 d; every revocation deletes its device in the same transaction (`mobile_device.removed`). One device per MOBILE
  session, the push token unique (a token seen in another session moves). Each counted occurrence and each hold writes
  one `exam_alerts` row in the events batch's transaction through `ExamAlertSink` (UNIQUE per attempt and ordinal);
  `ExamAlertWorker` claims with `FOR UPDATE SKIP LOCKED`, resolves the recipients at send time (the class's teacher,
  a valid MOBILE session, the account active with `chamada.registrar`, the class not archived, the exam not muted),
  sends once per device (PK per alert and device), retries 2 s and 5 s, never sends an alert older than 60 s
  (EXPIRED) and removes a device Expo reports `DeviceNotRegistered`. A failed send never touches the exam. The message
  carries only the student's name, the exam's title and class and ids in `data` — never a statement, answer, grade,
  e-mail or RA, nor "fraude", "cola" or "violação"; audit and logs carry ids, enums and codes, never tokens, names or
  texts. The mute is a row per teacher and exam (`PUT …/exam-alerts { muted }`, idempotent, no audit); an alert of a
  muted exam ends SKIPPED and is never sent late. `PUSH_ENABLED=false` is the kill switch (alerts end SKIPPED). The
  app polls the room every 5 s while visible, never WebSockets; its UI uses only `@repo/design-tokens`.
- Exam nudge (025): `POST …/attempts/:attemptId/exam-nudges` is `@MobileOnly()` (a web cookie gets
  `403 MOBILE_SESSION_REQUIRED` before the permission; `provas.avisos.enviar` and `chamada.registrar`), the body exactly
  `{}` — no text, student or time; another class (archived, or no longer the teacher's), not an EXAM or another
  activity's attempt → 404 with no event. It is accepted only while the attempt runs (not submitted, ended, paused or
  held) with 2+ counted occurrences, re-derived under the attempt's `FOR UPDATE` by the pure `nudge-status.ts`; a
  refusal is `409 EXAM_NUDGE_NOT_ALLOWED` with `exam_nudge.send_refused` in its own transaction. One pending per attempt
  (partial UNIQUE, `ON CONFLICT DO NOTHING`): a repeat returns it with `200` and no event. The student's poll
  (`GET /me/activities/:id/attempt/exam-nudge`, 5 s while the page is visible, never WebSockets) shows it only while the
  attempt runs and is neither paused nor held, with only the id and the student's own name; "Entendi" (body `{}`) sets
  `dismissedAt` by the server's clock once. PENDING/DISMISSED/UNSEEN are derived on read, never stored. The warning's
  sentence lives only in the web and the app, never on the wire, in audit or logs; a warning is never an occurrence,
  grade, discount, block or pause, and the 018 inactivity does not count while the dialog is open. Audit metadata holds
  ids, enums and counts. Triggers refuse other inserts, updates and deletes on `exam_nudges`.
- Student's current subject (026): `classId` on `GET /me/activities` and `GET /me/dashboard` is optional; without it
  both answer exactly as before (`026/SC-005`). With it, the class must be one of the student's ACTIVE enrollments,
  checked before any read, else `404` with the same body for another student's, an ended or an unknown class (never
  403); a malformed id is `400` before any query; the cursor pages only within the class. The subject is never stored
  on the server: the address (`materia=`) holds it. A class the student can no longer see (not in "Minhas turmas", or
  the 5 s poll of the list or the Painel answering `404`) falls back to the most recent enrollment with "Essa matéria
  não está mais disponível para você.", never WebSockets. The subject name is text, never HTML.
- Turmas of the MANAGER (027): the turma is `cohorts`; `classes` is the disciplina da turma (teacher + subject + calendar,
  `cohort_id`, UNIQUE per turma and subject) and keeps every 004–026 table and route. Enrollments and invitations are keyed
  by `cohort_id` (one ACTIVE enrollment per turma and student, one PENDING invitation per turma and e-mail): an enrollment
  reaches every disciplina of the turma, present and future. Pedagogical readers ask "students of this class" through the
  view `class_enrollments` (raw SQL) or `schoolClass.cohort.enrollments` (Prisma), never `enrollments.class_id`; only
  `cohorts`, `class-invitations` and `enrollments` write enrollments or invitations (`cohorts-boundary.spec.ts`). The
  `turmas.*` keys (create, edit, status, invite, resend, cancel, view students, remove, the new `turmas.incluir_aluno`)
  are MANAGER/ADMIN; the teacher has `turmas.buscar` (the directory: active turmas with only name, code, year, period and
  each disciplina's subject and teacher) and `disciplinas_turma.*`; the MANAGER never reaches a class's pedagogical
  routes, another teacher's class in the same turma is `404`. The effective status of a class is the most restrictive of
  the turma's and its own (ARCHIVED > INACTIVE > ACTIVE), derived on every read (`effectiveStatus()`,
  `ClassContextPolicy` returns it as `status` with `ownStatus` kept, SQL `class_effective_status(class_id)`), never
  stored or cascaded. The teacher changes the class's own status only when `planningToday(clock) > endsOn` (pure
  `canCloseClass`; no calendar → never), else `409 CLASS_CALENDAR_NOT_ENDED`; the view's `canChangeStatus` drives the
  web. A closed turma (INACTIVE) keeps its enrollments ACTIVE: the student reads, never writes, and the 026 card offers
  only effectively ACTIVE classes. Direct enrollment (`POST /cohorts/:id/student-lookup` and `…/enrollments`, e-mail in
  the body only) finds only an ACTIVE, verified STUDENT account with a profile, every other case the same `{ found:
  false }` / `422 STUDENT_NOT_ELIGIBLE`; 30 per MANAGER per minute (`429`, audited); created under the turma's lock with
  the partial UNIQUE (`409 ALREADY_ENROLLED`), a pending invitation of the same e-mail cancelled (`ENROLLED_DIRECTLY`),
  a `CLASS_ENROLLMENT_NOTICE` scheduled (no token, link to `/entrar`). Removing an enrollment removes it from every
  disciplina of the turma. Invitations and the notice name only the turma, never a teacher or subject; e-mails and
  names stay out of the new audit metadata and logs.
- Student's Histórico (028, 029): `GET /me/history` derives everything on every read, newest row first. Since 029 the
  placement is the teacher's act on the activity (pure `inHistory`/`inList` in `student-activities/history.ts`): the
  Histórico holds only the works and exams the teacher closed or cancelled; every exercise and every ACTIVE work or exam
  (pending, in progress, overdue accepting or not, delivered, graded, concluded) stays in "Minhas atividades", whose
  `COMPLETED` filter ("Entregues/concluídas") is back. The class's or turma's status never moves a row. A CLOSED row is
  `AWAITING`/`GRADED` with a delivery (a held exam awaits too), else `MISSED`; a CANCELLED one is `CANCELLED` whatever the
  delivery, read only by `StudentActivityLoader.loadCancelled` (ACTIVE enrollment, the 016 release, published before the
  cancellation) and built by `toCancelledSummary` (no result or points, read with `canSeeResults` false): never a grade,
  feedback or link, and every other student route of it stays `404` (`student_access.denied`, `CANCELLED`). The row's
  date is `deliveredAt ?? endedAt` (`closedAt`/`cancelledAt`). `GRADED` only when the result is visible to the student
  (released with complete grading); before it the row is `AWAITING` with no grade or feedback. `totals` (the cards:
  `delivered` = awaiting + graded; `missed` and `cancelled` apart) follow only `classId`, `tabCounts` `classId` and `q`,
  `items`/`total` also the tab; `q` is a title "contains", case- and accent-insensitive, trimmed and ≤ 100 code points,
  and is redacted from the logs (the URL's `q=` and `req.query.q`). `classId` is the 026 check (ACTIVE enrollment, else
  the same `404`), made before the cancelled rows are read. The Painel counts the list ("Atrasadas" every overdue of
  it) and its "Concluídas" is the number of the Histórico's rows of the same `classId`, linking to `/historico`.
- Calendar day kinds (031): `class_meetings` holds only the encontros (`kind` CLASS/EXAM/ASSIGNMENT/REVIEW/MAKEUP;
  `description` required on all but CLASS, null on CLASS); Feriado/Recesso/Evento especial/Falta live in
  `class_calendar_days`, and a date of a disciplina is in one table at most (cross-table triggers, `23505`). Every 004–030
  reader of meetings stays unchanged: numbering, "Total de aulas", topics, coverage and 007 count only meetings. The
  save is the 004 `PUT /classes/:id/meetings` with `set` (a strict union per kind; a date in only one of
  `add`/`set`/`remove`, `add` of a day without class → 400), diffed by the pure `class-plans/calendar-diff.ts` under
  `lockOwnedClass`: a meeting leaving the meeting condition (removed or set to a day kind) needs the 004/FR-029
  resolutions of its topics, else `409 MEETING_HAS_TOPICS`; a period change deletes the days without class outside it
  (`calendarDaysRemoved`). The Falta's reason is the teacher's only — never in the student's shape, audit metadata or
  logs (`class_meetings.updated` carries counts: `kinds`, `changed`). The student reads `GET /me/classes/:classId/calendar`
  (`calendario.turma.visualizar`, STUDENT) only with an ACTIVE enrollment in the class's turma (the same `404`
  otherwise, a malformed id `400`), built by the allowlist `student-calendar/views/student-calendar.view.ts`: date, kind
  and the student's text (the description, the notice, nothing on CLASS) — never topics, numbers, status or ids; `today`
  is the server's `planningToday`. The class's effective status does not hide it. Texts render as text.
- Student's "Minhas turmas" (030): `GET /me/classes` carries the turma's `enrolledAt` (the student's own ACTIVE
  enrollment); the 030 year filter and search run in the browser over that list, the route takes no parameters.
- UI only with Design System tokens and components (exceptions need a `ds-exception` marker and a
  row in `apps/web/design-system/exceptions.md`); the 014 code-highlighting rules and the rest:
  `apps/web/CLAUDE.md`.

## Recent Changes
- 032-activity-period: works and exams applied with a period (start now or scheduled, end date and time) instead of the exam's start window and the work's late policy; a present student starts any time in the period, an exam attempt ends at min(start + duration, end); a published exam's end only extends; attendance refused after the end
- 031-calendar-day-kinds: nine kinds per calendar day (Aula, Prova, Trabalho, Revisão, Reposição are encontros; Feriado, Recesso, Evento especial, Falta do professor are not), a modal per day, the Falta's private reason + optional notice; the student's "Seu calendário de aulas" card on the Painel through `GET /me/classes/:classId/calendar`, never topics
- 030-student-classes-redesign: the student's "Minhas turmas" redesigned — one card per disciplina da turma (teacher, year, period, enrollment date, "Acessar turma", ranking panel), search and year filter in the browser; `GET /me/classes` gains the turma's `enrolledAt`; no migration

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
