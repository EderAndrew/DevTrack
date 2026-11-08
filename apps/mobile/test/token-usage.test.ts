import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * 024/FR-023 (research Y11, constitution 3.7.0): the app uses only the Design System's values — the mobile
 * counterpart of apps/web/test/design-system/token-usage.test.ts. No literal color anywhere in the app's
 * code; no literal font size, line height, font family, radius or spacing outside `components/ui` (which
 * builds them from `@repo/design-tokens`). Fails with file:line.
 */
const ROOT = join(__dirname, "..");
const SCANNED = ["app", "features", "components", "lib"];
const UI = "components/ui/";

function files(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Any literal color: #rgb/#rrggbb(aa), rgb()/rgba()/hsl(), or a named CSS color in a style. */
const COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:color|backgroundColor|borderColor|tintColor)\s*:\s*["'](?!transparent)[a-z]+["']/;
/** Sizes that have tokens: font size, line height, family, radius, spacing (a literal 0 is allowed). */
const SIZE = /\b(?:fontSize|lineHeight|borderRadius|padding\w*|margin\w*|gap|rowGap|columnGap)\s*:\s*[1-9]\d*(?:\.\d+)?\b|\bfontFamily\s*:\s*["'`]/;

function offenders(pattern: RegExp, include: (file: string) => boolean): string[] {
  return SCANNED.flatMap((dir) => files(join(ROOT, dir)))
    .map((file) => relative(ROOT, file))
    .filter(include)
    .flatMap((file) =>
      withoutComments(readFileSync(join(ROOT, file), "utf8"))
        .split("\n")
        .flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
    );
}

describe("024/FR-023 o app usa só os tokens do Design System", () => {
  it("nenhuma cor literal no código do app", () => {
    expect(offenders(COLOR, () => true)).toEqual([]);
  });

  it("nenhum tamanho de fonte, altura de linha, família, raio ou espaçamento literal fora de components/ui", () => {
    expect(offenders(SIZE, (file) => !file.startsWith(UI))).toEqual([]);
  });

  it("a varredura reconhece o que proíbe", () => {
    expect(COLOR.test('backgroundColor: "#0b0f2b"')).toBe(true);
    expect(COLOR.test("color: 'red'")).toBe(true);
    expect(COLOR.test("color: colors.foreground")).toBe(false);
    expect(SIZE.test("fontSize: 16")).toBe(true);
    expect(SIZE.test("paddingHorizontal: 12")).toBe(true);
    expect(SIZE.test('fontFamily: "Inter"')).toBe(true);
    expect(SIZE.test("padding: spacing[4]")).toBe(false);
    expect(SIZE.test("margin: 0")).toBe(false);
  });
});
