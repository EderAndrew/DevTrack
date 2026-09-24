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
      (readdirSync(join(WEB_ROOT, dir), { recursive: true, encoding: "utf8" }) as string[]).map((entry) =>
        toPosix(relative(WEB_ROOT, join(WEB_ROOT, dir, entry))),
      ),
    )
    .filter((file) => SOURCE.test(file) && !TEST.test(file) && !file.endsWith(".d.ts"))
    .sort();
}

/** Blanks `/* … *\/` comments (JSX `{/* … *\/}` included), keeping the newlines they span. */
function blankBlockComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "));
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
    } else if (char === "/" && line[index + 1] === "/" && line[index - 1] !== ":") {
      return line.slice(0, index);
    }
  }
  return line;
}

const exceptionIn = (raw: string | undefined) => (raw === undefined ? null : (EXCEPTION.exec(raw)?.[1] ?? null));

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
export function scanSources(dirs: readonly string[] = SCANNED_DIRS): SourceLine[] {
  return sourceFiles(dirs).flatMap(readSourceLines);
}

/** `file:line` as the guards report it. */
export const location = (line: Pick<SourceLine, "file" | "line">) => `${line.file}:${line.line}`;
