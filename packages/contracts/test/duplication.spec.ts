import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as contracts from "../src/index.js";
import { lineOf, listFiles, readRepoFile, scanSource } from "./helpers/source-scan.js";

// FR-006 / Principle XXVI: a type or public enum of the contract is defined once, here. The
// guard flags `interface X` / `type X =` named after a contract type, literal unions holding
// exactly the values of a contract enum, and literal arrays repeating them in the enum's order
// (S7). Arrays compare by order so that data such as a state machine's transition list, which
// may contain every status, is not mistaken for a copy of the enum.

const exported = Object.entries(contracts as Record<string, unknown>).filter(([name]) => name.endsWith("Schema"));
const TYPE_NAMES = new Set(exported.map(([name]) => name.slice(0, -"Schema".length)));
const ALL_ENUMS = exported
  .filter((entry): entry is [string, z.ZodEnum] => entry[1] instanceof z.ZodEnum)
  .map(([name, schema]) => ({ name: name.slice(0, -"Schema".length), options: schema.options.map(String) }));
/**
 * An enum whose values are a strict subset of another enum's (SubjectStatus ⊂ ClassStatus,
 * TopicStatus ⊂ ClassPlanStatus) is ambiguous: `["ACTIVE", "INACTIVE"]` in the API is as likely
 * a list of class statuses as a copy of SubjectStatus. Only unambiguous enums are checked.
 */
const isStrictSubset = (small: string[], large: string[]) =>
  small.length < large.length && small.every((option) => large.includes(option));
const ENUMS = ALL_ENUMS.filter((candidate) => !ALL_ENUMS.some((other) => isStrictSubset(candidate.options, other.options)));

const DECLARATION = /\binterface\s+([A-Za-z_$][\w$]*)|\btype\s+([A-Za-z_$][\w$]*)\s*(?:<[^=;]*>)?\s*=/g;
const QUOTED = `(?:"[^"\\n]*"|'[^'\\n]*')`;
const LITERAL_UNION = new RegExp(`(?:${QUOTED}\\s*\\|\\s*)+${QUOTED}`, "g");
const LITERAL_ARRAY = new RegExp(`\\[\\s*(?:${QUOTED}\\s*,\\s*)+${QUOTED}\\s*,?\\s*\\]`, "g");

const sameSet = (values: string[], options: string[]) =>
  values.length === options.length && options.every((option) => values.includes(option));
const sameSequence = (values: string[], options: string[]) =>
  values.length === options.length && options.every((option, index) => values[index] === option);

/** `file:line` descriptions of every duplicated contract definition in `source`. */
export function duplicatesIn(path: string, source: string): string[] {
  const { code } = scanSource(source);
  const found: string[] = [];
  for (const match of code.matchAll(DECLARATION)) {
    const name = match[1] ?? match[2]!;
    if (TYPE_NAMES.has(name)) found.push(`${path}:${lineOf(code, match.index)} redefine o tipo ${name}`);
  }
  for (const [pattern, matches] of [
    [LITERAL_UNION, sameSet],
    [LITERAL_ARRAY, sameSequence],
  ] as const) {
    for (const match of code.matchAll(pattern)) {
      const values = [...match[0].matchAll(/"([^"\n]*)"|'([^'\n]*)'/g)].map((value) => value[1] ?? value[2]!);
      const duplicated = ENUMS.find((candidate) => matches(values, candidate.options));
      if (duplicated) found.push(`${path}:${lineOf(code, match.index)} repete os valores de ${duplicated.name}`);
    }
  }
  return found;
}

const SCANNED = [
  ...listFiles("apps/api/src", /\.ts$/),
  ...listFiles("apps/web", /\.tsx?$/).filter((path) => !path.endsWith(".d.ts")),
];

describe("002/US1-4 nenhum tipo do contrato definido fora do pacote (FR-006)", () => {
  it("coleta os tipos e enums do contrato e os arquivos da API e do web", () => {
    expect(TYPE_NAMES).toContain("ErrorCode");
    expect(ENUMS.map((candidate) => candidate.name)).toContain("InvitationStatus");
    expect(SCANNED.some((path) => path.startsWith("apps/api/src/"))).toBe(true);
    expect(SCANNED.some((path) => path.startsWith("apps/web/"))).toBe(true);
  });

  it("a API e o web não redefinem tipos, enums públicos nem códigos de erro do contrato", () => {
    const offenders = SCANNED.flatMap((path) => duplicatesIn(path, readRepoFile(path)));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("004 enums contidos em outro não são conferidos (ambíguos), os demais continuam", () => {
    const names = ENUMS.map((candidate) => candidate.name);
    expect(names).not.toContain("SubjectStatus");
    // TopicStatus gained COMPLETED (004/US9), so it no longer fits inside ClassPlanStatus and is checked.
    expect(names).toEqual(expect.arrayContaining(["ClassStatus", "ClassPlanStatus", "TopicStatus", "SyllabusMediaType"]));
    expect(duplicatesIn("x.ts", 'const statuses = ["ACTIVE", "INACTIVE"];')).toEqual([]);
    expect(duplicatesIn("x.ts", 'const types = ["PDF", "DOCX", "PNG", "JPEG"];')).toEqual([
      "x.ts:1 repete os valores de SyllabusMediaType",
    ]);
  });

  it("a heurística detecta interface, alias, união e array com os valores de um enum", () => {
    const sample = [
      "export interface ErrorBody { code: string }",
      "type RoleKey = string;",
      'const status: "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED" = "PENDING";',
      'const modes = ["CREATE_ACCOUNT", "SIGN_IN_REQUIRED", "CLAIM_ACCOUNT"] as const;',
      'const partial: "PENDING" | "ACCEPTED" = "PENDING";',
      "// interface MeView {} (comentário, ignorado)",
      'const transitions = { PENDING: ["ACCEPTED", "REVOKED", "EXPIRED", "PENDING"] };',
      'const reversed: "REVOKED" | "EXPIRED" | "ACCEPTED" | "PENDING" = "PENDING";',
    ].join("\n");
    expect(duplicatesIn("x.ts", sample)).toEqual([
      "x.ts:1 redefine o tipo ErrorBody",
      "x.ts:2 redefine o tipo RoleKey",
      "x.ts:3 repete os valores de InvitationStatus",
      "x.ts:8 repete os valores de InvitationStatus",
      "x.ts:4 repete os valores de AcceptanceMode",
    ]);
  });
});
