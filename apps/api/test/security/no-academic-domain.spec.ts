import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/modules/access-control/permissions";
import { API_ROOT } from "../helpers/env";
import { registeredRoutes } from "../helpers/routes";

/** The entities of data-model.md — feature 001 creates nothing else. */
const EXPECTED_MODELS = [
  "User",
  "Role",
  "Permission",
  "RolePermission",
  "UserRole",
  "TeacherProfile",
  "StudentProfile",
  "Invitation",
  "UserToken",
  "AdminBootstrap",
  "Session",
  "AuditEvent",
  "AccessRecord",
  "RateLimitCounter",
];

/**
 * Word prefixes of the academic domain (FR-080), without accents, pt-BR and English.
 * "assignment" is left out on purpose: role assignment is identity vocabulary (`UserRole`).
 */
const ACADEMIC_PREFIXES = [
  "disciplin",
  "ementa",
  "turma",
  "periodo",
  "matricul",
  "aula",
  "questao",
  "questoes",
  "exercicio",
  "trabalho",
  "prova",
  "nota",
  "grade",
  "submiss",
  "course",
  "enrollment",
  "lesson",
  "exam",
  "homework",
  "curricul",
];
/** Matched only as whole words, so `classification` or `subjectId`-free names like `subjective` do not count. */
const ACADEMIC_WORDS = ["class", "classe", "classes", "subject"];

const stripAccents = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "");

/** Splits identifiers (camelCase, snake_case, dots, slashes, dashes) into lowercase words. */
function words(identifier: string): string[] {
  return stripAccents(identifier)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function academicTerms(identifier: string): string[] {
  return words(identifier).filter(
    (word) => ACADEMIC_WORDS.includes(word) || ACADEMIC_PREFIXES.some((prefix) => word.startsWith(prefix)),
  );
}

function schemaNames() {
  const schema = readFileSync(resolve(API_ROOT, "prisma/schema.prisma"), "utf8");
  const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((m) => m[1]!);
  const enums = [...schema.matchAll(/^enum (\w+) \{([^}]*)\}/gm)].flatMap((m) => [
    m[1]!,
    ...m[2]!.split(/\s+/).filter((v) => /^[A-Z_]+$/.test(v)),
  ]);
  const maps = [...schema.matchAll(/@@?map\("([^"]+)"\)/g)].map((m) => m[1]!);
  const fields = [...schema.matchAll(/^model \w+ \{([^}]*)\}/gm)].flatMap((m) =>
    m[1]!
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0]!)
      .filter((name) => /^[a-z]\w*$/.test(name)),
  );
  return { models, names: [...models, ...enums, ...maps, ...fields] };
}

describe("FR-080 — sem domínio acadêmico prematuro (critério 27)", () => {
  let routes: string[];

  beforeAll(async () => {
    routes = (await registeredRoutes()).map((r) => r.route);
  });

  it("schema.prisma tem exatamente os modelos de data-model.md", () => {
    expect([...schemaNames().models].sort()).toEqual([...EXPECTED_MODELS].sort());
  });

  it("nenhum modelo, enum, tabela, coluna, rota ou permissão usa termo acadêmico", () => {
    const candidates = [...schemaNames().names, ...routes, ...PERMISSIONS];
    const offenders = candidates.flatMap((name) => academicTerms(name).map((term) => `${name} (${term})`));
    expect(offenders).toEqual([]);
  });

  it("o detector reconhece termos acadêmicos e ignora falsos positivos", () => {
    for (const name of ["Turma", "course_enrollments", "GET /disciplinas/:id", "notas.lancar", "QuestãoProva", "class"]) {
      expect(academicTerms(name), name).not.toEqual([]);
    }
    for (const name of ["classification", "provisioning", "RateLimitCounter", "notificationSentAt", "sessoes.proprias.listar"]) {
      expect(academicTerms(name), name).toEqual([]);
    }
  });
});
