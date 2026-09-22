// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// axe in jsdom cannot measure contrast (no layout), so the theme tokens are checked here
// directly: WCAG 2.2 AA, 4.5:1 for text and 3:1 for borders and the focus ring (002 S12).

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Custom properties declared in the first `:root { … }` found in `source`. */
function rootTokens(source: string): Record<string, string> {
  const block = /:root\s*\{([^}]*)\}/.exec(source)?.[1] ?? "";
  return Object.fromEntries([...block.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

const darkStart = css.indexOf("@media (prefers-color-scheme: dark)");
const THEMES = {
  claro: rootTokens(darkStart >= 0 ? css.slice(0, darkStart) : css),
  escuro: darkStart >= 0 ? rootTokens(css.slice(darkStart)) : {},
};

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
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}

const PAIRS: [foreground: string, background: string, minimum: number][] = [
  ["--foreground", "--background", 4.5],
  ["--foreground", "--card", 4.5],
  ["--muted-foreground", "--background", 4.5],
  ["--muted-foreground", "--card", 4.5],
  ["--primary-foreground", "--primary", 4.5],
  ["--destructive", "--background", 4.5],
  ["--destructive", "--danger-surface", 4.5],
  ["--border", "--background", 3],
  ["--ring", "--background", 3],
  ["--sidebar-foreground", "--sidebar", 4.5],
  ["--sidebar-accent-foreground", "--sidebar-accent", 4.5],
  ["--sidebar-primary-foreground", "--sidebar-primary", 4.5],
  ["--sidebar-border", "--sidebar", 3],
  ["--sidebar-ring", "--sidebar", 3],
  ["--sidebar-ring", "--sidebar-accent", 3],
];

describe.each(Object.entries(THEMES))("002/US3-3 002/US3-4 contraste AA dos tokens do tema %s", (_theme, tokens) => {
  it.each(PAIRS)("%s sobre %s ≥ %s:1", (foreground, background, minimum) => {
    expect(tokens[foreground], foreground).toBeDefined();
    expect(tokens[background], background).toBeDefined();
    expect(ratio(tokens[foreground]!, tokens[background]!)).toBeGreaterThanOrEqual(minimum);
  });
});
