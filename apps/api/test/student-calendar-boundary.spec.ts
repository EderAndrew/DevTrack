import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 031 research CK12, FR-022, SC-004: the student's calendar is its own read slice. `modules/student-calendar` (API)
 * imports nothing of the class plan, the syllabus, the activities or AI — except the pure "today" of
 * `class-plans/planning-date` (CK7) and `isoDate` of `classes/class.view` —, never names the absence reason, a topic or
 * a meeting's status, and its view copies named keys (no spread of a database row). `features/student-calendar` (web)
 * imports nothing of the teacher's plan or calendar.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const CALENDAR_API = "apps/api/src/modules/student-calendar";
const CALENDAR_WEB = "apps/web/features/student-calendar";
const VIEW = `${CALENDAR_API}/views/student-calendar.view.ts`;

const FORBIDDEN_API = [
  "apps/api/src/modules/class-plans",
  "apps/api/src/modules/syllabus",
  "apps/api/src/modules/subjects",
  "apps/api/src/modules/curriculum-ai",
  "apps/api/src/modules/activities",
  "apps/api/src/modules/student-activities",
  "apps/api/src/modules/ai",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/exam-ai",
  "apps/api/src/modules/work-help",
];
/** The only files of a forbidden module the slice may import. */
const ALLOWED_API = ["apps/api/src/modules/class-plans/planning-date"];
const FORBIDDEN_WEB = [
  "apps/web/features/class-plan",
  "apps/web/features/class-calendar",
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

const production = (dir: string) =>
  sources(dir).filter((file) => !/\.(spec|test)\.tsx?$/.test(file));
const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");
/** The code without comments: the rules are about what the code does, not what its comments explain. */
const code = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const IMPORT_SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith("."))
    return relative(
      REPO_ROOT,
      resolve(join(REPO_ROOT, dirname(file)), specifier),
    );
  if (specifier.startsWith("@/") && file.startsWith("apps/web/"))
    return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) =>
  dirs.some((dir) => path === dir || path.startsWith(`${dir}/`));

function forbiddenImports(
  file: string,
  to: readonly string[],
  allowed: readonly string[] = [],
): string[] {
  return [...read(file).matchAll(IMPORT_SPECIFIER)]
    .map((match) => match[1]!)
    .filter((specifier) => {
      const target = importTarget(file, specifier);
      return (
        target !== null &&
        inside(target, to) &&
        !allowed.includes(target.replace(/\.tsx?$/, ""))
      );
    })
    .map((specifier) => `${file}: ${specifier}`);
}

describe("031 fronteira do calendário do aluno (CK12)", () => {
  it("os arquivos existem (a guarda não passa vazia)", () => {
    expect(production(CALENDAR_API).length).toBeGreaterThanOrEqual(4);
    expect(production(CALENDAR_WEB).length).toBeGreaterThanOrEqual(4);
    expect(existsSync(join(REPO_ROOT, VIEW))).toBe(true);
  });

  it("modules/student-calendar não importa plano, ementa, atividades nem IA (só o planning-date puro)", () => {
    expect(
      production(CALENDAR_API).flatMap((file) =>
        forbiddenImports(file, FORBIDDEN_API, ALLOWED_API),
      ),
    ).toEqual([]);
  });

  it("031/SC-004 o código do módulo não cita o motivo da falta, tópicos nem a situação de um encontro", () => {
    const offenders = production(CALENDAR_API).flatMap((file) => {
      const text = code(read(file));
      const names = [
        /absenceReason/,
        /absence_reason/,
        /\btopics?\b/i,
        /\bnumber\b/,
      ];
      const found = names
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${file}: ${pattern}`);
      // The only `status` is the enrollment's ACTIVE filter.
      const statuses = text.match(/\bstatus\b[^,}\n]*/g) ?? [];
      return [
        ...found,
        ...statuses
          .filter((match) => !/^status: "ACTIVE"$/.test(match.trim()))
          .map((m) => `${file}: ${m}`),
      ];
    });
    expect(offenders).toEqual([]);
  });

  it("031/FR-022 a view copia chaves nomeadas, sem espalhar um objeto do banco", () => {
    const text = code(read(VIEW));
    expect(text).not.toMatch(/\{\s*\.\.\./);
    expect(text).not.toMatch(/Object\.(assign|entries|fromEntries)/);
    for (const key of [
      "date:",
      "kind:",
      "text:",
      "subjectName:",
      "teacherName:",
      "startsOn:",
      "endsOn:",
      "today:",
    ]) {
      expect(text).toContain(key);
    }
  });

  it("features/student-calendar não importa o plano nem o calendário do professor", () => {
    expect(
      production(CALENDAR_WEB).flatMap((file) =>
        forbiddenImports(file, FORBIDDEN_WEB),
      ),
    ).toEqual([]);
  });
});
