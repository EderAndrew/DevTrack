import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 023 research U5: "the attempt of this student" has one definition, the participation. The modules that look
 * up a student's attempt — on the student's side or the teacher's — find it through `attempt_participants`,
 * never by `activity_attempts.student_user_id` (the attempt's owner, who is only one of a group's members);
 * only the start (`student-activities`) and "Incluir integrantes" (`group-work.service.ts`) write participants
 * outside the migration; and the 015/016 boundaries between these modules still hold (each in its own query).
 */

const SRC = join(API_ROOT, "src/modules");

/** The modules and files that look up a student's attempt (research U5). */
const LOOKUPS = [
  "student-activities",
  "attempt-integrity",
  "work-help",
  "attendance",
  "code-runs",
  "exam-sessions",
  "activities/exam-settlement.ts",
  "activities/submission/settle-exam.ts",
  "activities/roster.ts",
  "activities/attempts-review.service.ts",
];

function sources(path: string): string[] {
  const absolute = join(SRC, path);
  if (!existsSync(absolute)) return [];
  if (!statSync(absolute).isDirectory()) return [path];
  return readdirSync(absolute).flatMap((name) => {
    const child = join(path, name);
    if (statSync(join(SRC, child)).isDirectory()) return sources(child);
    return /\.ts$/.test(name) && !/\.spec\.ts$/.test(name) ? [child] : [];
  });
}

const read = (file: string) => readFileSync(join(SRC, file), "utf8");

/** Template literals (raw SQL) of a file. */
const templates = (source: string) => [...source.matchAll(/`[^`]*`/g)].map((match) => match[0]);

const SQL_KEYWORDS = new Set(["where", "join", "left", "inner", "on", "for", "order", "group", "limit", "using", "as"]);

/** A raw query over `activity_attempts` that filters it, or lists who started it, by the owner. */
function ownerFilters(sql: string): string[] {
  if (!/\bactivity_attempts\b/.test(sql)) return [];
  const found: string[] = [];
  const aliases = [...sql.matchAll(/\bactivity_attempts\s+(?:AS\s+)?([a-z_]+)/gi)]
    .map((match) => match[1]!)
    .filter((alias) => !SQL_KEYWORDS.has(alias.toLowerCase()));
  for (const alias of aliases) {
    const column = `\\b${alias}\\.student_user_id\\b`;
    if (new RegExp(`${column}\\s*(=|IN\\b)|(=|IN\\s*\\()\\s*${column}`, "i").test(sql)) found.push(`${alias}.student_user_id`);
  }
  // Unaliased: `FROM activity_attempts WHERE … student_user_id = …`.
  if (/\bFROM\s+activity_attempts\s+WHERE\b[^`]*?(?<![.\w])student_user_id\s*(=|IN\b)/i.test(sql)) found.push("student_user_id");
  if (/\bDISTINCT\s+student_user_id\s+FROM\s+activity_attempts\b/i.test(sql)) found.push("DISTINCT student_user_id");
  return found;
}

/** A Prisma lookup of attempts by their owner: `activityAttempt.findX({ where: { …, studentUserId … } })`. */
const PRISMA_OWNER =
  /\bactivityAttempt\.(findFirst|findFirstOrThrow|findMany|findUnique|findUniqueOrThrow|count|updateMany)\(\{\s*where:\s*\{[^{}]*\bstudentUserId\b/g;

describe("023/FR-008 023/FR-011 research U5: a tentativa de um aluno é a da participação", () => {
  const files = LOOKUPS.flatMap(sources);

  it("os módulos existem", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const path of LOOKUPS) expect(existsSync(join(SRC, path)), path).toBe(true);
  });

  it("nenhuma consulta procura a tentativa de um aluno por activity_attempts.student_user_id", () => {
    const offenders = files.flatMap((file) => {
      const source = read(file);
      return [
        ...templates(source).flatMap((sql) => ownerFilters(sql).map((what) => `${file}: SQL ${what}`)),
        ...[...source.matchAll(PRISMA_OWNER)].map((match) => `${file}: activityAttempt.${match[1]} by studentUserId`),
      ];
    });
    expect(offenders).toEqual([]);
  });

  it("a guarda reconhece as formas proibidas", () => {
    expect(ownerFilters("`SELECT a.id FROM activity_attempts a WHERE a.activity_id = $1 AND a.student_user_id = $2`")).toEqual(["a.student_user_id"]);
    expect(ownerFilters("`SELECT at.id FROM activity_attempts at WHERE at.student_user_id = e.student_user_id`")).toEqual(["at.student_user_id"]);
    expect(ownerFilters("`SELECT id FROM activity_attempts WHERE activity_id = $1 AND student_user_id = $2`")).toEqual(["student_user_id"]);
    expect(ownerFilters("`SELECT DISTINCT student_user_id FROM activity_attempts WHERE activity_id = $1`")).toEqual(["DISTINCT student_user_id"]);
    expect(
      ownerFilters("`SELECT a.id, a.student_user_id FROM activity_attempts a JOIN attempt_participants p ON p.attempt_id = a.id WHERE p.student_user_id = $1`"),
    ).toEqual([]);
    expect("activityAttempt.findFirst({ where: { activityId, studentUserId, number } })".match(PRISMA_OWNER)).not.toBeNull();
    expect("activityAttempt.findFirst({ where: { activityId, participants: { some: { studentUserId } } } })".match(PRISMA_OWNER)).toBeNull();
  });

  it("só o início (student-activities) e a inclusão (group-work.service.ts) gravam participantes", () => {
    const writes =
      /\battemptParticipant\.(create|createMany|createManyAndReturn|upsert|update|updateMany|delete|deleteMany)\b|\bINSERT\s+INTO\s+"?attempt_participants\b/i;
    const writers = sources(".").filter((file) => writes.test(read(file)));
    expect(writers.filter((file) => !file.startsWith("student-activities/") && !file.endsWith("/group-work.service.ts"))).toEqual([]);
  });

  it("os limites da 015/016 continuam: as atividades não importam os módulos do aluno, nem eles uns aos outros", () => {
    const IMPORT = /(?:\bfrom\s*|\bimport\s*\(?\s*)["'`](\.[^"'`]+)["'`]/g;
    const moduleOf = (file: string, specifier: string) => relative(SRC, resolve(join(SRC, dirname(file)), specifier)).split("/")[0]!;
    const PER_STUDENT = ["attempt-integrity", "work-help", "attendance", "code-runs"];
    const rules: [string, string[]][] = [
      ["student-activities", [...PER_STUDENT, "exam-sessions"]],
      ["activities", [...PER_STUDENT, "exam-sessions", "student-activities"]],
      ...PER_STUDENT.map((name): [string, string[]] => [name, PER_STUDENT.filter((other) => other !== name)]),
    ];
    const offenders = rules.flatMap(([from, forbidden]) =>
      sources(from).flatMap((file) =>
        [...read(file).matchAll(IMPORT)]
          .map((match) => moduleOf(file, match[1]!))
          .filter((target) => forbidden.includes(target))
          .map((target) => `${file} → ${target}`),
      ),
    );
    expect(offenders).toEqual([]);
  });
});
