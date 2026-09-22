import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * SC-010 / criterion 28: every acceptance scenario of spec.md and every row of its
 * "Acceptance Criteria Traceability" table is covered by an automated test. A test covers an
 * id when the id appears in the title of a `describe`/`it`/`test` (composites such as
 * `US5-6/US5-7` count for both).
 */
const REPO_ROOT = resolve(API_ROOT, "../..");
const SPEC = join(REPO_ROOT, "specs/001-foundation-identity-access/spec.md");
const TEST_ROOTS = [
  { dir: join(REPO_ROOT, "apps/api/test"), pattern: /\.spec\.ts$/ },
  { dir: join(REPO_ROOT, "apps/api/src"), pattern: /\.spec\.ts$/ },
  { dir: join(REPO_ROOT, "apps/web"), pattern: /\.test\.tsx?$/ },
];
const SKIPPED_DIRS = new Set(["node_modules", ".next", "dist", "generated", ".turbo"]);
const ID = /\b(?:US\d+-\d+|SC-\d{3}|FR-\d{3}[a-z]?)\b/g;

function testFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : testFiles(join(dir, entry.name), pattern);
    return pattern.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

/** `describe`/`it`/`test` titles (string, template or `.each` forms) of a test file. */
export function testTitles(source: string): string[] {
  const title = /\b(?:describe|it|test)(?:\.(?:each|skip|only|todo|concurrent)(?:\([^)]*\))?)?\(\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g;
  return [...source.matchAll(title)].map((m) => m[2]!);
}

/** id → files whose test titles mention it. */
function coverage(): Map<string, Set<string>> {
  const covered = new Map<string, Set<string>>();
  for (const { dir, pattern } of TEST_ROOTS) {
    for (const file of testFiles(dir, pattern)) {
      for (const title of testTitles(readFileSync(file, "utf8"))) {
        for (const [id] of title.matchAll(ID)) {
          if (!covered.has(id)) covered.set(id, new Set());
          covered.get(id)!.add(relative(REPO_ROOT, file));
        }
      }
    }
  }
  return covered;
}

/** `USn-k` of each numbered item under "**Acceptance Scenarios**:" of "### User Story n". */
export function acceptanceScenarios(spec: string): string[] {
  const ids: string[] = [];
  let story: string | null = null;
  let inScenarios = false;
  let count = 0;
  for (const line of spec.split("\n")) {
    const heading = /^### User Story (\d+)\b/.exec(line);
    if (heading) {
      story = heading[1]!;
      inScenarios = false;
      continue;
    }
    if (/^(#{2,3} |---)/.test(line)) {
      story = null;
      inScenarios = false;
      continue;
    }
    if (story && line.startsWith("**Acceptance Scenarios**")) {
      inScenarios = true;
      count = 0;
      continue;
    }
    if (inScenarios && /^\*\*/.test(line)) inScenarios = false;
    if (inScenarios && /^\d+\. /.test(line)) ids.push(`US${story}-${++count}`);
  }
  return ids;
}

interface TraceabilityRow {
  number: number;
  criterion: string;
  ids: string[];
}

export function traceabilityRows(spec: string): TraceabilityRow[] {
  const section = spec.split("### Acceptance Criteria Traceability")[1]?.split(/\n## /)[0] ?? "";
  return section
    .split("\n")
    .filter((line) => /^\| \d+ \|/.test(line))
    .map((line) => {
      const [number, criterion, verifiedBy] = line.split("|").slice(1, 4).map((cell) => cell.trim());
      return { number: Number(number), criterion: criterion!, ids: [...verifiedBy!.matchAll(ID)].map((m) => m[0]) };
    });
}

describe("SC-010 — rastreabilidade dos critérios de aceite (critério 28)", () => {
  const spec = readFileSync(SPEC, "utf8");
  const covered = coverage();
  const missing = (ids: string[]) => ids.filter((id) => !covered.has(id));

  it("os parsers leem a spec inteira (66 cenários em 8 histórias, 28 critérios)", () => {
    const scenarios = acceptanceScenarios(spec);
    expect(scenarios).toHaveLength(66);
    expect(new Set(scenarios.map((id) => id.split("-")[0]))).toEqual(
      new Set(["US1", "US2", "US3", "US4", "US5", "US6", "US7", "US8"]),
    );
    const rows = traceabilityRows(spec);
    expect(rows.map((row) => row.number)).toEqual(Array.from({ length: 28 }, (_, i) => i + 1));
    expect(rows.every((row) => row.ids.length > 0)).toBe(true);
  });

  it("todo cenário de aceite USn-k tem teste", () => {
    expect(missing(acceptanceScenarios(spec))).toEqual([]);
  });

  it.each(traceabilityRows(spec).map((row) => [row.number, row] as const))("critério %i coberto", (_n, row) => {
    const scenarioIds = row.ids.filter((id) => id.startsWith("US"));
    // Rows with scenarios are covered by them; rows without (25, 27, 28) need their SC/FR ids.
    const required = scenarioIds.length > 0 ? scenarioIds : row.ids;
    expect(missing(required), `critério ${row.number}: ${row.criterion}`).toEqual([]);
  });

  it("SC-003 a SC-012 aparecem em títulos de teste", () => {
    const ids = Array.from({ length: 10 }, (_, i) => `SC-${String(i + 3).padStart(3, "0")}`);
    expect(missing(ids)).toEqual([]);
  });

  it("o extrator de títulos reconhece as formas usadas nos testes", () => {
    const source = [
      'describe("US5-6/US5-7 ciclo", () => {',
      "  it(`US2-3: bloqueio`, async () => {});",
      '  it.each(["a"])("SC-008 %s", () => {});',
      "  // US9-9 em comentário não conta",
      "});",
    ].join("\n");
    const ids = testTitles(source).flatMap((title) => [...title.matchAll(ID)].map((m) => m[0]));
    expect(ids).toEqual(["US5-6", "US5-7", "US2-3", "SC-008"]);
  });
});
