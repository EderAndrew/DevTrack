# Data Model: 022 — Tema claro opcional

One migration, `apps/api/prisma/migrations/<timestamp>_022_light_theme/migration.sql`.

## Enum `ui_theme` (Prisma `UiTheme`)

| Value | Meaning |
|-------|---------|
| `DARK` | The dark theme (Vice City, 005). Default of every account. |
| `LIGHT` | The light theme (palette of this feature). |

## `users` (changed)

| Column | Type | Rule |
|--------|------|------|
| `theme` | `ui_theme NOT NULL DEFAULT 'DARK'` | New. Written only by `PATCH /me/preferences` for the session's own user. Existing rows get `DARK`. |

- No index (read by primary key with the rest of the user).
- No trigger and no audit: a visual preference (FR-015). Changing it bumps `updated_at` like any write
  to the row.
- No state machine: any value can replace any value; repeating the stored value changes nothing.

## Prisma

```prisma
enum UiTheme {
  DARK
  LIGHT

  @@map("ui_theme")
}

model User {
  // …
  theme UiTheme @default(DARK)
  // …
}
```

## Design tokens (not stored)

A theme is a set of values for the 005 color tokens, in `apps/web/design-system/tokens.css`:

| Selector | Theme | Content |
|----------|-------|---------|
| `:root` | Dark (default) | Unchanged: every color token, the aliases and the non-color tokens, `color-scheme: dark`. |
| `:root[data-theme="light"]` | Light | A value for every color token of `:root` (research Z6), `color-scheme: light`. No alias, no non-color token. |

The `<html>` element carries `data-theme="dark"` or `data-theme="light"`, decided by the server from
`me.theme` (research Z4).
