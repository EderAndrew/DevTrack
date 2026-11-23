# HTTP API: Histórico do aluno redesenhado (028)

One new read route. Pipeline, permission and error shape as every student route (`{statusCode, code, message}`).
`GET /me/classes` does not change. `GET /me/activities` and `GET /me/dashboard` change only by the amendment of
2026-11-23 (spec FR-022–FR-025, research HI11–HI13; see the end of this file).

## `GET /me/history` — "Histórico"

Permission: `atividades.proprias.visualizar`. Identity from the session only. Not `@MobileAccess()` (a bearer gets
`403 MOBILE_ROUTE_NOT_ALLOWED`, 024).

Query (`StudentHistoryQuerySchema`, strict — any other parameter → `400`):

| Param | Type | Meaning |
|-------|------|---------|
| `tab` | `"AWAITING"` \| `"GRADED"` | optional; absent = all |
| `q` | string, trimmed, ≤ 100 chars, no NUL | optional; empty after trim = no search; contains, case/accent-insensitive, title only (research HI6) |
| `classId` | UUID | optional; an ACTIVE enrollment of the student (026/027) |
| `cursor` | string ≤ 200 | opaque, from `nextCursor`; meaningful only with the same `tab`, `q`, `classId` |
| `pageSize` | 1–50 | default 20 (`STUDENT_ACTIVITIES_PAGE_SIZE`) |

Response `200 StudentHistoryPage`:

```ts
{
  items: StudentHistoryItem[];        // newest delivery first (deliveredAt desc, id asc)
  nextCursor: string | null;
  total: number;                      // rows matching classId + q + tab (the "M")
  tabCounts: { all: number; awaiting: number; graded: number };   // classId + q
  totals: { delivered: number; awaiting: number; graded: number }; // classId only (the cards)
}

StudentHistoryItem = StudentActivitySummary & {
  deliveredAt: string;               // ISO; submission, or the exercise's attempt-1 conclusion (HI4)
  situation: "AWAITING" | "GRADED";  // HI3
}
```

Invariants: `totals.delivered = totals.awaiting + totals.graded`; `tabCounts.all = tabCounts.awaiting +
tabCounts.graded`; `total = tabCounts[tab ?? all]`; `result` is non-null only when `situation = "GRADED"` and the item
is an ASSIGNMENT/EXAM; never a grade or feedback before the release with complete grading.

Errors:

- `400 VALIDATION_ERROR` — unknown `tab`, `q` over 100 characters or with NUL, `classId` not a UUID, bad `pageSize`,
  unknown parameter; before any database access.
- `400` — a `cursor` that doesn't decode (as `/me/activities`).
- `401` / `403` — no session / unverified / without `atividades.proprias.visualizar` (pipeline of today).
- `404 NOT_FOUND` — `classId` without an ACTIVE enrollment of the student: another student's class, an ended
  enrollment, a class that doesn't exist; identical bodies; not audited (026 D2).

## `packages/contracts` changes

- `activities/enums.ts`: `StudentHistorySituationSchema = z.enum(["AWAITING", "GRADED"])` (also the `tab` values).
- `activities/student.ts`: `STUDENT_HISTORY_SEARCH_MAX = 100`; `StudentHistoryQuerySchema`, `StudentHistoryItemSchema`
  (`StudentActivitySummarySchema.extend({ deliveredAt, situation })`), `StudentHistoryPageSchema` and their types.
- `endpoints.ts`: `"myActivities.history": { method: "GET", path: "/me/history", query: StudentHistoryQuerySchema,
  response: StudentHistoryPageSchema, status: 200 }`.
- No user-facing text in the package (XXVI).

## Permission matrix

| Route | Permission | Context |
|-------|------------|---------|
| `GET /me/history` | `atividades.proprias.visualizar` (grades inside items only with `notas.proprias.visualizar`) | own ACTIVE enrollments; with `classId`, that one |

## Amendment 2026-11-23 — concluded activities only in the Histórico

`GET /me/history`:

- `tab` gains `"MISSED"`; `StudentHistorySituationSchema = z.enum(["AWAITING", "GRADED", "MISSED"])`.
- `StudentHistoryItem`: `deliveredAt: string | null` (null only for `MISSED`), new `missedAt: string | null` (non-null
  only for `MISSED`, research HI11), `situation` with `MISSED`; a `MISSED` item has `result: null` and, for an exercise,
  the points as the list shows them.
- `tabCounts: { all, awaiting, graded, missed }` with `all = awaiting + graded + missed`; `totals` gains
  `missed` (classId only), never added to `delivered`.
- Order: `deliveredAt ?? missedAt` desc, then id asc.

`GET /me/activities`: never returns an item that is delivered (`SUBMITTED`, `GRADED`, `COMPLETED`) or missed (HI11);
`status` accepts `PENDING`, `IN_PROGRESS`, `OVERDUE` (`COMPLETED` → `400 VALIDATION_ERROR`); `OVERDUE` lists only the
overdue that still accept a submission.

`GET /me/dashboard`: `counts.overdue` = overdue that still accept a submission; `counts.completed` = the deliveries
(SUBMITTED + GRADED + COMPLETED), unchanged in meaning; `next` and `overdueOpen` unchanged.

