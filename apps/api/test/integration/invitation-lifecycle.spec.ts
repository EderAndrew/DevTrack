import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createUser, loginAs, type TestUser, uniqueEmail } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

describe("ciclo de vida do convite (FR-041, FR-042, FR-049)", () => {
  let t: TestApp;
  let admin: TestUser;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    admin = await createUser(t, { roles: ["ADMIN"] });
    client = api(t, { cookie: await loginAs(t, admin) });
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const preview = (token: string) => api(t).post("/api/invitations/preview", { token });

  const invite = async (email = uniqueEmail("gestor")) => {
    const res = await client.post("/api/manager-invitations", { email, displayName: "Gestor" });
    expect(res.status).toBe(201);
    await t.flushMail();
    return { id: res.body.id as string, email, token: t.mailer.lastTokenFor(email, "invitation-manager")! };
  };

  it("reenvio troca o token, renova a validade e incrementa sendCount", async () => {
    const { id, email, token } = await invite();
    await t.prisma.$executeRaw`UPDATE invitations SET expires_at = now() + interval '1 day', last_sent_at = now() - interval '1 day'`;
    const before = await t.prisma.invitation.findUniqueOrThrow({ where: { id } });

    const res = await client.post(`/api/manager-invitations/${id}/resend`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: "PENDING", sendCount: 2 });
    await t.flushMail();
    const newToken = t.mailer.lastTokenFor(email, "invitation-manager")!;
    expect(newToken).not.toBe(token);

    const after = await t.prisma.invitation.findUniqueOrThrow({ where: { id } });
    expect(after.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime() + 5 * 86_400_000);
    expect(after.lastSentAt.getTime()).toBeGreaterThan(before.lastSentAt.getTime());
    expect(t.mailer.messagesFor(email)).toHaveLength(2);

    expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
    expect((await preview(newToken)).status).toBe(200);
    expect(await events("invitation.resent")).toMatchObject([{ actorUserId: admin.id, targetId: id, metadata: { sendCount: 2 } }]);
  });

  it("revogação invalida o token e é auditada", async () => {
    const { id, token } = await invite();
    const res = await client.post(`/api/manager-invitations/${id}/revoke`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REVOKED");
    expect(await t.prisma.invitation.findUniqueOrThrow({ where: { id } })).toMatchObject({
      status: "REVOKED",
      revokedById: admin.id,
    });
    expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
    expect((await api(t).post("/api/invitations/accept", { token, password: "senha-forte-qualquer" })).body.code).toBe(
      "TOKEN_INVALID",
    );
    expect(await events("invitation.revoked")).toMatchObject([{ actorUserId: admin.id, targetId: id }]);
  });

  it.each(["ACCEPTED", "REVOKED", "EXPIRED"] as const)("reenviar ou revogar %s → 409", async (status) => {
    const { id } = await invite();
    if (status === "ACCEPTED") {
      const user = await createUser(t);
      await t.prisma.invitation.update({ where: { id }, data: { status, acceptedAt: new Date(), acceptedByUserId: user.id } });
    } else {
      await t.prisma.invitation.update({ where: { id }, data: { status } });
    }
    for (const action of ["resend", "revoke"]) {
      const res = await client.post(`/api/manager-invitations/${id}/${action}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
    }
  });

  it("id inexistente → 404; convite de outro papel não é visível pela rota de MANAGER", async () => {
    expect((await client.post("/api/manager-invitations/00000000-0000-4000-8000-000000000000/resend")).status).toBe(404);
    const teacherRole = await t.prisma.role.findUniqueOrThrow({ where: { key: "TEACHER" } });
    const teacherInvite = await t.prisma.invitation.create({
      data: {
        email: uniqueEmail("prof"),
        displayName: "Prof",
        roleId: teacherRole.id,
        invitedById: admin.id,
        tokenHash: "hash-de-teste-professor",
        status: "PENDING",
        expiresAt: new Date(Date.now() + 86_400_000),
        lastSentAt: new Date(),
      },
    });
    expect((await client.post(`/api/manager-invitations/${teacherInvite.id}/revoke`)).status).toBe(404);
  });

  it("expiração preguiçosa: uso de convite vencido grava EXPIRED e libera novo convite", async () => {
    const { id, email, token } = await invite();
    await t.prisma.$executeRaw`UPDATE invitations SET expires_at = now() - interval '1 second'`;

    const listed = await client.get("/api/manager-invitations?status=EXPIRED");
    expect(listed.body.items.map((i: { id: string; status: string }) => [i.id, i.status])).toEqual([[id, "EXPIRED"]]);
    expect((await client.get("/api/manager-invitations?status=PENDING")).body.items).toEqual([]);

    expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
    expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
    expect((await api(t).post("/api/invitations/accept", { token, password: "senha-forte-qualquer" })).body.code).toBe(
      "TOKEN_INVALID",
    );

    const again = await client.post("/api/manager-invitations", { email, displayName: "Gestor" });
    expect(again.status).toBe(201);
  });

  it("novo convite com o anterior vencido mas ainda PENDING no banco", async () => {
    const { id, email } = await invite();
    await t.prisma.$executeRaw`UPDATE invitations SET expires_at = now() - interval '1 second'`;
    expect((await client.post("/api/manager-invitations", { email, displayName: "Gestor" })).status).toBe(201);
    expect((await t.prisma.invitation.findUniqueOrThrow({ where: { id } })).status).toBe("EXPIRED");
  });

  it("listagem sem filtro traz todos os status", async () => {
    const { id } = await invite();
    const res = await client.get("/api/manager-invitations");
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([id]);
  });

  it("status inválido no filtro → 400", async () => {
    expect((await client.get("/api/manager-invitations?status=QUALQUER")).status).toBe(400);
  });
});
