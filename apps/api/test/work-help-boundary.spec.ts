import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../src/modules/ai/definitions/model-catalog";
import { API_ROOT } from "./helpers/env";

/**
 * 015 research F1, F8, F10, F18: the AI help never hands the answer key to the model (the tool and
 * the prompt context read only what the student sees; the leak check, which needs the key, lives in
 * `work-help/help`), never chooses a model (the 009 policy does, from the task declaration alone)
 * and does no float arithmetic. Neither the AI help nor the controlled mode ends, submits, grades or
 * blocks an attempt, and nothing of exams (timer, automatic submission) comes in.
 */

const REPO_ROOT = resolve(API_ROOT, "../..");

const WORK_HELP_API = ["apps/api/src/modules/work-help"];
const INTEGRITY_API = ["apps/api/src/modules/attempt-integrity"];
/** What reaches the model: the agent, its prompt, its read tool and the resource ownership. */
const MODEL_INPUT = ["apps/api/src/modules/work-help/definitions"];

/** The one place `work-help` may name tiers and families: the task declaration the 009 policy reads. */
const DEFINITIONS_FILE = "apps/api/src/modules/work-help/definitions/work-helper.ts";
const TASK_DECLARATION = "export const WORK_HELP_TASK = defineTask({";

function sources(dir: string): string[] {
  const absolute = join(REPO_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(REPO_ROOT, path)).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

const production = (dirs: readonly string[]) => dirs.flatMap(sources).filter((file) => !file.endsWith(".spec.ts"));

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;

function importTarget(file: string, specifier: string): string | null {
  return specifier.startsWith(".") ? relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier)) : null;
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

const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");

/** Code lines only: a comment may explain what the module does not do. */
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function offendingLines(files: readonly string[], patterns: readonly RegExp[], text: (file: string) => string = read): string[] {
  return files.flatMap((file) =>
    text(file)
      .split("\n")
      .flatMap((line, index) => (!isComment(line) && patterns.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

describe("015/FR-018 015/FR-030 fronteiras da ajuda da IA e do modo controlado (research F1, F8, F18)", () => {
  it("varre os dois módulos", () => {
    expect(sources(WORK_HELP_API[0]!)).toContain("apps/api/src/modules/work-help/work-help.module.ts");
    expect(sources(INTEGRITY_API[0]!)).toContain("apps/api/src/modules/attempt-integrity/attempt-integrity.module.ts");
    expect(sources(MODEL_INPUT[0]!)).toContain(DEFINITIONS_FILE);
  });

  it("controle: a varredura resolve imports relativos", () => {
    expect(importTarget("apps/api/src/modules/work-help/help/materialize.ts", "../../activities/submission/register")).toBe(
      "apps/api/src/modules/activities/submission/register",
    );
    expect(importTarget("apps/api/src/modules/work-help/help/materialize.ts", "@repo/contracts")).toBeNull();
  });
});

describe("015/FR-018 o que vai ao modelo nunca lê o gabarito (research F8)", () => {
  /** The answer-key fields of the snapshot (and of the banks) and the private test cases. */
  const ANSWER_KEY = [/\bisCorrect\b|\bis_correct\b/, /\bexpectedAnswer\b|\bexpected_answer\b/, /\bexpectedSolution\b|\bexpected_solution\b/, /\bexplanation\b/, /\brubric\b/, /\bisTrickQuestion\b|\bis_trick_question\b/, /["']PRIVATE["']/];

  it("a ferramenta, o prompt, o contexto e a posse do recurso não citam nenhum campo do gabarito", () => {
    expect(offendingLines(production(MODEL_INPUT), ANSWER_KEY)).toEqual([]);
  });

  it("o que vai ao modelo não importa as visões do professor nem a checagem de vazamento", () => {
    const teacherSide = ["apps/api/src/modules/activities/views/teacher-view", "apps/api/src/modules/work-help/help"];
    expect(importsInto(MODEL_INPUT, teacherSide)).toEqual([]);
  });

  it("controle: a varredura acha o gabarito e ignora o enunciado", () => {
    for (const line of ["select: { isCorrect: true }", "question.expectedAnswer", "testCases.filter((c) => c.visibility === 'PRIVATE')", "rubric: q.rubric"]) {
      expect(ANSWER_KEY.some((pattern) => pattern.test(line)), line).toBe(true);
    }
    for (const line of ["statement: question.statement", "starterCode: question.starterCode", "visibility: 'PUBLIC'"]) {
      expect(ANSWER_KEY.some((pattern) => pattern.test(line)), line).toBe(false);
    }
  });
});

describe("015/FR-018 a ajuda não escolhe modelo (009, research F8)", () => {
  const FORBIDDEN = [
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

  /** The declaration file without its `defineTask({…})` block (once US3 declares it) and the imports that feed it. */
  function withoutTaskDeclaration(file: string): string {
    const text = read(file);
    if (file !== DEFINITIONS_FILE) return text;
    const start = text.indexOf(TASK_DECLARATION);
    if (start === -1) return text;
    const end = text.indexOf("\n});", start);
    return (text.slice(0, start) + text.slice(end + 4)).replace(/^import .*model-families.*$/m, "");
  }

  it("nenhum arquivo de work-help nem de attempt-integrity cita nível, família, catálogo, rota ou provedor (fora da declaração da tarefa)", () => {
    expect(offendingLines(production([...WORK_HELP_API, ...INTEGRITY_API]), FORBIDDEN, withoutTaskDeclaration)).toEqual([]);
  });

  it("controle: a varredura acha um nível citado", () => {
    expect(FORBIDDEN.some((pattern) => pattern.test('const tier: AiModelTier = "STANDARD";'))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test('outcome: "GUIDANCE"'))).toBe(false);
  });
});

describe("015/FR-013 015/FR-030 nada entrega, corrige, bloqueia ou cronometra a tentativa (research F1, F18)", () => {
  const FORBIDDEN = [
    /\bregisterSubmission\b/,
    /status:\s*["']SUBMITTED["']/,
    /\bactivitySubmission\b|\bactivity_submissions\b/,
    /\bactivityQuestionGrading\b|\bactivity_question_gradings\b/,
    /\bdecideByTeacher\b|\bgradeQuestion\b/,
    /auto_?submit/i,
    /ExamTimer|countdown/i,
  ];
  const GRADING = ["apps/api/src/modules/activities/submission", "apps/api/src/modules/activities/grading", "apps/api/src/modules/works/grading"];

  it("nenhum dos dois módulos entrega, corrige, cronometra ou bloqueia a tentativa", () => {
    expect(offendingLines(production([...WORK_HELP_API, ...INTEGRITY_API]), FORBIDDEN)).toEqual([]);
  });

  it("nenhum dos dois módulos importa a entrega ou a correção", () => {
    expect(importsInto([...WORK_HELP_API, ...INTEGRITY_API], GRADING)).toEqual([]);
  });

  it("015/FR-018 015/FR-030 sem parseFloat, Number( nem .toNumber() nos dois módulos", () => {
    const FLOAT = [/\bparseFloat\s*\(/, /\bNumber\s*\(/, /\.toNumber\s*\(/];
    expect(offendingLines(production([...WORK_HELP_API, ...INTEGRITY_API]), FLOAT)).toEqual([]);
  });

  it("controle: a varredura acha uma entrega automática", () => {
    for (const line of ['await tx.activityAttempt.update({ data: { status: "SUBMITTED" } });', "await registerSubmission(tx, attempt);", "const autoSubmit = true;"]) {
      expect(FORBIDDEN.some((pattern) => pattern.test(line)), line).toBe(true);
    }
    expect(FORBIDDEN.some((pattern) => pattern.test('status: "IN_PROGRESS"'))).toBe(false);
  });
});
