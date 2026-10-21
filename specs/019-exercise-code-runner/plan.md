# Implementation Plan: 019 — Code Runner nos Exercícios (primeira etapa)

**Branch**: `019-exercise-code-runner` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/019-exercise-code-runner/spec.md`

## Summary

The first use of the Code Runner (constitution IV):

- **Test cases in the exercise bank** (B16): a CODE exercise gets 0–20 cases (input, expected
  output, PUBLIC/PRIVATE), typed by the teacher only (Clarification Q1); applying copies them into the
  existing 012 snapshot table `class_activity_test_cases`.
- **"Executar"** (B13, B17): on an EXERCISE CODE question with public cases and a language with
  execution, the student's editor code becomes a `code_runs` row (QUEUED). It never touches the
  answer, the attempt, points or the ranking (FR-008).
- **The worker** (B2, B8): a separate Node process built from `apps/api`
  (`dist/code-runner/main.js`) claims runs with `FOR UPDATE SKIP LOCKED`, runs them and writes the
  result exactly once (claim token). Stale runs (deadline, lease) are settled by the worker and by the
  API on read.
- **The sandbox** (B1, B3, B4): our own runner on Docker — one fresh, hardened container per step
  (check/compile, then each public case), no network, read-only root, tmpfs, memory/CPU/pids/time
  limits, unprivileged user; files arrive on stdin, nothing is mounted. `runc` in development, gVisor
  (`runsc`) required in production. Judge0 (brings Redis) and Piston (privileged, recompiles per case)
  were rejected.
- **Verdicts and comparison** (B6, B7): pure functions; trailing spaces per line and trailing empty
  lines ignored, everything else exact.
- **Languages** (B5): `programming_languages.execution` (`java`/`python`/`javascript`), profiles with
  pinned image digests in the worker.
- **Availability and limits** (B10, B11, B12): `CODE_RUNNER_ENABLED` kill switch, worker heartbeat
  (liveness, versions, limits), one pending run per student (partial UNIQUE), 10 runs/min, content
  purged after 24 h by a maintenance job, audit without content.
- **Web** (`features/code-run`): "Executar", the result per case, 1 s polling while pending and
  visible.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**:
- NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`);
- web: Next.js 16, React 19, TanStack Query 5, React Hook Form 7, shadcn/ui, Lucide, CodeMirror 6 (014);
- **no new npm dependency**: the worker drives Docker through the `docker` CLI with
  `node:child_process`;
- **new runtime infrastructure**: Docker Engine on the worker host (already a dev prerequisite),
  gVisor `runsc` in production, three official images pinned by digest (`eclipse-temurin:25-jdk`,
  `python:3.13-slim`, `node:24-slim`).

**Storage**: PostgreSQL 17. One migration adds:
- `programming_languages.execution` + seed;
- `exercise_test_cases` with triggers;
- `code_runs`, `code_run_cases`, `code_runner_heartbeats`, 4 enums, CHECKs, the partial UNIQUE,
  transition/immutability triggers;
- the permission seed (`atividades.proprias.executar` → STUDENT).

**Testing**:
- Vitest (API), with `FakeSandbox`:
  - pure: `compare-output`, `verdict`, `run-state` (transitions, stale settlement), `profiles`
    (commands, prelude framing), exercise test-case rules;
  - integration per story (`019-us1-run` … `019-us4-languages`), `019-schema`, the worker cycle
    (`019-worker`: claim, result, lease takeover, expiry, sandbox error);
  - security: isolation (other student, other class, WORK/EXAM, private cases never in any response —
    SC-002), concurrency (double create → one pending; two workers → one claim; late result after
    takeover → no write), rate limits, audit and log scan without content (SC-006), retention,
    points/ranking unchanged with runs (SC-004), boundaries (`code-runner-boundary.spec.ts`).
- `test:sandbox` (real Docker, separate CI job): the three languages end to end, the verdict table,
  the hostile suite (SC-003) and the SC-001 timing.
- Web: Testing Library + `vitest-axe` + keyboard helpers; polling with fake timers; XSS of output.
- Playwright E2E `code-runner.spec.ts`: teacher creates a Python exercise with cases, student runs it
  (pass, wrong, compile error), private case never shown, conclusion unchanged.

**Target Platform**: Linux server (API, worker host with Docker + gVisor); browser for the teacher
and the student (desktop, phone).
**Project Type**: web service + worker + web app (pnpm/Turborepo monorepo)
**Performance Goals**:
- create run p95 < 150 ms; read run p95 < 100 ms (API only);
- a run with ≤ 5 public cases: ≤ 5 s Python/JavaScript, ≤ 10 s Java, without queue (SC-001;
  measured by `test:sandbox`);
- 40 runs in a minute with 4 slots: 95% done in ≤ 30 s (SC-001).

**Constraints**:
- student code never in the API process or with access to DB, secrets or network (IV);
- no Redis, queues, WebSockets, SSE or new npm dependency (IX, FR-018);
- runs never change answers, attempts, points, results or the ranking (FR-008);
- private cases never in a student response, not even their count (FR-004);
- no content in audit or logs; content purged after 24 h (FR-019);
- exercises, works and exams behave exactly as before when execution is off (SC-007).

**Scale/Scope**:
- 3 new routes, 4 changed shapes (exercise create/update/read, languages, student question);
- 1 migration;
- 1 new API module (`code-runs`), 1 worker (`src/code-runner`), changes in `exercises`,
  `activities/snapshot`, `activities/views/student-view`, `platform/maintenance`, config;
- 1 permission, 3 new audit types, 2 changed;
- 1 web feature (`code-run`), changes in `features/exercises` and `features/student-activities`;
- 1 E2E, 1 deploy guide (`docs/deploy/code-runner.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**:
  - strict bodies (`sourceCode` only; activity, question, attempt, language and cases from the server);
  - OWASP A01: every run scoped to the student → `404`; A03: output rendered as text; A04: rate
    limit, one pending run, size limits; A05: hardened containers, production guard for gVisor.
- [x] **II. RBAC**: `atividades.proprias.executar` (STUDENT); matrix rows; no role-name check.
- [x] **III. Server authority**: deadlines, leases, statuses and verdicts from the server clock and
  the worker; the web only shows them.
- [x] **IV. Untrusted code**: never in the API (boundary: the API never imports `src/code-runner`,
  `child_process` only in `docker-sandbox.ts`); isolated containers with CPU, memory, time, pids,
  filesystem and network limits (B3); the Code Runner has its own spec (this one), its own process and
  its own `SandboxPort`.
- [x] **V. Data integrity**: one migration; composite FKs (question ↔ activity, attempt ↔ student);
  partial UNIQUE; transition and immutability triggers; private-case and CODE-only triggers.
- [x] **VI. Audit & logs**: requested, finished (exactly once, same transaction) and rate-limited;
  metadata without content; logs counts and enums only.
- [x] **VII. Tests**: isolation, private cases, concurrency, the hostile suite and the 013 invariance
  are written first (tasks).
- [x] **VIII. Layering**: thin controller; service with scoped queries; pure compare/verdict/state;
  no rule in React components.
- [x] **IX. Simplicity**: a table and a polling worker, no queue product; no new npm dependency;
  the sandbox is new infrastructure explicitly required by this approved spec (line 186) — see
  Complexity Tracking.
- [x] **X. Evidence**: run results are facts kept 24 h for the student; they never become a grade,
  points or a behaviour label.
- [x] **XI. Human oversight**: the teacher's right/wrong (013) is untouched.
- [x] **XII. Determinism first**: execution and comparison are deterministic; no AI anywhere in 019.
- [x] **XIII. Risk level**: L1 (no effect on grades or points).
- [x] **XIV–XV, XIX. AI**: N/A (`exercise-generator` unchanged, Clarification Q1).
- [x] **XVI. Explicit states**: `code_run_status`, `code_run_failure_reason`, `code_run_outcome`,
  `code_run_verdict`; transitions enforced by trigger.
- [x] **XVII. Idempotency**: one pending run per student; claim with `SKIP LOCKED`; result keyed by
  claim token; settlement by conditional `UPDATE`.
- [x] **XVIII. Safe interruption**: time limits per step, worker-side kill, queue deadline, lease,
  kill switch (`CODE_RUNNER_ENABLED`), orphan container sweep; every failure ends `FAILED` with a
  reason.
- [x] **XX. Pedagogy**: immediate, objective feedback on practice; private cases kept for later
  grading; no penalty for running.
- [x] **XXI. Configurable domain**: execution is a catalog column; profiles keyed by it; test cases
  are teacher data.
- [x] **XXII. Accessibility**: keyboard flow, announced results, verdicts in words (SC-008).
- [x] **XXIII. Curricular traceability**: unchanged (exercise topic from 010).
- [x] **XXIV. Academic isolation**: student routes from the ACTIVE enrollment, the released activity,
  the own attempt in progress.
- [x] **XXV. Privileged provisioning**: N/A. Permission granted to STUDENT by migration.
- [x] **XXVI. Shared contracts**: `packages/contracts/src/code-runs/*`, changes in `exercises/` and
  `activities/`, endpoint catalog; user-facing text stays in the web (the convention is a key).
- [x] **Frontend stack**: `features/code-run`, TanStack Query polling, React Hook Form + Zod for the
  test-case section, DS components only.

**Post-design re-check**: all ✅ against constitution v3.5.0. No amendment is needed: line 186 already
admits a sandbox when an approved spec requires it, and IV asks for exactly the separate component
this plan builds.

Touches outside the new code:
- `exercises`: test cases in create/update/read/sets, rules, audit metadata;
- `activities/snapshot/from-exercises.ts` + `read-source.ts`: copy cases;
- `activities/views/student-view.ts`: `execution` on EXERCISE CODE questions;
- `platform/maintenance`: job `code-run-content`; `platform/config`: the new variables and guard;
- the permission seed, audit types, endpoint catalog, authorization matrix;
- `traceability.spec.ts` (`SPECS += 019` at the first implementation phase);
- `turbo.json`/`apps/api/package.json`: `code-runner:dev`, `code-runner:start`, `code-runner:images`,
  `test:sandbox`; `.github/workflows/ci.yml`: the `sandbox` job.

During planning the spec did not change. Details it left to the plan are fixed here: the sandbox
(B1), the hosting (B2), the profiles and versions (B5), the verdict order (B6) and the HTTP shape (B13).

## Project Structure

### Documentation (this feature)

```text
specs/019-exercise-code-runner/
├── plan.md
├── research.md                     # B1–B17
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   ├── audit-events.md
│   ├── configuration.md
│   ├── sandbox.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks
```

### Source Code (repository root)

```text
apps/api/
├── prisma/{schema.prisma, migrations/<ts>_exercise_code_runner/}   # execution column, exercise_test_cases, code_runs, code_run_cases, heartbeats, triggers, seed
├── src/platform/config/config.schema.ts                            # CODE_RUNNER_*, CODE_RUN_*, RATE_LIMIT_CODE_RUNS_PER_MINUTE, production guard
├── src/platform/maintenance/                                       # job code-run-content
├── src/modules/code-runs/
│   ├── code-runs.controller.ts, code-runs.service.ts, code-runs.module.ts
│   ├── availability.ts                                             # heartbeat read (B10)
│   ├── compare-output.ts, verdict.ts, run-state.ts                 # pure (B6, B7, B8)
│   ├── settle-stale.ts                                             # conditional UPDATE, used by API and worker
│   ├── views/student-run-view.ts                                   # allowlist
│   └── content-retention.job.ts
├── src/code-runner/                                                # the worker, never imported by the API
│   ├── main.ts, code-runner.module.ts, worker.ts, heartbeat.ts, profiles.ts
│   └── sandbox/{sandbox.port,docker-sandbox,fake-sandbox}.ts
├── src/modules/exercises/                                          # test cases (rules, service, views)
├── src/modules/activities/snapshot/{from-exercises,read-source}.ts
├── src/modules/activities/views/student-view.ts
├── src/modules/audit/audit-event-types.ts
└── test/
    ├── helpers/code-runs.ts
    ├── integration/019-us1-run … 019-us4-languages.spec.ts, 019-schema.spec.ts, 019-worker.spec.ts
    ├── security/019-{isolation,private-cases,concurrency,rate-limits,audit,retention,invariance,performance}.spec.ts
    ├── sandbox/019-{languages,verdicts,hostile,timing}.spec.ts      # test:sandbox, real Docker
    ├── code-runner-boundary.spec.ts (new)
    └── traceability.spec.ts                                         # SPECS += 019
packages/contracts/src/{code-runs/*, exercises/*, activities/*, endpoints.ts}
apps/web/
├── features/code-run/{api,components,hooks}/…                       # CodeRunPanel, CodeRunResult, use-code-run
├── features/exercises/components/{exercise-form,exercise-test-cases,exercise-detail}.tsx
├── features/student-activities/components/activity-answering.tsx    # mounts CodeRunPanel for EXERCISE CODE
├── lib/messages/error-messages.ts                                   # CODE_RUN_* codes
└── e2e/code-runner.spec.ts
docs/deploy/code-runner.md                                           # worker host, Docker + gVisor, DB role GRANTs, images
README.md, CLAUDE.md, apps/api/CLAUDE.md, apps/web/CLAUDE.md, apps/api/.env.example
```

**Structure Decision**: the existing monorepo.
- **API**: one new module (`code-runs`) for the student routes, the pure rules and the retention
  job; the worker in `src/code-runner`, built with the API but started as its own process and kept
  apart by the boundary test (B2, B15).
- **Web**: one new feature (`code-run`) mounted into the 012 answering page for EXERCISE CODE
  questions; the test-case section inside `features/exercises`.

## Complexity Tracking

No constitution violation. The new infrastructure is the one this spec exists to approve.

| Change | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| A separate worker process with the Docker CLI (and gVisor in production) | Constitution IV: student code never in the API process or host, with CPU/memory/time/process/filesystem/network limits | In-process (`vm`, `worker_threads`, child process): forbidden by IV; a Nest provider in the API would give the API the Docker socket (root on the host) |
| Our own runner instead of Judge0/Piston (B1) | FR-018 forbids Redis/queues; one compilation per run; verdicts and comparison stay testable in our code | Judge0 needs Redis + its own PostgreSQL + privileged containers; Piston needs a privileged container, recompiles per case and is another API to secure |
| A container per step instead of per run (B3, B4) | Each case starts clean; a time-out or output overflow is a `docker kill` of that case only | A long-lived container with `docker exec`: a process left by one case can affect the next, and killing an `exec` does not kill its process |
