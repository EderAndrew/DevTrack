import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { createCurriculumAiApp, createCurriculumProposal, seedProcessedDocument } from "../helpers/curriculum-ai";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api } from "../helpers/test-app";
import { AI_TEACHER_ROUTES, type AiArea, aiSnapshot, buildAiArea, callAiRoute, VALID_BODY } from "./006-ai-authorization-matrix";
import { routeKey } from "./authorization-matrix";

const MISSING_ID = "00000000-0000-4000-8000-000000000001";
const ERROR_KEYS = ["code", "message", "statusCode"];

/**
 * 006/SC-001 (contracts/permissions.md): every AI execution route as each subject of the matrix.
 * A refusal carries only the standard error body and changes nothing.
 */
describe("006/SC-001 006/US5 matriz de autorização das rotas de IA do professor", () => {
  let t: AiTestApp;
  let owner: TestUser;
  let area: AiArea;
  const users = new Map<string, TestUser>();

  beforeAll(async () => {
    // The reference agents plus the 007 one, whose proposals are approved only by applying them.
    t = await createCurriculumAiApp();
    await resetAiDb(t);
    owner = await createUser(t, { roles: ["TEACHER"] });
    area = await buildAiArea(t, owner);
    for (const role of ["STUDENT", "MANAGER", "ADMIN"] as const) users.set(role, await createUser(t, { roles: [role] }));
    users.set("outro TEACHER", await createUser(t, { roles: ["TEACHER"] }));
    users.set("TEACHER não verificado", await createUser(t, { roles: ["TEACHER"], verified: false }));
  });
  afterAll(() => t.close());

  const routes = AI_TEACHER_ROUTES.map((entry) => [routeKey(entry), entry] as const);

  it("toda rota de IA do professor tem corpo válido, e a matriz cobre as rotas de execução e de proposta", () => {
    expect(AI_TEACHER_ROUTES.map(routeKey)).toEqual(expect.arrayContaining(Object.keys(VALID_BODY)));
    for (const entry of AI_TEACHER_ROUTES) expect(VALID_BODY, routeKey(entry)).toHaveProperty([routeKey(entry)]);
  });

  it.each(routes)("%s sem sessão → 401", async (_key, entry) => {
    const res = await callAiRoute(t, entry, null, area);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 401, code: "UNAUTHENTICATED" });
  });

  it.each(routes)("%s com e-mail não verificado → 403 EMAIL_NOT_VERIFIED", async (_key, entry) => {
    const res = await callAiRoute(t, entry, users.get("TEACHER não verificado")!, area);
    expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "EMAIL_NOT_VERIFIED" });
  });

  it.each(["STUDENT", "MANAGER", "ADMIN"].flatMap((principal) => routes.map(([key, entry]) => [key, principal, entry] as const)))(
    "%s como %s (sem TEACHER) → 403, só o corpo de erro, sem efeito",
    async (_key, principal, entry) => {
      const before = await aiSnapshot(t);
      const res = await callAiRoute(t, entry, users.get(principal)!, area);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "FORBIDDEN" });
      expect(Object.keys(res.body).sort()).toEqual(ERROR_KEYS);
      expect(await aiSnapshot(t)).toEqual(before);
    },
  );

  it.each(routes.filter(([, entry]) => entry.path.includes(":id")))(
    "%s com o id do dono, como outro professor → 404 idêntico ao de inexistente, sem efeito",
    async (_key, entry) => {
      const other = users.get("outro TEACHER")!;
      const before = await aiSnapshot(t);
      const foreign = await callAiRoute(t, entry, other, area);
      const missing = await callAiRoute(t, entry, other, area, MISSING_ID);
      expect(foreign.status).toBe(404);
      expect(foreign.body).toEqual({ statusCode: 404, code: "NOT_FOUND", message: expect.any(String) });
      expect(foreign.body).toEqual(missing.body);
      expect(await aiSnapshot(t)).toEqual(before);
    },
  );

  it("POST /ai/executions sobre a disciplina do dono, como outro professor → 404, sem execução", async () => {
    const entry = AI_TEACHER_ROUTES.find((route) => routeKey(route) === "POST /ai/executions")!;
    const before = await aiSnapshot(t);
    const res = await callAiRoute(t, entry, users.get("outro TEACHER")!, area);
    expect(res.status).toBe(404);
    expect(await aiSnapshot(t)).toEqual(before);
  });

  it("o dono passa por todas as rotas (nenhum 401, 403 ou 404)", async () => {
    for (const [key, entry] of routes) {
      const res = await callAiRoute(t, entry, owner, area);
      expect([401, 403, 404], `${key} → ${res.status} ${res.body?.code}`).not.toContain(res.status);
    }
  });

  it("007/FR-030 APPROVE de proposta CURRICULUM_EXTRACTION pela rota da 006 → 409 AI_PROPOSAL_APPLY_REQUIRED; REJECT passa", async () => {
    const entry = AI_TEACHER_ROUTES.find((route) => routeKey(route) === "POST /ai/proposals/:id/decision")!;
    const { document } = await seedProcessedDocument(t, owner.id);
    const proposal = await createCurriculumProposal(t, owner.id, document);
    const cookie = await loginAs(t, owner);
    for (const body of [{ decision: "APPROVE" }, { decision: "APPROVE_PARTIALLY", acceptedItemIds: ["title"] }]) {
      const res = await api(t, { cookie }).post(`/api${entry.path.replace(":id", proposal.id)}`, body);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 409, code: "AI_PROPOSAL_APPLY_REQUIRED" });
    }
    const reject = await api(t, { cookie }).post(`/api${entry.path.replace(":id", proposal.id)}`, { decision: "REJECT" });
    expect(reject.status).toBe(200);
    expect(reject.body.status).toBe("REJECTED");
  });
});
