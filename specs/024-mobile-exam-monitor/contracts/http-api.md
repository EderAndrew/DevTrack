# HTTP API: 024

Every shape is a Zod schema in `packages/contracts/src/mobile/` (new domain) and every route has one entry in
`endpoints.ts`. Errors are `{statusCode, code, message}`. Dates are ISO strings.

## Authentication of the app (research Y3, Y4)

- The app sends `Authorization: Bearer <secret>` on every request; it never sends or keeps a cookie.
- A bearer is accepted only for a `MOBILE` session and only on routes marked `@MobileAccess()` (the table below
  and the 018 reads listed after it); any other route with a bearer → `403 MOBILE_ROUTE_NOT_ALLOWED`. A cookie is
  accepted only for a `WEB` session.
- `OriginGuard`: `POST /auth/mobile/sessions` (`@MobileEntry()`) accepts a request with no `Origin` (an `Origin`
  present must be allowed); a bearer request without a session cookie on a `@MobileAccess()` route needs no
  `Origin`. Both still require `Content-Type: application/json` (`{}` when there is no body). Web routes and the
  cookie path are unchanged.

## New routes

| Method & path | Access | Body / query | Success | Errors |
|---|---|---|---|---|
| `POST /auth/mobile/sessions` | `@Public()`, `@MobileEntry()` | `MobileLoginRequestSchema` `{ email, password }` (same rules as `LoginRequestSchema`) | `201 MobileSessionSchema` `{ token, expiresAt, user: MeView }` — `token` is the only place the secret ever appears | `401 INVALID_CREDENTIALS` (generic, same as the web), `429` (same scopes as the web login), `403 ACCOUNT_SUSPENDED` (same rule as the web), `403 MOBILE_NOT_ALLOWED` (correct password but no `chamada.registrar`, unverified e-mail or not ACTIVE; no session created) |
| `DELETE /auth/mobile/sessions/current` | MOBILE session, `@MobileAccess()` | `{}` | `204` — session revoked (`LOGOUT`) and its device deleted | `401` |
| `PUT /mobile/device` | MOBILE session, `@MobileAccess()` | `RegisterMobileDeviceRequestSchema` `{ pushToken, platform: "ANDROID" \| "IOS" }` (strict; token regex of data-model) | `200 MobileDeviceSchema` `{ id, platform }` — upsert for the current session; a token linked to another session moves here | `400`, `401`, `429` (`mobile-writes`) |
| `GET /mobile/exams` | `chamada.registrar`, `@MobileAccess()` | — | `200 MobileExamListSchema` `{ items: [{ activityId, classId, className, title, closesAt, muted }] , serverNow }` — the teacher's EXAM activities in progress, by `closesAt` | `401`, `403` |
| `PUT /classes/:classId/activities/:activityId/exam-alerts` | `chamada.registrar`, `@MobileAccess()` (also callable from the web session) | `ExamAlertPreferenceRequestSchema` `{ muted: boolean }` (strict) | `200 ExamAlertPreferenceSchema` `{ muted }` — idempotent | `400`, `401`, `403`, `404` (another teacher's class, not an EXAM, archived class), `429` (`mobile-writes`) |

## 018/015 reads opened to the app (`@MobileAccess()` added, nothing else changes)

| Method & path | Permission | Use in the app |
|---|---|---|
| `GET /me` | session | user and `theme` (022) |
| `GET /classes/:classId/activities/:activityId/exam-monitor` | `chamada.registrar` | the room, polled every 5 s |
| `GET /classes/:classId/activities/:activityId/attempts/:attemptId/integrity` | the permission it already has | a student's occurrences (`occurrenceOrdinal`) |

The decision routes (`…/exam-holds/:holdId/{cancel,return,keep}`), attendance, pauses and every other route stay
web-only (`403 MOBILE_ROUTE_NOT_ALLOWED` with a bearer, FR-010).

## Rate limits

- `mobile-writes`: `PUT /mobile/device` and `PUT …/exam-alerts`, `RATE_LIMIT_MOBILE_WRITES_PER_MINUTE` (default 30)
  per user, counted in `rate_limit_counters` like the other writes.
- The mobile login shares the web login scopes and thresholds (`login:email_origin`, `login:origin`,
  `login:email`).

## Permission matrix (`authorization-matrix.ts`)

| Route | ADMIN | MANAGER | TEACHER | STUDENT | Bearer on a web-only route |
|---|---|---|---|---|---|
| `POST /auth/mobile/sessions` | 403 `MOBILE_NOT_ALLOWED`* | 403 `MOBILE_NOT_ALLOWED` | 201 | 403 `MOBILE_NOT_ALLOWED` | — |
| `GET /mobile/exams` | 403 | 403 | 200 (own classes) | 403 | — |
| `PUT …/exam-alerts` | 403 | 403 | 200 own / 404 other | 403 | — |
| `PUT /mobile/device`, `DELETE /auth/mobile/sessions/current` | — (no MOBILE session) | — | 200 / 204 | — | — |
| Any route without `@MobileAccess()` | | | | | 403 `MOBILE_ROUTE_NOT_ALLOWED` |

\* unless the account also holds `chamada.registrar` (a teacher who is also ADMIN gets in, as a teacher).

No new permission is created; the app uses `chamada.registrar`, the permission of the web room.
