import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PERMISSIONS } from "../../src/modules/access-control/permissions";
import { API_ROOT } from "../helpers/env";
import { registeredRoutes } from "../helpers/routes";

/** The entities of data-model.md (001 plus 003) — nothing else exists yet. */
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
  "SchoolClass",
  "ClassInvitation",
  "ClassInvitationDelivery",
  "Enrollment",
];

/**
 * Word prefixes of the academic domain not built yet (FR-080), without accents, pt-BR and English.
 * 003 brought classes and enrollments in on purpose (`turma`, `matricul`, `class`, `classes`,
 * `enrollment` are allowed, 003/D13); the later phases' terms stay forbidden.
 * "assignment" is left out on purpose: role assignment is identity vocabulary (`UserRole`).
 */
const ACADEMIC_PREFIXES = [
  "disciplin",
  "ementa",
  "periodo",
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
  "lesson",
  "exam",
  "homework",
  "curricul",
];
/** Matched only as whole words, so `classification` or `subjectId`-free names like `subjective` do not count. */
const ACADEMIC_WORDS = ["classe", "subject"];

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

describe("003/D13 fronteira do domínio (FR-080, critério 27)", () => {
  let routes: string[];

  beforeAll(async () => {
    routes = (await registeredRoutes()).map((r) => r.route);
  });

  it("schema.prisma tem exatamente os modelos de data-model.md", () => {
    expect([...schemaNames().models].sort()).toEqual([...EXPECTED_MODELS].sort());
  });

  it("nenhum modelo, enum, tabela, coluna, rota ou permissão usa termo acadêmico de fase futura", () => {
    const candidates = [...schemaNames().names, ...routes, ...PERMISSIONS];
    const offenders = candidates.flatMap((name) => academicTerms(name).map((term) => `${name} (${term})`));
    expect(offenders).toEqual([]);
  });

  it("o detector reconhece termos acadêmicos e ignora falsos positivos", () => {
    for (const name of ["course_enrollments", "GET /disciplinas/:id", "notas.lancar", "QuestãoProva", "classe", "subject"]) {
      expect(academicTerms(name), name).not.toEqual([]);
    }
    for (const name of [
      "classification",
      "provisioning",
      "RateLimitCounter",
      "notificationSentAt",
      "sessoes.proprias.listar",
      "SchoolClass",
      "turmas.remover_aluno",
      "enrollment_status",
      "GET /classes/:id/enrollments",
      "matriculas",
    ]) {
      expect(academicTerms(name), name).toEqual([]);
    }
  });
});
