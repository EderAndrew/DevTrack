import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// Source scan behind the design-system guards (005 research V9): the web's own code, one entry
// per line with its real number, block comments blanked out (line numbers kept) and the
// `ds-exception: <reason>` marker of the line or the one above it.

/** `apps/web`, with forward slashes in every path this module returns. */
export const WEB_ROOT = fileURLToPath(new URL("../..", import.meta.url));

/** Directories the guards read: routes, features and components (tests excluded). */
export const SCANNED_DIRS = ["app", "features", "components"] as const;

export interface SourceLine {
  /** Path relative to `apps/web` (e.g. `features/class-plan/components/topic-actions.tsx`). */
  file: string;
  /** 1-based line number in the file. */
  line: number;
  /** The line without block comments and without a trailing `//` comment. */
  code: string;
  /** The reason of a `ds-exception:` marker on this line or the previous one, else `null`. */
  exception: string | null;
}

const SOURCE = /\.(ts|tsx)$/;
const TEST = /\.test\.(ts|tsx)$/;
const EXCEPTION = /ds-exception:\s*(.+?)\s*(?:\*\/\s*\}?)?\s*$/;

const toPosix = (path: string) => path.split("\\").join("/");

/** Every `.ts`/`.tsx` file under `dirs` (relative to `apps/web`), tests left out, sorted. */
export function sourceFiles(dirs: readonly string[] = SCANNED_DIRS): string[] {
  return dirs
    .flatMap((dir) =>
      (
        readdirSync(join(WEB_ROOT, dir), {
          recursive: true,
          encoding: "utf8",
        }) as string[]
      ).map((entry) => toPosix(relative(WEB_ROOT, join(WEB_ROOT, dir, entry)))),
    )
    .filter(
      (file) =>
        SOURCE.test(file) && !TEST.test(file) && !file.endsWith(".d.ts"),
    )
    .sort();
}

/** Blanks `/* … *\/` comments (JSX `{/* … *\/}` included), keeping the newlines they span. */
function blankBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) =>
    comment.replace(/[^\n]/g, " "),
  );
}

/** Drops a trailing `//` comment, leaving `://` (URLs) and `//` inside quotes alone. */
function stripLineComment(line: string): string {
  let quote: string | null = null;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (
      char === "/" &&
      line[index + 1] === "/" &&
      line[index - 1] !== ":"
    ) {
      return line.slice(0, index);
    }
  }
  return line;
}

const exceptionIn = (raw: string | undefined) =>
  raw === undefined ? null : (EXCEPTION.exec(raw)?.[1] ?? null);

/** The lines of `text` as the guards see them (see `SourceLine`). */
export function scanText(file: string, text: string): SourceLine[] {
  const raw = text.split("\n");
  const blanked = blankBlockComments(text).split("\n");
  return blanked.map((line, index) => ({
    file,
    line: index + 1,
    code: stripLineComment(line),
    exception: exceptionIn(raw[index]) ?? exceptionIn(raw[index - 1]),
  }));
}

/** `scanText` of a file under `apps/web`. */
export function readSourceLines(file: string): SourceLine[] {
  return scanText(file, readFileSync(join(WEB_ROOT, file), "utf8"));
}

/** Every line of every scanned file. */
export function scanSources(
  dirs: readonly string[] = SCANNED_DIRS,
): SourceLine[] {
  return sourceFiles(dirs).flatMap(readSourceLines);
}

/** `file:line` as the guards report it. */
export const location = (line: Pick<SourceLine, "file" | "line">) =>
  `${line.file}:${line.line}`;

// ── Guard rules (005 research V9, FR-033) ─────────────────────────────────────────────────────
// `valores`: visual values outside the tokens; `controles`: fundamental controls recreated outside
// `components/ui`. They have separate repository tests so the migration of native controls (US2)
// does not block the migration of the screens (US1).

export type Rule = "valores" | "controles";

export interface Violation {
  rule: Rule;
  file: string;
  line: number;
  /** The class, literal or element found. */
  found: string;
  reason: string;
}

/** `file:line found — reason`, one per violation in the failure message. */
export const describeViolation = (violation: Violation) =>
  `${location(violation)} ${violation.found} — ${violation.reason}`;

const PALETTE =
  "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose";
const COLOR_PREFIX =
  "bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|outline|fill|stroke|divide|placeholder|decoration|accent|caret|from|via|to|shadow|inset-shadow";
const SPACING_PREFIX = "p[trblxyse]?|m[trblxyse]?|gap(?:-[xy])?|space-[xy]";
const ARBITRARY_PREFIX = `${COLOR_PREFIX}|${SPACING_PREFIX}|font|leading|tracking|rounded(?:-[a-z]{1,2})?|drop-shadow`;

const PALETTE_CLASS = new RegExp(
  `^(?:${COLOR_PREFIX})-(?:(?:${PALETTE})-(?:50|[1-9]00|950)|white|black)(?:/\\d+)?$`,
);
const ARBITRARY_CLASS = new RegExp(`^(?:${ARBITRARY_PREFIX})-\\[`);
const TEXT_SCALE = /^text-(?:xs|sm|base|lg|xl|[2-9]xl)$/;
const ROUNDED_SCALE = /^rounded(?:-[trblse]{1,2})?(?:-(?:xs|xl|[2-4]xl))?$/;
const SHADOW_SCALE = /^shadow(?:-(?:2xs|xs|lg|xl|2xl|inner))?$/;
const FONT_SCALE = /^font-(?:serif|thin|extralight|light|extrabold|black)$/;
const SPACING_CLASS = new RegExp(`^(?:${SPACING_PREFIX})-(\\d+(?:\\.\\d+)?)$`);
const SPACING_STEPS = new Set([
  "0",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "8",
  "10",
  "12",
  "16",
]);
const BREAKPOINT_VARIANT = /^(?:[2-9]xl|max-.+|min-.+)$/;
const ICON_SIZES = new Set(["size-4", "size-5", "size-6"]);
const LITERAL_COLOR =
  /(?<![&\w])#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/i;
const STYLE_PROPERTY =
  /\b(color|background(?:Color)?|borderColor|fill|stroke|font(?:Size|Family|Weight)|lineHeight|letterSpacing|padding\w*|margin\w*|gap|rowGap|columnGap|borderRadius|boxShadow)\s*:/;
const CONTROL = /<(button|select|textarea|table)\b/g;
const INPUT = /<input\b/g;

/** Class-like tokens of a line: whitespace, quotes and JS punctuation split them, except inside `[…]`. */
export function classTokens(code: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const char = code[index]!;
    if (
      char === "[" &&
      (depth > 0 || current !== "" || /[&@.:>*]/.test(code[index + 1] ?? ""))
    ) {
      depth += 1;
      current += char;
    } else if (char === "]" && depth > 0) {
      depth -= 1;
      current += char;
    } else if (depth === 0 && /[\s"'`{}(),;]/.test(char)) {
      if (current) tokens.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/** Splits `md:hover:-mt-2!` into its variants and the bare utility (`mt-2`). */
function parseClass(token: string): { variants: string[]; utility: string } {
  const parts: string[] = [];
  let current = "";
  let depth = 0;
  for (const char of token) {
    if (char === "[" || char === "(") depth += 1;
    if (char === "]" || char === ")") depth -= 1;
    if (char === ":" && depth === 0) {
      parts.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  const utility = current.replace(/^!|!$/g, "").replace(/^-/, "");
  return { variants: parts, utility };
}

function classReason({
  variants,
  utility,
}: {
  variants: string[];
  utility: string;
}): string | null {
  const breakpoint = variants.find((variant) =>
    BREAKPOINT_VARIANT.test(variant),
  );
  if (breakpoint)
    return `ponto de quebra "${breakpoint}:" fora de sm, md, lg e xl`;
  if (PALETTE_CLASS.test(utility))
    return "cor da paleta padrão; use um token de cor";
  if (ARBITRARY_CLASS.test(utility)) return "valor arbitrário; use um token";
  if (TEXT_SCALE.test(utility))
    return "tamanho de texto da escala padrão; use text-display…text-code";
  if (ROUNDED_SCALE.test(utility))
    return "raio fora de rounded-sm, rounded-md, rounded-lg e rounded-full";
  if (SHADOW_SCALE.test(utility))
    return "sombra fora de shadow-sm, shadow-md e shadow-overlay";
  if (FONT_SCALE.test(utility))
    return "fonte ou peso fora de font-sans, font-mono e dos pesos 400–700";
  const spacing = SPACING_CLASS.exec(utility);
  if (spacing && !SPACING_STEPS.has(spacing[1]!))
    return "passo de espaçamento fora da escala (0–6, 8, 10, 12, 16, px)";
  return null;
}

/** Names imported from `lucide-react` in the file (aliases resolved, type imports left out). */
function lucideNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const match of text.matchAll(
    /import\s*\{([^}]*)\}\s*from\s*["']lucide-react["']/g,
  )) {
    for (const specifier of match[1]!.split(",")) {
      const [name, alias] = specifier.trim().split(/\s+as\s+/);
      if (name && !name.startsWith("type ")) names.add((alias ?? name).trim());
    }
  }
  return names;
}

/** Indexes of the lines a JSX opening tag starting at `lines[start]`, column `column`, spans. */
function tagSpan(lines: SourceLine[], start: number, column: number): number[] {
  const span: number[] = [];
  let braces = 0;
  for (let index = start; index < lines.length; index += 1) {
    span.push(index);
    const code = lines[index]!.code;
    for (let at = index === start ? column + 1 : 0; at < code.length; at += 1) {
      const char = code[at]!;
      if (char === "{") braces += 1;
      else if (char === "}") braces -= 1;
      else if (char === ">" && braces === 0 && code[at - 1] !== "=")
        return span;
    }
  }
  return span;
}

/** Every violation of both rules in one file (`file` relative to `apps/web`). */
export function checkText(file: string, text: string): Violation[] {
  const lines = scanText(file, text);
  const found: Violation[] = [];
  const report = (rule: Rule, index: number, what: string, reason: string) => {
    const line = lines[index]!;
    if (line.exception === null)
      found.push({ rule, file, line: line.line, found: what, reason });
  };

  const icons = lucideNames(lines.map((line) => line.code).join("\n"));
  const iconTag =
    icons.size > 0 ? new RegExp(`<(${[...icons].join("|")})\\b`, "g") : null;
  let inStyle = false;

  lines.forEach(({ code }, index) => {
    const literal = LITERAL_COLOR.exec(code);
    if (literal)
      report("valores", index, literal[0], "cor literal; use um token de cor");

    for (const token of classTokens(code)) {
      const parsed = parseClass(token);
      const reason = classReason(parsed);
      if (reason) report("valores", index, token, reason);
      else if (
        /^size-/.test(parsed.utility) &&
        !ICON_SIZES.has(parsed.utility) &&
        parsed.variants.some((variant) => variant.includes("svg"))
      ) {
        report(
          "valores",
          index,
          token,
          "ícone fora de size-4, size-5 e size-6",
        );
      }
    }

    if (/style=\{\{/.test(code)) inStyle = true;
    if (inStyle) {
      const property = STYLE_PROPERTY.exec(code);
      if (property)
        report(
          "valores",
          index,
          `style ${property[1]}`,
          "estilo em linha com cor, fonte ou espaçamento; use tokens",
        );
      if (/\}\}/.test(code)) inStyle = false;
    }

    if (iconTag) {
      for (const match of code.matchAll(iconTag)) {
        for (const spanIndex of tagSpan(lines, index, match.index)) {
          for (const token of classTokens(lines[spanIndex]!.code)) {
            const { utility } = parseClass(token);
            if (/^size-/.test(utility) && !ICON_SIZES.has(utility)) {
              report(
                "valores",
                spanIndex,
                `<${match[1]}> ${token}`,
                "ícone fora de size-4, size-5 e size-6",
              );
            }
          }
        }
      }
    }

    if (!file.startsWith("components/ui/")) {
      for (const match of code.matchAll(CONTROL)) {
        report(
          "controles",
          index,
          `<${match[1]}>`,
          "controle recriado; use o componente de components/ui",
        );
      }
      for (const match of code.matchAll(INPUT)) {
        const span = tagSpan(lines, index, match.index)
          .map((spanIndex) => lines[spanIndex]!.code)
          .join(" ");
        const type = /\btype=["'{]*(checkbox|radio)\b/.exec(span);
        if (type)
          report(
            "controles",
            index,
            `<input type="${type[1]}">`,
            "controle recriado; use o componente de components/ui",
          );
      }
    }
  });
  return found;
}

/** Violations of `rule` across `app`, `features` and `components`. */
export function checkRepository(rule: Rule): Violation[] {
  return sourceFiles()
    .flatMap((file) =>
      checkText(file, readFileSync(join(WEB_ROOT, file), "utf8")),
    )
    .filter((violation) => violation.rule === rule);
}

export interface ExceptionMarker {
  file: string;
  /** Line of the `ds-exception:` comment. */
  line: number;
  reason: string;
  /** The code the marker covers: its own line and the next one. */
  covers: string;
}

/** Every `ds-exception: <reason>` comment in the scanned sources. */
export function exceptionMarkers(): ExceptionMarker[] {
  return sourceFiles().flatMap((file) => {
    const raw = readFileSync(join(WEB_ROOT, file), "utf8").split("\n");
    return raw.flatMap((text, index) => {
      const reason = exceptionIn(text);
      return reason === null
        ? []
        : [
            {
              file,
              line: index + 1,
              reason,
              covers: `${text}\n${raw[index + 1] ?? ""}`,
            },
          ];
    });
  });
}
