import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 012 research P1, P12, P15, P24: the class activity modules read the banks only through their own
 * snapshot readers and the pure 011 grading rules, run no code and call no AI (FR-036), never do
 * float arithmetic on grades, and answer students only through the student-view allowlist. 013 adds
 * the ranking (API and web), which reads no bank at all and counts points as integers. 015 (research
 * F1, F18) allows the CONTROLLED mode as a setting of a work, but its monitoring and the AI help live
 * in `attempt-integrity` and `work-help`, which the activity modules never import (they register hooks).
 * 016 (research M1) keeps `attendance` out too: the activity modules read its tables in their own
 * scoped queries, never its code. 018 (research T1, T16) adds the EXAM type: the activity modules read
 * the exam bank through their own snapshot reader and its pure `exams/coverage`, never `exam-sessions`
 * or `exam-ai`, and the exam's timer and countdown live only in `features/exam-attempt` and
 * `components/ui/assessment`.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const RANKING_API = ["apps/api/src/modules/ranking"];
const ACTIVITIES_API = ["apps/api/src/modules/activities", "apps/api/src/modules/student-activities", ...RANKING_API];
const STUDENT_API = ["apps/api/src/modules/student-activities"];
const FORBIDDEN_API = [
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/ai",
  // 015 research F1: reached only through the `HelpAvailability` and `AnswerSaveGuard` hooks.
  "apps/api/src/modules/attempt-integrity",
  "apps/api/src/modules/work-help",
  // 016 research M1: the visibility clause and the paused-write refusal read its tables, not its code.
  "apps/api/src/modules/attendance",
  // 018 research T1: the monitor and the decisions call into `activities/submission`, never the reverse.
  "apps/api/src/modules/exam-sessions",
  "apps/api/src/modules/exam-ai",
];
/** The only part of the exam bank the activities may use: the pure coverage of the scope check (018 T15). */
const ALLOWED_EXAMS = ["apps/api/src/modules/exams/coverage"];
/** The only parts of the work bank the activities may use: the pure grading rules and the type registry. */
const ALLOWED_WORKS = ["apps/api/src/modules/works/grading", "apps/api/src/modules/works/types"];
const ACTIVITIES_WEB = ["apps/web/features/activities", "apps/web/features/student-activities", "apps/web/features/ranking"];
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
    expect(sources(RANKING_API[0]!)).toContain("apps/api/src/modules/ranking/ranking.module.ts");
  });

  it("013 o ranking não importa nada dos bancos (nem as regras de correção)", () => {
    const banks = [...FORBIDDEN_API, "apps/api/src/modules/works"];
    expect(imports(RANKING_API).filter(({ target }) => inside(target, banks)).map(describeImport)).toEqual([]);
  });

  it("015/FR-030 016/FR-024 nenhum import dos módulos de exercícios, de IA, da geração de trabalhos, do modo controlado, da ajuda nem da chamada", () => {
    expect(imports(ACTIVITIES_API).filter(({ target }) => inside(target, FORBIDDEN_API)).map(describeImport)).toEqual([]);
  });

  it("do banco de trabalhos, só as regras puras de correção e o registro de tipos; o portal do aluno não o importa", () => {
    const works = imports(ACTIVITIES_API).filter(({ target }) => inside(target, ["apps/api/src/modules/works"]));
    expect(works.filter(({ target }) => !inside(target, ALLOWED_WORKS)).map(describeImport)).toEqual([]);
    expect(works.filter(({ file }) => inside(file, STUDENT_API)).map(describeImport)).toEqual([]);
  });

  it("018/FR-008 do Banco de Provas, só a cobertura pura; o portal do aluno não o importa", () => {
    const exams = imports(ACTIVITIES_API).filter(({ target }) => inside(target, ["apps/api/src/modules/exams"]));
    expect(exams.filter(({ target }) => !inside(target, ALLOWED_EXAMS)).map(describeImport)).toEqual([]);
    expect(exams.filter(({ file }) => inside(file, STUDENT_API)).map(describeImport)).toEqual([]);
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

describe("012/SC-012 012/FR-036 015/FR-030 a prova só como tipo EXAM; o monitoramento e o cronômetro ficam fora das atividades", () => {
  /**
   * 015 research F18: monitoring lives only in `attempt-integrity`, `features/controlled-attempt` and
   * `components/ui/assessment`; the activity features and the AI help never detect focus, fullscreen
   * or the clipboard themselves (the help field reuses the controlled-attempt hook).
   */
  const MONITORED_WEB = [...ACTIVITIES_WEB, "apps/web/features/work-help"];
  const WEB_SOURCES = MONITORED_WEB.flatMap(sources).filter((file) => !/\.test\.tsx?$|test-fixtures\.ts$/.test(file));
  const MONITORED_API = [...ACTIVITIES_API, "apps/api/src/modules/work-help"];
  /** Exam-mode monitoring (012 research P19): timer, countdown, alerts, fullscreen, focus, clipboard. */
  const MONITORING = [/ExamTimer|FinalCountdown|TimeAlert|FocusViolation|ReviewFlag/, /requestFullscreen|fullscreenchange|exitFullscreen/, /["']blur["']|onBlurCapture|hasFocus\s*\(/, /navigator\.clipboard|["'](copy|paste|cut)["']|\bon(Copy|Paste|Cut)\b/];

  it("018 as rotas de prova ficam no Banco de Provas, na geração e no acompanhamento; nenhum texto rotula o aluno", () => {
    const catalog = readFileSync(join(REPO_ROOT, "packages/contracts/src/endpoints.ts"), "utf8");
    const paths = [...catalog.matchAll(/path:\s*"([^"]+)"/g)].map((match) => match[1]!);
    const EXAM_ROUTES = /^\/exams(\/|$)|^\/exam-generation(-requests)?(\/|$)|\/activities\/:activityId\/exam-(monitor|holds)(\/|$)/;
    expect(paths.filter((path) => /exam|prova/i.test(path) && !EXAM_ROUTES.test(path))).toEqual([]);
    // 018/FR-032: no screen of the activities calls an occurrence fraud, cheating or a violation.
    expect(offendingLines(WEB_SOURCES, [/\bfraude?/i, /\bcola\b/i, /viola[cç][aã]o/i])).toEqual([]);
  });

  it("nenhum cronômetro de prova, tela cheia, monitoramento de foco ou de área de transferência nas atividades nem na ajuda", () => {
    expect(offendingLines(WEB_SOURCES, MONITORING)).toEqual([]);
    expect(offendingLines(MONITORED_API.flatMap(sources), MONITORING)).toEqual([]);
  });

  it("018 cronômetro, contagem regressiva e alertas de tempo só em features/exam-attempt e components/ui/assessment", () => {
    const TIMER = [/ExamTimer|FinalCountdown|TimeAlert/];
    const elsewhere = ["apps/web/features", "apps/web/app"]
      .flatMap(sources)
      .filter((file) => !/\.test\.tsx?$|test-fixtures\.ts$/.test(file))
      .filter((file) => !inside(file, ["apps/web/features/exam-attempt", "apps/web/features/design-system"]));
    expect(offendingLines(elsewhere, TIMER)).toEqual([]);
  });

  it("controle: os padrões pegam o que devem", () => {
    expect(MONITORING.some((pattern) => pattern.test("document.documentElement.requestFullscreen();"))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test("<FinalCountdown seconds={10} />"))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test('window.addEventListener("blur", onBlur);'))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test("<textarea onPaste={block} />"))).toBe(true);
    expect(MONITORING.some((pattern) => pattern.test('document.addEventListener("visibilitychange", flush);'))).toBe(false);
  });
});
