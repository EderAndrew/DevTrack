import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

// TypeScript 7 ships no JavaScript compiler API, so the guards use this small lexer instead.
// It understands comments and string/template literals; regex literals are treated as code,
// which is enough for this repository (no regex in scope contains quotes or comment markers).

export const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

export interface StringLiteral {
  value: string;
  line: number;
}

export interface ScannedSource {
  /** Source with comments replaced by spaces (line numbers preserved). */
  code: string;
  strings: StringLiteral[];
}

export function scanSource(source: string): ScannedSource {
  let code = "";
  const strings: StringLiteral[] = [];
  let line = 1;
  let i = 0;
  const blank = (text: string) => text.replace(/[^\n]/g, " ");

  while (i < source.length) {
    const char = source[i]!;
    const next = source[i + 1];
    if (char === "/" && next === "/") {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end;
      code += blank(source.slice(i, stop));
      i = stop;
    } else if (char === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      const comment = source.slice(i, stop);
      code += blank(comment);
      line += comment.split("\n").length - 1;
      i = stop;
    } else if (char === '"' || char === "'" || char === "`") {
      const startLine = line;
      let j = i + 1;
      let value = "";
      while (j < source.length && source[j] !== char) {
        if (source[j] === "\\") {
          value += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        // Template placeholders count as code, not text: `${name}` never makes a literal "texty".
        if (char === "`" && source[j] === "$" && source[j + 1] === "{") {
          let depth = 1;
          j += 2;
          while (j < source.length && depth > 0) {
            if (source[j] === "{") depth++;
            else if (source[j] === "}") depth--;
            j++;
          }
          value += " ";
          continue;
        }
        value += source[j];
        j++;
      }
      const literal = source.slice(i, j + 1);
      strings.push({ value: char === "`" ? value.replace(/ $/, "") : value, line: startLine });
      code += literal;
      line += literal.split("\n").length - 1;
      i = j + 1;
    } else {
      if (char === "\n") line++;
      code += char;
      i++;
    }
  }
  return { code, strings };
}

const SKIPPED_DIRS = new Set(["node_modules", ".next", "dist", "generated", "e2e", ".turbo", "coverage"]);

/** Files under `dir` (relative to the repository root) whose name matches `pattern`. */
export function listFiles(dir: string, pattern: RegExp): string[] {
  const root = join(REPO_ROOT, dir);
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRS.has(entry.name)) walk(join(current, entry.name));
      } else if (pattern.test(entry.name)) {
        found.push(relative(REPO_ROOT, join(current, entry.name)));
      }
    }
  };
  walk(root);
  return found.sort();
}

export const readRepoFile = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

export const lineOf = (text: string, index: number) => text.slice(0, index).split("\n").length;
