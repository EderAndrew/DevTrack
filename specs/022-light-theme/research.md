# Research: 022 — Tema claro opcional

Decisions carry the prefix **Z**. The design system itself (tokens, scales, components, the guards) is
005's (research V1–V8) and its rules do not change; this feature adds a second set of color values and
the user's choice.

## Z1 — The preference is a column of the user

**Decision**: a Prisma enum `UiTheme` (`DARK`, `LIGHT`, mapped to the PostgreSQL type `ui_theme`) and
`users.theme ui_theme NOT NULL DEFAULT 'DARK'`, in one migration. Existing accounts get `DARK` (no visible
change, spec Assumptions).

**Rationale**: one value per account (spec Key Entities), read with the data the screens already load
(`GET /me`), so no join and no new table. `NOT NULL DEFAULT 'DARK'` encodes "never chose = dark" (FR-003)
without a third state the UI would have to explain. An enum and not a free text: the two values are a
fixed contract of the UI, not domain data (XXI concerns subjects, languages and technologies).

**Alternatives considered**: a nullable column (null = never chose: a distinction the spec does not use);
a `user_preferences` table (one row per user for one value; worth it only when there are several
preferences); a cookie only (rejected by the user: the choice must follow the account across devices,
US2).

## Z2 — One route of the own account, session access like `GET /me`

**Decision**: `PATCH /me/preferences` with the strict body `{ theme: "DARK" | "LIGHT" }` and the response
`{ theme }` (200). `@AllowUnverified()` and no `@RequirePermissions()`, the same declaration as `GET /me`
(`access: "session"` in `authorization-matrix.ts`): any valid session, only the session's own user, no
user id in the path or body. The service is `MeService.updatePreferences(userId, body)`: one
`UPDATE users SET theme = $1 WHERE id = $2`; writing the value already stored is a no-op that still
answers 200 (idempotent, last write wins). No audit event and no extra log (FR-015).

**Rationale**: the preference is part of the user's own identity data, like reading `/me`; a permission
(`perfil.preferencias.alterar` seeded to every role) would add a matrix row that every role has, with no
case where it is denied, and would block an unverified user, which FR-005 allows. The constitution's II
asks for explicit permissions on **protected** operations over resources; the own account's cosmetic
preference has no resource context beyond "the session's user" — the same precedent as `GET /me` and the
two session-only writes of the own account, `POST /auth/logout` and `POST /auth/logout-all`
(`access: "session"` in `authorization-matrix.ts`). The own sessions' list and revocation
(`/me/sessions`) do carry `sessoes.proprias.*`, but they need a verified e-mail, which FR-005 does not;
the user chose the session-only access on 2026-10-29 (`/speckit-analyze` D1). The usual write protections stay (OriginGuard + JSON, 001 R6; SessionGuard 401;
ZodValidationPipe 400).

**Alternatives considered**: `PATCH /me` (the identity view has fields the user cannot change — roles,
email — and a body with only `theme` reads oddly there); `PUT /me/theme` (one route per preference;
`preferences` leaves room without a new route); a permission per role (see above).

## Z3 — `MeView` carries the theme

**Decision**: `MeViewSchema` gains `theme: UiThemeSchema` (`z.enum(["DARK", "LIGHT"])` in
`packages/contracts/src/me/preferences.ts`), so `GET /me` and the login response (`user: MeView`) both
carry it. `UpdatePreferencesRequestSchema = z.strictObject({ theme: UiThemeSchema })` and
`PreferencesViewSchema = z.strictObject({ theme: UiThemeSchema })`; the route enters `endpoints.ts` as
`"me.preferences.update"`.

**Rationale**: the screens already read `/me` on the server for the menu; the theme comes with it, so
no extra request decides the theme (FR-008). One enum defined once (XXVI).

**Alternatives considered**: a separate `GET /me/preferences` (one more request per page, on the
critical path of the first paint).

## Z4 — The server renders the theme on `<html>`; no flash

**Decision**: the root layout (`app/layout.tsx`) reads `getMeForNavigation()` and renders
`<html lang="pt-BR" data-theme={me?.theme === "LIGHT" ? "light" : "dark"}>`. `getMe` is wrapped in
React's `cache()` so the root layout, the group layouts and the page share one `GET /me` per request.
Without a valid session (no cookie, 401, any failure) `me` is null → `dark` (FR-004, SC-007).

**Rationale**: the attribute is in the first HTML byte the browser paints, so there is no frame in the
wrong theme (FR-008, SC-003) and no inline script reading storage before paint. It must be on `<html>`:
dialogs, menus, tooltips and toasts render in portals under `<body>`, outside any wrapper a route group
could add. Only the root layout renders `<html>`, so it is the only place that can decide.

**Consequences**: the root layout becomes dynamic (it reads the request's cookies), so the public pages
are rendered per request too, and a visitor with any cookie triggers one `GET /me` (401 without a
session). The pages with a session were already dynamic. Accepted for the beta's scale; noted in
Complexity Tracking.

**Alternatives considered**: a theme cookie mirrored from the account and read by the root layout
(cheaper, but a second source of truth that can disagree with the account after another device changes
it, and that survives a session expiry, breaking FR-004); an inline script with `localStorage`
(per-browser, US2 fails); a client-only switch after hydration (flashes, FR-008 fails); one root layout
per route group (a full reload between groups).

## Z5 — Tokens: the light block overrides the same names

**Decision**: `design-system/tokens.css` keeps `:root { … }` exactly as it is (the dark theme and every
non-color token, SC-005) and adds `:root[data-theme="light"] { … color-scheme: light; }` with a value for
every color token the dark block declares (FR-010), nothing else. The shadcn aliases (`--card:
var(--surface)`, `--sidebar-*`, …) stay in `:root`: both selectors match the same element, so the aliases
resolve to the light values without being repeated. `@theme inline` already maps every utility to
`var(--x)`, so `bg-surface`, `text-foreground` and the rest follow the attribute at runtime; no
component changes (FR-012). Nothing reads `prefers-color-scheme` (FR-003).

**Rationale**: the 005 architecture was built for this ("trocar a paleta muda só valores de tokens");
one selector keeps the light theme from leaking into a nested element and keeps the CSS scan simple.

**Alternatives considered**: `[data-theme="light"]` on any element (would need the aliases repeated in
that block, since an alias declared on `:root` inherits already resolved; only useful for side-by-side
previews, which Z8 avoids); Tailwind `dark:` variants (a per-component change, against FR-012).

## Z6 — The light values

**Decision**: built from the palette (#E63946, #F1FAEE, #A8DADC, #457B9D, #1D3557) as FR-009 asks — the
original colors where nothing is read on them, darker derived tones where text sits on or over them:

| Token | Light | From | Note |
|-------|-------|------|------|
| `--background` | `#f1faee` | F1FAEE | page |
| `--surface` | `#ffffff` | — | cards, menu, dialogs |
| `--foreground` | `#1d3557` | 1D3557 | 11.6:1 on the page |
| `--text-secondary` | `#4a5f78` | 1D3557 lightened | ≥ 4.5 on page and surface |
| `--primary` | `#c1121f` | E63946 darkened | E63946 is 3.9:1 on the page |
| `--primary-foreground` | `#ffffff` | — | on `--primary` and `--primary-hover` |
| `--primary-hover` | `#a00f1a` | E63946 darkened | |
| `--primary-strong` | `#8a0d17` | E63946 darkened | text on `--primary-subtle` |
| `--primary-subtle` | `#fde2e4` | E63946 tint | menu item active, selection |
| `--brand-secondary` | `#2f6585` | 457B9D darkened | "Track" of the wordmark; 457B9D is 4.3:1 |
| `--border` | `#a8dadc` | A8DADC | decorative borders |
| `--border-control` | `#457b9d` | 457B9D | control borders (3:1) |
| `--ring` | `#457b9d` | 457B9D | focus ring (3:1) |
| `--success` / `-text` / `-surface` | `#2e7d4f` / `#1f6b3f` / `#dcf2e3` | — | state greens |
| `--warning` / `-text` / `-surface` | `#a86200` / `#8a4f00` / `#fcefd6` | — | state ambers |
| `--danger` / `-text` / `-surface` / `-foreground` | `#c62833` / `#b01f2b` / `#fde2e4` / `#ffffff` | E63946 family | |
| `--info` / `-text` / `-surface` | `#457b9d` / `#2f6585` / `#dcf0f1` | 457B9D, A8DADC tint | |
| `--disabled-bg` / `-fg` / `-border` | `#e4ebe6` / `#5d6b78` / `#c5d3cf` | — | |
| `--overlay` | `rgb(29 53 87 / 0.45)` | 1D3557 | dialog scrim |
| `--syntax-keyword` | `#6a32a8` | — | purple |
| `--syntax-string` | `#1f6b3f` | — | green |
| `--syntax-number` | `#8a4f00` | — | amber |
| `--syntax-comment` | `#5a6878` | — | grey-blue |
| `--syntax-type` | `#1f5a7a` | 457B9D darkened | |
| `--syntax-function` | `#a3195b` | — | magenta |
| `--syntax-operator` | `#b01f2b` | E63946 darkened | |
| `--syntax-punctuation` | `#3b4a5c` | — | |
| `--chart-1` | `#457b9d` | 457B9D | marks, ≥ 3:1 |

Checked with the 005/014 rules before writing this plan: the 76 pairs `test/contrast.test.ts` checks
(texts and the four states on both surfaces, each `-text` on its `-surface`, the foregrounds on
`--primary`, `--primary-hover` and `--danger`, `--primary-strong` on `--primary-subtle`, the graphics at
3:1, and the eight syntax colors plus `--foreground` on the page, a surface, the selection and the
disabled editor) all pass; the tightest margin is 0.16 over the minimum.

**Rationale**: the user's palette carries the identity (page, borders, focus, info, charts, wordmark
hue); the darker derived tones keep AA where the originals fail (FR-009). The syntax colors need eight
distinguishable hues, more than the palette has (spec Assumptions).

**Alternatives considered**: #E63946 as `--primary` with dark text on it (navy on red is 3.0:1 — fails);
a navy menu (`--sidebar: #1d3557`) — appealing, but then every sidebar alias needs its own foreground,
accent and border pairs checked; left for a later visual pass, the aliases keep the menu on `--surface`.

## Z7 — The switch in "Meu perfil": optimistic, then the server render

**Decision**: `features/profile` gains `api/preferences.ts` (`updatePreferences` through `lib/api`),
`hooks/use-update-theme.ts` (TanStack mutation) and `components/appearance-settings.tsx`: the section
"Aparência" with the 005 `RadioGroup` ("Escuro", "Claro"), checked from `me.theme`. On change: set
`document.documentElement.dataset.theme` at once (SC-001), send the mutation (the group disabled while it
is pending, `aria-busy`), then on success update the `me` query data and `router.refresh()` so the server
render agrees; on failure put the previous value back on `<html>` and in the group and show "Não foi
possível salvar a aparência. Tente de novo." (`role="alert"`). A `401` follows the app's existing
session-expired handling. The page `/conta/perfil` renders it for every session (FR-005, also unverified).

**Rationale**: the user sees the change in the same frame (SC-001); the server stays the authority (III);
`router.refresh()` re-renders the root layout, so the next soft navigation does not bring the old
attribute back. Writing `dataset.theme` is a DOM side effect in a hook, not a business rule in a
component (VIII).

**Alternatives considered**: waiting for the response before switching (slower on a bad network, SC-001
at risk); a full reload (FR-007 says without reloading).

## Z8 — Login, logout and other sessions

**Decision**: the login form and the logout already call `router.refresh()` after navigating
(`login-form.tsx`, `logout-button.tsx`), which re-renders the root layout: the new user gets their theme,
and the login page after a logout is dark (US2-3, US2-4). No polling or push: another open session picks
up a change on its next full load (spec US2-2, IX).

**Rationale**: no new mechanism; soft navigations keep the root layout, which is exactly "only on the
next load" from the spec.

## Z9 — The design-system catalog shows both themes with a switch

**Decision**: the catalog page (`/design-system`, out of production) gets a "Tema do catálogo: Escuro |
Claro" switch at the top that sets `document.documentElement.dataset.theme` for the visit only (not
saved, no API call). `catalog.test.tsx` runs axe and the Tab order in both themes.

**Rationale**: dialogs, menus and toasts of the catalog render in portals, which a side-by-side wrapper
would leave in the other theme; switching `<html>` shows every component exactly as the app does
(FR-014).

**Alternatives considered**: two side-by-side panels with `data-theme` wrappers (portals escape, and the
aliases would need repeating, Z5).

## Z10 — Guards and tests

**Decision**:
- `test/contrast.test.ts`: `THEMES` gains `claro: { ...dark, ...blockTokens(css, /:root\[data-theme="light"\]\s*\{/) }`
  (the aliases resolve through the dark block's `var()`s, as in the browser); the 76 pairs run for both.
  The old test "um só tema" becomes "005/FR-013 022/FR-002 022/FR-003": no `prefers-color-scheme`, the
  dark block's values equal a frozen copy of today's values (SC-005), `color-scheme: dark` in `:root` and
  `color-scheme: light` in the light block, and every color token of `:root` has a light value (FR-010,
  SC-006).
- `test/design-system/token-usage.test.ts` keeps scanning for literal colors (FR-012); the light block is
  inside `tokens.css`, the only file allowed literals.
- API: `test/integration/022-preferences.spec.ts` (401, 400 for each invalid body, 200 and `GET /me`
  reflecting it, unverified allowed, no audit row, idempotent repeat, Origin refused) and the matrix row
  `{ method: "PATCH", path: "/me/preferences", access: "session" }`; the endpoint catalog entry.
- Web: `appearance-settings.test.tsx` (checked from `me`, immediate switch, revert and message on failure,
  axe), the root layout's attribute for `LIGHT`, `DARK` and no session.
- E2E `light-theme.spec.ts`: choose "Claro", reload (no dark frame: `data-theme` is `light` in the
  first HTML response), log in from a new browser context (still light), log out (dark `/entrar`).
- `apps/api/test/traceability.spec.ts`: 022 joins `SPECS` at the first phase.
