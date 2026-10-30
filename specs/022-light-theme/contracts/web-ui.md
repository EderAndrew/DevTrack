# Web UI Contract: 022 — Tema claro opcional

## Theme on `<html>` (root layout)

- `app/layout.tsx` renders `<html lang="pt-BR" data-theme="dark|light">` from `getMeForNavigation()`:
  `light` only when `me.theme === "LIGHT"`; no session, an expired one or any failure → `dark` (FR-004).
- `getMe` is wrapped in React `cache()`: one `GET /me` per request shared by the root layout, the group
  layouts and the page.
- No `prefers-color-scheme`, no `localStorage`, no inline script.

## "Meu perfil" → Aparência (`/conta/perfil`)

```text
Meu perfil
Meu perfil                                   ☾ [○──] ☀   ← PageHeader actions; off = Escuro, on = Claro
  Nome / E-mail / Papéis
  [role=alert] Não foi possível salvar a aparência. Tente de novo.   ← only after a failure
  ── Minhas sessões ─────────────────────────
```

- `features/profile/components/appearance-settings.tsx`, given to the page's `PageHeader` as `actions` (at
  the right of the title on wide screens, under it on narrow ones): no heading and no visible text, the 005
  `Switch` with `aria-label="Tema claro"`, on when `me.theme` is `LIGHT`, between a Lucide `Moon` (left, dark) and `Sun` (right, light), both `aria-hidden`;
  the icon of the current theme is in `--foreground`, the other in `--text-secondary` (the thumb's position and
  `aria-checked` carry the state, never the color alone). Amended 2026-10-30 (the two radios became the switch; then the section "Aparência" and its texts went away,
  leaving the switch and the icons at the right of the title). Shown for every session, including an unverified e-mail (FR-005).
- Toggling: `<html data-theme>` changes at once, the switch is disabled with `aria-busy` while the request
  is pending; on success the `me` query data is updated and `router.refresh()` runs; on failure the previous
  position and theme come back and the alert above shows (the text lives in `features/profile/schemas/`).
- `api/preferences.ts` → `hooks/use-update-theme.ts` → component (005 layers, ESLint-enforced).

## Design-system catalog (`/design-system`, out of production)

- A "Tema do catálogo" radio group ("Escuro", "Claro") at the top sets `<html data-theme>` for the visit
  only (no request, not saved). axe and the Tab order run in both themes (`catalog.test.tsx`).

## Docs

- `design-system/tokens.md`: the two themes, the light values and their source colors (research Z6).
- `design-system/README.md` and `layouts.md`: where the theme comes from (root layout, `me.theme`).
- `specs/005-design-system/spec.md` FR-013: amendment 2026-10-29 (FR-017).
