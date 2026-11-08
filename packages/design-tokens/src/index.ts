import { colors } from "./generated.js";

// 024 (research Y11, constitution 3.7.0 "Stack oficial do mobile"): the Design System's values for the
// app, generated from apps/web/design-system/tokens.css. Screens never use literal values.
export * from "./generated.js";

export type ThemeName = keyof typeof colors;
export type ColorName = keyof (typeof colors)["dark"];
export type ThemeColors = Record<ColorName, string>;

/** The colors of a theme; the light block overrides only colors, as in the web (022). */
export function colorsFor(theme: ThemeName): ThemeColors {
  return colors[theme];
}

/**
 * Spacing: the web's 4 px unit and its allowed steps (apps/web/design-system/tokens.md, "Espaçamento");
 * Tailwind's scale has no CSS token, so the steps live here.
 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;
export type SpacingStep = keyof typeof spacing;
