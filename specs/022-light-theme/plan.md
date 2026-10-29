# Implementation Plan: 022 — Tema claro opcional

**Branch**: `022-light-theme` | **Date**: 2026-10-29 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/022-light-theme/spec.md`

## Summary

A second set of values for the 005 color tokens and the user's choice between them:

- **The preference** (Z1–Z3): `users.theme ui_theme NOT NULL DEFAULT 'DARK'`; `PATCH /me/preferences`
  `{ theme }` for the session's own user (session access like `GET /me`, also unverified; strict body; no
  audit); `MeView` carries `theme`.
- **No flash** (Z4, Z8): the root layout renders `<html data-theme>` from `getMeForNavigation()` (React
  `cache()` shares one `GET /me` per request); no session → `dark`. Login and logout already call
  `router.refresh()`, so the theme follows the account that is signed in.
- **The light theme** (Z5, Z6): `:root[data-theme="light"]` in `tokens.css` with a value for every color
  token, from the palette #E63946 / #F1FAEE / #A8DADC / #457B9D / #1D3557 and darker derived tones where
  text needs them (all 76 contrast pairs pass); the dark `:root` block does not change; no component
  changes.
- **The switch** (Z7): "Aparência" in "Meu perfil" — `RadioGroup` Escuro/Claro, optimistic switch of
  `<html data-theme>`, revert and message on failure, `router.refresh()` on success.
- **Catalog and docs** (Z9): "Tema do catálogo" switch in `/design-system`; 005 FR-013 amended;
  `tokens.md`/`layouts.md` updated.

## Technical Context

**Language/Version**: TypeScript 7 on Node.js 24 LTS (`apps/api` with SWC; `tsc` type-check)
**Primary Dependencies**: NestJS 11, Prisma 7, Zod 4 (`@repo/contracts`); web: Next.js 16, React 19,
TanStack Query 5, Tailwind 4 (`@theme inline`), shadcn/ui, Lucide. **No new dependency.**
**Storage**: PostgreSQL 17 — one migration: enum `ui_theme` and `users.theme NOT NULL DEFAULT 'DARK'`.
**Testing**:
- Vitest (API): `022-preferences.spec.ts` (integration), the matrix row, the endpoint catalog.
- Web: `test/contrast.test.ts` for both themes and the frozen dark values; `appearance-settings.test.tsx`
  (Testing Library + `vitest-axe`); the root layout's attribute; `catalog.test.tsx` in both themes; the
  design-system scans unchanged.
- Playwright E2E `light-theme.spec.ts`.
**Target Platform**: Linux server (API); browser (desktop, phone).
**Project Type**: web service + web app (pnpm/Turborepo monorepo)
**Performance Goals**: the switch shows in < 1 s (SC-001, immediate on the client); `PATCH
/me/preferences` p95 < 50 ms (one UPDATE by primary key); one `GET /me` per page render (shared by
`cache()`).
**Constraints**:
- dark values frozen (FR-002, SC-005); no literal color outside `tokens.css` (FR-012);
- no `prefers-color-scheme`, no `localStorage`, no inline script (FR-003, Z4);
- the theme is decided on the server for the first paint (FR-008);
- no new permission, audit type, configuration or infrastructure (IX).
**Scale/Scope**:
- 1 new route, 2 changed responses (`GET /me`, login's `user`); 1 migration; `auth` (`MeService`,
  `MeController`);
- web: `app/layout.tsx`, `features/auth/api/server.ts` (`cache`), `features/profile`
  (api/hooks/components/schemas), `/conta/perfil`, the catalog page, `tokens.css`, the contrast test and
  docs; 1 E2E.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Security**: the body is strict (one enum field, else 400); OriginGuard + JSON on the PATCH;
  the user is the session's, never from the request (A01); nothing rendered as HTML.
- [x] **II. RBAC**: no protected resource beyond the own account; declared `access: "session"` like
  `GET /me` (Z2), with a matrix row; no role-name check. Justified in Complexity Tracking.
- [x] **III. Server authority**: the stored theme is the server's; the client switch is optimistic and
  reverted on failure; the server render decides the first paint.
- [x] **IV. Untrusted code**: N/A.
- [x] **V. Data integrity**: Prisma migration; `NOT NULL` with a default; enum type.
- [x] **VI. Audit & logs**: not a critical operation (FR-015), so no audit event; nothing logged beyond
  the request log.
- [x] **VII. Tests**: integration, contrast for both themes, frozen dark values, UI, E2E (Z10).
- [x] **VIII. Layering**: thin controller → `MeService`; web `api → hooks → components`; the DOM attribute
  is set in the hook, no business rule in components.
- [x] **IX. Simplicity**: no dependency, no new table, no polling or push; the 005 tokens absorb the theme.
- [x] **X. Evidence**: N/A (no assessment evidence).
- [x] **XI. Human oversight**: N/A.
- [x] **XII. Determinism first**: N/A (no AI).
- [x] **XIII. Risk level**: N/A.
- [x] **XIV–XV. AI governance**: N/A.
- [x] **XVI. Explicit states**: a two-value enum, not a boolean flag; no workflow.
- [x] **XVII. Idempotency**: repeating the stored value is a no-op 200; last write wins.
- [x] **XVIII. Safe interruption**: N/A.
- [x] **XIX. AI evals**: N/A.
- [x] **XX. Pedagogy**: N/A.
- [x] **XXI. Configurable domain**: no subject/language/technology involved; the theme enum is a UI
  contract.
- [x] **XXII. Personalization & accessibility**: AA contrast in both themes (FR-011), forced colors kept;
  the theme is not an assessment adaptation.
- [x] **XXIII. Curricular traceability**: N/A.
- [x] **XXIV. Academic isolation**: no class-scoped resource.
- [x] **XXV. Privileged provisioning**: unchanged; the route changes no role or credential.
- [x] **XXVI. Shared contracts**: `UiThemeSchema`, `UpdatePreferencesRequestSchema`,
  `PreferencesViewSchema` and `MeViewSchema.theme` in `packages/contracts/src/me/`; catalog entry.
- [x] **Frontend stack**: TanStack Query mutation, the 005 `RadioGroup`, Tailwind tokens; code in
  `features/profile`.

**Post-design re-check (after Phase 1)**: unchanged — the design adds one column, one route and one CSS
block, and touches no rule of 012–021.

## Project Structure

### Documentation (this feature)

```text
specs/022-light-theme/
├── plan.md
├── research.md          # Z1–Z10
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   ├── permissions.md
│   └── web-ui.md
├── checklists/requirements.md
└── tasks.md             # /speckit-tasks
```

### Source Code (repository root)

```text
packages/contracts/src/
├── me/preferences.ts                 # UiThemeSchema, UpdatePreferencesRequestSchema, PreferencesViewSchema (new)
├── me/me.ts                          # MeViewSchema.theme
├── endpoints.ts                      # "me.preferences.update"
└── index.ts                          # export

apps/api/
├── prisma/schema.prisma              # enum UiTheme, User.theme
├── prisma/migrations/<ts>_022_light_theme/migration.sql
├── src/modules/auth/me.service.ts    # theme in get(); updatePreferences()
├── src/modules/auth/me.controller.ts # PATCH /me/preferences (@AllowUnverified)
└── test/
    ├── integration/022-preferences.spec.ts
    ├── security/authorization-matrix.ts   # row
    └── traceability.spec.ts               # SPECS += 022

apps/web/
├── app/layout.tsx                    # <html data-theme> from getMeForNavigation()
├── app/(account)/conta/perfil/page.tsx   # <AppearanceSettings>
├── app/(catalog)/design-system/…     # "Tema do catálogo"
├── design-system/tokens.css          # :root[data-theme="light"] block
├── design-system/{tokens,layouts,README}.md
├── features/auth/api/server.ts       # getMe wrapped in cache()
├── features/profile/
│   ├── api/preferences.ts
│   ├── hooks/use-update-theme.ts
│   ├── components/appearance-settings.tsx (+ .test.tsx)
│   └── schemas/appearance.ts         # labels and the failure message
├── features/design-system/components/catalog-theme-switch.tsx
├── test/contrast.test.ts             # both themes, frozen dark values
└── e2e/light-theme.spec.ts

specs/005-design-system/spec.md       # FR-013 amendment 2026-10-29
```

**Structure Decision**: the existing monorepo; the preference lives with the own-account routes in
`modules/auth` (`MeService`), the switch in `features/profile`, the theme values in `tokens.css`.

## Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|-----------|------------|--------------------------------------|
| `PATCH /me/preferences` without an explicit permission (II) | The own account's cosmetic preference, available to every role and to an unverified e-mail (FR-005); same declaration as `GET /me` and logout | A permission granted to every role is never denied and would block unverified users |
| The root layout becomes dynamic and reads `GET /me` (public pages rendered per request) | The theme must be in the first HTML (FR-008) on `<html>`, which only the root layout renders, and portals sit under `<body>` | A theme cookie is a second source that disagrees after another device changes it and survives a session expiry (FR-004); a client-side switch flashes |
