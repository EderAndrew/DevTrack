# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project state

DevTrack is a teaching/assessment platform configurable per teacher (docs, specs, UI copy, and
test names are in Portuguese). Features 001–017 in `specs/` are implemented; 018 (controlled exams)
is in implementation, phase by phase (`specs/018-controlled-exams/tasks.md`, git log `feat(018)`).
Later work starts a new feature through `/speckit-specify`.

- 001 foundation, identity and access; 002 the same behavior on the official stack (shared Zod
  contracts, web stack, Playwright E2E, GitHub Actions CI).
- 003 classes, class invitations by e-mail (the only way a student account is created),
  enrollments, "Minhas turmas".
- 004 subjects, syllabus upload/extraction/review, class calendar, class plan with manual topics
  and coverage; US9 (2026-09-24 amendment) marks a topic's class completed. A teacher lands on
  "Minhas disciplinas" after login.
- 005 design system and the Exam Mode visual contract; 012 built its NORMAL-mode subset in
  `apps/web/components/ui/assessment/` (timer, review flag and focus warnings wait for exams).
- 006 AI foundation with no domain agent and no real provider (tests use the reference agents and
  fake provider in `apps/api/test/fixtures/ai`).
- 007 Curriculum Agent ("Preencher com IA" → L2 proposal → `AI_ASSISTED` 004 draft); 008 OpenRouter
  as the only real provider, task routing, fallback, circuits; 009 model policy (catalog in code,
  cheapest approved model of the task's tier).
- 010 the teacher's private exercise bank, with "Criar com IA" through `exercise-generator`; the
  Curriculum Agent v3 also proposes the syllabus's programming language.
- 011 the teacher's private work bank, apart from the exercise bank (1–10 questions, grade split in
  exact hundredths, manual or "Criar trabalho com IA" through `work-generator`).
- 012 the student portal and class activities (a work or 1–10 exercises applied to a class as a
  snapshot; autosave, one submission, grade only after release).
- 013 exercise points (15/30/60 by difficulty, only attempt 1 scores) and the class ranking.
- 014 code syntax highlighting (`CodeEditor` with CodeMirror 6 on demand, read-only `CodeBlock`).
- 015 per-work CONTROLLED mode (focus page, screen exits and blocked copy/paste as server-timed facts,
  typing allowance on save) and AI help (3 orientations per student by `work-helper`, never the
  answer key, a deterministic leak check before delivery).
- 016 attendance-gated release: a new work is released only to the students the teacher marks present
  in its "Chamada" (late students marked later); "Sair da sala" pauses the attempt until the teacher
  releases the return; exercises and works applied before 016 stay open to every enrolled student.
- 017 production e-mail: the six e-mails (class, teacher and manager invitations, verification,
  password reset, admin activation) go through one outbox with retries; provider notices (Resend now,
  AWS SES later by configuration) mark an invitation "Não entregue"; HTML + text templates; a
  production config guard and the deploy guide `docs/deploy/email.md`.

Take-home works, AI grading and code execution are later features (exams arrive with 018, summarized
under "Recent Changes" and the `exams-boundary` guard below). The rules of 012–017 that
are easy to break are under "Rules that are easy to get wrong" below.

AI agents (`curriculum-agent`, `exercise-generator`, `work-generator`, `work-helper`) are registered
DISABLED until the admin enables them. All four tasks are BASIC; each task's primary and fallback come from the 009
catalog, backed by the release-gate evidence in `apps/api/test/fixtures/evaluations/` (current
results per model: `apps/api/CLAUDE.md`).

Before implementing anything, read the active feature (`.specify/feature.json` → `specs/<feature>/`):
`spec.md` (FR-/SC- requirements), `plan.md`, `research.md` (decisions with a per-feature letter prefix, e.g. R1 in 001, L1 in 014), `data-model.md`,
`contracts/*` (HTTP API, permission matrix, audit events, CLI, maintenance jobs) and `tasks.md`
(tests are mandatory and written first). If behavior must change during implementation, update the
spec first.

## Workflow (Spec Kit)

`SPEC → PLAN → TASKS → IMPLEMENTATION → TESTS → REVIEW`, driven by the `/speckit-*` skills in
`.claude/skills/` (`speckit-specify`, `-clarify`, `-plan`, `-tasks`, `-analyze`, `-implement`, git
helpers). Feature branches are named `NNN-short-name` and match `specs/NNN-short-name/`.
When a new feature starts implementation, add it to `SPECS` in `apps/api/test/traceability.spec.ts`
at its first phase (otherwise its scenario ids are never checked), with the stories and SC ids still to
come in `pending`; each leaves `pending` with the test that covers it (a pending id a test already
covers fails), so the list is empty when the feature ends. `/speckit-specify` already points
`.specify/feature.json` at it.

`.specify/memory/constitution.md` (v3.5.0) is non-negotiable and overrides everything else; every
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
- PostgreSQL 17 — one migration: `programming_languages.highlight` (text NULL, CHECK) + seed (014-code-syntax-highlighting)
- No new dependency (015-controlled-work-ai-help)
- PostgreSQL 17 — one migration: `activity_execution_mode` += `CONTROLLED`, `class_activities.ai_help_allowance` (0 or 3), tables `attempt_integrity_events` (append-only) and `work_help_requests` (015-controlled-work-ai-help)
- No new dependency (016-attendance-gated-release)
- PostgreSQL 17 — one migration: `class_activities.release_mode` (`ALL_ENROLLED`/`PRESENT_ONLY`), tables `activity_attendances` and `attempt_pauses`, defense triggers on attempt writes while paused (016-attendance-gated-release)
- No new dependency; `nodemailer` SMTP stays the only transport (Resend now, AWS SES later by configuration), `node:crypto` + `fetch` verify provider notices (017-production-email)
- PostgreSQL 17 — one migration: `mail_deliveries` (replaces `class_invitation_deliveries`, all six e-mails) and `mail_notices` (append-only), `delivery_status` += `DELIVERED`/`UNDELIVERED`/`DISCARDED` (017-production-email)
- No new dependency (018-controlled-exams)
- PostgreSQL 17 — one migration: the Banco de Provas tables (mirroring 011), `class_activity_type` += `EXAM` with duration/inactivity/start-window columns, submissions `end_reason`, integrity `INACTIVITY`, tables `exam_occurrences` (append-only) and `exam_attempt_holds` (018-controlled-exams)

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
pnpm admin:bootstrap --email <email> [--print-link]     # only way to create the first ADMIN (runs dist/, build first)
pnpm --filter api maintenance:run [--job <name>]        # retention/purge jobs (runs dist/)
pnpm --filter api fixtures:syllabus                     # rebuild test/fixtures/syllabus/* (004 upload/extraction fixtures)
pnpm --filter api fixtures:curriculum                   # rebuild test/fixtures/curriculum-agent/golden/*/document.* (007)
OPENROUTER_API_KEY=... pnpm --filter api eval:curriculum  # on-demand golden-set eval of the catalog candidates of the analysis's tier (costs cents)
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:curriculum
                                                        # 009 release gate: one catalog entry; writes test/fixtures/evaluations/<task>/<key>.json
                                                        # (skipped when a case failed for infrastructure); EVAL_REPLAY=1 rewrites recorded.json
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:exercises
                                                        # 010 release gate of the exercise generator, same flags; evidence in
                                                        # test/fixtures/evaluations/exercise-generation/, with each case's latency
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:works
                                                        # 011 release gate of the work generator, same flags; evidence in
                                                        # test/fixtures/evaluations/work-generation/
OPENROUTER_API_KEY=... EVAL_MODEL=<catalog key> EVAL_RECORD=1 pnpm --filter api eval:help
                                                        # 015 release gate of the AI help (work-helper), same flags; evidence in
                                                        # test/fixtures/evaluations/work-help/, with each case's latency
pnpm --filter api mail:notice --kind bounced --delivery <id> [--bad-signature]
                                                        # 017 dev helper (runs dist/): posts a Resend notice signed with
                                                        # MAIL_NOTICE_SECRET for that delivery; kinds delivered|bounced|complained|failed

# apps/web (port 3000) — API_ORIGIN (default http://localhost:4000) is the rewrite target
pnpm --filter web dev
pnpm --filter web test                                  # Vitest + jsdom + Testing Library + vitest-axe
pnpm --filter web test test/contrast.test.ts            # single file (no `--`, same as the API)
pnpm --filter web test -t "<test name>"                 # single test, or an id prefix such as "014/"

# packages/contracts
pnpm --filter @repo/contracts build                     # tsc -> dist/ (api and web import it)
pnpm --filter @repo/contracts test                      # boundary, duplication, zod-version guards

# E2E (Playwright): own API :4100 + web :3100, DB devtrack_e2e reset each run, emails via Mailpit
docker compose up -d postgres-test mailpit
pnpm build                                              # the E2E API runs apps/api/dist
pnpm --filter web exec playwright install chromium      # first time only
pnpm --filter web test:e2e
pnpm --filter web test:e2e work-bank                    # one spec by path regex; the admin → teacher setup projects still run first
```

The API builds with SWC into `dist/`; `tsc` only type-checks (`check-types`). The CLI scripts run
compiled code, so run `pnpm --filter api build` before them. Root `pnpm check-types`/`pnpm test`
build `packages/contracts` first (turbo `^build`); a filtered run (`pnpm --filter api check-types`)
needs `pnpm build` beforehand.

CI (`.github/workflows/ci.yml`, actions pinned by SHA) runs `pnpm lint`, `check-types`, `build` and
`test` against a PostgreSQL 17 service on every push and pull request. E2E runs locally only.
`prisma migrate reset` (used by the E2E `e2e/prepare-db.ts`) refuses to run under an AI agent
unless the user consents; the E2E aborts unless the DB name contains `e2e`.

API test harness, API-only guards and the per-feature security suites (test DB setup, `resetDb`,
`createTestApp`, audit/secret scans, 004–011 suites): see `apps/api/CLAUDE.md`, loaded when working
under `apps/api`.

Cross-cutting guards that fail when the spec and the code drift apart:
- `apps/api/test/traceability.spec.ts` parses the `spec.md` of each feature listed in its `SPECS`
  (001, 003, 004, 005, 006, 007, 008, 009, 010, 011, 012, 013, 014, 015, 016, 017 and 018; the on-demand evals' `apps/api/test/eval/*.eval.ts` counts
  too). Every `USn-k` scenario, every traceability row and the listed SC ids must appear
  in a `describe`/`it`/`test` title (API, web unit and `apps/web/e2e`), so name new tests with
  their scenario or SC/FR id. 001 ids are bare; later features carry their number (`003/US1-1`,
  `003/SC-004`), which never covers the bare 001 id. A new feature is checked once it's added to
  `SPECS`.
- Per-feature API security and integration suites (004–011) and the endpoint catalog guard: see
  `apps/api/CLAUDE.md`.
- `apps/api/test/works-boundary.spec.ts` (011) keeps the work bank and the exercise bank apart in
  the API modules, the contracts and the web features (no imports either way), and forbids code
  execution, model choice and float arithmetic (`parseFloat`, `Number(`, `.toNumber()`) in
  `works`/`work-ai`.
- `apps/api/test/activities-boundary.spec.ts` (012) lets `activities`/`student-activities` (API
  and web) reach the banks only through their snapshot readers and the pure `works/grading` and
  `works/types`; no exercise/AI module imports, no code execution, AI calls or float arithmetic on
  grades, and students are answered only through the student-view allowlist; it also keeps exams
  and timer/fullscreen/focus/clipboard code out (SC-012). Since 015 the activity modules reach
  `attempt-integrity` and `work-help` only through the hooks they register (`AnswerSaveGuard`,
  `HelpAvailability`), and monitoring lives only in `attempt-integrity`, `features/controlled-attempt`
  and `components/ui/assessment`. Since 016 they read the attendance tables in their own scoped
  queries, never import `attendance` code.
- `apps/api/test/exams-boundary.spec.ts` (018) keeps `exams`/`exam-ai` (API) and `features/exams` (web) apart
  from the exercise and work banks (only `works/{types,grading,grade}`), with no code execution, model choice or
  float arithmetic; `exam-sessions` calls no AI or AI help and grades only through `activities/submission`; no
  exam text says "fraude", "cola" or "violação". `activities-boundary.spec.ts` (amended in 018) lets the
  activity modules reach exams only through `exams/coverage`, never `exam-sessions`, and keeps the exam timer
  and countdown in `features/exam-attempt` and `components/ui/assessment`.
- `apps/api/test/attendance-boundary.spec.ts` (016) keeps `attendance` (API) and
  `features/attendance` (web) away from AI, AI help, controlled-mode monitoring, grading, the banks
  and mail; no code execution or float arithmetic, and presence is only the teacher's mark (no
  location, camera or QR code).
- `apps/api/test/work-help-boundary.spec.ts` (015) keeps the answer key out of everything that
  reaches the `work-helper` model (only `work-help/help` may read it, for the leak check), lets only
  the task declaration name tiers/families (no model choice), and forbids float arithmetic, and
  grading/submitting/blocking or exam code in `work-help`/`attempt-integrity`.
- `apps/api/test/mail-boundary.spec.ts` (017) keeps `platform/mail` free of domain-module imports
  (each module registers its `MailSubject`), forbids provider SDKs (`resend`, `svix`, `@aws-sdk/*`…),
  allows `nodemailer` only in `smtp.mailer.ts`, and only `platform/mail/outbox` may call `Mailer.send`.
- Contracts (`packages/contracts/test/`): `boundary.spec.ts` (no Prisma/Nest/React imports and no
  user-facing text in the package), `duplication.spec.ts` (no contract type redefined in api or
  web), `zod-version.spec.ts` (one Zod version in the lockfile; every workspace uses `catalog:`).
- Web guards (XSS, keyboard helpers, ESLint layers, contrast, design-system scans, the E2E
  OpenRouter mock): see `apps/web/CLAUDE.md`, loaded when working under `apps/web`.

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
  contract as Zod schemas, one directory per API domain (`common`, `auth`, `me`, `accounts`,
  `provisioning`, `admin-activation`, `health`, `classes` for classes, class invitations,
  enrollments and "Minhas turmas", `ai` for the 006 executions, proposals and operations,
  `curriculum` for 004 subjects, syllabus, class meetings and class plans plus the 007
  `curriculum-ai.ts`, `exercises` for the 010 bank and its AI batches, and `works` for the 011
  bank, its generation requests, the exact grade helpers and the grading result shapes, and
  `activities` for the 012 teacher and student shapes of class activities, with the 013 points and
  exercise results, `ranking` for the 013 class ranking, `attempt-integrity` and `work-help`
  for the 015 integrity events and AI help requests, and `attendance` for the 016 room, attendance
  batch and pauses, and `mail` for the 017 notice route's provider param — the notice body stays the
  provider's, parsed in the API adapters), with
  types derived through `z.infer`
  (`XxxSchema` / `Xxx`). `endpoints.ts` catalogs every route with its request and response
  schemas. Responses describe the JSON on the wire (dates are ISO strings). The package holds no
  Prisma, service or UI-state types and no user-facing messages. One Zod version comes from the
  pnpm catalog. API controllers validate input with the contract schemas and services return the
  contract types. The package builds to `dist/`, which api and web import.
- Protected request pipeline: `OriginGuard → SessionGuard (401) → VerifiedGuard (403) →
  PermissionsGuard (403) → ZodValidationPipe (400) → controller → service (scoped queries → 404;
  rule violations → 409/422) → AuditService (same transaction)`. Guards are global and
  deny-by-default: every route needs `@Public()` or `@RequirePermissions()`/`@AllowUnverified()`.
- API modules (003, 004, 006, 007, 009, 010, 011, 012, 013, 015, 016, 017 `platform/mail`): see `apps/api/CLAUDE.md`, loaded when working
  under `apps/api`.
- Auth is opaque, revocable server-side sessions (cookie `__Host-devtrack_session`), not JWT. All
  session revocation goes through `SessionService.revokeAllForUser(userId, reason, tx)`.

## Rules that are easy to get wrong

- Authorization = explicit permission (`recurso.acao`, e.g. `professores.convidar`) **and**
  resource context. Never check role names or `isAdmin`-style flags. Missing capability → `403`;
  has capability but resource outside the user's context → `404` (don't reveal existence).
- One `User` identity with many roles via `User → UserRole → Role → RolePermission → Permission`;
  never a `users.role` column. No public self-signup (constitution 3.0.0): student accounts come only from
  accepting a teacher's class invitation (spec 003); `POST /auth/signup` and `/cadastro` are gone (FR-048).
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
- E-mail (017): every e-mail of the six kinds goes through the outbox (`MailOutbox.schedule` in the
  request's transaction, `mail_deliveries`); only the outbox calls `Mailer.send`. Nothing of the
  e-mail is stored (no address, subject, link or token): each attempt rebuilds it with a fresh link
  through the owner module's `MailSubject`, and the Message-ID `<deliveryId.attempt@domain>` is the
  only link to the provider. A provider notice only changes the delivery (never the invitation, the
  account or a permission) and is never a suppression list. `POST /mail/notices/:provider` is public
  and authenticated only by the provider's signature on the raw body, before any database access;
  it never takes a session or an `Origin`. Account e-mails never show a delivery situation, and the
  public flows answer exactly as before (anti-enumeration).
- UI only with Design System tokens and components (exceptions need a `ds-exception` marker and a
  row in `apps/web/design-system/exceptions.md`); the 014 code-highlighting rules and the rest:
  `apps/web/CLAUDE.md`.

## Recent Changes
- 018-controlled-exams: exams — own Banco de Provas (manual or `exam-generator` L2 draft), applied as an always-CONTROLLED, help-free, attendance-gated EXAM with a per-student server timer (1–120 min, start window); occurrences (screen/fullscreen exits, clipboard, inactivity 30–60 s) give 3 warnings and the 4th opens a hold that only the teacher resolves (cancel → zero, return while time is left, or do not cancel); expired attempts settled on the next touch
- 017-production-email: real e-mail in production — one outbox with retries for all six e-mails (fresh link per attempt, nothing of the e-mail stored), provider notices (`POST /mail/notices/:provider`, signature on the raw body, our own Message-ID links them) mark invitations "Não entregue", HTML + text templates without external resources or tracking, production config guard, deploy guide (Resend → SES)
- 016-attendance-gated-release: per-activity attendance — a new work is released only to the students the teacher marks present (late students marked later, unmark only before the start); exercises and older works stay open; "Sair da sala" pauses the attempt (reason declared by the student, or a teacher pause) and only the teacher releases the return, on every device; the deadline keeps running; PAUSED and durations derived on read; polling, no WebSocket

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->
