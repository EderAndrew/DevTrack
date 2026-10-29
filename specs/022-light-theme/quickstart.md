# Quickstart: 022 — Tema claro opcional

## Setup

```bash
docker compose up -d postgres postgres-test mailpit
pnpm --filter api prisma migrate deploy      # adds users.theme (DARK for every account)
pnpm build
pnpm dev                                     # web :3000, api :4000
```

## Walk-through

1. Log in with any account. The system is dark, as before. "Meu perfil" (account menu in the footer of
   the side menu) shows the section "Aparência" with "Escuro" checked.
2. Choose "Claro": the whole screen (menu, top bar, content) turns light at once, without a reload.
3. Reload: the page comes back light from the first frame (`view-source:` shows `<html … data-theme="light">`).
4. Open a private window and log in with the same account: the first screen is already light.
5. Visit the main screens of the role (banks, a class, a correction, the student's Painel, Operação de
   IA, Feedbacks): no dark area; code blocks and charts use the light colors.
6. As a student, open a CONTROLLED work or an exam: the focus page, the timer and the dialogs are light.
7. Log out: `/entrar` is dark. Log in as another account that never chose: dark.
8. Back to the first account, choose "Escuro": dark again, and it stays dark after a reload.
9. With the API stopped, choose a theme: the screen goes back to the previous theme and "Não foi possível
   salvar a aparência. Tente de novo." appears.
10. `/design-system` (dev only): "Tema do catálogo" switches the whole catalog between the two themes.

## Checks

```bash
pnpm --filter web test test/contrast.test.ts        # 76 pairs × 2 themes, dark values frozen
pnpm --filter api test test/integration/022-preferences.spec.ts
pnpm --filter web test -t "022/"
```
