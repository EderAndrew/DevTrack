import type { UiTheme } from "@repo/contracts";

// Texts of the theme switch of "Meu perfil" (022 contracts/web-ui.md).

/** The switch's accessible name (no visible text): on is "Claro", off is "Escuro" (amended 2026-10-30). */
export const LIGHT_THEME_SWITCH = "Tema claro";
export const APPEARANCE_SAVE_FAILED = "Não foi possível salvar a aparência. Tente de novo.";

/** The value of `<html data-theme>` for an account's theme (the root layout renders the same). */
export const themeAttribute = (theme: UiTheme) => (theme === "LIGHT" ? "light" : "dark");
