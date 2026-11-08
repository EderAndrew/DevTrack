# HTTP API: 025

Shapes are Zod schemas in `packages/contracts/src/exam-nudges/` (new domain) with one `endpoints.ts` entry per route.
Errors are `{statusCode, code, message}`; dates ISO strings. New error codes: `EXAM_NUDGE_NOT_ALLOWED`,
`EXAM_NUDGE_NOT_PENDING`, `MOBILE_SESSION_REQUIRED`.

## Schemas

```ts
// exam-nudges/nudge.ts
ExamNudgeStatusSchema = z.enum(["PENDING", "DISMISSED", "UNSEEN"]);
TeacherExamNudgeSchema = z.strictObject({ id: Uuid, sentAt: IsoDateTime, dismissedAt: IsoDateTime.nullable(), status: ExamNudgeStatusSchema });
ExamNudgeSummarySchema = z.strictObject({ canSend: z.boolean(), pendingSince: IsoDateTime.nullable(), sentCount: z.int().min(0), lastDismissedAt: IsoDateTime.nullable() });
SendExamNudgeRequestSchema = z.strictObject({});            // body is exactly {}
SendExamNudgeResponseSchema = z.strictObject({ nudge: TeacherExamNudgeSchema });
StudentExamNudgeSchema = z.strictObject({ nudge: z.strictObject({ id: Uuid, studentName: z.string() }).nullable() });
DismissExamNudgeRequestSchema = z.strictObject({});
```

Changed shapes (fields added, nothing removed):

- `ExamMonitorStudentSchema` (`exam-sessions/monitor.ts`) + `nudge: ExamNudgeSummarySchema.nullable()` — null when
  the student has no attempt.
- `IntegrityTimelineSchema` (`attempt-integrity/views.ts`) + `nudges: z.array(TeacherExamNudgeSchema)` — EXAM only,
  oldest first; empty for works.

## Routes

| Method & path | Access | Body | Success | Errors |
|---|---|---|---|---|
| `POST /classes/:classId/activities/:activityId/attempts/:attemptId/exam-nudges` | `chamada.registrar` + `provas.avisos.enviar`, `@MobileOnly()` (implies `@MobileAccess()`) | `{}` | `201 SendExamNudgeResponse` (created) · `200` (a pending one already existed: the same nudge, no event) | `400` (extra fields), `401`, `403` (no permission; `MOBILE_SESSION_REQUIRED` with a web session), `404` (other teacher's class, not an EXAM, attempt not of this activity), `409 EXAM_NUDGE_NOT_ALLOWED` (not running, held, paused, < 2 occurrences), `429` (`mobile-writes`) |
| `GET /me/activities/:activityId/attempt/exam-nudge` | `atividades.proprias.responder` | — | `200 StudentExamNudge` — `nudge` only when `shown` (N6), else `null` | `401`, `403`, `404` (no own attempt, not present, not an EXAM: same as the 018 student routes) |
| `POST /me/activities/:activityId/attempt/exam-nudge/:nudgeId/dismiss` | `atividades.proprias.responder` | `{}` | `200 StudentExamNudge` with `nudge: null` (also when already dismissed, no event) | `400`, `401`, `403`, `404` (nudge not of the own attempt), `409 ATTEMPT_PAUSED`, `409 EXAM_ATTEMPT_ON_HOLD`, `409 EXAM_NUDGE_NOT_PENDING` (attempt ended) |

The two student routes are web-only (a bearer → `403 MOBILE_ROUTE_NOT_ALLOWED`). Unsafe methods need the allowed
`Origin` and `Content-Type: application/json` as usual; the mobile send follows the 024 bearer rule (no `Origin`).

## `@MobileOnly()` (research N3)

`SessionGuard`: on a route marked `@MobileOnly()`, a cookie (WEB) session → `403 MOBILE_SESSION_REQUIRED`, before
`PermissionsGuard`. A bearer is accepted as on every `@MobileAccess()` route. `024-mobile-allowlist.spec.ts` gains the
send route; a new `025-mobile-only.spec.ts` checks the web refusal.

## Permission matrix (`authorization-matrix.ts`)

| Route | ADMIN | MANAGER | TEACHER | STUDENT |
|---|---|---|---|---|
| `POST …/exam-nudges` (MOBILE session) | — (no MOBILE session) | — | 201/200 own class · 404 other | — |
| `POST …/exam-nudges` (WEB session) | 403 | 403 | 403 `MOBILE_SESSION_REQUIRED` | 403 |
| `GET /me/…/exam-nudge` | 403 | 403 | 403 | 200 own · 404 other |
| `POST /me/…/exam-nudge/:id/dismiss` | 403 | 403 | 403 | 200 own · 404 other |
