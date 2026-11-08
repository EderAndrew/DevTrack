import { MobileExamListSchema, MobileSessionSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import { LOGIN_DELAY } from "../../src/modules/auth/login.service";
import { SessionService } from "../../src/modules/auth/session.service";
import { createClassWithStudents } from "../helpers/activities";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { examActivity, expoToken, mobileApi, mobileLogin, openMobileSession, registerDevice, signInMobile } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const DAY = 86_400_000;
const audits = (t: TestApp, type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

/**
 * 024/US1 (contracts/http-api.md, contracts/audit-events.md, research Y3, Y9): the teacher signs in to the
 * app with their own account and gets a MOBILE kind of the opaque session, registers the phone for alerts,
 * lists their exams in progress and signs out; every revocation of the web reaches the phone.
 */
describe("024/US1 professor entra no aplicativo com a própria conta", () => {
  let t: TestApp;
  let teacher: TestUser;
  let schoolClass: { id: string; teacherId: string };

  beforeAll(async () => {
    t = await createTestApp({ overrides: [{ provide: LOGIN_DELAY, useValue: async () => {} }] });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    schoolClass = (await createClassWithStudents(t, teacher.id, { students: 1 })).schoolClass;
  });

  describe("entrar", () => {
    it("024/US1-1 o professor entra com e-mail e senha: sessão MOBILE opaca, só o hash no banco, 90 dias no máximo", async () => {
      const before = Date.now();
      const res = await mobileLogin(t, teacher.email, teacher.password);
      expect(res.status).toBe(201);
      const body = MobileSessionSchema.parse(res.body);
      expect(body.user).toMatchObject({ id: teacher.id, email: teacher.email });
      expect(res.headers["set-cookie"]).toBeUndefined();

      const session = await t.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashToken(body.token) } });
      expect(session.client).toBe("MOBILE");
      expect(JSON.stringify(session)).not.toContain(body.token);
      const absolute = session.absoluteExpiresAt.getTime() - before;
      expect(absolute).toBeGreaterThanOrEqual(90 * DAY - 5000);
      expect(absolute).toBeLessThanOrEqual(90 * DAY + 5000);
      expect(new Date(body.expiresAt).getTime()).toBe(session.absoluteExpiresAt.getTime());

      expect((await mobileApi(t, body.token).get("/api/me")).status).toBe(200);
      expect((await mobileApi(t, body.token).get("/api/mobile/exams")).status).toBe(200);

      const [created] = await audits(t, "mobile_session.created");
      expect(created).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "SESSION", targetId: session.id });
      expect(created!.metadata).toEqual({ sessionId: session.id });
      expect(await t.prisma.accessRecord.count({ where: { userId: teacher.id } })).toBe(1);
      expect(await audits(t, "auth.login.succeeded")).toHaveLength(0);
    });

    it("024/US1-2 e-mail ou senha errados: a mesma resposta genérica da web, contando no mesmo limite", async () => {
      const wrong = await mobileLogin(t, teacher.email, "senha-errada");
      const unknown = await mobileLogin(t, "ninguem@example.test", "senha-errada");
      const web = await api(t).post("/api/auth/login", { email: teacher.email, password: "senha-errada" });
      expect(wrong.status).toBe(401);
      expect(wrong.body).toEqual(web.body);
      expect(unknown.body).toEqual(web.body);
      expect(wrong.body.code).toBe("INVALID_CREDENTIALS");

      // 5 failures of this e-mail from this origin block the pair, on the web too (login:email_origin).
      // Two failures so far count for this pair (the app's and the web's); three more reach the 5.
      for (let i = 0; i < 3; i += 1) await mobileLogin(t, teacher.email, "senha-errada");
      const blockedWeb = await api(t).post("/api/auth/login", { email: teacher.email, password: teacher.password });
      expect(blockedWeb.status).toBe(429);
      const blockedApp = await mobileLogin(t, teacher.email, teacher.password);
      expect(blockedApp.status).toBe(429);
      expect(await t.prisma.session.count()).toBe(0);
    });

    it("024/US1-3 uma conta que não acompanha provas é recusada, sem sessão, com o motivo auditado", async () => {
      const student = await createUser(t, { roles: ["STUDENT"] });
      const manager = await createUser(t, { roles: ["MANAGER"] });
      const admin = await createUser(t, { roles: ["ADMIN"] });
      const unverified = await createUser(t, { roles: ["TEACHER"], verified: false });
      for (const user of [student, manager, admin, unverified]) {
        const res = await mobileLogin(t, user.email, user.password);
        expect({ status: res.status, code: res.body.code }).toEqual({ status: 403, code: "MOBILE_NOT_ALLOWED" });
      }
      expect(await t.prisma.session.count()).toBe(0);
      const refused = await audits(t, "mobile_session.refused");
      expect(refused.map((event) => event.targetId)).toEqual([student.id, manager.id, admin.id, unverified.id]);
      for (const event of refused) expect(event.metadata).toEqual({ code: "MOBILE_NOT_ALLOWED" });

      // A teacher who is also ADMIN gets in, as a teacher.
      const teacherAdmin = await createUser(t, { roles: ["ADMIN", "TEACHER"] });
      expect((await mobileLogin(t, teacherAdmin.email, teacherAdmin.password)).status).toBe(201);

      // A suspended account answers as on the web.
      const suspended = await createUser(t, { roles: ["TEACHER"], status: "SUSPENDED" });
      expect((await mobileLogin(t, suspended.email, suspended.password)).body.code).toBe("ACCOUNT_SUSPENDED");
    });

    it("o corpo do login é estrito e a rota não exige Origin; um Origin presente precisa ser permitido", async () => {
      const extra = await api(t, { origin: null }).post("/api/auth/mobile/sessions", { email: teacher.email, password: teacher.password, client: "WEB" });
      expect(extra.status).toBe(400);
      const foreign = await api(t, { origin: "https://evil.example" }).post("/api/auth/mobile/sessions", { email: teacher.email, password: teacher.password });
      expect(foreign.body.code).toBe("ORIGIN_NOT_ALLOWED");
      const allowed = await api(t).post("/api/auth/mobile/sessions", { email: teacher.email, password: teacher.password });
      expect(allowed.status).toBe(201);
    });
  });

  describe("sair e perder a sessão", () => {
    it("024/US1-4 Sair encerra a sessão do celular e apaga o celular na mesma transação", async () => {
      const token = await signInMobile(t, teacher);
      expect((await registerDevice(t, token)).status).toBe(200);
      const session = await t.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
      const device = await t.prisma.mobileDevice.findUniqueOrThrow({ where: { sessionId: session.id } });

      const res = await mobileApi(t, token).delete("/api/auth/mobile/sessions/current");
      expect(res.status).toBe(204);
      expect(await t.prisma.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ revokeReason: "LOGOUT" });
      expect(await t.prisma.mobileDevice.count()).toBe(0);

      const [ended] = await audits(t, "mobile_session.ended");
      expect(ended).toMatchObject({ actorType: "USER", targetType: "SESSION", targetId: session.id, metadata: { sessionId: session.id } });
      const [removed] = await audits(t, "mobile_device.removed");
      expect(removed).toMatchObject({ actorType: "USER", targetType: "MOBILE_DEVICE", targetId: device.id, metadata: { reason: "LOGOUT" } });

      expect((await mobileApi(t, token).delete("/api/auth/mobile/sessions/current")).status).toBe(401);
    });

    it("024/US1-5 troca de senha, suspensão, remoção do papel, sair de todos e Minhas sessões derrubam o celular e apagam o aparelho", async () => {
      const sessions = t.get(SessionService);
      const revokers: [string, (userId: string, sessionId: string) => Promise<unknown>][] = [
        ["PASSWORD_RESET", (userId) => t.prisma.runInTransaction((tx) => sessions.revokeAllForUser(tx, userId, "PASSWORD_RESET"))],
        ["ACCOUNT_SUSPENDED", (userId) => t.prisma.runInTransaction((tx) => sessions.revokeAllForUser(tx, userId, "ACCOUNT_SUSPENDED"))],
        ["ROLE_DEACTIVATED", (userId) => t.prisma.runInTransaction((tx) => sessions.revokeAllForUser(tx, userId, "ROLE_DEACTIVATED"))],
        ["LOGOUT_ALL", async (userId) => api(t, { cookie: await loginAs(t, { id: userId }) }).post("/api/auth/logout-all")],
        ["USER_REVOKED", async (userId, sessionId) => api(t, { cookie: await loginAs(t, { id: userId }) }).delete(`/api/me/sessions/${sessionId}`)],
      ];
      for (const [reason, revoke] of revokers) {
        const user = await createUser(t, { roles: ["TEACHER"] });
        const token = await signInMobile(t, user);
        await registerDevice(t, token);
        const session = await t.prisma.session.findUniqueOrThrow({ where: { tokenHash: hashToken(token) } });
        const device = await t.prisma.mobileDevice.findUniqueOrThrow({ where: { sessionId: session.id } });

        await revoke(user.id, session.id);
        expect((await mobileApi(t, token).get("/api/me")).status, reason).toBe(401);
        expect(await t.prisma.mobileDevice.count({ where: { id: device.id } }), reason).toBe(0);
        const removed = await t.prisma.auditEvent.findMany({ where: { type: "mobile_device.removed", targetId: device.id } });
        expect(removed, reason).toHaveLength(1);
        expect(removed[0], reason).toMatchObject({ actorType: "SYSTEM", targetType: "MOBILE_DEVICE", metadata: { reason: "SESSION_REVOKED" } });
      }
    });

    it("024/US1-5 uma revogação desfeita (rollback) mantém o celular", async () => {
      const token = await signInMobile(t, teacher);
      await registerDevice(t, token);
      const sessions = t.get(SessionService);
      await expect(
        t.prisma.runInTransaction(async (tx) => {
          await sessions.revokeAllForUser(tx, teacher.id, "PASSWORD_RESET");
          throw new Error("rollback");
        }),
      ).rejects.toThrow("rollback");
      expect(await t.prisma.mobileDevice.count()).toBe(1);
      expect((await mobileApi(t, token).get("/api/me")).status).toBe(200);
    });

    it("024/US1-6 a sessão do celular expira após 30 dias sem uso ou 90 dias desde a criação; a da web segue 8 h / 7 dias", async () => {
      const idle = await openMobileSession(t, teacher);
      await t.prisma.session.update({ where: { id: idle.sessionId }, data: { lastUsedAt: new Date(Date.now() - 30 * DAY - 1000) } });
      expect((await mobileApi(t, idle.token).get("/api/me")).status).toBe(401);

      const recent = await openMobileSession(t, teacher);
      await t.prisma.session.update({ where: { id: recent.sessionId }, data: { lastUsedAt: new Date(Date.now() - 29 * DAY) } });
      expect((await mobileApi(t, recent.token).get("/api/me")).status).toBe(200);

      const old = await openMobileSession(t, teacher);
      await t.prisma.session.update({ where: { id: old.sessionId }, data: { absoluteExpiresAt: new Date(Date.now() - 1000), lastUsedAt: new Date() } });
      expect((await mobileApi(t, old.token).get("/api/me")).status).toBe(401);

      // The web keeps 8 h idle: a cookie session idle for 9 h is gone, one idle for 7 h still works.
      const webCookie = await loginAs(t, teacher);
      const webSecret = webCookie.split("=")[1]!;
      await t.prisma.session.update({ where: { tokenHash: hashToken(webSecret) }, data: { lastUsedAt: new Date(Date.now() - 9 * 3_600_000) } });
      expect((await api(t, { cookie: webCookie }).get("/api/me")).status).toBe(401);
    });

    it("024/FR-004 ler a sala e a lista renovam o uso; entregar avisos não (o worker nunca valida a sessão)", async () => {
      const session = await openMobileSession(t, teacher);
      const stale = new Date(Date.now() - 29 * DAY);
      await t.prisma.session.update({ where: { id: session.sessionId }, data: { lastUsedAt: stale } });
      expect((await mobileApi(t, session.token).get("/api/mobile/exams")).status).toBe(200);
      const renewed = await t.prisma.session.findUniqueOrThrow({ where: { id: session.sessionId } });
      expect(renewed.lastUsedAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });
  });

  describe("024/FR-018 registrar o celular", () => {
    it("cria o registro da sessão, repetir não muda nada, outro login no mesmo celular leva o token", async () => {
      const token = await signInMobile(t, teacher);
      const pushToken = expoToken();
      const first = await registerDevice(t, token, pushToken);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ id: expect.any(String), platform: "ANDROID" });
      expect(JSON.stringify(first.body)).not.toContain(pushToken);
      expect(await audits(t, "mobile_device.registered")).toHaveLength(1);

      const again = await registerDevice(t, token, pushToken);
      expect(again.body.id).toBe(first.body.id);
      expect(await audits(t, "mobile_device.registered")).toHaveLength(1);

      // A new token for the same session replaces the old one in place.
      const rotated = await registerDevice(t, token, expoToken());
      expect(rotated.body.id).toBe(first.body.id);
      expect(await t.prisma.mobileDevice.count()).toBe(1);

      // Another teacher signs in on the same phone: the token moves to the new session.
      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherToken = await signInMobile(t, other);
      const currentToken = (await t.prisma.mobileDevice.findFirstOrThrow()).pushToken;
      const moved = await registerDevice(t, otherToken, currentToken);
      expect(moved.status).toBe(200);
      const devices = await t.prisma.mobileDevice.findMany();
      expect(devices).toHaveLength(1);
      expect(devices[0]!.userId).toBe(other.id);
      const removed = await audits(t, "mobile_device.removed");
      expect(removed.map((event) => (event.metadata as { reason: string }).reason)).toEqual(["REPLACED"]);
      expect(removed[0]!.targetId).toBe(first.body.id);
    });

    it("corpo estrito: token fora do formato, plataforma inválida ou campo extra → 400", async () => {
      const token = await signInMobile(t, teacher);
      const client = mobileApi(t, token);
      for (const body of [
        { pushToken: "abc", platform: "ANDROID" },
        { pushToken: expoToken(), platform: "WEB" },
        { pushToken: expoToken(), platform: "ANDROID", userId: teacher.id },
        {},
      ]) {
        expect((await client.put("/api/mobile/device", body)).status).toBe(400);
      }
      expect(await t.prisma.mobileDevice.count()).toBe(0);
    });

    it("uma sessão da web não tem celular para registrar nem sair pelo app", async () => {
      const cookie = await loginAs(t, teacher);
      expect((await api(t, { cookie }).put("/api/mobile/device", { pushToken: expoToken(), platform: "ANDROID" })).status).toBe(404);
      expect((await api(t, { cookie }).delete("/api/auth/mobile/sessions/current")).status).toBe(404);
      expect((await api(t, { cookie }).get("/api/me")).status).toBe(200);
    });
  });

  describe("024/FR-006 provas em andamento", () => {
    it("só as provas EXAM das turmas do professor, publicadas, não encerradas nem canceladas, por encerramento", async () => {
      const later = await examActivity(t, schoolClass, { startedMinutesAgo: 1, title: "Prova B" });
      const sooner = await examActivity(t, schoolClass, { startedMinutesAgo: 30, title: "Prova A" });
      await examActivity(t, schoolClass, { startedMinutesAgo: -30, title: "Agendada" });
      await examActivity(t, schoolClass, { startedMinutesAgo: 80, title: "Já passou do fim" });
      await examActivity(t, schoolClass, { status: "CLOSED", title: "Encerrada" });
      await examActivity(t, schoolClass, { status: "CANCELLED", title: "Cancelada" });
      const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
      const otherClass = (await createClassWithStudents(t, otherTeacher.id, { students: 1 })).schoolClass;
      await examActivity(t, otherClass, { title: "De outro professor" });
      const archived = (await createClassWithStudents(t, teacher.id, { students: 1 })).schoolClass;
      await examActivity(t, archived, { title: "Turma arquivada" });
      await t.prisma.schoolClass.update({ where: { id: archived.id }, data: { status: "ARCHIVED" } });

      const token = await signInMobile(t, teacher);
      const res = await mobileApi(t, token).get("/api/mobile/exams");
      expect(res.status).toBe(200);
      const list = MobileExamListSchema.parse(res.body);
      expect(list.items.map((item) => item.title)).toEqual(["Prova A", "Prova B"]);
      expect(list.items[0]).toEqual({
        activityId: sooner.activity.id,
        classId: schoolClass.id,
        className: expect.any(String),
        title: "Prova A",
        closesAt: new Date(sooner.activity.publishAt.getTime() + 75 * 60_000).toISOString(),
        muted: false,
      });
      expect(list.items[1]!.activityId).toBe(later.activity.id);
      expect(Math.abs(new Date(list.serverNow).getTime() - Date.now())).toBeLessThan(10_000);
    });
  });
});
