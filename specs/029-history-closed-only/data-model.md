# Data model: Histórico só com provas e trabalhos encerrados ou cancelados (029)

**No migration.** Everything is derived on every read from existing columns.

## Columns read

| Table | Column | Use |
|-------|--------|-----|
| `class_activities` | `type`, `status` (`ACTIVE`/`CLOSED`/`CANCELLED`) | placement (HC1) |
| `class_activities` | `closed_at`, `cancelled_at` | `endedAt` (HC4) |
| `class_activities` | `publish_at` | a cancelled row only when published before `cancelled_at` (HC2) |
| `class_activities` | `release_mode` + `activity_attendances` | the 016 release, also for cancelled rows |
| `activity_submissions` | `submitted_at` | `deliveredAt` |
| `exam_attempt_holds` | open hold | a held CLOSED exam is AWAITING (HC4) |
| `enrollments` (by cohort) | `status = ACTIVE` | scope, as every student read |

## Read model

- **History row** (`StudentHistoryItem`): the student summary (012 allowlist; for a cancelled row `toCancelledSummary`)
  + `situation` (`AWAITING`/`GRADED`/`MISSED`/`CANCELLED`) + `deliveredAt` (nullable) + `endedAt` (non-null).
- **List item** (`StudentActivitySummary`): unchanged shape; now every EXERCISE and every ACTIVE ASSIGNMENT/EXAM.

## Placement (derived)

| Type | Activity status | Screen | History situation |
|------|-----------------|--------|-------------------|
| EXERCISE | any visible | Minhas atividades | — |
| ASSIGNMENT/EXAM | ACTIVE | Minhas atividades | — |
| ASSIGNMENT/EXAM | CLOSED, delivered | Histórico | AWAITING / GRADED |
| EXAM | CLOSED, open hold, no submission | Histórico | AWAITING |
| ASSIGNMENT/EXAM | CLOSED, not delivered | Histórico | MISSED |
| ASSIGNMENT/EXAM | CANCELLED (published before, released) | Histórico | CANCELLED |
| any | CANCELLED before publication / never released | nowhere | — |
