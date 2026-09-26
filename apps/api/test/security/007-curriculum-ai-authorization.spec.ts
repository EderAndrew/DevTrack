import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, createCurriculumProposal, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { MATRIX, routeKey } from "./authorization-matrix";

type Principal = "dono" | "outro TEACHER" | "ADMIN" | "MANAGER" | "STUDENT" | "anônimo";

interface Area {
  documentId: string;
  proposalId: string;
}

interface Route {
  key: string;
  method: "GET" | "POST";
  path: (area: Area) => string;
  valid: object;
  invalid: object;
  ownStatus: number;
}

/** The 3 routes of 007 (contracts/permissions.md), with a valid body and one refused by validation. */
const ROUTES: Route[] = [
  {
    key: "GET /syllabus-documents/:id/ai",
    method: "GET",
    path: (area) => `/api/syllabus-documents/${area.documentId}/ai`,
    valid: {},
    invalid: {},
    ownStatus: 200,
  },
  {
    key: "POST /syllabus-documents/:id/ai-analyses",
    method: "POST",
    path: (area) => `/api/syllabus-documents/${area.documentId}/ai-analyses`,
    valid: {},
    invalid: { workspaceId: crypto.randomUUID() },
    ownStatus: 202,
  },
  {
    key: "POST /syllabus-documents/:id/ai-proposals/:proposalId/apply",
    method: "POST",
    path: (area) => `/api/syllabus-documents/${area.documentId}/ai-proposals/${area.proposalId}/apply`,
    valid: { acceptedItemIds: ["title"], replaceDraft: false },
    invalid: { acceptedItemIds: [], replaceDraft: false },
    ownStatus: 200,
  },
];

const EXPECTED: Record<Exclude<Principal, "dono">, { status: number; code: string }> = {
  "outro TEACHER": { status: 404, code: "NOT_FOUND" },
  ADMIN: { status: 403, code: "FORBIDDEN" },
  MANAGER: { status: 403, code: "FORBIDDEN" },
  STUDENT: { status: 403, code: "FORBIDDEN" },
  anônimo: { status: 401, code: "UNAUTHENTICATED" },
};

/**
 * 007 contracts/permissions.md: the 3 routes × the roles of the matrix, and the order of the
 * checks of the protected pipeline (origin → session → e-mail → permission → validation →
 * context), each step shown by a call that would fail every later one too.
 */
describe("007/SC-002 matriz de autorização das rotas da 007", () => {
  let t: AiTestApp;
  let owner: TestUser;
  let area: Area;
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    t = await createCurriculumAiApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    owner = await createUser(t, { roles: ["TEACHER"] });
    const { document } = await seedProcessedDocument(t, owner.id);
    const proposal = await createCurriculumProposal(t, owner.id, document);
    area = { documentId: document.id, proposalId: proposal.id };
    for (const role of ["TEACHER", "ADMIN", "MANAGER", "STUDENT"] as const) {
      users.set(role === "TEACHER" ? "outro TEACHER" : role, await createUser(t, { roles: [role] }));
    }
    users.set("TEACHER não verificado", await createUser(t, { roles: ["TEACHER"], verified: false }));
  });

  async function call(route: Route, user: TestUser | null, body: object = route.valid, options: { origin?: string | null } = {}) {
    const client = api(t, { cookie: user ? await loginAs(t, user) : undefined, origin: options.origin });
    return route.method === "GET" ? client.get(route.path(area)) : client.post(route.path(area), body);
  }

  it("as 3 rotas estão na matriz geral, com a permissão de ementas do contrato", () => {
    const rows = MATRIX.filter((entry) => ROUTES.some((route) => route.key === routeKey(entry)));
    expect(rows.map((entry) => [routeKey(entry), entry.access])).toEqual([
      ["GET /syllabus-documents/:id/ai", "ementas.visualizar"],
      ["POST /syllabus-documents/:id/ai-analyses", "ementas.revisar"],
      ["POST /syllabus-documents/:id/ai-proposals/:proposalId/apply", "ementas.revisar"],
    ]);
  });

  it.each(ROUTES.map((route) => [route.key, route] as const))("%s como professor dono → 2xx", async (_key, route) => {
    const res = await call(route, owner);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: route.ownStatus, code: undefined });
  });

  it.each(
    ROUTES.flatMap((route) => (Object.keys(EXPECTED) as (keyof typeof EXPECTED)[]).map((principal) => [route.key, principal, route] as const)),
  )("%s como %s → a resposta da matriz, sem execução nem rascunho", async (_key, principal, route) => {
    const res = await call(route, principal === "anônimo" ? null : users.get(principal)!);
    expect({ status: res.status, code: res.body.code }).toEqual(EXPECTED[principal]);
    expect(Object.keys(res.body).sort()).toEqual(["code", "message", "statusCode"]);
    expect(await t.prisma.aiExecution.count({ where: { status: { not: "COMPLETED" } } })).toBe(0);
    expect(await t.prisma.syllabusRevision.count()).toBe(0);
    expect((await t.prisma.aiProposal.findUniqueOrThrow({ where: { id: area.proposalId } })).status).toBe("READY_FOR_REVIEW");
  });

  describe("ordem das checagens: origem → sessão → e-mail → permissão → validação → contexto", () => {
    const posts = ROUTES.filter((route) => route.method === "POST").map((route) => [route.key, route] as const);

    it.each(posts)("%s sem Origin e sem sessão → 403 ORIGIN_NOT_ALLOWED (a origem vem antes da sessão)", async (_key, route) => {
      const res = await call(route, null, route.invalid, { origin: null });
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "ORIGIN_NOT_ALLOWED" });
    });

    it.each(ROUTES.map((route) => [route.key, route] as const))(
      "%s sem sessão e com corpo inválido → 401 (a sessão vem antes da validação)",
      async (_key, route) => {
        const res = await call(route, null, route.invalid);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
      },
    );

    it.each(ROUTES.map((route) => [route.key, route] as const))(
      "%s com e-mail não verificado e corpo inválido → 403 EMAIL_NOT_VERIFIED (antes da permissão)",
      async (_key, route) => {
        const res = await call(route, users.get("TEACHER não verificado")!, route.invalid);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "EMAIL_NOT_VERIFIED" });
      },
    );

    it.each(posts)("%s como ADMIN com corpo inválido → 403 FORBIDDEN (a permissão vem antes da validação)", async (_key, route) => {
      const res = await call(route, users.get("ADMIN")!, route.invalid);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
    });

    it.each(posts)(
      "%s como outro professor com corpo inválido → 400 (a validação vem antes do contexto); com corpo válido → 404",
      async (_key, route) => {
        const other = users.get("outro TEACHER")!;
        const invalid = await call(route, other, route.invalid);
        expect({ status: invalid.status, code: invalid.body.code }).toEqual({ status: 400, code: "VALIDATION_ERROR" });
        const valid = await call(route, other, route.valid);
        expect({ status: valid.status, code: valid.body.code }).toEqual({ status: 404, code: "NOT_FOUND" });
      },
    );
  });
});
