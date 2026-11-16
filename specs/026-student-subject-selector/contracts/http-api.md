# HTTP API: Matéria atual do aluno (026)

All routes exist already (012/003); this feature adds one optional query parameter to two of them and one response
field to the third. Pipeline, permissions and error shape are unchanged (`{statusCode, code, message}`).

## `GET /me/activities` — "Minhas atividades" (012)

Query (`StudentActivityListQuerySchema`, strict):

| Param | Type | Change |
|-------|------|--------|
| `status` | `StudentActivityFilter` | unchanged |
| `type` | `ActivityType` | unchanged |
| `cursor` | string ≤ 200 | unchanged; a cursor is only meaningful with the same `classId` |
| `pageSize` | 1–50 | unchanged |
| `classId` | UUID | **new, optional**: only the activities of this class |

Responses:

- `200 StudentActivityPage` — without `classId`, exactly as before (SC-005); with it, only items whose `class.id` is
  `classId`, in the same order and paging.
- `400 VALIDATION_ERROR` — `classId` not a UUID (before any database access).
- `403` — without `atividades.proprias.visualizar` (unchanged).
- `404 NOT_FOUND` — `classId` where the session student has no ACTIVE enrollment: another student's class, an ended
  enrollment, a class that doesn't exist. The three are identical; nothing is audited (research D2).

## `GET /me/dashboard` — "Painel" (012/013)

Query (**new** `StudentDashboardQuerySchema`, strict): `{ classId?: UUID }`. Any other parameter → `400`.

Responses:

- `200 StudentDashboard` — without `classId`, exactly as before; with it, `counts`, `next`, `overdueOpen` count only
  that class, and `rankings` holds at most that class's block (only an ACTIVE class, only with
  `ranking.turma.visualizar`, research D4). `firstName` and `serverNow` unchanged.
- `400`, `403`, `404` — as in `GET /me/activities`.

## `GET /me/classes` — "Minhas turmas" (003)

`MyClassViewSchema` gains one field:

```ts
subjectName: string | null; // the class's subject; null for a class without a subject (pre-004)
```

Order and filter unchanged: ACTIVE enrollments, most recent first.

## `packages/contracts` changes

- `activities/student.ts`: `StudentActivityListQuerySchema` += `classId: UuidSchema.optional()`; new
  `StudentDashboardQuerySchema = z.strictObject({ classId: UuidSchema.optional() })` and its type.
- `classes/my-classes.ts`: `MyClassViewSchema` += `subjectName: z.string().nullable()`.
- `endpoints.ts`: `myActivities.dashboard` gains `query: StudentDashboardQuerySchema`.
- No user-facing text in the package (XXVI).

## Permission matrix (unchanged)

| Route | Permission | Context |
|-------|------------|---------|
| `GET /me/activities` | `atividades.proprias.visualizar` | own ACTIVE enrollments; with `classId`, that one |
| `GET /me/dashboard` | `atividades.proprias.visualizar` (+ `ranking.turma.visualizar` for the ranking block) | idem |
| `GET /me/classes` | as today (003) | own ACTIVE enrollments |
