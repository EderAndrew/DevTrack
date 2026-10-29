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
  Nome / E-mail / Papéis
  ── Aparência ──────────────────────────────
  Tema
  (•) Escuro
  ( ) Claro
  [role=alert] Não foi possível salvar a aparência. Tente de novo.   ← only after a failure
  ── Minhas sessões ─────────────────────────
```

- `features/profile/components/appearance-settings.tsx`: `<section aria-labelledby="aparencia">`,
  `<h2 id="aparencia">Aparência</h2>`, the 005 `RadioGroup` named "Tema" with "Escuro" and "Claro",
  checked from `me.theme`. Shown for every session, including an unverified e-mail (FR-005).
- Choosing an option: `<html data-theme>` changes at once, the group is disabled with `aria-busy` while
  the request is pending; on success the `me` query data is updated and `router.refresh()` runs; on
  failure the previous option and theme come back and the alert above shows (the text lives in
  `features/profile/schemas/`). Choosing the checked option sends nothing.
- `api/preferences.ts` → `hooks/use-update-theme.ts` → component (005 layers, ESLint-enforced).

## Design-system catalog (`/design-system`, out of production)

- A "Tema do catálogo" radio group ("Escuro", "Claro") at the top sets `<html data-theme>` for the visit
  only (no request, not saved). axe and the Tab order run in both themes (`catalog.test.tsx`).

## Docs

- `design-system/tokens.md`: the two themes, the light values and their source colors (research Z6).
- `design-system/README.md` and `layouts.md`: where the theme comes from (root layout, `me.theme`).
- `specs/005-design-system/spec.md` FR-013: amendment 2026-10-29 (FR-017).
