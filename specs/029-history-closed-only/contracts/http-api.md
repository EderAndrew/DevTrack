# HTTP API: Histórico só com provas e trabalhos encerrados ou cancelados (029)

No new route. Pipeline, permissions and error shape as today. Changes to three student reads.

## `GET /me/history`

Query (`StudentHistoryQuerySchema`): `tab` gains `"CANCELLED"` (`AWAITING` | `GRADED` | `MISSED` | `CANCELLED`); the rest
as 028.

Rows: only ASSIGNMENT/EXAM whose activity is CLOSED or CANCELLED (research HC1); a cancelled one only when published
before its cancellation and released to the student (HC2).

```ts
StudentHistoryItem = StudentActivitySummary & {
  situation: "AWAITING" | "GRADED" | "MISSED" | "CANCELLED";
  deliveredAt: string | null;   // the submission; null without one (MISSED, a held exam, a cancelled one not delivered)
  endedAt: string;              // closedAt (CLOSED) or cancelledAt (CANCELLED) — replaces 028's `missedAt`
}

StudentHistoryPage = {
  items; nextCursor; total;
  tabCounts: { all, awaiting, graded, missed, cancelled };          // classId + q; all = the sum
  totals:    { delivered, awaiting, graded, missed, cancelled };    // classId only; delivered = awaiting + graded
}
```

Invariants: `situation = "GRADED"` ⇒ `deliveredAt ≠ null`; `situation = "MISSED"` ⇒ `deliveredAt = null`;
`situation = "CANCELLED"` ⇒ `result = null` and `points = null`; `totals.delivered = totals.awaiting + totals.graded`
(a held CLOSED exam is AWAITING with `deliveredAt = null` and counts there); no item is an EXERCISE; order
`deliveredAt ?? endedAt` desc, then id asc.

## `GET /me/activities`

- Items: every visible EXERCISE and every ACTIVE ASSIGNMENT/EXAM, in any 012/013 status; never a CLOSED or CANCELLED
  work or exam.
- `status` accepts `PENDING`, `IN_PROGRESS`, `OVERDUE`, `COMPLETED` again (`COMPLETED` = SUBMITTED + GRADED +
  COMPLETED); `OVERDUE` lists every overdue item of the list.

## `GET /me/dashboard`

- `counts.pending`, `inProgress`, `overdue`: the list's items by status (overdue includes those no longer accepting a
  submission).
- `counts.completed`: the number of history rows with the same `classId` (all situations).
- `next`, `overdueOpen`, `rankings`: unchanged.

## Unchanged

Every other student route answers `404` for a cancelled activity, as today (`student_access.denied`, reason
`CANCELLED`). `GET /me/classes` unchanged.

## `packages/contracts` changes

- `activities/enums.ts`: `StudentHistorySituationSchema` += `"CANCELLED"`; `StudentActivityFilterSchema` += `"COMPLETED"`.
- `activities/student.ts`: `StudentHistoryItemSchema` (`missedAt` → `endedAt`, the refine of the invariants above);
  `tabCounts`/`totals` += `cancelled`.
