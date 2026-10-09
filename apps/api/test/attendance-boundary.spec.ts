import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 016 research M1, M12: attendance is neither AI nor monitoring nor grading. The `attendance` module
 * (API) and `features/attendance` (web) import no AI module, no AI help, no controlled-mode
 * monitoring, no grading rule and no bank; they run no code, do no float arithmetic and prove
 * presence by nothing but the teacher's mark (no location, camera or QR code, FR-024), and they send
 * no e-mail.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const ATTENDANCE_API = ["apps/api/src/modules/attendance"];
const ATTENDANCE_WEB = ["apps/web/features/attendance"];
const FORBIDDEN_API = [
  "apps/api/src/modules/ai",
  "apps/api/src/modules/curriculum-ai",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/work-help",
  "apps/api/src/modules/attempt-integrity",
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/works",
  "apps/api/src/modules/activities/grading",
  "apps/api/src/modules/activities/submission",
  "apps/api/src/platform/mail",
];
const FORBIDDEN_WEB = [
  "apps/web/features/ai",
  "apps/web/features/ai-operations",
  "apps/web/features/curriculum-ai",
  "apps/web/features/work-help",
  "apps/web/features/controlled-attempt",
  "apps/web/features/exercises",
  "apps/web/features/works",
];

function sources(dir: string): string[] {
  const absolute = join(REPO_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(REPO_ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const production = (dirs: readonly string[]) => dirs.flatMap(sources).filter((file) => !/\.(spec|test)\.tsx?$/.test(file));

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier));
  if (specifier.startsWith("@/") && file.startsWith("apps/web/")) return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) => dirs.some((dir) => path === dir || path.startsWith(dir + sep) || path.startsWith(`${dir}/`));

function importsInto(from: readonly string[], to: readonly string[]): string[] {
  return production(from).flatMap((file) =>
    [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(IMPORT_SPECIFIER)]
      .map((match) => match[1]!)
      .filter((specifier) => {
        const target = importTarget(file, specifier);
        return target !== null && inside(target, to);
      })
      .map((specifier) => `${file}: ${specifier}`),
  );
}

/** Code lines only: a comment may explain what the module does not do. */
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function offendingLines(files: readonly string[], patterns: readonly RegExp[]): string[] {
  return files.flatMap((file) =>
    readFileSync(join(REPO_ROOT, file), "utf8")
      .split("\n")
      .flatMap((line, index) => (!isComment(line) && patterns.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

const EXECUTION = [/child_process/, /\bnode:vm\b|["']vm["']/, /\beval\s*\(/, /new Function\s*\(/];
const FLOAT = [/\bparseFloat\s*\(/, /\bNumber\s*\(/, /\.toNumber\s*\(/];
/** FR-024: presence is the teacher's mark, never a device's proof. */
const DEVICE_PROOF = [/\bgeolocation\b/i, /\bgetUserMedia\b/, /\bqr ?code\b/i, /\bnavigator\.(?:connection|bluetooth|usb)\b/];
/** FR-018: a pause never grades, submits or labels the attempt. */
const GRADING = [/\bregisterSubmission\b/, /\bdecideByTeacher\b|\bgradeQuestion\b/, /auto_?submit/i, /\bfraud|\bcola\b|viola[cç][aã]o/i];

describe("016/FR-024 fronteiras da chamada (research M1, M12)", () => {
  it("varre o módulo da API", () => {
    expect(sources(ATTENDANCE_API[0]!)).toContain("apps/api/src/modules/attendance/attendance.module.ts");
  });

  it("a API da chamada não importa IA, ajuda, modo controlado, bancos, correção, entrega nem e-mail", () => {
    expect(importsInto(ATTENDANCE_API, FORBIDDEN_API)).toEqual([]);
  });

  it("o web da chamada não importa IA, ajuda, modo controlado nem bancos", () => {
    expect(importsInto(ATTENDANCE_WEB, FORBIDDEN_WEB)).toEqual([]);
  });

  it("016/FR-018 sem execução de código, aritmética de float, entrega ou correção, nem rótulo de fraude", () => {
    const files = production([...ATTENDANCE_API, ...ATTENDANCE_WEB]);
    expect(offendingLines(files, [...EXECUTION, ...FLOAT, ...GRADING])).toEqual([]);
  });

  it("016/FR-024 presença sem localização, câmera, QR code ou dispositivo", () => {
    expect(offendingLines(production([...ATTENDANCE_API, ...ATTENDANCE_WEB]), DEVICE_PROOF)).toEqual([]);
  });

  it("controle: a varredura resolve imports relativos e do web e acha o proibido", () => {
    expect(importTarget("apps/api/src/modules/attendance/pauses.service.ts", "../work-help/work-help.service")).toBe(
      "apps/api/src/modules/work-help/work-help.service",
    );
    expect(importTarget("apps/web/features/attendance/components/room-panel.tsx", "@/features/work-help/api")).toBe("apps/web/features/work-help/api");
    expect(inside("apps/api/src/modules/activities/status/pause-time", FORBIDDEN_API)).toBe(false);
    expect(inside("apps/api/src/modules/works/grading/registry", FORBIDDEN_API)).toBe(true);
    for (const line of ["const seconds = Number(raw);", "navigator.geolocation.getCurrentPosition()", "await registerSubmission(tx, attempt);"]) {
      expect([...FLOAT, ...DEVICE_PROOF, ...GRADING].some((pattern) => pattern.test(line)), line).toBe(true);
    }
    expect([...FLOAT, ...GRADING].some((pattern) => pattern.test('reason: "WATER"'))).toBe(false);
  });
});
