import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 012 research P1, P12, P15, P24: the class activity modules read the banks only through their own
 * snapshot readers and the pure 011 grading rules, run no code and call no AI (FR-036), never do
 * float arithmetic on grades, and answer students only through the student-view allowlist.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const ACTIVITIES_API = ["apps/api/src/modules/activities", "apps/api/src/modules/student-activities"];
const STUDENT_API = ["apps/api/src/modules/student-activities"];
const FORBIDDEN_API = [
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/ai",
];
/** The only parts of the work bank the activities may use: the pure grading rules and the type registry. */
const ALLOWED_WORKS = ["apps/api/src/modules/works/grading", "apps/api/src/modules/works/types"];
const ACTIVITIES_WEB = ["apps/web/features/activities", "apps/web/features/student-activities"];
const BANKS_WEB = ["apps/web/features/works", "apps/web/features/exercises"];

function sources(dir: string): string[] {
  const absolute = join(REPO_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(REPO_ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier));
  if (specifier.startsWith("@/") && file.startsWith("apps/web/")) return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) => dirs.some((dir) => path === dir || path.startsWith(dir + sep) || path.startsWith(`${dir}/`));

/** `file: specifier → target` of every in-repo import of the files under `from`. */
function imports(from: readonly string[]): { file: string; specifier: string; target: string }[] {
  return from.flatMap(sources).flatMap((file) =>
    [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(IMPORT_SPECIFIER)].flatMap((match) => {
      const target = importTarget(file, match[1]!);
      return target === null ? [] : [{ file, specifier: match[1]!, target }];
    }),
  );
}

const describeImport = ({ file, specifier }: { file: string; specifier: string }) => `${file}: ${specifier}`;

/** Code lines only: a comment may explain what the module does not do. */
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function offendingLines(files: readonly string[], patterns: readonly RegExp[]): string[] {
  return files.flatMap((file) =>
    readFileSync(join(REPO_ROOT, file), "utf8")
      .split("\n")
      .flatMap((line, index) => (!isComment(line) && patterns.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

describe("012/FR-036 fronteiras dos módulos de atividades (research P1, P24)", () => {
  it("varre os módulos de atividades", () => {
    expect(sources(ACTIVITIES_API[0]!)).toContain("apps/api/src/modules/activities/activities.module.ts");
    expect(sources(ACTIVITIES_API[1]!)).toContain("apps/api/src/modules/student-activities/student-activities.module.ts");
  });

  it("nenhum import dos módulos de exercícios, de IA nem da geração de trabalhos", () => {
    expect(imports(ACTIVITIES_API).filter(({ target }) => inside(target, FORBIDDEN_API)).map(describeImport)).toEqual([]);
  });

  it("do banco de trabalhos, só as regras puras de correção e o registro de tipos; o portal do aluno não o importa", () => {
    const works = imports(ACTIVITIES_API).filter(({ target }) => inside(target, ["apps/api/src/modules/works"]));
    expect(works.filter(({ target }) => !inside(target, ALLOWED_WORKS)).map(describeImport)).toEqual([]);
    expect(works.filter(({ file }) => inside(file, STUDENT_API)).map(describeImport)).toEqual([]);
  });

  it("012/FR-032 o portal do aluno nunca usa a visão do professor", () => {
    expect(
      imports(STUDENT_API)
        .filter(({ target }) => target.endsWith("views/teacher-view"))
        .map(describeImport),
    ).toEqual([]);
    expect(offendingLines(STUDENT_API.flatMap(sources), [/\btoTeacherQuestion\b/])).toEqual([]);
  });

  it("no web, nenhum import entre as features de atividades e as dos bancos", () => {
    expect(imports(ACTIVITIES_WEB).filter(({ target }) => inside(target, BANKS_WEB)).map(describeImport)).toEqual([]);
  });

  it("controle: a varredura resolve imports relativos", () => {
    expect(importTarget("apps/api/src/modules/activities/grading/x.ts", "../../works/grading/registry")).toBe(
      "apps/api/src/modules/works/grading/registry",
    );
    expect(inside("apps/api/src/modules/works/grading/registry", ALLOWED_WORKS)).toBe(true);
    expect(inside("apps/api/src/modules/works/views/student-view", ALLOWED_WORKS)).toBe(false);
  });
});

describe("012/FR-036 nada é executado nem calculado em ponto flutuante (constituição IV, research P24)", () => {
  const EXECUTION = [/child_process/, /\bnode:vm\b|["']vm["']/, /\beval\s*\(/, /\bnew\s+Function\b/, /worker_threads/];
  const FLOAT = [/\bparseFloat\s*\(/, /\bNumber\s*\(/, /\.toNumber\s*\(/];

  it("nenhum child_process, vm, eval(, new Function ou worker_threads", () => {
    expect(offendingLines(ACTIVITIES_API.flatMap(sources), EXECUTION)).toEqual([]);
  });

  it("notas só em centésimos inteiros: nenhum parseFloat, Number( ou .toNumber()", () => {
    expect(offendingLines(ACTIVITIES_API.flatMap(sources), FLOAT)).toEqual([]);
  });

  it("controle: os padrões pegam o que devem", () => {
    expect(EXECUTION.some((pattern) => pattern.test('import { exec } from "child_process";'))).toBe(true);
    expect(FLOAT.some((pattern) => pattern.test("const grade = Number(value);"))).toBe(true);
    expect(FLOAT.some((pattern) => pattern.test("const grade = gradeToCents(value);"))).toBe(false);
  });
});

describe("012/SC-012 012/FR-036 nada de prova nem de modo controlado nesta feature", () => {
  const WEB_SOURCES = ACTIVITIES_WEB.flatMap(sources).filter((file) => !/\.test\.tsx?$|test-fixtures\.ts$/.test(file));
  /** Exam-mode monitoring that belongs to the exams spec (research P19): timer, fullscreen, focus, clipboard. */
  const MONITORING = [/ExamTimer|FocusViolation|ReviewFlag/, /requestFullscreen|fullscreenchange|exitFullscreen/, /["']blur["']|onBlurCapture|hasFocus\s*\(/, /navigator\.clipboard|["'](copy|paste|cut)["']|\bon(Copy|Paste|Cut)\b/];

  it("nenhuma rota do catálogo nem texto das telas de atividades fala de prova ou de modo controlado", () => {
    const catalog = readFileSync(join(REPO_ROOT, "packages/contracts/src/endpoints.ts"), "utf8");
    const paths = [...catalog.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]!);
    expect(paths.filter((path) => /exam|prova|controlled/i.test(path))).toEqual([]);
    const strings = WEB_SOURCES.flatMap((file) =>
      [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(/["'`>]([^"'`<>{}]*\b(Prova|prova|Provas|modo controlado|Modo controlado)\b[^"'`<>{}]*)["'`<]/g)].map(
        (match) => `${file}: ${match[1]!.trim()}`,
      ),
    );
    expect(strings).toEqual([]);
    expect(offendingLines(ACTIVITIES_API.flatMap(sources), [/["'](EXAM|CONTROLLED)["']/])).toEqual([]);
  });

  it("nenhum cronômetro de prova, tela cheia, monitoramento de foco ou de área de transferência no portal do aluno", () => {
    expect(offendingLines(WEB_SOURCES, MONITORING)).toEqual([]);
  });

  it("controle: os padrões pegam o que devem", () => {
    expect(MONITORING.some((pattern) => pattern.test("document.documentElement.requestFullscreen();"))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test('window.addEventListener("blur", onBlur);'))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test("<textarea onPaste={block} />"))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test('document.addEventListener("visibilitychange", flush);'))).toBe(false);
  });
});
