# Audit Events: 021

No new type. Metadata holds only ids, enums, counts and times — never source code, an input, an
output, stderr or a compiler message.

## Changed

| Type | Metadata added |
|---|---|
| `activity.published` | `codeExecution` (boolean; `false` for EXERCISE and EXAM) |
| `activity.settings_changed` | `codeExecution` (the value after the change) |
| `code_run.requested` | `activityType` (`EXERCISE` \| `ASSIGNMENT`) |
| `attempt_pause.write_refused` | `operation` gains `CODE_RUN` (with `EVENTS` \| `HELP`) |

`code_run.finished` and `code_run.rate_limited` (019) are unchanged and now also cover works. The
teacher's summary and the availability read are not audited.
