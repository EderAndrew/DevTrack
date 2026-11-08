/**
 * 024 (research Y11): reads the web's `apps/web/design-system/tokens.css`, the single source of every
 * visual value, and produces the TypeScript source of `src/generated.ts` for React Native: the colors of
 * both themes (the `--color-*` utilities of `@theme inline`, aliases resolved, the light block over the
 * dark one as in the browser), the type scale in px (rem × 16), font families and weights, radii, icon
 * sizes, the focus ring, motion and the gutter. Pure: `test/in-sync.test.ts` runs it in memory.
 */

type Tokens = Record<string, string>;

const REM = 16;

/** The fonts the app ships (`apps/mobile/assets/fonts`), keyed by the web's `--font-*` variable. */
const FONT_NAMES: Record<string, string> = {
  inter: "Inter",
  fredoka: "Fredoka",
  "jetbrains-mono": "JetBrains Mono",
};

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** Body of the first block opened by `selector` (blocks here hold no nested braces). */
function blockBody(css: string, selector: RegExp): string {
  const start = css.search(selector);
  if (start < 0) throw new Error(`tokens.css sem o bloco ${selector}`);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

function declarations(body: string): Tokens {
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()]));
}

/** Follows `var(--x)` aliases down to a literal value. */
function resolve(tokens: Tokens, name: string): string {
  let value = tokens[name];
  for (let depth = 0; value !== undefined && depth < 10; depth++) {
    const alias = /^var\((--[\w-]+)\)$/.exec(value);
    if (!alias) return value;
    value = tokens[alias[1]!];
  }
  throw new Error(`token sem valor: ${name}`);
}

/** `#rrggbb` stays; `rgb(r g b / a)` becomes `rgba(r, g, b, a)`, the form React Native reads. */
function nativeColor(value: string): string {
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  const rgb = /^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)\s*)?\)$/i.exec(value);
  if (rgb) return rgb[4] === undefined ? `rgb(${rgb[1]}, ${rgb[2]}, ${rgb[3]})` : `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${rgb[4]})`;
  throw new Error(`cor em formato não suportado: ${value}`);
}

const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());

function px(value: string): number {
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number.parseFloat(rem[1]!) * REM;
  const pixels = /^([\d.]+)px$/.exec(value);
  if (pixels) return Number.parseFloat(pixels[1]!);
  throw new Error(`medida não suportada: ${value}`);
}

function ms(value: string): number {
  const match = /^(\d+)ms$/.exec(value);
  if (!match) throw new Error(`duração não suportada: ${value}`);
  return Number.parseInt(match[1]!, 10);
}

function fontName(stack: string): string {
  const variable = /^var\(--font-([\w-]+)\)/.exec(stack);
  const name = variable ? FONT_NAMES[variable[1]!] : undefined;
  if (!name) throw new Error(`família sem fonte do app: ${stack}`);
  return name;
}

const literal = (value: unknown) => JSON.stringify(value, null, 2).replace(/"([A-Za-z_][\w]*)":/g, "$1:");

export interface GeneratedTokens {
  colors: { dark: Record<string, string>; light: Record<string, string> };
  typography: Record<string, { fontSize: number; lineHeight: number; fontWeight: string }>;
  fontFamilies: Record<string, string>;
  fontWeights: Record<string, string>;
  radii: Record<string, number>;
  iconSizes: Record<string, number>;
  focusRing: { width: number; offset: number };
  durations: Record<string, number>;
  gutter: number;
}

export function parseTokens(source: string): GeneratedTokens {
  const css = stripComments(source);
  const dark = declarations(blockBody(css, /:root\s*\{/));
  const light = { ...dark, ...declarations(blockBody(css, /:root\[data-theme="light"\]\s*\{/)) };
  const theme = declarations(blockBody(css, /@theme inline\s*\{/));

  const colorNames = Object.keys(theme)
    .filter((name) => name.startsWith("--color-") && !name.endsWith("*"))
    .map((name) => name.slice("--color-".length));
  const colorsOf = (tokens: Tokens) =>
    Object.fromEntries(colorNames.map((name) => [camel(name), nativeColor(resolve({ ...theme, ...tokens }, `--${name}`))]));

  const typography: GeneratedTokens["typography"] = {};
  for (const [name, value] of Object.entries(theme)) {
    const step = /^--text-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(name);
    if (!step || value === "initial") continue;
    typography[camel(step[1]!)] = {
      fontSize: px(value),
      lineHeight: px(theme[`${name}--line-height`]!),
      fontWeight: theme[`${name}--font-weight`]!,
    };
  }

  const pick = (prefix: string, tokens: Tokens) =>
    Object.entries(tokens).filter(([name, value]) => name.startsWith(prefix) && value !== "initial" && !name.endsWith("*"));

  return {
    colors: { dark: colorsOf(dark), light: colorsOf(light) },
    typography,
    fontFamilies: Object.fromEntries(
      pick("--font-", theme)
        .filter(([name]) => !name.startsWith("--font-weight-"))
        .map(([name, value]) => [camel(name.slice("--font-".length)), fontName(value)]),
    ),
    fontWeights: Object.fromEntries(pick("--font-weight-", theme).map(([name, value]) => [camel(name.slice("--font-weight-".length)), value])),
    radii: Object.fromEntries(pick("--radius-", theme).map(([name, value]) => [name.slice("--radius-".length), px(value)])),
    iconSizes: Object.fromEntries(pick("--icon-", dark).map(([name, value]) => [name.slice("--icon-".length), px(value)])),
    focusRing: { width: px(dark["--focus-ring-width"]!), offset: px(dark["--focus-ring-offset"]!) },
    durations: Object.fromEntries(pick("--duration-", dark).map(([name, value]) => [name.slice("--duration-".length), ms(value)])),
    gutter: px(dark["--gutter"]!),
  };
}

/** The exact text of `src/generated.ts`. */
export function generatedSource(source: string): string {
  const t = parseTokens(source);
  const entries: [string, unknown][] = [
    ["colors", t.colors],
    ["typography", t.typography],
    ["fontFamilies", t.fontFamilies],
    ["fontWeights", t.fontWeights],
    ["radii", t.radii],
    ["iconSizes", t.iconSizes],
    ["focusRing", t.focusRing],
    ["durations", t.durations],
    ["gutter", t.gutter],
  ];
  return [
    "// Generated by `pnpm --filter @repo/design-tokens generate` from apps/web/design-system/tokens.css.",
    "// Do not edit: change tokens.css and regenerate (test/in-sync.test.ts fails otherwise).",
    "",
    ...entries.map(([name, value]) => `export const ${name} = ${literal(value)} as const;\n`),
  ].join("\n");
}
