# Permissions: 022

No new permission and no audit event.

| Route | Access | Who |
|---|---|---|
| `PATCH /me/preferences` | `session` (as `GET /me`) | Any valid session (ADMIN, MANAGER, TEACHER, STUDENT), including an unverified e-mail; always the session's own user. |

New row in `apps/api/test/security/authorization-matrix.ts`:
`{ method: "PATCH", path: "/me/preferences", access: "session" }` — no session `401`, every role `200`.
