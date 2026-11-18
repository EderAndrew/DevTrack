import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import { API_ROOT } from "./helpers/env";

/**
 * 027 research Q3/Q4: the enrollments and the invitations belong to the turma (`cohorts`). A pedagogical
 * reader asks "is this student in this class" through the view `class_enrollments` (or the Prisma relation
 * `schoolClass.cohort.enrollments`), never by joining `enrollments` on a `class_id`; only `cohorts`,
 * `class-invitations` and `enrollments` write enrollments or invitations; and the class's own `status` is
 * read alone only by `ClassContextPolicy` — any other reader also reads the turma's (FR-023, effective status).
 * A `schoolClass.status` read is allowed where the class comes from the policy (its `status` is the effective
 * one); a Prisma filter or select of the class's `status` needs the cohort's next to it.
 */

const SRC = join(API_ROOT, "src");
const WRITERS = ["modules/cohorts/", "modules/class-invitations/", "modules/enrollments/"];
const OWN_STATUS_ALLOWED = ["modules/classes/class-context.policy.ts"];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "generated" ? [] : sources(path);
    return /\.ts$/.test(name) && !/\.(spec|test)\.ts$/.test(name) ? [path] : [];
  });
}

const files = sources(SRC).map((path) => ({ rel: relative(SRC, path).split(sep).join("/"), text: readFileSync(path, "utf8") }));

const ENROLLMENTS_BY_CLASS = [
  /\benrollments\s+\w+\s+(?:ON|WHERE)[^;]*?\.class_id\b/i,
  /\benrollments\s+WHERE\s+class_id\b/i,
  /schoolClass:\s*\{\s*enrollments\b/,
];
const WRITES = /\b(?:enrollment|classInvitation)\.(?:create|update|upsert)\w*\s*\(/;
const OWN_STATUS_READ = /schoolClass\.status\b/;
const OWN_STATUS_QUERY = /schoolClass:\s*\{\s*(?:select:\s*\{\s*)?status\b/;
const FROM_POLICY = /ClassContextPolicy|ClassInContext|findOwnedOrNotFound|findInContext|lockOwnedClass/;
const READS_COHORT_STATUS = /cohort\.status\b|cohort:\s*\{\s*(?:select:\s*\{\s*)?status\b/;

describe("027 cohorts boundary (research Q3, FR-023)", () => {
  it("guards something", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("027/FR-013 nenhum leitor junta enrollments por class_id (usa class_enrollments)", () => {
    const offenders = files.filter((f) => ENROLLMENTS_BY_CLASS.some((re) => re.test(f.text))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("027/FR-013 só cohorts, class-invitations e enrollments gravam matrículas e convites", () => {
    const offenders = files.filter((f) => WRITES.test(f.text) && !WRITERS.some((dir) => f.rel.startsWith(dir))).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it("027/FR-023 a situação própria da classe só é lida junto da situação da turma", () => {
    const offenders = files
      .filter((f) => !OWN_STATUS_ALLOWED.includes(f.rel) && !READS_COHORT_STATUS.test(f.text))
      .filter((f) => OWN_STATUS_QUERY.test(f.text) || (OWN_STATUS_READ.test(f.text) && !FROM_POLICY.test(f.text)))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
