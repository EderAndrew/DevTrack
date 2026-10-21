import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 019 research B2, B15 (constitution IV): student code never runs in the API. The worker
 * (`src/code-runner`) is a process of its own that nothing else imports; only `docker-sandbox.ts`
 * starts processes; `code-runs` never reaches grading, points, the ranking or the submission
 * (FR-008); and no audit or log call of either carries a program, an input or an output (FR-019,
 * SC-006).
 */

const WORKER_DIR = "src/code-runner/";
const CODE_RUNS_DIR = "src/modules/code-runs/";
const DOCKER_SANDBOX = "src/code-runner/sandbox/docker-sandbox.ts";

function sources(dir: string): string[] {
  const absolute = join(API_ROOT, dir);
  if (!existsSync(absolute)) return [];
  return readdirSync(absolute).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(join(API_ROOT, path)).isDirectory()) return sources(path);
    return /\.ts$/.test(name) ? [path] : [];
  });
}

const production = (dir: string) => sources(dir).filter((file) => !/\.(spec|test)\.ts$/.test(file) && !file.startsWith("src/generated/"));
const read = (file: string) => readFileSync(join(API_ROOT, file), "utf8");

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["'`]([^"'`]+)["'`]/g;
const importsOf = (text: string) => [...text.matchAll(IMPORT_SPECIFIER)].map(([, specifier]) => specifier!);

/** The repo-relative targets of a file's relative imports. */
const relativeTargets = (file: string, text = read(file)) =>
  importsOf(text)
    .filter((specifier) => specifier.startsWith("."))
    .map((specifier) => relative(API_ROOT, resolve(join(API_ROOT, dirname(file)), specifier)));

/** Process-starting modules: only the Docker CLI wrapper may use them. */
const PROCESS_MODULE = /^(node:)?(child_process|cluster|worker_threads|vm)$/;

/** What `code-runs` must never reach (FR-008): grading, points, the ranking, the submission. */
const FORBIDDEN_TARGET = /(^|\/)(activities\/(submission|grading|results)|ranking|works\/grading|exam-sessions)(\/|$)|points/;
/** Contract names of grades and points. */
const FORBIDDEN_CONTRACT_NAME = /\b(EXERCISE_POINTS|Points\w*|\w*Grade\w*|\w*Grading\w*|Ranking\w*|\w*Submission\w*)\b/;

/** Content that never goes to the audit trail or a log line (FR-019). */
const CONTENT = /\b(sourceCode|source_code|stdout|stderr|input|expectedOutput|expected_output|compileOutput|compile_output|artifact)\b/;
/** An audit record or a log call, up to its matching parenthesis. */
const SINK = /\b(?:audit\.record|logger\.(?:log|warn|error|debug|verbose|fatal|info)|console\.(?:log|warn|error|info|debug))\s*\(/g;

/** The argument text of every sink call in `text`, with its line. */
function sinkCalls(text: string): { line: number; args: string }[] {
  const calls: { line: number; args: string }[] = [];
  for (const match of text.matchAll(SINK)) {
    const start = match.index + match[0].length;
    let depth = 1;
    let end = start;
    while (end < text.length && depth > 0) {
      const char = text[end]!;
      if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
      end += 1;
    }
    calls.push({ line: text.slice(0, match.index).split("\n").length, args: text.slice(start, end - 1) });
  }
  return calls;
}

const contentInSinks = (file: string, text = read(file)) =>
  sinkCalls(text)
    .filter(({ args }) => CONTENT.test(args))
    .map(({ line, args }) => `${file}:${line} ${args.replace(/\s+/g, " ").slice(0, 120)}`);

const forbiddenReach = (file: string, text = read(file)) => [
  ...relativeTargets(file, text)
    .filter((target) => FORBIDDEN_TARGET.test(target))
    .map((target) => `${file} → ${target}`),
  ...[...text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@repo\/contracts["']/g)]
    .flatMap(([, names]) => names!.split(",").map((name) => name.replace(/\btype\b/, "").trim()))
    .filter((name) => FORBIDDEN_CONTRACT_NAME.test(name))
    .map((name) => `${file} → @repo/contracts ${name}`),
];

/** The profile keys the code may name (research B5): everything else of the catalog is data. */
const PROFILE_KEYS = new Set(["java", "python", "javascript"]);

/** The seeded catalog (010 migration): `[key, name]` of every language. */
function catalog(): [string, string][] {
  const migrations = join(API_ROOT, "prisma/migrations");
  const seed = readdirSync(migrations)
    .map((dir) => join(migrations, dir, "migration.sql"))
    .filter((file) => existsSync(file))
    .map((file) => readFileSync(file, "utf8"))
    .find((sql) => sql.includes('INSERT INTO "programming_languages" ("key", "name"'))!;
  const block = seed.slice(seed.indexOf('INSERT INTO "programming_languages" ("key", "name"'));
  return [...block.slice(0, block.indexOf(";")).matchAll(/\('([^']+)',\s*'([^']+)'/g)].map(([, key, name]) => [key!, name!]);
}

/** A catalog language named in code: its name, or a key that isn't a profile key, as a whole string literal. */
function catalogLiterals(file: string, text = read(file), languages = catalog()): string[] {
  const literals = new Set([...text.matchAll(/(["'`])([^"'`\n]*)\1/g)].map(([, , value]) => value!));
  return languages
    .flatMap(([key, name]) => [name, ...(PROFILE_KEYS.has(key) ? [] : [key])])
    .filter((value) => literals.has(value))
    .map((value) => `${file} → "${value}"`);
}

describe("019/FR-013 fronteira do Code Runner (research B2, B15)", () => {
  it("há código do worker e de code-runs para conferir", () => {
    expect(production(WORKER_DIR)).toEqual(expect.arrayContaining(["src/code-runner/main.ts", DOCKER_SANDBOX, "src/code-runner/profiles.ts"]));
    expect(production(CODE_RUNS_DIR)).toEqual(expect.arrayContaining(["src/modules/code-runs/code-runs.module.ts", "src/modules/code-runs/verdict.ts"]));
  });

  it("019/FR-013 nada fora de src/code-runner importa o worker (a API nunca o carrega)", () => {
    const offenders = production("src")
      .filter((file) => !file.startsWith(WORKER_DIR))
      .flatMap((file) => relativeTargets(file).filter((target) => target.startsWith(WORKER_DIR.slice(0, -1))).map((target) => `${file} → ${target}`));
    expect(offenders).toEqual([]);
  });

  it("019/FR-013 só docker-sandbox.ts inicia processos (child_process, cluster, worker_threads, vm)", () => {
    const users = production(WORKER_DIR).concat(production(CODE_RUNS_DIR)).filter((file) => importsOf(read(file)).some((specifier) => PROCESS_MODULE.test(specifier)));
    expect(users).toEqual([DOCKER_SANDBOX]);
    const elsewhere = production("src")
      .filter((file) => file !== DOCKER_SANDBOX && !file.startsWith("src/modules/syllabus/"))
      .filter((file) => importsOf(read(file)).some((specifier) => /^(node:)?(child_process|cluster|vm)$/.test(specifier)));
    expect(elsewhere).toEqual([]);
  });

  it("019/FR-008 code-runs e o worker não alcançam correção, pontos, ranking nem entrega", () => {
    const offenders = production(CODE_RUNS_DIR).concat(production(WORKER_DIR)).flatMap((file) => forbiddenReach(file));
    expect(offenders).toEqual([]);
  });

  it("019/FR-019 019/SC-006 auditoria e logs de code-runs e do worker sem código, entrada nem saída", () => {
    const offenders = production(CODE_RUNS_DIR).concat(production(WORKER_DIR)).flatMap((file) => contentInSinks(file));
    expect(offenders).toEqual([]);
  });

  it("019/US4-1 019/FR-020 code-runs e o worker não nomeiam linguagens do catálogo, só as chaves de perfil", () => {
    expect(catalog().length).toBeGreaterThanOrEqual(13);
    const offenders = production(CODE_RUNS_DIR).concat(production(WORKER_DIR)).flatMap((file) => catalogLiterals(file));
    expect(offenders).toEqual([]);
    // Control: a branch on a catalog language is found.
    const sample = 'if (language.name === "C++" || language.key === "rust") return; const key = "java";';
    expect(catalogLiterals("src/modules/code-runs/sample.ts", sample)).toEqual(['src/modules/code-runs/sample.ts → "C++"', 'src/modules/code-runs/sample.ts → "rust"']);
  });

  it("cada varredura acha o padrão proibido num exemplo", () => {
    const sample = [
      'import { spawn } from "node:child_process";',
      'import { registerSubmission } from "../activities/submission/register";',
      'import { rankClass } from "../ranking/rank";',
      'import { EXERCISE_POINTS, type CodeRun } from "@repo/contracts";',
      "this.audit.record(tx, { type: \"code_run.finished\", metadata: { passedCount, stdout: result.stdout } });",
      "this.logger.warn({ runId, sourceCode }, \"code_run.failed\");",
      "this.logger.log({ runId, verdicts }, \"code_run.finished\");",
    ].join("\n");
    const file = "src/modules/code-runs/sample.ts";
    expect(importsOf(sample).filter((specifier) => PROCESS_MODULE.test(specifier))).toEqual(["node:child_process"]);
    expect(forbiddenReach(file, sample)).toEqual([
      "src/modules/code-runs/sample.ts → src/modules/activities/submission/register",
      "src/modules/code-runs/sample.ts → src/modules/ranking/rank",
      "src/modules/code-runs/sample.ts → @repo/contracts EXERCISE_POINTS",
    ]);
    expect(contentInSinks(file, sample).map((line) => line.split(" ")[0])).toEqual([`${file}:5`, `${file}:6`]);
    expect(relativeTargets("src/modules/activities/x.ts", 'import { a } from "../../code-runner/worker";')).toEqual(["src/code-runner/worker"]);
  });
});
