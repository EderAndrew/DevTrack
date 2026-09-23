import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { createClass, createClassInvitation, createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

/** Everything a client can observe except per-request identifiers. */
function publicShape(res: { status: number; body: unknown; headers: Record<string, string> }) {
  const { "x-request-id": _id, date: _date, etag: _etag, ...headers } = res.headers;
  return { status: res.status, body: res.body, headers };
}

const randomToken = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
const PASSWORD = "girassol-azul-de-outono";

// The block that captures logs comes first: Nest keeps its static logger bound to the first
// app created in the file.
describe("003/US8-5 — limite de tentativas no convite público (FR-038)", () => {
  const logs = new LogCapture();
  let t: TestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({ logs, config: { rateLimit: { ...base.rateLimit, publicOrigin: 5 } } });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });

  it.each([
    ["preview", "/api/class-invitations/preview", {}],
    ["aceite", "/api/class-invitations/accept", { name: "Aluna", ra: "RA-1", password: PASSWORD }],
  ] as const)("003/FR-062 %s: muitos tokens inválidos da mesma origem → 429; logs e auditoria sem token", async (_label, path, extra) => {
    const tokens = Array.from({ length: 6 }, randomToken);
    const results = [];
    for (const token of tokens) {
      results.push(await api(t).post(path, { token, ...extra }).set("X-Forwarded-For", "203.0.113.77"));
    }
    expect(results.slice(0, 5).map((res) => res.body.code)).toEqual(Array(5).fill("TOKEN_INVALID"));
    const blocked = results[5]!;
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    // Another origin is not affected.
    expect((await api(t).post(path, { token: randomToken(), ...extra }).set("X-Forwarded-For", "198.51.100.9")).status).toBe(400);

    const rejected = logs.lines().filter((line) => line.msg === "class_invitation.token_rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(5);
    const events = await t.prisma.auditEvent.findMany({ where: { type: "auth.rate_limit.blocked" } });
    const flow = path.endsWith("accept") ? "class_invitation_accept" : "class_invitation_preview";
    expect(events).toMatchObject([{ actorType: "ANONYMOUS", metadata: { scope: `${flow}_origin` } }]);

    const trail = logs.text() + JSON.stringify(events, (_k, v: unknown) => (typeof v === "bigint" ? String(v) : v));
    for (const token of tokens) {
      expect(trail).not.toContain(token);
      expect(trail).not.toContain(hashToken(token));
    }
  });
});

describe("003/FR-039 — respostas de tokens inválidos não revelam nada", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  it("003/SC-005 desconhecido, cancelado, usado, substituído e adulterado respondem igual, com ou sem conta no e-mail; vencido → TOKEN_EXPIRED", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const schoolClass = await createClass(t, teacher.id);
    const withAccount = await createUser(t, { email: uniqueEmail("tem-conta") });
    const cancelled = await createClassInvitation(t, schoolClass.id, withAccount.email, { status: "CANCELLED" });
    const cancelledNoAccount = await createClassInvitation(t, schoolClass.id, uniqueEmail("sem-conta"), {
      status: "CANCELLED",
    });
    const accepted = await createClassInvitation(t, schoolClass.id, uniqueEmail("aceito"));
    const acceptBody = { name: "Aluna", ra: "RA-FR039", password: PASSWORD };
    expect((await api(t).post("/api/class-invitations/accept", { token: accepted.token, ...acceptBody })).status).toBe(200);

    const expired = await createClassInvitation(t, schoolClass.id, uniqueEmail("vencido"), {
      expiresAt: new Date(Date.now() - 1000),
    });
    const resent = await createClassInvitation(t, schoolClass.id, uniqueEmail("reenviado"));
    const teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    expect((await teacherClient.post(`/api/classes/${schoolClass.id}/invitations/${resent.invitation.id}/resend`, {})).status).toBe(200);
    await t.flushMail();
    const pending = await createClassInvitation(t, schoolClass.id, uniqueEmail("adulterado"));
    const tampered = `${pending.token.slice(0, -1)}${pending.token.endsWith("A") ? "B" : "A"}`;

    const tokens = [
      randomToken(),
      cancelled.token,
      cancelledNoAccount.token,
      accepted.token,
      resent.token,
      tampered,
    ];
    for (const path of ["/api/class-invitations/preview", "/api/class-invitations/accept"]) {
      const responses = [];
      for (const token of tokens) {
        const body = path.endsWith("accept") ? { token, ...acceptBody, ra: "RA-OUTRO" } : { token };
        responses.push(publicShape(await api(t).post(path, body)));
      }
      expect(responses[0]).toMatchObject({ status: 400, body: { code: "TOKEN_INVALID" } });
      for (const response of responses.slice(1)) expect(response).toEqual(responses[0]);
      // Nothing about the invited e-mail, its account or the class leaks.
      expect(JSON.stringify(responses)).not.toMatch(/@example\.test|mode|raRequired|teacherName/);

      // An expired link is refused with its own message (contracts/http-api.md), revealing nothing else.
      const body = path.endsWith("accept") ? { token: expired.token, ...acceptBody, ra: "RA-OUTRO" } : { token: expired.token };
      const res = await api(t).post(path, body);
      expect({ status: res.status, code: res.body.code }).toEqual({ status: 400, code: "TOKEN_EXPIRED" });
      expect(JSON.stringify(res.body)).not.toMatch(/@example\.test|mode|raRequired|teacherName/);
    }
    expect(await t.prisma.enrollment.count()).toBe(1);
  });
});
