import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * SC-010 / criterion 28 (001) and 003/D13: every acceptance scenario of each feature's spec.md
 * and every row of its "Acceptance Criteria Traceability" table is covered by an automated test.
 * A test covers an id when the id appears in the title of a `describe`/`it`/`test` (composites
 * such as `US5-6/US5-7` count for both). Ids of other features carry their number (`003/US1-1`)
 * and never cover the bare 001 id of the same name; the ids of the 003 spec are read as `003/…`.
 */
const REPO_ROOT = resolve(API_ROOT, "../..");
const TEST_ROOTS = [
  { dir: join(REPO_ROOT, "apps/api/test"), pattern: /\.spec\.ts$/ },
  { dir: join(REPO_ROOT, "apps/api/src"), pattern: /\.spec\.ts$/ },
  { dir: join(REPO_ROOT, "apps/web"), pattern: /\.test\.tsx?$/ },
  { dir: join(REPO_ROOT, "apps/web/e2e"), pattern: /\.spec\.ts$/ },
  // The on-demand evaluation against the real models (008/US1-4), like the local E2E, outside CI.
  { dir: join(REPO_ROOT, "apps/api/test/eval"), pattern: /\.eval\.ts$/ },
];

interface FeatureSpec {
  feature: string;
  path: string;
  /** User stories US1..USn. */
  stories: number;
  scenarios: number;
  rows: number;
  /** Rows verified by review only: their "Verificado por" cites no id (e.g. "Assumptions"). */
  rowsWithoutIds: number[];
  /** Success criteria that must appear in test titles. */
  successCriteria: string[];
  /**
   * A feature in implementation joins `SPECS` at its first phase (root CLAUDE.md): the scenarios of
   * these stories and these success criteria wait for their story. A pending id that a test already
   * covers fails, so the lists only shrink and are empty when the feature ends.
   */
  pending?: { stories: number[]; successCriteria: string[] };
}

const sc = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `SC-${String(from + i).padStart(3, "0")}`);

const SPECS: FeatureSpec[] = [
  {
    feature: "001",
    path: "specs/001-foundation-identity-access/spec.md",
    stories: 8,
    scenarios: 66,
    rows: 28,
    rowsWithoutIds: [],
    successCriteria: sc(3, 12),
  },
  {
    feature: "003",
    path: "specs/003-class-invitations-enrollment/spec.md",
    stories: 8,
    scenarios: 52,
    rows: 36,
    rowsWithoutIds: [30],
    // SC-001/SC-002 are timings of a person using the screens: the E2E journeys (SC-010) cover the flows.
    successCriteria: sc(3, 11),
  },
  {
    feature: "004",
    path: "specs/004-syllabus-planning/spec.md",
    stories: 9,
    scenarios: 60,
    rows: 26,
    rowsWithoutIds: [],
    // SC-001 is the time of a person using the screens, checked on the quickstart walk-through.
    successCriteria: sc(2, 12),
  },
  {
    feature: "005",
    path: "specs/005-design-system/spec.md",
    stories: 7,
    scenarios: 34,
    rows: 26,
    rowsWithoutIds: [],
    // SC-006 is the whole suite, SC-007 and SC-009 are checked by review, SC-008 on the quickstart (§4).
    successCriteria: [...sc(1, 5), ...sc(10, 10)],
  },
  {
    feature: "006",
    path: "specs/006-ai-foundation/spec.md",
    stories: 9,
    scenarios: 53,
    rows: 29,
    rowsWithoutIds: [],
    successCriteria: sc(1, 13),
  },
  {
    feature: "007",
    path: "specs/007-curriculum-agent/spec.md",
    stories: 7,
    scenarios: 40,
    // The spec has no traceability table: its scenarios, FRs and SCs are the ids.
    rows: 0,
    rowsWithoutIds: [],
    // SC-001 is covered by the local E2E journey (apps/web/e2e/curriculum-ai.spec.ts).
    successCriteria: sc(1, 9),
  },
  {
    feature: "008",
    path: "specs/008-ai-gateway-openrouter/spec.md",
    stories: 7,
    scenarios: 27,
    // The table of the request's acceptance criteria is informative and sits outside
    // "### Acceptance Criteria Traceability", as in 007.
    rows: 0,
    rowsWithoutIds: [],
    // SC-009 is the on-demand evaluation against the real models (test/eval, outside CI).
    successCriteria: [...sc(1, 8), "SC-010"],
  },
  {
    feature: "009",
    path: "specs/009-ai-model-policy/spec.md",
    stories: 8,
    scenarios: 35,
    // No "### Acceptance Criteria Traceability" table, as in 008.
    rows: 0,
    rowsWithoutIds: [],
    successCriteria: sc(1, 10),
  },
  {
    feature: "010",
    path: "specs/010-exercise-bank/spec.md",
    stories: 7,
    scenarios: 47,
    // No "### Acceptance Criteria Traceability" table, as in 008 and 009.
    rows: 0,
    rowsWithoutIds: [],
    // SC-002 is measured by the on-demand evaluation against the real models (test/eval).
    successCriteria: sc(1, 12),
  },
  {
    feature: "011",
    path: "specs/011-work-bank/spec.md",
    stories: 8,
    scenarios: 53,
    // No "### Acceptance Criteria Traceability" table, as in 008–010.
    rows: 0,
    rowsWithoutIds: [],
    // SC-002 is measured by the on-demand evaluation against the real models (test/eval).
    successCriteria: sc(1, 13),
  },
  {
    feature: "012",
    path: "specs/012-student-portal/spec.md",
    stories: 6,
    scenarios: 38,
    // No "### Acceptance Criteria Traceability" table, as in 008–011.
    rows: 0,
    rowsWithoutIds: [],
    successCriteria: sc(1, 12),
  },
  {
    feature: "013",
    path: "specs/013-exercise-points-ranking/spec.md",
    stories: 5,
    scenarios: 28,
    // No "### Acceptance Criteria Traceability" table, as in 008–012.
    rows: 0,
    rowsWithoutIds: [],
    // SC-008 (own position within 10 s) is timed by the E2E and the manual quickstart run.
    successCriteria: sc(1, 9),
  },
  {
    feature: "014",
    path: "specs/014-code-syntax-highlighting/spec.md",
    stories: 4,
    scenarios: 18,
    // No "### Acceptance Criteria Traceability" table, as in 008–013.
    rows: 0,
    rowsWithoutIds: [],
    // SC-001, SC-002, SC-004 and SC-006 are measured in the E2E (code-highlighting.spec.ts).
    successCriteria: sc(1, 7),
  },
  {
    feature: "015",
    path: "specs/015-controlled-work-ai-help/spec.md",
    stories: 5,
    scenarios: 39,
    // No "### Acceptance Criteria Traceability" table, as in 008–014.
    rows: 0,
    rowsWithoutIds: [],
    successCriteria: sc(1, 11),
    pending: { stories: [2, 3, 4, 5], successCriteria: sc(1, 11) },
  },
];

/** Coverage key of a spec's own id: bare for 001, `NNN/id` for later features. */
const keyFor = (feature: string) => (id: string) => (feature === "001" || id.includes("/") ? id : `${feature}/${id}`);
const SKIPPED_DIRS = new Set(["node_modules", ".next", "dist", "generated", ".turbo"]);
/** Optional feature prefix (`003/`) and the bare id. */
const ID = /\b(?:(\d{3})\/)?(US\d+-\d+|SC-\d{3}|FR-\d{3}[a-z]?)\b/g;

/** Coverage keys of a title: the bare id for 001 (no prefix or `001/`), `NNN/id` otherwise. */
export function idKeys(title: string): string[] {
  return [...title.matchAll(ID)].map(([, feature, bare]) =>
    !feature || feature === "001" ? bare! : `${feature}/${bare}`,
  );
}

function testFiles(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) return SKIPPED_DIRS.has(entry.name) ? [] : testFiles(join(dir, entry.name), pattern);
    return pattern.test(entry.name) ? [join(dir, entry.name)] : [];
  });
}

/**
 * `describe`/`it`/`test` titles (string, template or `.each` forms) of a test file. The table of
 * `.each(…)` is skipped by balancing parentheses, so tables built with `.map((x) => …)` and titles
 * on the next line are read too.
 */
export function testTitles(source: string): string[] {
  const titles: string[] = [];
  for (const match of source.matchAll(/\b(?:describe|it|test)(?:\.(each|skip|only|todo|concurrent))?\(/g)) {
    let i = match.index + match[0].length;
    if (match[1] === "each") {
      for (let depth = 1; i < source.length && depth > 0; i += 1) {
        if (source[i] === "(") depth += 1;
        else if (source[i] === ")") depth -= 1;
      }
      const open = /^\s*\(/.exec(source.slice(i));
      if (!open) continue;
      i += open[0].length;
    }
    const literal = /^\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/.exec(source.slice(i));
    if (literal) titles.push(literal[2]!);
  }
  return titles;
}

/** id → files whose test titles mention it. */
function coverage(): Map<string, Set<string>> {
  const covered = new Map<string, Set<string>>();
  for (const { dir, pattern } of TEST_ROOTS) {
    for (const file of testFiles(dir, pattern)) {
      for (const title of testTitles(readFileSync(file, "utf8"))) {
        for (const id of idKeys(title)) {
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
      return { number: Number(number), criterion: criterion!, ids: idKeys(verifiedBy!) };
    });
}

describe("SC-010 003/D13 — rastreabilidade dos critérios de aceite (critério 28)", () => {
  const covered = coverage();
  const missing = (ids: string[]) => ids.filter((id) => !covered.has(id));

  describe.each(SPECS.map((spec) => [spec.feature, spec] as const))("feature %s", (_feature, spec) => {
    const text = readFileSync(join(REPO_ROOT, spec.path), "utf8");
    const key = keyFor(spec.feature);
    const rows = traceabilityRows(text).map((row) => ({ ...row, ids: row.ids.map(key) }));

    it(`os parsers leem a spec inteira (${spec.stories} histórias, todos os cenários e critérios)`, () => {
      const scenarios = acceptanceScenarios(text);
      expect(scenarios).toHaveLength(spec.scenarios);
      expect(new Set(scenarios.map((id) => id.split("-")[0]))).toEqual(
        new Set(Array.from({ length: spec.stories }, (_, i) => `US${i + 1}`)),
      );
      expect(rows.map((row) => row.number)).toEqual(Array.from({ length: spec.rows }, (_, i) => i + 1));
      expect(rows.filter((row) => row.ids.length === 0).map((row) => row.number)).toEqual(spec.rowsWithoutIds);
    });

    const pendingStories = new Set((spec.pending?.stories ?? []).map((story) => `US${story}`));
    const scenarios = acceptanceScenarios(text);
    const pendingScenarios = scenarios.filter((id) => pendingStories.has(id.split("-")[0]!)).map(key);
    const pendingCriteria = (spec.pending?.successCriteria ?? []).map(key);

    it("todo cenário de aceite USn-k tem teste", () => {
      expect(missing(scenarios.map(key)).filter((id) => !pendingScenarios.includes(id))).toEqual([]);
    });

    it("histórias e critérios pendentes saem da lista quando todos os seus ids têm teste", () => {
      const of = (story: string) => pendingScenarios.filter((id) => id.split("/").at(-1)!.startsWith(`${story}-`));
      const done = [...pendingStories].filter((story) => missing(of(story)).length === 0);
      expect(done, "histórias pendentes já cobertas").toEqual([]);
      expect(pendingCriteria.filter((id) => covered.has(id)), "critérios pendentes já cobertos").toEqual([]);
    });

    it.each(rows.filter((row) => row.ids.length > 0).map((row) => [row.number, row] as const))(
      "critério %i coberto",
      (_n, row) => {
        const scenarioIds = row.ids.filter((id) => /(^|\/)US/.test(id));
        // Rows with scenarios are covered by them; rows without need their SC/FR ids.
        const required = scenarioIds.length > 0 ? scenarioIds : row.ids;
        expect(missing(required), `critério ${row.number}: ${row.criterion}`).toEqual([]);
      },
    );

    it("os critérios de sucesso verificáveis aparecem em títulos de teste", () => {
      expect(missing(spec.successCriteria.map(key)).filter((id) => !pendingCriteria.includes(id))).toEqual([]);
    });
  });

  it("o extrator de títulos reconhece as formas usadas nos testes", () => {
    const source = [
      'describe("US5-6/US5-7 ciclo", () => {',
      "  it(`US2-3: bloqueio`, async () => {});",
      '  it.each(["a"])("SC-008 %s", () => {});',
      "  it.each(rows.map((row) => [row.id, row] as const))(",
      '    "US4-1 %s multilinha",',
      "  );",
      "  // US9-9 em comentário não conta",
      "});",
    ].join("\n");
    const ids = testTitles(source).flatMap(idKeys);
    expect(ids).toEqual(["US5-6", "US5-7", "US2-3", "SC-008", "US4-1"]);
  });

  it("003/D13 ids com prefixo de outra feature não cobrem a 001", () => {
    const source = [
      'describe("003/US1-1 professor cria turma", () => {',
      '  it("003/FR-048 e 001/US2-3 e SC-004", () => {});',
      "});",
    ].join("\n");
    expect(testTitles(source).flatMap(idKeys)).toEqual(["003/US1-1", "003/FR-048", "US2-3", "SC-004"]);
  });
});
