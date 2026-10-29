import { type UiTheme, UiThemeSchema } from "@repo/contracts";

// Texts of "Aparência" in "Meu perfil" (022 contracts/web-ui.md).

export const APPEARANCE_TITLE = "Aparência";
export const THEME_LEGEND = "Tema";
export const THEME_LABELS: Record<UiTheme, string> = { DARK: "Escuro", LIGHT: "Claro" };
export const THEME_OPTIONS: readonly UiTheme[] = UiThemeSchema.options;
export const APPEARANCE_SAVE_FAILED = "Não foi possível salvar a aparência. Tente de novo.";

/** The value of `<html data-theme>` for an account's theme (the root layout renders the same). */
export const themeAttribute = (theme: UiTheme) => (theme === "LIGHT" ? "light" : "dark");
