import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { ClassInvitationDeliveryWorker } from "../../src/modules/class-invitations/delivery.worker";
import { hashToken } from "../../src/platform/crypto/tokens";
import { CryptoService } from "../../src/platform/crypto/crypto.service";
import {
  createClass,
  createClassInvitation,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

describe("003/US5 — professor acompanha, reenvia e cancela convites (FR-020–FR-023)", () => {
  let t: TestApp;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    t.mailer.setFailing(false);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    schoolClass = await createClass(t, teacher.id, { name: "Redes" });
    client = api(t, { cookie: await loginAs(t, teacher) });
  });

  const base = () => `/api/classes/${schoolClass.id}/invitations`;
  const invite = async (email: string) => {
    const res = await client.post(base(), { email });
    expect(res.status).toBe(201);
    await t.flushMail();
    return res.body as { id: string };
  };
  const resend = (id: string) => client.post(`${base()}/${id}/resend`, {});
  const cancel = (id: string) => client.post(`${base()}/${id}/cancel`, {});
  const list = (query = "") => client.get(`${base()}${query ? `?${query}` : ""}`);
  const emails = (res: { body: { items: { email: string }[] } }) => res.body.items.map((item) => item.email);
  const preview = (token: string) => api(t).post("/api/class-invitations/preview", { token });
  const row = (id: string) => t.prisma.classInvitation.findUniqueOrThrow({ where: { id } });
  /** Forgets the 60 s spacing of `id`'s resends, to reach the daily limit in a test. */
  const forgetResendSpacing = (id: string) =>
    t.prisma.rateLimitCounter.deleteMany({ where: { key: t.get(CryptoService).hmacKey("class_invite:resend", id) } });

  describe("003/US5-1 lista com pesquisa, filtro e paginação", () => {
    it("padrão PENDING; pesquisa por parte do e-mail; filtro pela situação efetiva; só da turma", async () => {
      const pending = await createClassInvitation(t, schoolClass.id, "ana.silva@example.test");
      await createClassInvitation(t, schoolClass.id, "bruno@example.test");
      await createClassInvitation(t, schoolClass.id, "carla@example.test", { status: "CANCELLED" });
      const overdue = await createClassInvitation(t, schoolClass.id, "dora@example.test", {
        lastSentAt: new Date(Date.now() - 8 * DAY_MS),
      });
      await createClassInvitation(t, schoolClass.id, "edu@example.test", { status: "EXPIRED" });
      const other = await createClass(t, teacher.id, { code: "OUTRA" });
      await createClassInvitation(t, other.id, "ana.outra@example.test");

      const defaults = await list();
      expect(defaults.status).toBe(200);
      expect(emails(defaults).sort()).toEqual(["ana.silva@example.test", "bruno@example.test"]);
      expect(defaults.body.items.find((i: { id: string }) => i.id === pending.invitation.id)).toMatchObject({
        status: "PENDING",
        sendCount: 1,
      });

      expect(emails(await list("query=ANA"))).toEqual(["ana.silva@example.test"]);
      expect(emails(await list("query=%25"))).toEqual([]);
      expect(emails(await list("status=CANCELLED"))).toEqual(["carla@example.test"]);
      const expired = await list("status=EXPIRED");
      expect(emails(expired).sort()).toEqual(["dora@example.test", "edu@example.test"]);
      expect(expired.body.items.find((i: { id: string }) => i.id === overdue.invitation.id).status).toBe("EXPIRED");
    });

    it("mais recentes primeiro, 20 por página com cursor", async () => {
      for (let i = 0; i < 23; i += 1) {
        await createClassInvitation(t, schoolClass.id, `aluno${i}@example.test`, {
          createdAt: new Date(Date.now() - i * 60_000),
        });
      }
      const first = await list();
      expect(first.body.items).toHaveLength(20);
      expect(first.body.items[0].email).toBe("aluno0@example.test");
      const second = await list(`cursor=${first.body.nextCursor}`);
      expect(emails(second)).toEqual(["aluno20@example.test", "aluno21@example.test", "aluno22@example.test"]);
      expect(second.body.nextCursor).toBeNull();
    });

    it("mostra \"Envio falhou\" como delivery FAILED", async () => {
      t.mailer.setFailing(true);
      const { id } = await invite("falha@example.test");
      const worker = t.get(ClassInvitationDeliveryWorker);
      let clock = Date.now();
      for (let i = 0; i < 6; i += 1) await worker.runOnce(new Date((clock += 7 * HOUR_MS)));
      expect((await list()).body.items.find((i: { id: string }) => i.id === id).delivery).toBe("FAILED");
    });
  });

  describe("003/US5-2 reenvio", () => {
    it("token novo, anterior inválido, prazo renovado, sendCount + 1, auditoria e entrega anterior SUPERSEDED", async () => {
      t.mailer.setFailing(true);
      const { id } = await invite("aluno@example.test");
      t.mailer.setFailing(false);
      const before = await row(id);
      const oldToken = t.mailer.failed.at(-1)!.text.match(/token=([\w-]+)/)![1]!;
      await t.prisma.classInvitation.update({ where: { id }, data: { lastSentAt: new Date(Date.now() - DAY_MS) } });

      const res = await resend(id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, status: "PENDING", sendCount: 2, delivery: "SENDING" });
      await t.flushMail();

      const after = await row(id);
      const newToken = t.mailer.lastTokenFor("aluno@example.test", "class-invitation")!;
      expect(after.tokenHash).toBe(hashToken(newToken));
      expect(after.tokenHash).not.toBe(before.tokenHash);
      expect(after.expiresAt.getTime() - after.lastSentAt.getTime()).toBe(7 * DAY_MS);
      expect(after.lastSentAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
      expect((await preview(oldToken)).body.code).toBe("TOKEN_INVALID");
      expect((await preview(newToken)).status).toBe(200);

      const deliveries = await t.prisma.mailDelivery.findMany({ where: { classInvitationId: id }, orderBy: { createdAt: "asc" } });
      expect(deliveries.map((d) => d.status)).toEqual(["SUPERSEDED", "SENT"]);
      expect(await t.prisma.auditEvent.findMany({ where: { type: "class_invitation.resent" } })).toMatchObject([
        { actorUserId: teacher.id, targetId: id, metadata: { classId: schoolClass.id, sendCount: 2 } },
      ]);
    });

    it("para e-mail já matriculado → 409 ALREADY_ENROLLED e o convite é cancelado (ALREADY_ENROLLED)", async () => {
      const student = await createUser(t, { email: "matriculado@example.test" });
      const { invitation } = await createClassInvitation(t, schoolClass.id, student.email);
      await createEnrollment(t, schoolClass.id, student.id);

      const res = await resend(invitation.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ALREADY_ENROLLED");
      expect(await row(invitation.id)).toMatchObject({ status: "CANCELLED", cancelReason: "ALREADY_ENROLLED" });
      await t.flushMail();
      expect(t.mailer.outbox).toHaveLength(0);
      expect(await t.prisma.auditEvent.findMany({ where: { type: "class_invitation.cancelled" } })).toMatchObject([
        { targetId: invitation.id, metadata: { classId: schoolClass.id, reason: "ALREADY_ENROLLED" } },
      ]);
    });

    it("turma inativa → 409 CLASS_NOT_OPEN, nada muda", async () => {
      const { invitation } = await createClassInvitation(t, schoolClass.id, "aluno@example.test");
      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "INACTIVE" } });
      const res = await resend(invitation.id);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("CLASS_NOT_OPEN");
      expect((await row(invitation.id)).sendCount).toBe(1);
    });
  });

  describe("003/US5-3 limites de reenvio (FR-021)", () => {
    it("segundo reenvio em menos de 60 s → 429 com Retry-After, sem e-mail", async () => {
      const { id } = await invite("aluno@example.test");
      expect((await resend(id)).status).toBe(200);
      await t.flushMail();
      t.mailer.clear();

      const blocked = await resend(id);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe("RATE_LIMITED");
      expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
      await t.flushMail();
      expect(t.mailer.outbox).toHaveLength(0);
      expect((await row(id)).sendCount).toBe(2);
    });

    it("6º envio no dia (criação + 5 reenvios) → 429, sem e-mail", async () => {
      const { id } = await invite("aluno@example.test");
      for (let i = 0; i < 4; i += 1) {
        await forgetResendSpacing(id);
        expect((await resend(id)).status).toBe(200);
      }
      await forgetResendSpacing(id);
      await t.flushMail();
      t.mailer.clear();
      const blocked = await resend(id);
      expect(blocked.status).toBe(429);
      await t.flushMail();
      expect(t.mailer.outbox).toHaveLength(0);
      expect((await row(id)).sendCount).toBe(5);
    });

    it("tentativas automáticas falhas não contam: depois de 6 delas o reenvio manual é aceito", async () => {
      t.mailer.setFailing(true);
      const { id } = await invite("aluno@example.test");
      const worker = t.get(ClassInvitationDeliveryWorker);
      let clock = Date.now();
      for (let i = 0; i < 6; i += 1) await worker.runOnce(new Date((clock += 7 * HOUR_MS)));
      t.mailer.setFailing(false);

      expect((await resend(id)).status).toBe(200);
      await t.flushMail();
      expect(t.mailer.messagesFor("aluno@example.test")).toHaveLength(1);
    });
  });

  describe("003/US5-4 cancelamento", () => {
    it("CANCELLED com motivo TEACHER, link recusado, auditado, entrega pendente aposentada", async () => {
      t.mailer.setFailing(true);
      const { id } = await invite("aluno@example.test");
      const token = t.mailer.failed.at(-1)!.text.match(/token=([\w-]+)/)![1]!;

      const res = await cancel(id);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id, status: "CANCELLED" });
      expect(await row(id)).toMatchObject({ status: "CANCELLED", cancelReason: "TEACHER", cancelledById: teacher.id });
      expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
      expect((await t.prisma.mailDelivery.findFirstOrThrow({ where: { classInvitationId: id } })).status).toBe(
        "SUPERSEDED",
      );
      expect(await t.prisma.auditEvent.findMany({ where: { type: "class_invitation.cancelled" } })).toMatchObject([
        { actorUserId: teacher.id, targetId: id, metadata: { classId: schoolClass.id, reason: "TEACHER" } },
      ]);
    });
  });

  describe("003/US5-5 transições inválidas", () => {
    it.each(["ACCEPTED", "CANCELLED", "EXPIRED", "vencido"] as const)(
      "reenviar ou cancelar convite %s → 409 INVALID_STATE_TRANSITION",
      async (state) => {
        const student = await createUser(t);
        const { invitation } =
          state === "vencido"
            ? await createClassInvitation(t, schoolClass.id, student.email, { lastSentAt: new Date(Date.now() - 8 * DAY_MS) })
            : state === "ACCEPTED"
              ? await createClassInvitation(t, schoolClass.id, student.email)
              : await createClassInvitation(t, schoolClass.id, student.email, { status: state });
        if (state === "ACCEPTED") {
          await t.prisma.classInvitation.update({
            where: { id: invitation.id },
            data: { status: "ACCEPTED", acceptedAt: new Date(), acceptedByUserId: student.id },
          });
        }
        for (const res of [await resend(invitation.id), await cancel(invitation.id)]) {
          expect(res.status).toBe(409);
          expect(res.body.code).toBe("INVALID_STATE_TRANSITION");
        }
      },
    );

    it("convite de outra turma do mesmo professor ou de outro professor → 404", async () => {
      const other = await createClass(t, teacher.id, { code: "OUTRA" });
      const { invitation } = await createClassInvitation(t, other.id, "aluno@example.test");
      expect((await resend(invitation.id)).status).toBe(404);
      expect((await cancel(invitation.id)).status).toBe(404);

      const stranger = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
      const url = `/api/classes/${other.id}/invitations/${invitation.id}/cancel`;
      expect((await stranger.post(url, {})).status).toBe(404);
      expect((await row(invitation.id)).status).toBe("PENDING");
    });
  });

  describe("003/US5-6 convite vencido", () => {
    it("aparece EXPIRED na lista e o link responde TOKEN_EXPIRED", async () => {
      const { invitation, token } = await createClassInvitation(t, schoolClass.id, "aluno@example.test", {
        lastSentAt: new Date(Date.now() - 8 * DAY_MS),
      });
      expect((await list("status=EXPIRED")).body.items.map((i: { id: string }) => i.id)).toEqual([invitation.id]);
      expect((await preview(token)).body.code).toBe("TOKEN_EXPIRED");
    });
  });

  describe("003/US5-7 links que não valem mais", () => {
    it("adulterado, cancelado e substituído por reenvio → mesma resposta TOKEN_INVALID", async () => {
      const cancelled = await createClassInvitation(t, schoolClass.id, "cancelado@example.test");
      expect((await cancel(cancelled.invitation.id)).status).toBe(200);
      const replaced = await createClassInvitation(t, schoolClass.id, "substituido@example.test");
      expect((await resend(replaced.invitation.id)).status).toBe(200);
      const valid = await createClassInvitation(t, schoolClass.id, "valido@example.test");
      const tampered = `${valid.token.slice(0, -1)}${valid.token.endsWith("A") ? "B" : "A"}`;

      const bodies = [];
      for (const token of [tampered, cancelled.token, replaced.token]) {
        const res = await preview(token);
        expect(res.status).toBe(400);
        bodies.push(res.body);
      }
      expect(bodies[1]).toEqual(bodies[0]);
      expect(bodies[2]).toEqual(bodies[0]);
      expect(bodies[0]).toMatchObject({ code: "TOKEN_INVALID" });
    });
  });
});
