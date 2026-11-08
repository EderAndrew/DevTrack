import type { UiTheme } from "@repo/contracts";
import { colorsFor, type ThemeColors, type ThemeName } from "@repo/design-tokens";
import { createContext, type ReactNode, useContext, useMemo } from "react";

export interface Theme {
  name: ThemeName;
  colors: ThemeColors;
}

const ThemeContext = createContext<Theme>({ name: "dark", colors: colorsFor("dark") });

/** The account's "Aparência" (022) as a theme name; dark before the session is known (contracts/mobile-ui.md). */
export const themeNameOf = (theme: UiTheme | null | undefined): ThemeName => (theme === "LIGHT" ? "light" : "dark");

/**
 * The app's theme (024/FR-023): the colors of `@repo/design-tokens` for the account's choice, read from
 * `GET /me` by the caller. Screens and components take colors only from `useTheme()`.
 */
export function ThemeProvider({ theme, children }: { theme: UiTheme | null | undefined; children: ReactNode }) {
  const name = themeNameOf(theme);
  const value = useMemo(() => ({ name, colors: colorsFor(name) }), [name]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
