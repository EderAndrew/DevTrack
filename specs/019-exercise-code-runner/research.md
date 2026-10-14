# Research: 019 — Code Runner nos Exercícios (primeira etapa)

Decisions carry the prefix **B** (B1, B2, …). Each one gives the Decision, the Rationale and the
Alternatives considered.

## B1 — The sandbox: our own runner on Docker, gVisor in production

**Decision**: a small runner of our own that executes each step of a run (check/compile, then each
public case) in a **fresh, throw-away container** started through the `docker` CLI
(`node:child_process`, no new npm dependency):

- one official image per language, pinned by digest (B5);
- the hardening flags of B3 on every container (no network, read-only root, tmpfs `/tmp`, memory,
  CPU, pids, no capabilities, `no-new-privileges`, unprivileged user);
- the OCI runtime is configuration: `runc` in development (Docker Desktop has no gVisor), **`runsc`
  (gVisor) required in production** by the config guard (B12), so a kernel escape from the
  container would still hit gVisor's user-space kernel.

**Rationale**:
- The spec rules out Redis and queues (FR-018, constitution IX). Judge0 brings its own Redis and its
  own PostgreSQL and its own queue.
- A container per step gives a clean process, filesystem and memory per case, so one case can't
  leave a process or a file behind for the next. Grading (the next stage) needs this anyway.
- Docker is already a prerequisite (compose), runs on the developers' macOS machines and on any
  Linux host. gVisor plugs in as a runtime without code changes.
- Everything that decides a verdict (B6) and compares output (B7) stays in our code, tested as pure
  functions, instead of inside a third-party API.

**Alternatives**:
- **Judge0**: mature, many languages, but needs Redis + its own PostgreSQL + a privileged container
  with cgroup v1 tricks (`isolate`), and returns its own verdict vocabulary. Rejected for the Redis and
  the operational weight.
- **Piston**: lighter (one Node service + `isolate`), but needs a privileged container, recompiles on
  every execute request (a Java run with 5 cases compiles 5 times), has an irregular maintenance
  history, and is a second HTTP API with its own auth to protect. Rejected.
- **nsjail directly**: very strong isolation, but Linux-only (no development on macOS without a
  VM), needs privileges on the host and a hand-written policy per language. Kept as a possible
  replacement behind the same `SandboxPort` (B4) if container start-up time becomes the bottleneck.
- **Running in the API process (vm, worker_threads, child process)**: forbidden by constitution IV.

## B2 — Where it runs: a separate worker process, never the API

**Decision**:
- The worker is a separate Node process built from `apps/api` (`dist/code-runner/main.js`, script
  `pnpm --filter api code-runner:start`). It boots a minimal Nest application context
  (`CodeRunnerModule`: config, Prisma, clock, audit, logging), not the HTTP app.
- Only the worker talks to Docker. The API never has the Docker socket, never imports
  `src/code-runner/**` (boundary test, B15) and only reads and writes the run tables.
- **Production**: the worker runs on its own host (or VM) with Docker + gVisor, connected to the
  database with a dedicated PostgreSQL role limited to the code-run tables, the snapshot tables it
  reads, `audit_events` (INSERT) and `code_runner_heartbeats` (deploy guide
  `docs/deploy/code-runner.md` gives the GRANTs). The student containers have no network at all, so
  they never reach that database.
- **Development**: `pnpm dev` also starts the worker (turbo task), using the local Docker Desktop.

**Rationale**: constitution IV (never in the API process or the main server, no access to the
database, secrets or internal network from student code) and 703 (components connected through
explicit interfaces). The worker is trusted code; the containers are not.

**Alternatives**:
- An in-API Nest provider with a timer (like the 017 mail worker): it would give the API process the
  Docker socket, i.e. root on the host. Rejected.
- A separate app (`apps/runner`) with its own Prisma client: duplicates config, schema and audit for
  no gain; the boundary test gives the same separation.

## B3 — Container hardening

**Decision**: every step container is started with:

```text
docker run --rm -i --network none --read-only --tmpfs /tmp:rw,nosuid,nodev,size=32m
  --memory 256m --memory-swap 256m --cpus 1 --pids-limit 128
  --cap-drop ALL --security-opt no-new-privileges --user 65534:65534
  --ulimit nofile=64:64 --ulimit fsize=33554432 --ipc none --log-driver none
  --env-file /dev/null --label devtrack.code-run=<runId> [--runtime runsc] <image@digest> <command>
```

- No volume, no bind mount, no environment from the worker; files arrive on stdin (B4).
- The worker removes leftovers labelled `devtrack.code-run` at start and after each run
  (`docker rm -f`), so a crash never leaves containers running.

**Rationale**: FR-013 lists CPU, memory, time, processes, filesystem and network; each flag maps to
one of them, and the test suite of B14 attacks each one.

**Alternatives**: a long-lived container per run with `docker exec` per case — faster, but a process
left by case 1 could change case 2 and killing an `exec` doesn't kill the process inside. Rejected.

## B4 — A run, step by step (`SandboxPort`)

**Decision**: the worker calls a `SandboxPort` (`code-runner/sandbox/sandbox.port.ts`); the real
implementation is `DockerSandbox`, the tests use `FakeSandbox`.

1. **Check/compile** (one container): the source arrives on stdin and is written to `/tmp`;
   Java runs `javac -proc:none -d /tmp/out Main.java` and prints the class files as a tar on stdout
   (≤ 1 MB); Python runs `py_compile` (with `PYTHONPYCACHEPREFIX=/tmp`); JavaScript runs
   `node --check`. A non-zero exit → `COMPILATION_ERROR` with the message (≤ 16 KB); no case runs.
2. **Each public case** (one container each, in order): stdin carries a length-prefixed header with
   the program (source, or the class tar for Java), then the case input. A tiny `sh` prelude in the
   command extracts the program into `/tmp` with `head -c` and `exec`s the interpreter, so the
   program's stdin is exactly the case input.
3. The worker reads stdout and stderr with byte caps (64 KB + 1 each), enforces the time limit with
   `timeout -s KILL` inside the container **and** a worker-side timer (limit + 1 s) that calls
   `docker kill`, and measures the wall time of the case.

Java needs the class to be `public class Main` (shown on the question screen, FR-020). Python runs
with `python3 -I -B`, JavaScript with `node --max-old-space-size=192`, Java with
`java -Xmx192m -XX:+UseSerialGC -XX:TieredStopAtLevel=1 -cp /tmp/c Main` (faster start-up).

**Rationale**: no host paths cross into the container (works with a remote Docker host and with
gVisor), one compilation per run, and each case starts clean. The first task of the implementation
is a spike that measures the start-up times against SC-001 on the developers' machines.

**Alternatives**: `docker cp` into a created container (doesn't reach a tmpfs, behaves differently
with `--read-only`); bind-mounting a host temp dir (breaks when the worker itself runs in a
container, and gives the student a host path). Both rejected.

**Spike (2026-10-14, T001)**: Docker Desktop 29.7.2 on an Apple Silicon Mac (4 CPUs and 5 GB given to
Docker), `runc`, every container with the flags of B3, a program that reads stdin and prints its sum
with a "ç" (output checked byte for byte). Medians of 10 runs:

| Step | Java | Python | JavaScript |
|---|---|---|---|
| Container start (`sh -c true`) | 95 ms (all three alike) | | |
| Check/compile | 451 ms | 174 ms | 114 ms |
| One case | 119 ms | 109 ms | 121 ms |
| Run of 5 cases (compile + 5 cases, sequential) | 1 061 ms (max 1 072) | 734 ms (max 760) | 719 ms (max 743) |

- 40 runs of 5 cases arriving together (Java, Python and JavaScript alternated), 4 slots: 95% done in
  13.3 s, the last in 13.9 s. SC-001 (5 s / 10 s per run, 30 s for 40) fits with room to spare.
- The `sh` prelude (`IFS= read -r n; head -c "$n" > /tmp/p`) hands over the program and leaves the case
  input as the program's exact stdin (GNU `head -c` reads no further than `n` from a pipe). The Java
  class tar of the sample is 10 KB.
- `--read-only` with the tmpfs `/tmp` is enough for all three, Java included (`javac` into `/tmp/out`,
  `tar -cf -` on stdout; the run extracts into `/tmp/c`); user 65534 writes to the tmpfs (mode 1777).
  `--ulimit nofile=64:64` does not get in the way of `javac` or the JVM.
- `timeout`, `head` and `tar` exist in all three images.
- Digests (multi-arch index, so the same pin serves amd64 hosts and arm64 Macs):
  - `eclipse-temurin:25-jdk@sha256:63f965b560b905c9633218330ac3516304b526a74fdc323a504b05c06e712c30`
    (OpenJDK 25.0.4.1);
  - `python:3.13-slim@sha256:70729b46c69b4f1e97c4822c1af3df53a1476cf5ddc6c087c0c10bc3a5678c2f`
    (Python 3.13.16);
  - `node:24-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20`
    (Node.js 24.21.0).
- Not measured here: gVisor (`runsc`) start-up, which adds to each container; checked in the deploy
  checklist against the same SC-001 numbers.

## B5 — Languages: an `execution` key in the catalog, profiles in the worker

**Decision**:
- `programming_languages.execution` (text NULL, CHECK `IN ('java','python','javascript')`), seeded for
  the catalog keys `java`, `python` and `javascript`; NULL = no execution. Like the 014 `highlight`
  column, the code knows profile keys, never catalog languages (constitution XXI).
- `code-runner/profiles.ts` maps each key to its image digest, version label (Java 25, Python 3.13,
  Node.js 24), file name, check/compile command, run command and the convention text shown to the
  student. `pnpm --filter api code-runner:images` pulls the pinned images.
- The worker publishes the profiles it can run in its heartbeat (B10); a key with no live worker
  profile is "unavailable", not "unsupported".

**Rationale**: FR-020 (data, not a business rule) and US4. Pinning by digest makes results
reproducible and the supply chain reviewable.

**Alternatives**: one image with the three runtimes (bigger, one CVE surface for all); free text
commands in the database (a teacher-editable command line would be code injection).

## B6 — Verdicts (pure `verdict.ts`)

**Decision**: per case, in this order:

| Condition | Verdict |
|-----------|---------|
| killed by the time limit (in-container `timeout` exit 137 after the limit, or the worker timer) | `TIME_LIMIT` |
| stdout over 64 KB | `OUTPUT_LIMIT` (the worker kills the container) |
| container `OOMKilled`, exit 137 without timeout, Java `OutOfMemoryError`, Node heap-limit exit | `MEMORY_LIMIT` |
| any other non-zero exit | `RUNTIME_ERROR` (stderr shown) |
| exit 0 and outputs equal after B7 | `PASSED` |
| exit 0 otherwise | `WRONG_OUTPUT` |

The run's `outcome` is `COMPILATION_ERROR` or `EXECUTED`; `passedCount`/`publicCaseCount` are
derived from the cases. A sandbox failure (Docker down, image missing) is not a verdict: the run
fails with `SANDBOX_ERROR` (B8).

**Rationale**: deterministic and testable without Docker (constitution XII); the classification
table is the contract the sandbox suite checks.

## B7 — Output comparison (pure `compare-output.ts`)

**Decision**: `normalize(s)`: `\r\n` and `\r` → `\n`; strip spaces and tabs at the end of each
line; drop empty lines at the end. `PASSED` iff `normalize(stdout) === normalize(expected)`.
Nothing else is normalized (case, accents, internal spaces, blank lines in the middle, Unicode form).
It lives in `modules/code-runs/compare-output.ts` (pure, no imports) so the future grading reuses it.

**Rationale**: FR-012. The two leniencies are the ones students hit without meaning to (editors and
`print` add a final newline; trailing spaces are invisible).

**Alternatives**: token comparison (hides real formatting errors); case-insensitive (changes the
meaning of many exercises).

## B8 — The queue is a table; states and claiming

**Decision**: `code_runs` (data-model):
- `QUEUED` → `RUNNING` → `COMPLETED`; `QUEUED` → `FAILED` and `RUNNING` → `FAILED`, with
  `failure_reason` `EXPIRED` (not started within `CODE_RUN_QUEUE_DEADLINE_SECONDS`, 60), `INTERRUPTED`
  (lease passed: worker died), `DISABLED` (execution switched off) or `SANDBOX_ERROR`.
- **Claim**: `SELECT … WHERE status='QUEUED' AND deadline_at > now() ORDER BY created_at FOR UPDATE
  SKIP LOCKED LIMIT 1`, then `RUNNING` with `claimed_by`, `claim_token` and `lease_until`
  (`now() + CODE_RUNNER_LEASE_SECONDS`, 90). Several workers never take the same run.
- **Result**: one transaction writes the cases and `COMPLETED` with `WHERE id=? AND status='RUNNING'
  AND claim_token=?`; a late worker whose lease was taken over writes nothing (exactly once, FR-017).
- **Settlement of stale runs** (expired deadline, passed lease): a conditional `UPDATE … RETURNING`
  run by the worker each cycle **and** by the API when it reads or creates a run, so a run never
  stays pending when no worker is alive. A failed run is never executed later.
- The worker polls every `CODE_RUNNER_POLL_MS` (500) when idle, with `CODE_RUNNER_CONCURRENCY` (2 in
  dev, 4 suggested in production) runs at a time.

**Rationale**: FR-017, FR-018; the same `FOR UPDATE SKIP LOCKED` pattern as the 017 outbox; no
`LISTEN/NOTIFY` needed at this volume.

**Alternatives**: `LISTEN/NOTIFY` to wake the worker (another moving part for a 500 ms gain); a
retry of `INTERRUPTED` runs (could run code twice and late; the student just clicks again).

## B9 — One pending run per student

**Decision**: a partial UNIQUE index on `code_runs(student_user_id) WHERE status IN
('QUEUED','RUNNING')`. Creating a run: in one transaction, settle the student's stale run (B8), then
`INSERT … ON CONFLICT DO NOTHING`; on conflict return the pending run (`200`, not counted by the rate
limit); otherwise `202` with the new run.

**Rationale**: FR-009 under concurrency (double click, two tabs, retry after a lost response) without
an idempotency key from the client.

## B10 — Availability and the kill switch

**Decision**:
- **Kill switch**: `CODE_RUNNER_ENABLED` (API config, required in production by the config guard,
  `true` in `.env.example`). Off: the student view says `UNAVAILABLE`, a create answers `409
  CODE_RUNNER_UNAVAILABLE`, and queued runs settle `FAILED/DISABLED` on the next touch. The worker has
  its own `CODE_RUNNER_ENABLED`; off, it claims nothing. Changing it needs a restart, not a release
  (FR-016). Effect time: the restart of the API and the worker (seconds). Stopping the worker alone
  takes effect within `CODE_RUNNER_STALE_SECONDS` (15 s) through the heartbeat, without touching the
  API — the fast path for an incident. An admin toggle stored in the database (like the 006 agent
  status) is the next stage's upgrade.
- **Liveness**: `code_runner_heartbeats` (one row per worker: `worker_id`, `started_at`,
  `last_seen_at`, `executions` with version labels, `limits`), refreshed every 5 s. The API treats a
  profile as available iff some heartbeat newer than `CODE_RUNNER_STALE_SECONDS` (15) lists it.
- The limits shown to the student (FR-014) come from the heartbeat, so the screen always shows the
  limits the worker actually applies.

**Rationale**: FR-016 and constitution XVIII without an admin UI. The 006 agent status is an admin
toggle for AI agents; a code-runner toggle in the admin screens can come with the next stage.

## B11 — Rate limit

**Decision**: the 001 `RateLimitService` fixed window, scope `code-runs`, key the student's id,
`RATE_LIMIT_CODE_RUNS_PER_MINUTE` (10). Counted only when a new run is created (returning the pending
one costs nothing); over → `429 RATE_LIMITED` with `Retry-After` and the audit event
`code_run.rate_limited`.

## B12 — Config guard, retention and logs

**Decision**:
- Production guard (017 pattern): with `CODE_RUNNER_ENABLED=true` on the worker, `NODE_ENV=production`
  requires `CODE_RUNNER_DOCKER_RUNTIME=runsc`.
- Maintenance job `code-run-content` (after `ai-records`): sets `source_code`, `compile_output` and
  each case's `stdout`/`stderr` to NULL and stamps `content_purged_at` on final runs whose
  `finished_at` is older than `CODE_RUN_CONTENT_RETENTION_HOURS` minus `MAINTENANCE_INTERVAL_SECONDS`
  (23 h with the defaults), so no content outlives 24 h between two maintenance runs. Rows stay (ids, enums, counts, times) with the activity.
  A DB trigger allows only that change on a final run.
- The case input and the expected output are never copied into the run: they are read from the
  activity snapshot when the run is shown.
- Logs: run id, profile, status, verdict counts and durations; never source, input or output.
  The worker's Docker stderr (daemon errors) is logged only as an error code.

**Rationale**: FR-019, SC-006, constitution VI.

## B13 — HTTP and polling

**Decision**:
- `POST /me/activities/:activityId/questions/:questionId/code-runs` `{ sourceCode }` → `202` new run
  or `200` the pending one.
- `GET /me/activities/:activityId/questions/:questionId/code-runs/latest` → the student's last run of
  that question in the current attempt (or `null`).
- `GET /me/code-runs/:runId` → one run of the student.
- The web polls `GET /me/code-runs/:runId` every `CODE_RUN_POLL_MS` (1 s) while the run is
  `QUEUED`/`RUNNING` and the page is visible (TanStack Query `refetchInterval`), then stops.

**Rationale**: FR-010; same polling discipline as 016 (`ATTENDANCE_POLL_MS`), but faster because the
student is waiting on it.

## B14 — Tests that need Docker

**Decision**:
- `pnpm --filter api test` (CI) uses `FakeSandbox`; nothing there needs Docker images.
- `pnpm --filter api test:sandbox` runs `test/sandbox/*.spec.ts` against the real `DockerSandbox`:
  the three languages (pass, wrong output, compile error, runtime error), the hostile suite (network,
  `/etc` and environment, fork bomb, infinite loop, memory, 10 MB of output, filling `/tmp`, writing
  outside `/tmp`, signals to other processes) and the SC-001 timing. CI gets a separate `sandbox` job
  (Ubuntu runner, `runc`); gVisor is verified in the deploy checklist.
- The E2E (`code-runner.spec.ts`) starts the real worker with Docker.

## B15 — Module layout and boundaries

**Decision**:
- API `modules/code-runs`: student controller and service (create, latest, get), availability
  (heartbeat read), the pure `compare-output.ts`, `verdict.ts`, `run-state.ts`, the student view of a
  run, the maintenance job. No `child_process`.
- `src/code-runner/` (worker only): `main.ts`, `code-runner.module.ts`, `worker.ts` (claim, run,
  write), `heartbeat.ts`, `profiles.ts`, `sandbox/{sandbox.port,docker-sandbox,fake-sandbox}.ts`.
  `child_process` only in `docker-sandbox.ts`.
- Exercise bank (`modules/exercises`): test cases on CODE exercises; `activities/snapshot/from-exercises.ts`
  copies them.
- New guard `apps/api/test/code-runner-boundary.spec.ts`: nothing outside `src/code-runner` imports it;
  `child_process` only in `docker-sandbox.ts`; `code-runs` never imports grading, points, ranking or
  submission code (FR-008); no audit metadata or log call carries `sourceCode`, `stdout`, `stderr`,
  `input` or `expectedOutput`. The 011/012/018 guards stay as they are (no execution in their modules).
- Web: `features/code-run` (`CodeRunPanel`, `CodeRunResult`, `use-code-run`), mounted by
  `activity-answering.tsx` only for EXERCISE CODE questions, through a slot like 015's help.

## B16 — Exercise test cases in the bank

**Decision**: table `exercise_test_cases` mirroring `work_question_test_cases` (0–20 per CODE exercise,
input ≤ 10 000 chars, expected output ≤ 10 000 chars, `PUBLIC`/`PRIVATE`, positions 0…n−1), replaced as
a whole on each create/edit (the 010 optimistic `version` applies). Contract shapes
`ExerciseTestCaseInput`/`ExerciseTestCase` live in `contracts/exercises` (the works bank is not imported,
011 boundary). The form gets a "Casos de teste" section (add, remove, reorder by buttons, visibility
radio) and, next to the language, "Os alunos poderão executar o código" or "Sem execução nesta
linguagem" from `GET /programming-languages` (`execution` key, not availability). The 010
`exercise-generator` is unchanged (spec Clarification Q1): its drafts have no cases.

## B17 — Student view of a CODE question

**Decision**: the 012 student question keeps `publicTestCases` (already there) and gains
`execution`: `{ status: "AVAILABLE" | "UNAVAILABLE" | "NO_PUBLIC_CASES" | "NOT_SUPPORTED", version,
convention, limits }` for EXERCISE CODE questions only (null elsewhere). Private cases stay out
by the allowlist (`student-view.ts`, 012). A run's view carries per case only the case's position and
the run data; the web joins it with `publicTestCases` for input and expected output.

**Rationale**: FR-004 (nothing about private cases, not even the count), FR-005, FR-014, FR-020.
