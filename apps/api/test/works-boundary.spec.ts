import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { endpoints } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { MODEL_CATALOG } from "../src/modules/ai/definitions/model-catalog";
import { API_ROOT } from "./helpers/env";

/**
 * 011 research W1, W8, W20: the work bank lives apart from the 010 exercise bank (no import in
 * either direction, in the API, the contracts or the web), runs no code (nothing is executed in
 * 011; the Code Runner is a later spec) and never chooses a model (the 009 policy does, from the
 * task declaration alone).
 */

const REPO_ROOT = resolve(API_ROOT, "../..");
const WEB_ROOT = join(REPO_ROOT, "apps/web");

const WORKS_API = ["apps/api/src/modules/works", "apps/api/src/modules/work-ai"];
const EXERCISES_API = ["apps/api/src/modules/exercises", "apps/api/src/modules/exercise-ai"];
const WORKS_CONTRACTS = ["packages/contracts/src/works"];
const EXERCISES_CONTRACTS = ["packages/contracts/src/exercises"];
const WORKS_WEB = ["apps/web/features/works"];
const EXERCISES_WEB = ["apps/web/features/exercises"];

/** The one place `work-ai` may name tiers and families: the task declaration the 009 policy reads. */
const DEFINITIONS_FILE = "apps/api/src/modules/work-ai/definitions/work-generator.ts";
const TASK_DECLARATION = "export const WORK_GENERATION_TASK = defineTask({";

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

/** Repo-relative target of an import, when it points into the repo (relative or the web's `@/`). */
function importTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return relative(REPO_ROOT, resolve(join(REPO_ROOT, dirname(file)), specifier));
  if (specifier.startsWith("@/") && file.startsWith("apps/web/")) return relative(REPO_ROOT, join(WEB_ROOT, specifier.slice(2)));
  return null;
}

const inside = (path: string, dirs: readonly string[]) => dirs.some((dir) => path === dir || path.startsWith(dir + sep) || path.startsWith(`${dir}/`));

/** `file: specifier` of every import from a file under `from` into a directory of `to`. */
function crossImports(from: readonly string[], to: readonly string[]): string[] {
  return from.flatMap(sources).flatMap((file) =>
    [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(IMPORT_SPECIFIER)]
      .map((match) => match[1]!)
      .filter((specifier) => {
        const target = importTarget(file, specifier);
        return target !== null && inside(target, to);
      })
      .map((specifier) => `${file}: ${specifier}`),
  );
}

/** Names imported from the contracts barrel (`@repo/contracts`) by the files under `dirs`. */
function contractNames(dirs: readonly string[]): { file: string; name: string }[] {
  const IMPORT = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+["']@repo\/contracts["']/g;
  return dirs.flatMap(sources).flatMap((file) =>
    [...readFileSync(join(REPO_ROOT, file), "utf8").matchAll(IMPORT)].flatMap((match) =>
      match[1]!
        .split(",")
        .map((part) => part.replace(/\btype\s+/, "").split(/\s+as\s+/)[0]!.trim())
        .filter(Boolean)
        .map((name) => ({ file, name })),
    ),
  );
}

/** Code lines only: a comment may explain what the module does not do. */
const isComment = (line: string) => /^\s*(\*|\/\/|\/\*)/.test(line);

function offendingLines(files: readonly string[], patterns: readonly RegExp[], text: (file: string) => string): string[] {
  return files.flatMap((file) =>
    text(file)
      .split("\n")
      .flatMap((line, index) => (!isComment(line) && patterns.some((pattern) => pattern.test(line)) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

const read = (file: string) => readFileSync(join(REPO_ROOT, file), "utf8");

describe("011/FR-001 o banco de trabalhos é separado do banco de exercícios (research W1)", () => {
  it("varre os módulos do banco de trabalhos", () => {
    expect(sources(WORKS_API[0]!)).toContain("apps/api/src/modules/works/works.module.ts");
    expect(sources(WORKS_CONTRACTS[0]!)).toContain("packages/contracts/src/works/works.ts");
  });

  it("nenhum import entre works/work-ai e exercises/exercise-ai na API, nos dois sentidos", () => {
    expect(crossImports(WORKS_API, EXERCISES_API)).toEqual([]);
    expect(crossImports(EXERCISES_API, WORKS_API)).toEqual([]);
  });

  it("nenhum import entre os contratos de works e de exercises, nos dois sentidos", () => {
    expect(crossImports(WORKS_CONTRACTS, EXERCISES_CONTRACTS)).toEqual([]);
    expect(crossImports(EXERCISES_CONTRACTS, WORKS_CONTRACTS)).toEqual([]);
  });

  it("nenhum import entre features/works e features/exercises no web, nos dois sentidos", () => {
    expect(crossImports(WORKS_WEB, EXERCISES_WEB)).toEqual([]);
    expect(crossImports(EXERCISES_WEB, WORKS_WEB)).toEqual([]);
  });

  it("pelo pacote de contratos, works não usa tipos de exercício e exercises não usa tipos de trabalho", () => {
    const worksUsingExercises = contractNames([...WORKS_API, ...WORKS_WEB]).filter(({ name }) => /Exercise|exercise|^alternative/.test(name));
    const exercisesUsingWorks = contractNames([...EXERCISES_API, ...EXERCISES_WEB]).filter(({ name }) => /Work|work/.test(name));
    expect(worksUsingExercises.map(({ file, name }) => `${file}: ${name}`)).toEqual([]);
    expect(exercisesUsingWorks.map(({ file, name }) => `${file}: ${name}`)).toEqual([]);
  });

  it("controle: a varredura resolve imports relativos e o alias do web", () => {
    expect(importTarget("apps/api/src/modules/works/work-topics.ts", "../exercises/types")).toBe("apps/api/src/modules/exercises/types");
    expect(importTarget("apps/web/features/works/api/works.ts", "@/features/exercises/api")).toBe("apps/web/features/exercises/api");
    expect(importTarget("apps/api/src/modules/works/work-topics.ts", "@repo/contracts")).toBeNull();
  });
});

describe("011/FR-038 nada é executado no banco de trabalhos (research W20)", () => {
  const FORBIDDEN = [/child_process/, /\bnode:vm\b|["']vm["']/, /\beval\s*\(/, /\bnew\s+Function\b/, /worker_threads/];

  it("nenhum child_process, vm, eval(, new Function ou worker_threads em works e work-ai", () => {
    expect(offendingLines(WORKS_API.flatMap(sources), FORBIDDEN, read)).toEqual([]);
  });

  it("controle: a varredura acha execução de código", () => {
    for (const line of ['import { exec } from "node:child_process";', "const f = new Function(code);", "eval(solution);", 'import vm from "node:vm";']) {
      expect(FORBIDDEN.some((pattern) => pattern.test(line)), line).toBe(true);
    }
  });
});

describe("011/FR-024 as regras de trabalho não escolhem modelo (research W8)", () => {
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

  /** The declaration file without its `defineTask({…})` block and the imports that feed it. */
  function withoutTaskDeclaration(file: string): string {
    const text = read(file);
    if (file !== DEFINITIONS_FILE) return text;
    const start = text.indexOf(TASK_DECLARATION);
    const end = text.indexOf("\n});", start);
    expect(start, "declaração da tarefa").toBeGreaterThan(-1);
    return (text.slice(0, start) + text.slice(end + 4)).replace(/^import .*model-families.*$/m, "");
  }

  it("nenhum arquivo de works nem de work-ai cita nível, família, catálogo, rota ou provedor (fora da declaração da tarefa)", () => {
    const files = WORKS_API.flatMap(sources).filter((file) => !file.endsWith(".spec.ts"));
    expect(offendingLines(files, FORBIDDEN, withoutTaskDeclaration)).toEqual([]);
  });

  it("controle: a varredura acha um nível citado e ignora a dificuldade pedagógica", () => {
    expect(FORBIDDEN.some((pattern) => pattern.test('const tier: AiModelTier = "STANDARD";'))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test("import { GENERATION_MODEL_FAMILIES } from '../ai';"))).toBe(true);
    expect(FORBIDDEN.some((pattern) => pattern.test('difficulty: "ADVANCED"'))).toBe(false);
  });
});

describe("011/FR-011 notas em aritmética decimal exata, nunca ponto flutuante (research W3)", () => {
  const FORBIDDEN = [/\bparseFloat\s*\(/, /\bNumber\s*\(/, /\.toNumber\s*\(/];

  it("nenhum parseFloat, Number( nem .toNumber() em works e work-ai", () => {
    expect(offendingLines(WORKS_API.flatMap(sources), FORBIDDEN, read)).toEqual([]);
  });

  it("controle: a varredura acha a conversão para float e ignora nomes parecidos", () => {
    for (const line of ["const grade = parseFloat(body.totalGrade);", "Number(row.value)", "row.value.toNumber()"]) {
      expect(FORBIDDEN.some((pattern) => pattern.test(line)), line).toBe(true);
    }
    for (const line of ["const questionNumber = 3;", "Number.isInteger(cents)", "type Grade = GradeNumber(x);"]) {
      expect(FORBIDDEN.some((pattern) => pattern.test(line)), line).toBe(false);
    }
  });
});

/**
 * 011/SC-013: the exercise bank (010) keeps its tables, routes and rules. The routes of the 010
 * catalog are pinned, and no migration after the 010 one writes to, alters or drops a 010 table
 * (a foreign key from a work table to `programming_languages` only references it). Its rules are
 * covered by the import scans above and by the `010-*` suites, which run unchanged.
 */
describe("011/SC-013 o banco de exercícios (010) não muda com o banco de trabalhos", () => {
  const TABLES_010 = ["programming_languages", "exercises", "exercise_alternatives", "exercise_generation_batches"];
  const MIGRATIONS = join(API_ROOT, "prisma/migrations");
  const after010 = readdirSync(MIGRATIONS)
    .filter((name) => /^\d{14}_/.test(name) && name > "20260928120000_exercise_bank")
    .sort();
  /** Statements that change a table: ALTER, DROP, TRUNCATE, writes, and indexes, triggers, rules or policies on it. */
  const changes = (sql: string, table: string) =>
    sql
      .replace(/--.*$/gm, "")
      .split(";")
      .map((statement) => statement.replace(/\s+/g, " ").trim())
      .filter((statement) =>
        new RegExp(
          `^(ALTER TABLE|DROP TABLE|TRUNCATE|UPDATE|DELETE FROM|INSERT INTO|COMMENT ON TABLE)( IF EXISTS| ONLY)* "?${table}"?\\b` +
            `|^CREATE (UNIQUE )?INDEX .* ON "?${table}"?\\b|^CREATE (OR REPLACE )?(CONSTRAINT )?TRIGGER .* ON "?${table}"?\\b` +
            `|^CREATE (RULE|POLICY) .* ON "?${table}"?\\b`,
          "i",
        ).test(statement),
      );

  it("as rotas da 010 são as mesmas, com os mesmos métodos e caminhos", () => {
    const routes = Object.entries(endpoints)
      .filter(([key]) => /^(exercises|exerciseBatches|programmingLanguages)\./.test(key))
      .map(([key, endpoint]) => `${key} ${endpoint.method} ${endpoint.path}`)
      .sort();
    expect(routes).toEqual(
      [
        "exercises.createSet POST /exercises/sets",
        "exercises.create POST /exercises",
        "exercises.list GET /exercises",
        "exercises.get GET /exercises/:id",
        "exercises.update PUT /exercises/:id",
        "exercises.approve POST /exercises/:id/approve",
        "exercises.archive POST /exercises/:id/archive",
        "exercises.restore POST /exercises/:id/restore",
        "exercises.delete DELETE /exercises/:id",
        "programmingLanguages.list GET /programming-languages",
        "exerciseBatches.availability GET /exercise-generation/availability",
        "exerciseBatches.request POST /exercise-batches",
        "exerciseBatches.list GET /exercise-batches",
        "exerciseBatches.get GET /exercise-batches/:id",
        "exerciseBatches.approve POST /exercise-batches/:id/approve",
      ].sort(),
    );
  });

  it("nenhuma migração depois da 010 altera, apaga ou escreve nas tabelas da 010", () => {
    expect(after010).toContain("20260930120000_work_bank");
    const found = after010.flatMap((name) => {
      const sql = readFileSync(join(MIGRATIONS, name, "migration.sql"), "utf8");
      return TABLES_010.flatMap((table) => changes(sql, table).map((statement) => `${name}: ${statement.slice(0, 120)}`));
    });
    expect(found).toEqual([]);
  });

  it("controle: a varredura acha uma mudança numa tabela da 010 e ignora a referência de uma chave estrangeira", () => {
    expect(changes('ALTER TABLE "exercises" ADD COLUMN "x" INTEGER;', "exercises")).toHaveLength(1);
    expect(changes('CREATE INDEX "i" ON "exercise_alternatives"("x");', "exercise_alternatives")).toHaveLength(1);
    expect(changes('UPDATE "programming_languages" SET "x" = 1;', "programming_languages")).toHaveLength(1);
    expect(
      changes('ALTER TABLE "work_questions" ADD CONSTRAINT "fk" FOREIGN KEY ("language_id") REFERENCES "programming_languages"("id");', "programming_languages"),
    ).toEqual([]);
    expect(changes('-- ALTER TABLE "exercises" in a comment\nSELECT 1;', "exercises")).toEqual([]);
  });
});
