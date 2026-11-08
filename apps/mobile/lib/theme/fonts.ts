import { fontFamilies, type typography } from "@repo/design-tokens";

/**
 * The app's fonts (research Y11): the web's families as static TTFs (`assets/fonts`), registered with
 * `expo-font` under `<Family>-<weight>` (React Native picks a face by name, not by weight on Android).
 * Names come from `@repo/design-tokens`, never written by hand in a screen.
 */
export type FontRole = keyof typeof fontFamilies;
export type FontWeight = (typeof typography)[keyof typeof typography]["fontWeight"] | "500";

/** The weights shipped per family (assets/fonts/README.md). */
const SHIPPED: Record<FontRole, readonly string[]> = {
  sans: ["400", "500", "600", "700"],
  brand: ["600"],
  mono: ["400"],
};

const faceName = (role: FontRole, weight: string) => `${fontFamilies[role].replace(/\s+/g, "")}-${weight}`;

/** The registered face for a role and weight; the nearest shipped weight when that one isn't shipped. */
export function fontFor(role: FontRole, weight: string): string {
  const shipped = SHIPPED[role];
  const wanted = Number(weight);
  const nearest = shipped.reduce((best, candidate) => (Math.abs(Number(candidate) - wanted) < Math.abs(Number(best) - wanted) ? candidate : best));
  return faceName(role, nearest);
}

/** What `useFonts` loads in the root layout. */
export const FONT_FILES = {
  [faceName("sans", "400")]: require("../../assets/fonts/Inter-400.ttf"),
  [faceName("sans", "500")]: require("../../assets/fonts/Inter-500.ttf"),
  [faceName("sans", "600")]: require("../../assets/fonts/Inter-600.ttf"),
  [faceName("sans", "700")]: require("../../assets/fonts/Inter-700.ttf"),
  [faceName("brand", "600")]: require("../../assets/fonts/Fredoka-600.ttf"),
  [faceName("mono", "400")]: require("../../assets/fonts/JetBrainsMono-400.ttf"),
} as Record<string, number>;
