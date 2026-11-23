# Data Model: Histórico do aluno redesenhado (028)

**No migration.** Nothing new is stored: the situation, the delivery date and every count are derived on each read
from the tables 012/013/016/018/023/026/027 already have.

## Read model

### History item (derived, per delivered activity of the session student)

| Field | Source | Notes |
|-------|--------|-------|
| every `StudentActivitySummary` field | `toStudentSummary` (012), unchanged | the student-view allowlist; `result` only after release with complete grading and `notas.proprias.visualizar` |
| `deliveredAt` | ASSIGNMENT/EXAM: `activity_submissions.submitted_at` of the student's attempt (group: the group's); EXERCISE: `activity_attempts.completed_at` of attempt 1 | research HI4; never null in the history |
| `situation` | `AWAITING` \| `GRADED`, pure `historySituation` | research HI3 |

Included rows: the activities `StudentActivityLoader.loadAll` returns for the student (ACTIVE enrollments, published,
016 presence, 023 participants), whose derived status is `SUBMITTED`, `GRADED` or `COMPLETED` (today's history).

### Situation rule (`historySituation`)

```text
EXERCISE            → points.awaitingCorrection ? AWAITING : GRADED
ASSIGNMENT | EXAM   → result !== null ? GRADED : AWAITING
```

Invariant: `totals.delivered = totals.awaiting + totals.graded`; same for `tabCounts.all`.

### Counts (derived per request)

| Count | Filters applied |
|-------|-----------------|
| `totals.{delivered, awaiting, graded}` (cards) | `classId` |
| `tabCounts.{all, awaiting, graded}` (tabs) | `classId`, `q` |
| `total` (the "M" of "Exibindo N de M") | `classId`, `q`, `tab` |

### Order and cursor

`deliveredAt` desc, then `id` asc; keyset cursor `{ name: deliveredAt ISO, id }` (research HI5).

## Changed internal shapes (no schema change)

- `StudentActivityInput` (`activities/views/student-view.ts`) gains `firstCompletedAt: Date | null` (EXERCISE: attempt
  1's `completedAt`; null otherwise), filled by `toInput` in `student-activity-loader.ts` from the attempt rows it
  already selects. Not exposed by `toStudentSummary` (the 012 summary is unchanged).
