# Configuration: 019

## API (`apps/api/.env.example`, `config.schema.ts`)

| Variable | Default | Meaning |
|---|---|---|
| `CODE_RUNNER_ENABLED` | `true` in `.env.example`; required in production | kill switch of the student routes (research B10) |
| `RATE_LIMIT_CODE_RUNS_PER_MINUTE` | 10 | new runs per student per minute (B11) |
| `CODE_RUN_QUEUE_DEADLINE_SECONDS` | 60 | a run not started by then → `FAILED/EXPIRED` |
| `CODE_RUNNER_STALE_SECONDS` | 15 | a heartbeat older than this is a dead worker |
| `CODE_RUN_CONTENT_RETENTION_HOURS` | 24 | the `code-run-content` maintenance job purges content after it |

## Worker (same `.env`, read by `dist/code-runner/main.js`)

| Variable | Default | Meaning |
|---|---|---|
| `CODE_RUNNER_ENABLED` | as above | off: the worker claims nothing |
| `CODE_RUNNER_CONCURRENCY` | 2 | runs at a time per worker (production: 4 suggested) |
| `CODE_RUNNER_POLL_MS` | 500 | idle poll interval |
| `CODE_RUNNER_LEASE_SECONDS` | 90 | a RUNNING run past its lease → `FAILED/INTERRUPTED` |
| `CODE_RUNNER_DOCKER_RUNTIME` | `runc` | `runsc` (gVisor) required when `NODE_ENV=production` (config guard) |
| `CODE_RUNNER_TIME_LIMIT_MS` | 2000 | per case |
| `CODE_RUNNER_COMPILE_LIMIT_MS` | 10000 | check/compile step |
| `CODE_RUNNER_MEMORY_MB` | 256 | per container (memory = memory + swap) |
| `CODE_RUNNER_OUTPUT_LIMIT_BYTES` | 65536 | stdout per case |
| `CODE_RUNNER_PIDS_LIMIT` | 128 | per container |
| `DOCKER_HOST` | (Docker default) | standard Docker variable, when the daemon is remote |

The worker publishes its limits and profile versions in the heartbeat; the student screen shows
those.

## Constants (not configurable)

- 20 test cases per exercise; input and expected output ≤ 10 000 chars each; source ≤ 65 536 bytes;
  stderr and compiler output kept up to 16 KB; Java class tar ≤ 1 MB.
- Heartbeat every 5 s; web polling `CODE_RUN_POLL_MS = 1000`, only while visible and pending.

## Maintenance job

`code-run-content` (after `ai-records`, before `mail-records`): purges content of final runs whose
`finished_at` is older than `CODE_RUN_CONTENT_RETENTION_HOURS` minus `MAINTENANCE_INTERVAL_SECONDS`
(23 h with the defaults), so no content outlives 24 h between two maintenance runs; batches of 500;
logs counts only.
