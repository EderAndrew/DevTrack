import { describe, expect, it } from "vitest";
import { colors, type ColorName, type ThemeName } from "../src/index.ts";

// 024/FR-023 (022 research Z10, apps/web/test/contrast.test.ts): the generated values keep WCAG 2.2 AA in
// both themes — 4.5:1 for text and 3:1 for graphics, control borders and the focus ring — so the app inherits
// the web's contrast with the values it actually uses.

function luminance(hex: string): number {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) throw new Error(`cor não é #rrggbb: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => {
    const channel = Number.parseInt(match[1]!.slice(i, i + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function ratio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter! + 0.05) / (darker! + 0.05);
}

type Pair = [foreground: ColorName, background: ColorName, minimum: number];
const SURFACES: ColorName[] = ["background", "surface"];
const STATES = ["success", "warning", "danger", "info"] as const;
const TEXTS: ColorName[] = ["foreground", "textSecondary", "primary", "brandSecondary", ...STATES.map((s) => `${s}Text` as ColorName)];
const GRAPHICS: ColorName[] = [...STATES.map((s) => s as ColorName), "borderControl", "ring"];

const PAIRS: Pair[] = [
  ...TEXTS.flatMap((text) => SURFACES.map((surface): Pair => [text, surface, 4.5])),
  ...STATES.map((s): Pair => [`${s}Text` as ColorName, `${s}Surface` as ColorName, 4.5]),
  ["primaryForeground", "primary", 4.5],
  ["primaryForeground", "primaryHover", 4.5],
  ["dangerForeground", "danger", 4.5],
  ["primaryStrong", "primarySubtle", 4.5],
  ["disabledFg", "disabledBg", 4.5],
  ...GRAPHICS.flatMap((graphic) => SURFACES.map((surface): Pair => [graphic, surface, 3])),
];

describe.each(["dark", "light"] as ThemeName[])("024/FR-023 contraste AA dos tokens do app no tema %s", (theme) => {
  it.each(PAIRS)("%s sobre %s ≥ %s:1", (foreground, background, minimum) => {
    expect(ratio(colors[theme][foreground], colors[theme][background])).toBeGreaterThanOrEqual(minimum);
  });
});
