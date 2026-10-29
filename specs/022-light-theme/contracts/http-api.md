# HTTP API Contract: 022 — Tema claro opcional

Shapes live in `packages/contracts/src/me/`, cataloged in `endpoints.ts`. Unsafe methods need `Origin`
and `Content-Type: application/json`. Bodies are strict: unknown fields → `400`.

```ts
UiTheme = "DARK" | "LIGHT"                       // UiThemeSchema, me/preferences.ts
UpdatePreferencesRequest = { theme: UiTheme }    // strict
PreferencesView = { theme: UiTheme }             // strict
```

## Own account (changed)

| Method & path | Access | Change |
|---|---|---|
| `GET /me` | session (`@AllowUnverified`) | `MeView` gains `theme: UiTheme` (`DARK` for an account that never chose). |
| `POST /auth/login` | public | The `user: MeView` of the response gains `theme` (same schema). |

## Own account: preferences (new)

| Method & path | Access | Body | Response | Errors |
|---|---|---|---|---|
| `PATCH /me/preferences` | session (`@AllowUnverified`, no permission, the session's own user) | `UpdatePreferencesRequest` | `200 PreferencesView` | `401` no valid session; `400 VALIDATION_ERROR` (missing/unknown `theme`, extra field, not JSON); `403 ORIGIN_NOT_ALLOWED` |

- Catalog key: `"me.preferences.update"`.
- Writing the stored value again answers `200` with it and changes nothing; concurrent writes of the same
  account: the last one wins.
- No audit event (`audit_events` gets no row); no log beyond the request log every route has.
- Never takes a user id; never changes roles, sessions, grades or anything but `users.theme`.
