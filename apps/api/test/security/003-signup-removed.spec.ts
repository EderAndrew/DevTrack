import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * Public self-signup is gone (003 FR-048, constitution 3.0.0): student accounts come only from
 * a teacher's class invitation. The route is not registered, so it answers like any unknown
 * route, and nothing is created whatever the body.
 */
describe("003/US8-7 003/FR-048 — cadastro público removido", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const signup = (body: object) => api(t).post("/api/auth/signup", body);

  it("001/US1-1 001/US1-2 001/US1-6 001/US1-7 substituídos por 003/FR-048: POST /api/auth/signup → 404, nenhuma conta", async () => {
    const email = uniqueEmail("sem-convite");
    const bodies = [
      { name: "Pessoa", email, password: "senha-forte-da-pessoa" },
      { name: "Invasor", email, password: "senha-forte-da-pessoa", role: "ADMIN" },
      {},
    ];
    const unknownRoute = await api(t).post("/api/auth/rota-que-nunca-existiu", {});
    expect(unknownRoute.status).toBe(404);

    for (const body of [...bodies, ...bodies]) {
      const res = await signup(body);
      expect(res.status).toBe(404);
      expect(res.body).toEqual(unknownRoute.body);
    }
    await t.flushMail();
    expect(await t.prisma.user.count()).toBe(0);
    expect(await t.prisma.userToken.count()).toBe(0);
    expect(t.mailer.outbox).toHaveLength(0);
  });

  it("verificação de e-mail e reenvio continuam para contas antigas", async () => {
    expect((await api(t).post("/api/auth/verify-email/resend", { email: uniqueEmail("antiga") })).status).toBe(202);
    expect((await api(t).post("/api/auth/verify-email", { token: "x".repeat(43) })).body.code).toBe("TOKEN_INVALID");
  });
});
