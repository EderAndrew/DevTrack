import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../src/modules/ai/definitions/model-catalog";
import { API_ROOT } from "./helpers/env";

/**
 * 018 research T1, T16: the Banco de Provas is a third bank. `exams` and `exam-ai` (API) and
 * `features/exams` (web) import nothing of the exercise and work banks but the work bank's pure parts
 * (`works/types`, `works/grading`, `works/grade`); they run no code, choose no model and do no float
 * arithmetic. `exam-sessions` (the monitor and the decisions) calls no AI and no AI help, runs no code
 * and writes grades only through `activities/submission`. No exam text names fraud (FR-032).
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const EXAMS_API = ["apps/api/src/modules/exams", "apps/api/src/modules/exam-ai"];
const SESSIONS_API = ["apps/api/src/modules/exam-sessions"];
const EXAMS_WEB = ["apps/web/features/exams"];
const SESSIONS_WEB = ["apps/web/features/exam-session", "apps/web/features/exam-attempt"];

/** The only parts of the work bank an exam may use: the question model and the exact grade rules. */
const ALLOWED_WORKS = ["apps/api/src/modules/works/types", "apps/api/src/modules/works/grading", "apps/api/src/modules/works/grade"];
const BANKS_API = [
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/works",
  "apps/api/src/modules/work-ai",
];
const BANKS_WEB = ["apps/web/features/exercises", "apps/web/features/works"];
const SESSIONS_FORBIDDEN_API = [
  "apps/api/src/modules/ai",
  "apps/api/src/modules/curriculum-ai",
  "apps/api/src/modules/exercise-ai",
  "apps/api/src/modules/work-ai",
  "apps/api/src/modules/exam-ai",
  "apps/api/src/modules/work-help",
  "apps/api/src/modules/exercises",
  "apps/api/src/modules/works",
  "apps/api/src/modules/activities/grading",
];
const SESSIONS_FORBIDDEN_WEB = ["apps/web/features/ai", "apps/web/features/ai-operations", "apps/web/features/work-help"];

/** The one place `exam-ai` may name tiers and families: the task declaration. */
const DEFINITIONS_FILE = "apps/api/src/modules/exam-ai/definitions/exam-generator.ts";
const TASK_DECLARATION = "export const EXAM_GENERATION_TASK = defineTask({";

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
const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier));
  if (specifier.startsWith("@/") && file.startsWith("apps/web/")) return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) => dirs.some((dir) => path === dir || path.startsWith(dir + sep) || path.startsWith(`${dir}/`));

function importsInto(from: readonly string[], to: readonly string[], allowed: readonly string[] = []): string[] {
  return production(from).flatMap((file) =>
    [...read(file).matchAll(IMPORT_SPECIFIER)]
      .map((match) => match[1]!)
      .filter((specifier) => {
        const target = importTarget(file, specifier);
        return target !== null && inside(target, to) && !inside(target, allowed);
      })
      .map((specifier) => `${file}: ${specifier}`),
  );
}

/** Code lines only: a comment may explain what the module does not do. */
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function offendingLines(files: readonly string[], patterns: readonly RegExp[], text: (file: string) => string = read): string[] {
  return files.flatMap((file) =>
    text(file)
      .split("\n")
      .flatMap((line, index) => (!isComment(line) && patterns.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

const EXECUTION = [/child_process/, /\bnode:vm\b|["']vm["']/, /\beval\s*\(/, /\bnew\s+Function\b/, /worker_threads/];
const FLOAT = [/\bparseFloat\s*\(/, /\bNumber\s*\(/, /\.toNumber\s*\(/];
const MODEL_CHOICE = [
  /\bModelTier\b/,
  /\bAiModelTier\b/,
  /\brouteFor\b/,
  /\bselectRoute\b/,
  /\bMODEL_CATALOG\b/,
  /model-catalog/,
  /model-families/,
  /MODEL_FAMILIES/,
  /\bPolicyRoute\b/,
  /\bmodelConfig/i,
  /openrouter/i,
  /["'](?:openai|anthropic|deepseek|typesafe)["']/,
  /\btier\b/i,
  new RegExp(`["'](?:${MODEL_CATALOG.map((entry) => entry.key).join("|")})["']`),
];
/** The grading rules themselves: exam-sessions reaches them only through `activities/submission`. */
const DIRECT_GRADING = [/\bdecideByTeacher\b/, /\bgradeQuestion\b/, /\bcomputeWorkGrade\b/];
/** FR-032: warnings, ends and the teacher's screens never call it fraud, cheating or a violation. */
const LABELS = [/\bfraud/i, /\bfraude/i, /\bcola\b/i, /viola[cç][aã]o/i, /\bcheat/i];

/** The declaration file without its `defineTask({…})` block and the imports that feed it. */
function withoutTaskDeclaration(file: string): string {
  const text = read(file);
  if (file !== DEFINITIONS_FILE) return text;
  const start = text.indexOf(TASK_DECLARATION);
  const end = text.indexOf("\n});", start);
  expect(start, "declaração da tarefa").toBeGreaterThan(-1);
  return (text.slice(0, start) + text.slice(end + 4)).replace(/^import .*model-families.*$/m, "");
}

describe("018/FR-001 o Banco de Provas é um banco à parte (research T1, T16)", () => {
  it("varre os módulos da prova", () => {
    expect(sources(EXAMS_API[0]!)).toContain("apps/api/src/modules/exams/exams.module.ts");
    expect(sources(EXAMS_API[1]!)).toContain("apps/api/src/modules/exam-ai/exam-ai.module.ts");
    expect(sources(SESSIONS_API[0]!)).toContain("apps/api/src/modules/exam-sessions/exam-sessions.module.ts");
  });

  it("exams e exam-ai não importam os bancos de exercícios e trabalhos, só as partes puras do banco de trabalhos", () => {
    expect(importsInto(EXAMS_API, BANKS_API, ALLOWED_WORKS)).toEqual([]);
  });

  it("o web do Banco de Provas não importa as features dos outros bancos", () => {
    expect(importsInto(EXAMS_WEB, BANKS_WEB)).toEqual([]);
  });

  it("018/FR-006 sem execução de código nem aritmética de float em exams e exam-ai", () => {
    expect(offendingLines(production(EXAMS_API), [...EXECUTION, ...FLOAT])).toEqual([]);
  });

  it("018/FR-005 exams e exam-ai não escolhem modelo (fora da declaração da tarefa)", () => {
    expect(offendingLines(production(EXAMS_API), MODEL_CHOICE, withoutTaskDeclaration)).toEqual([]);
  });
});

describe("018/FR-019 018/FR-032 a prova em andamento só decide e registra (research T9, T16)", () => {
  it("exam-sessions não importa IA, ajuda da IA, bancos nem as regras de correção diretamente", () => {
    expect(importsInto(SESSIONS_API, SESSIONS_FORBIDDEN_API)).toEqual([]);
    expect(importsInto(SESSIONS_WEB, SESSIONS_FORBIDDEN_WEB)).toEqual([]);
  });

  it("sem execução de código, aritmética de float ou correção fora de activities/submission", () => {
    expect(offendingLines(production(SESSIONS_API), [...EXECUTION, ...FLOAT, ...DIRECT_GRADING])).toEqual([]);
  });

  it("018/FR-032 nenhum texto da prova fala em fraude, cola ou violação", () => {
    const files = production([...EXAMS_API, ...SESSIONS_API, ...EXAMS_WEB, ...SESSIONS_WEB, "apps/api/src/modules/attempt-integrity"]);
    expect(offendingLines(files, LABELS)).toEqual([]);
  });

  it("controle: a varredura resolve imports e acha o proibido", () => {
    expect(importTarget("apps/api/src/modules/exams/exams.service.ts", "../works/grade/grade-values")).toBe("apps/api/src/modules/works/grade/grade-values");
    expect(inside("apps/api/src/modules/works/grade/grade-values", ALLOWED_WORKS)).toBe(true);
    expect(inside("apps/api/src/modules/works/views/student-view", ALLOWED_WORKS)).toBe(false);
    expect(inside("apps/api/src/modules/activities/submission/register", SESSIONS_FORBIDDEN_API)).toBe(false);
    expect(inside("apps/api/src/modules/activities/grading/bridge", SESSIONS_FORBIDDEN_API)).toBe(true);
    for (const line of ["const grade = Number(value);", 'const tier = "STANDARD";', "await decideByTeacher(question, grade);", 'label: "Fraude detectada"']) {
      expect([...FLOAT, ...MODEL_CHOICE, ...DIRECT_GRADING, ...LABELS].some((pattern) => pattern.test(line)), line).toBe(true);
    }
    for (const line of ['difficulty: "ADVANCED"', "const collapsed = true;", 'reason: "colagem bloqueada"']) {
      expect([...FLOAT, ...MODEL_CHOICE, ...DIRECT_GRADING, ...LABELS].some((pattern) => pattern.test(line)), line).toBe(false);
    }
  });
});
