# HTTP API: Histórico do aluno redesenhado (028)

One new read route. Pipeline, permission and error shape as every student route (`{statusCode, code, message}`).
`GET /me/activities`, `GET /me/dashboard` and `GET /me/classes` do not change (spec FR-016, SC-005).

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
