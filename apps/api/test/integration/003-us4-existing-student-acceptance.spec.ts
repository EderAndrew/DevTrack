import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import {
  createClass,
  createClassInvitation,
  createEnrollment,
  createUser,
  DEFAULT_PASSWORD,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const NEW_PASSWORD = "girassol-azul-de-outono";

describe("003/US4 — aluno que já tem conta aceita o convite (FR-032–FR-036)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  let teacher: TestUser;
  const newClass = async (overrides: Parameters<typeof createClass>[2] = {}) => {
    teacher ??= await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    return createClass(t, teacher.id, overrides);
  };
  beforeEach(() => {
    teacher = undefined as unknown as TestUser;
  });

  const preview = (token: string, cookie?: string) => api(t, { cookie }).post("/api/class-invitations/preview", { token });
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/class-invitations/accept", body);
  const sessionCookie = (res: { headers: Record<string, unknown> }) =>
    ((res.headers["set-cookie"] as string[] | undefined) ?? [])
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split(";")[0];
  const activeEnrollments = (userId: string) =>
    t.prisma.enrollment.findMany({ where: { studentUserId: userId, status: "ACTIVE" }, orderBy: { classId: "asc" } });
  const invitationStatus = async (id: string) => (await t.prisma.classInvitation.findUniqueOrThrow({ where: { id } })).status;
  const refusals = () => t.prisma.auditEvent.findMany({ where: { type: "class_invitation.acceptance_refused" } });

  /** A verified student with an RA, already enrolled in one class. */
  async function enrolledStudent(): Promise<{ student: TestUser; first: SchoolClass }> {
    const student = await createUser(t, { name: "Aluno Veterano", ra: "RA-100" });
    const first = await newClass({ code: "A-1" });
    await createEnrollment(t, first.id, student.id);
    return { student, first };
  }

  describe("003/US4-1 conta verificada sem sessão", () => {
    it("preview SIGN_IN_REQUIRED; aceite → 401 SIGN_IN_REQUIRED, senha enviada ignorada e inalterada", async () => {
      const { student } = await enrolledStudent();
      const { token, invitation } = await createClassInvitation(t, (await newClass({ code: "B-1" })).id, student.email);
      const before = await t.prisma.user.findUniqueOrThrow({ where: { id: student.id } });

      expect((await preview(token)).body).toMatchObject({ mode: "SIGN_IN_REQUIRED", raRequired: false, email: student.email });
      const res = await accept({ token, name: "Outro Nome", password: NEW_PASSWORD });
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("SIGN_IN_REQUIRED");

      const after = await t.prisma.user.findUniqueOrThrow({ where: { id: student.id } });
      expect(after.passwordHash).toBe(before.passwordHash);
      expect(after.name).toBe(before.name);
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await refusals()).toMatchObject([{ actorType: "ANONYMOUS", metadata: { reason: "SIGN_IN_REQUIRED" } }]);
    });
  });

  describe("003/US4-2 com a sessão da conta convidada", () => {
    it("matrícula nova, convite aceito, nenhuma conta nova e nenhuma sessão nova", async () => {
      const { student, first } = await enrolledStudent();
      const second = await newClass({ code: "B-1" });
      const { token, invitation } = await createClassInvitation(t, second.id, student.email);
      const users = await t.prisma.user.count();
      const cookie = await loginAs(t, student);

      const res = await accept({ token, password: NEW_PASSWORD }, cookie);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ classId: second.id, mode: "SIGN_IN_REQUIRED", alreadyEnrolled: false });
      expect(sessionCookie(res)).toBeUndefined();

      expect(await t.prisma.user.count()).toBe(users);
      expect((await activeEnrollments(student.id)).map((e) => e.classId).sort()).toEqual([first.id, second.id].sort());
      expect(await invitationStatus(invitation.id)).toBe("ACCEPTED");
      expect(await t.prisma.auditEvent.findFirstOrThrow({ where: { type: "class_invitation.accepted" } })).toMatchObject({
        actorType: "USER",
        actorUserId: student.id,
        metadata: { mode: "SIGN_IN_REQUIRED", alreadyEnrolled: false },
      });
      // The student's password still works; the invitation did not touch it.
      expect((await api(t).post("/api/auth/login", { email: student.email, password: DEFAULT_PASSWORD })).status).toBe(200);
    });

    it("já matriculado por outro convite da mesma turma → convite aceito, alreadyEnrolled, sem matrícula nova", async () => {
      const { student, first } = await enrolledStudent();
      const { token, invitation } = await createClassInvitation(t, first.id, student.email);
      const res = await accept({ token }, await loginAs(t, student));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ classId: first.id, mode: "SIGN_IN_REQUIRED", alreadyEnrolled: true });
      expect(await activeEnrollments(student.id)).toHaveLength(1);
      expect(await invitationStatus(invitation.id)).toBe("ACCEPTED");
      expect(await t.prisma.auditEvent.count({ where: { type: "enrollment.created" } })).toBe(0);
    });
  });

  describe("003/US4-3 sessão de outra conta", () => {
    it("403 WRONG_ACCOUNT, recusa auditada, nada muda e nada da conta convidada aparece", async () => {
      const { student } = await enrolledStudent();
      const { token, invitation } = await createClassInvitation(t, (await newClass({ code: "B-1" })).id, student.email);
      const intruder = await createUser(t, { name: "Outra Pessoa", ra: "RA-200" });

      const res = await accept({ token, ra: "RA-300" }, await loginAs(t, intruder));
      expect(res.status).toBe(403);
      expect(res.body).toEqual({ statusCode: 403, code: "WRONG_ACCOUNT", message: expect.any(String) });
      expect(JSON.stringify(res.body)).not.toContain(student.name);
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await activeEnrollments(intruder.id)).toHaveLength(0);
      expect(await refusals()).toMatchObject([
        { actorType: "USER", actorUserId: intruder.id, targetId: invitation.id, metadata: { reason: "WRONG_ACCOUNT" } },
      ]);
    });
  });

  describe("003/US4-4 conta sem papel de aluno", () => {
    it("professor ganha STUDENT e perfil de aluno, mantendo TEACHER", async () => {
      const otherTeacher = await createUser(t, { roles: ["TEACHER"], name: "Professor Estudante" });
      const schoolClass = await newClass();
      const { token } = await createClassInvitation(t, schoolClass.id, otherTeacher.email);
      const cookie = await loginAs(t, otherTeacher);

      expect((await preview(token, cookie)).body).toMatchObject({ mode: "SIGN_IN_REQUIRED", raRequired: true });
      const res = await accept({ token, ra: "RA-PROF-1" }, cookie);
      expect(res.status).toBe(200);

      const roles = await t.prisma.userRole.findMany({ where: { userId: otherTeacher.id }, include: { role: true } });
      expect(roles.map((r) => [r.role.key, r.status]).sort()).toEqual([
        ["STUDENT", "ACTIVE"],
        ["TEACHER", "ACTIVE"],
      ]);
      expect(roles.find((r) => r.role.key === "STUDENT")).toMatchObject({ grantedVia: "CLASS_INVITATION" });
      expect(await t.prisma.studentProfile.findUniqueOrThrow({ where: { userId: otherTeacher.id } })).toMatchObject({
        displayName: "Professor Estudante",
        ra: "RA-PROF-1",
      });
      expect(await activeEnrollments(otherTeacher.id)).toHaveLength(1);
    });

    it("o próprio professor pode aceitar convite da própria turma (autoconvite não é bloqueado para aluno)", async () => {
      const schoolClass = await newClass();
      const { token } = await createClassInvitation(t, schoolClass.id, teacher.email);
      const res = await accept({ token, ra: "RA-DONA" }, await loginAs(t, teacher));
      expect(res.status).toBe(200);
      expect(await activeEnrollments(teacher.id)).toHaveLength(1);
    });
  });

  describe("003/US4-5 RA que falta", () => {
    it("sem RA no perfil: preview raRequired, aceite sem RA → 400 RA_REQUIRED, com RA grava e audita student.registered", async () => {
      const student = await createUser(t, { name: "Aluna Sem RA" });
      const { token, invitation } = await createClassInvitation(t, (await newClass()).id, student.email);
      const cookie = await loginAs(t, student);

      expect((await preview(token, cookie)).body.raRequired).toBe(true);
      const missing = await accept({ token }, cookie);
      expect(missing.status).toBe(400);
      expect(missing.body.code).toBe("RA_REQUIRED");
      expect(await invitationStatus(invitation.id)).toBe("PENDING");

      expect((await accept({ token, ra: " ra-novo-1 " }, cookie)).status).toBe(200);
      expect((await t.prisma.studentProfile.findUniqueOrThrow({ where: { userId: student.id } })).ra).toBe("RA-NOVO-1");
      expect(await t.prisma.auditEvent.findMany({ where: { type: "student.registered" } })).toMatchObject([
        { actorType: "USER", actorUserId: student.id, metadata: { userId: student.id, via: "CLASS_INVITATION" } },
      ]);
    });

    it("com RA no perfil: o RA não é pedido e um RA enviado é ignorado", async () => {
      const { student } = await enrolledStudent();
      const { token } = await createClassInvitation(t, (await newClass({ code: "B-1" })).id, student.email);
      expect((await accept({ token, ra: "RA-DIFERENTE" }, await loginAs(t, student))).status).toBe(200);
      expect((await t.prisma.studentProfile.findUniqueOrThrow({ where: { userId: student.id } })).ra).toBe("RA-100");
      expect(await t.prisma.auditEvent.count({ where: { type: "student.registered" } })).toBe(0);
    });

    it("RA de outro aluno → 409 RA_TAKEN, nada muda", async () => {
      await createUser(t, { ra: "RA-OCUPADO" });
      const student = await createUser(t);
      const { token, invitation } = await createClassInvitation(t, (await newClass()).id, student.email);
      const res = await accept({ token, ra: "ra-ocupado" }, await loginAs(t, student));
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("RA_TAKEN");
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await activeEnrollments(student.id)).toHaveLength(0);
    });
  });

  describe("003/US4-6 conta nunca verificada", () => {
    it("CLAIM_ACCOUNT: nova senha, sessões anteriores revogadas, e-mail verificado, account.claimed e sessão nova", async () => {
      const squatter = await createUser(t, { name: "Quem Cadastrou", verified: false });
      const oldCookie = await loginAs(t, squatter);
      const { token, invitation } = await createClassInvitation(t, (await newClass()).id, squatter.email);

      expect((await preview(token)).body).toMatchObject({ mode: "CLAIM_ACCOUNT", raRequired: true });
      const noName = await accept({ token, ra: "RA-CLAIM", password: NEW_PASSWORD });
      expect(noName.status).toBe(400);
      expect(noName.body.code).toBe("VALIDATION_ERROR");

      const res = await accept({ token, name: "Dona do E-mail", ra: "RA-CLAIM", password: NEW_PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ classId: expect.any(String), mode: "CLAIM_ACCOUNT", alreadyEnrolled: false });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { id: squatter.id } });
      expect(user.emailVerifiedAt).not.toBeNull();
      expect(user.name).toBe("Dona do E-mail");
      expect(await t.prisma.user.count({ where: { email: squatter.email } })).toBe(1);
      expect((await api(t, { cookie: oldCookie }).get("/api/me")).status).toBe(401);
      expect((await api(t).post("/api/auth/login", { email: squatter.email, password: squatter.password })).status).toBe(401);
      expect((await api(t).post("/api/auth/login", { email: squatter.email, password: NEW_PASSWORD })).status).toBe(200);
      expect((await api(t, { cookie: sessionCookie(res) }).get("/api/me")).body.emailVerified).toBe(true);
      expect(await invitationStatus(invitation.id)).toBe("ACCEPTED");
      expect(await t.prisma.auditEvent.findMany({ where: { type: "account.claimed" } })).toMatchObject([
        { actorType: "ANONYMOUS", targetId: squatter.id, metadata: { via: "CLASS_INVITATION", revokedSessions: 1 } },
      ]);
    });
  });

  describe("003/US4-7 várias turmas", () => {
    it("aluno das turmas A e B aceita C → três matrículas ativas, uma conta", async () => {
      const { student, first } = await enrolledStudent();
      const second = await newClass({ code: "B-1" });
      await createEnrollment(t, second.id, student.id);
      const third = await newClass({ code: "C-1" });
      const { token } = await createClassInvitation(t, third.id, student.email);

      expect((await accept({ token }, await loginAs(t, student))).status).toBe(200);
      expect((await activeEnrollments(student.id)).map((e) => e.classId).sort()).toEqual(
        [first.id, second.id, third.id].sort(),
      );
      expect(await t.prisma.user.count({ where: { email: student.email } })).toBe(1);
    });
  });

  describe("003/US4-8 conta suspensa", () => {
    it("preview e aceite → TOKEN_INVALID (igual a convite inválido); recusa auditada", async () => {
      const student = await createUser(t, { status: "SUSPENDED", ra: "RA-SUSP" });
      const { token, invitation } = await createClassInvitation(t, (await newClass()).id, student.email);
      expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
      const res = await accept({ token });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TOKEN_INVALID");
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await refusals()).toMatchObject([{ metadata: { reason: "ACCOUNT_SUSPENDED" } }]);
    });
  });

  describe("003/FR-036 turma e professor responsável", () => {
    it("turma INACTIVE → TOKEN_INVALID com recusa auditada; reativada dentro do prazo, o aceite volta a funcionar", async () => {
      const { student } = await enrolledStudent();
      const schoolClass = await newClass({ code: "B-1", status: "INACTIVE" });
      const { token, invitation } = await createClassInvitation(t, schoolClass.id, student.email);
      const cookie = await loginAs(t, student);

      expect((await preview(token, cookie)).body.code).toBe("TOKEN_INVALID");
      expect((await accept({ token }, cookie)).body.code).toBe("TOKEN_INVALID");
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await refusals()).toMatchObject([{ actorType: "USER", metadata: { reason: "CLASS_NOT_OPEN" } }]);

      await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "ACTIVE" } });
      expect((await accept({ token }, cookie)).status).toBe(200);
    });

    it("TEACHER do responsável suspenso → TOKEN_INVALID, convite continua PENDING", async () => {
      const { student } = await enrolledStudent();
      const { token, invitation } = await createClassInvitation(t, (await newClass({ code: "B-1" })).id, student.email);
      await t.prisma.userRole.updateMany({ where: { userId: teacher.id }, data: { status: "SUSPENDED" } });

      expect((await accept({ token }, await loginAs(t, student))).body.code).toBe("TOKEN_INVALID");
      expect(await invitationStatus(invitation.id)).toBe("PENDING");
      expect(await refusals()).toMatchObject([{ metadata: { reason: "TEACHER_INACTIVE" } }]);
    });
  });
});
