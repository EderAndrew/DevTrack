# Audit Events: 019

Metadata holds only ids, enums, counts and durations. It never holds source code, an input, an
expected or obtained output, a compiler message or stderr (`code-runner-boundary.spec.ts`, SC-006).

## New

| Type | Actor | Target | Metadata |
|---|---|---|---|
| `code_run.requested` | USER (student) | CODE_RUN | `activityId`, `questionId`, `execution`, `publicCaseCount`, `sourceBytes` |
| `code_run.finished` | SYSTEM | CODE_RUN | `status`, `outcome`, `failureReason`, `passedCount`, `publicCaseCount`, `durationMs`, `verdicts` (count per verdict) |
| `code_run.rate_limited` | USER (student) | — | `scope: "code-runs"` |

`code_run.finished` is written in the transaction that makes the run final: by the worker
(`COMPLETED`, `FAILED/SANDBOX_ERROR`, `FAILED/INTERRUPTED` it settles) or by the API settlement
(`FAILED/EXPIRED`, `FAILED/DISABLED`, `FAILED/INTERRUPTED`). Exactly one per run.

## Changed

| Type | Metadata added |
|---|---|
| `exercise.created` | `testCaseCount`, `publicTestCaseCount` (010; 0 for a type without cases) |
| `exercise.edited` | `testCaseCount`, `publicTestCaseCount` (010; the list after the edit; the field name testCases joins `fields` when the list changed) |

A returned pending run (`200`) writes nothing.
