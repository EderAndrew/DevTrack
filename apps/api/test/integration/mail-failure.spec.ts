import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TokenPurpose } from "../../src/generated/prisma/client";
import { FailingMailer } from "../../src/platform/mail/in-memory.mailer";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { createUser, loginAs, uniqueEmail } from "../helpers/factories";
import { captureLogs } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PASSWORD = "senha-forte-da-falha-de-email";

/** Status and body with per-request identifiers removed, to compare the failing and normal cases. */
function shape(res: { status: number; body: Record<string, unknown> }) {
  const { id: _id, email: _email, createdAt: _c, expiresAt: _e, lastSentAt: _l, ...body } = res.body;
  return { status: res.status, body };
}

/**
 * Edge case "Falha no envio de e-mail" (spec): SMTP down never changes the public response nor
 * leaves the state inconsistent, and a later resend with a working mailer delivers a valid link.
 * Since 017 the e-mail also stays PENDING in the outbox and goes out on the next worker cycle
 * (017/US1-1, 017/US1-2), with a fresh link that replaces the one of the failed attempt.
 */
describe("falha no envio de e-mail (edge case; FR-016, FR-041, FR-029a)", () => {
  const logs = captureLogs();
  let failing: TestApp;
  let normal: TestApp;

  beforeAll(async () => {
    failing = await createTestApp({ mailer: new FailingMailer(), logs });
    normal = await createTestApp();
  });
  afterAll(async () => {
    await failing.close();
    await normal.close();
  });
  beforeEach(async () => {
    await resetDb(normal.prisma);
    normal.mailer.clear();
    logs.clear();
  });

  /** Unused, unexpired tokens of a purpose for the user with this e-mail. */
  const liveTokens = async (email: string, purpose: TokenPurpose) =>
    normal.prisma.userToken.count({
      where: { user: { email }, purpose, usedAt: null, invalidatedAt: null, expiresAt: { gt: new Date() } },
    });

  const expectFailureLoggedWithoutSecrets = async (t: TestApp) => {
    await t.flushMail();
    const warnings = logs.lines().filter((line) => line.msg === "mail.delivery_failed");
    expect(warnings.length).toBeGreaterThan(0);
    expect(logs.text()).not.toMatch(/token=|https?:\/\/localhost:3000\//);
  };

  /**
   * 017/US1-2: the failed e-mail is PENDING; the worker of the app with a working mailer sends it
   * once, with a fresh link that works, and the link of the failed attempt is dead.
   */
  const expectRetriedByWorker = async (
    email: string,
    kind: "VERIFY_EMAIL" | "PASSWORD_RESET",
    template: "verify-email" | "password-reset",
    use: (token: string) => Promise<{ status: number }>,
  ) => {
    const delivery = await normal.prisma.mailDelivery.findFirstOrThrow({ where: { kind, user: { email } }, orderBy: { createdAt: "desc" } });
    expect(delivery).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "ECONNECTION" });
    const failedToken = new URL(
      (failing.mailer as unknown as FailingMailer).attempted.at(-1)!.params.link,
    ).searchParams.get("token")!;
    expect(await normal.get(MailDeliveryWorker).runOnce(new Date(Date.now() + 2 * 60_000))).toBe(1);
    expect(normal.mailer.messagesFor(email).filter((mail) => mail.template === template)).toHaveLength(1);
    expect(await normal.prisma.mailDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).toMatchObject({ status: "SENT", attempts: 2 });
    expect((await use(failedToken)).status).toBe(400);
    expect((await use(normal.mailer.lastTokenFor(email, template)!)).status).toBe(200);
    normal.mailer.clear();
  };

  it("017/US1-1 017/US1-2 reenvio de verificação: mesma resposta, envio PENDING que sai no runOnce, reenvio posterior funciona", async () => {
    const resend = (t: TestApp, email: string) => api(t).post("/api/auth/verify-email/resend", { email });

    const email = uniqueEmail("sem-smtp");
    const reference = uniqueEmail("com-smtp");
    await createUser(normal, { name: "Aluna Sem E-mail", email, password: PASSWORD, verified: false });
    await createUser(normal, { name: "Aluna Com E-mail", email: reference, password: PASSWORD, verified: false });
    expect(shape(await resend(failing, email))).toEqual(shape(await resend(normal, reference)));
    await expectFailureLoggedWithoutSecrets(failing);

    const user = await normal.prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ emailVerifiedAt: null, status: "ACTIVE" });
    expect(await liveTokens(email, "EMAIL_VERIFICATION")).toBe(1);
    await expectRetriedByWorker(email, "VERIFY_EMAIL", "verify-email", (token) =>
      api(normal).post("/api/auth/verify-email", { token }),
    );
    await normal.prisma.user.update({ where: { email }, data: { emailVerifiedAt: null } });

    expect((await resend(normal, email)).status).toBe(202);
    await normal.flushMail();
    const token = normal.mailer.lastTokenFor(email, "verify-email")!;
    expect(await liveTokens(email, "EMAIL_VERIFICATION")).toBe(1);
    expect((await api(normal).post("/api/auth/verify-email", { token })).status).toBe(200);
  });

  it("convites de MANAGER e de professor: 201 igual, convite PENDING, reenvio posterior aceito", async () => {
    const admin = await createUser(normal, { roles: ["ADMIN"] });
    const manager = await createUser(normal, { roles: ["MANAGER"] });
    const cases = [
      { path: "/api/manager-invitations", inviter: admin, template: "invitation-manager" as const },
      { path: "/api/teacher-invitations", inviter: manager, template: "invitation-teacher" as const },
    ];

    for (const { path, inviter, template } of cases) {
      const cookie = await loginAs(normal, inviter);
      const email = uniqueEmail("convidada-sem-smtp");
      const body = { email, displayName: "Convidada" };
      const failed = await api(failing, { cookie }).post(path, body);
      const reference = await api(normal, { cookie }).post(path, { ...body, email: uniqueEmail("convidada") });
      expect(shape(failed)).toEqual(shape(reference));
      await expectFailureLoggedWithoutSecrets(failing);

      const invitation = await normal.prisma.invitation.findUniqueOrThrow({ where: { id: failed.body.id as string } });
      expect(invitation.status).toBe("PENDING");

      expect((await api(normal, { cookie }).post(`${path}/${invitation.id}/resend`)).status).toBe(200);
      await normal.flushMail();
      const token = normal.mailer.lastTokenFor(email, template)!;
      const accepted = await api(normal).post("/api/invitations/accept", { token, password: PASSWORD });
      expect(accepted.status, path).toBe(200);
    }
  });

  it("017/US1-1 017/US1-2 recuperação de senha: mesma resposta, envio PENDING que sai no runOnce, novo pedido posterior funciona", async () => {
    const user = await createUser(normal);
    const other = await createUser(normal);
    const request = (t: TestApp, email: string) => api(t).post("/api/auth/password-reset/request", { email });

    expect(shape(await request(failing, user.email))).toEqual(shape(await request(normal, other.email)));
    await expectFailureLoggedWithoutSecrets(failing);
    expect(await liveTokens(user.email, "PASSWORD_RESET")).toBe(1);
    await expectRetriedByWorker(user.email, "PASSWORD_RESET", "password-reset", (token) =>
      api(normal).post("/api/auth/password-reset/confirm", { token, password: PASSWORD }),
    );

    expect((await request(normal, user.email)).status).toBe(202);
    await normal.flushMail();
    const token = normal.mailer.lastTokenFor(user.email, "password-reset")!;
    expect(await liveTokens(user.email, "PASSWORD_RESET")).toBe(1);
    const confirm = await api(normal).post("/api/auth/password-reset/confirm", { token, password: PASSWORD });
    expect(confirm.status).toBe(200);
  });
});
