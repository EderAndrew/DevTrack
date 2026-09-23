import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "../../src/modules/audit/audit.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import {
  createClass,
  createClassInvitation,
  createUser,
  DEFAULT_PASSWORD,
  type TestUser,
} from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const DAY_MS = 24 * 60 * 60 * 1000;
const EMAIL = "aluna.nova@example.test";
const PASSWORD = "girassol-azul-de-outono";
const VALID = { name: "Aluna Nova", ra: " ra-2026.001 ", password: PASSWORD };

describe("003/US3 — aluno novo aceita o convite criando a própria conta (FR-030–FR-036)", () => {
  const logs = new LogCapture();
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp({ logs });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    logs.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  let teacher: TestUser;
  /** Pending invitation of EMAIL to an ACTIVE class of a teacher named "Professora Ada". */
  async function invitation(overrides: Parameters<typeof createClassInvitation>[3] = {}) {
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const schoolClass = await createClass(t, teacher.id, {
      name: "Algoritmos",
      code: "ALG-1",
      academicYear: 2026,
      period: "1º semestre",
    });
    const { invitation, token } = await createClassInvitation(t, schoolClass.id, EMAIL, overrides);
    return { schoolClass, invitation, token };
  }
  const preview = (token: string) => api(t).post("/api/class-invitations/preview", { token });
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/class-invitations/accept", body);
  const sessionCookie = (res: { headers: Record<string, unknown> }) =>
    ((res.headers["set-cookie"] as string[] | undefined) ?? [])
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))
      ?.split(";")[0];
  const nothingCreated = async (invitationId: string) => {
    expect(await t.prisma.user.count({ where: { email: EMAIL } })).toBe(0);
    expect(await t.prisma.enrollment.count()).toBe(0);
    expect((await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invitationId } })).status).toBe("PENDING");
  };

  describe("003/US3-1 página do convite", () => {
    it("preview mostra turma, professor e e-mail, com modo CREATE_ACCOUNT e RA obrigatório", async () => {
      const { token, invitation: row } = await invitation();
      const res = await preview(token);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        class: { name: "Algoritmos", code: "ALG-1", academicYear: 2026, period: "1º semestre" },
        teacherName: "Professora Ada",
        email: EMAIL,
        mode: "CREATE_ACCOUNT",
        raRequired: true,
      });
      await nothingCreated(row.id);
    });
  });

  describe("003/US3-2 aceite cria conta, aluno e matrícula numa operação", () => {
    it("conta verificada, STUDENT via CLASS_INVITATION, RA normalizado, matrícula ACTIVE, convite ACCEPTED e sessão", async () => {
      const { token, schoolClass, invitation: row } = await invitation();

      const res = await accept({ token, ...VALID });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ classId: schoolClass.id, mode: "CREATE_ACCOUNT", alreadyEnrolled: false });

      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      expect(user.name).toBe("Aluna Nova");
      expect(user.emailVerifiedAt).not.toBeNull();
      const roles = await t.prisma.userRole.findMany({ where: { userId: user.id }, include: { role: true } });
      expect(roles).toMatchObject([
        { status: "ACTIVE", grantedVia: "CLASS_INVITATION", grantedById: teacher.id, role: { key: "STUDENT" } },
      ]);
      expect(await t.prisma.studentProfile.findUniqueOrThrow({ where: { userId: user.id } })).toMatchObject({
        displayName: "Aluna Nova",
        ra: "RA-2026.001",
      });
      const enrollments = await t.prisma.enrollment.findMany();
      expect(enrollments).toMatchObject([
        { classId: schoolClass.id, studentUserId: user.id, status: "ACTIVE", invitationId: row.id },
      ]);
      expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({
        status: "ACCEPTED",
        acceptedByUserId: user.id,
      });

      const cookie = sessionCookie(res);
      expect(cookie).toBeDefined();
      const me = await api(t, { cookie }).get("/api/me");
      expect(me.status).toBe(200);
      expect(me.body.email).toBe(EMAIL);

      const audit = async (type: string) => t.prisma.auditEvent.findMany({ where: { type } });
      expect(await audit("class_invitation.accepted")).toMatchObject([
        {
          actorType: "ANONYMOUS",
          targetType: "CLASS_INVITATION",
          targetId: row.id,
          metadata: { classId: schoolClass.id, userId: user.id, mode: "CREATE_ACCOUNT", alreadyEnrolled: false },
        },
      ]);
      expect(await audit("student.registered")).toMatchObject([
        { targetType: "STUDENT_PROFILE", targetId: user.id, metadata: { userId: user.id, via: "CLASS_INVITATION" } },
      ]);
      expect(await audit("enrollment.created")).toMatchObject([
        {
          targetType: "ENROLLMENT",
          targetId: enrollments[0]!.id,
          metadata: { classId: schoolClass.id, userId: user.id, invitationId: row.id },
        },
      ]);
      expect(await audit("role.granted")).toMatchObject([
        { metadata: { userId: user.id, role: "STUDENT", via: "CLASS_INVITATION" } },
      ]);

      // The link is no longer valid.
      const again = await preview(token);
      expect(again.status).toBe(400);
      expect(again.body.code).toBe("TOKEN_INVALID");
    });
  });

  describe("003/US3-3 e-mail, papel e turma vêm do convite", () => {
    it.each([
      ["email", { email: "outra@example.test" }],
      ["role", { role: "TEACHER" }],
      ["classId", { classId: "11111111-1111-4111-8111-111111111111" }],
    ])("campo %s no corpo → 400 VALIDATION_ERROR, nada criado", async (_field, extra) => {
      const { token, invitation: row } = await invitation();
      const res = await accept({ token, ...VALID, ...extra });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      await nothingCreated(row.id);
    });
  });

  describe("003/US3-4 RA em uso", () => {
    it("RA de outro aluno, com outra caixa → 409 RA_TAKEN, nada criado", async () => {
      await createUser(t, { email: "veterano@example.test", ra: "RA-2026.001" });
      const { token, invitation: row } = await invitation();
      const res = await accept({ token, ...VALID, ra: "ra-2026.001" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("RA_TAKEN");
      await nothingCreated(row.id);
    });
  });

  describe("003/US3-5 dados obrigatórios e política de senha", () => {
    it.each([
      ["senha curta", { password: "curta" }, "WEAK_PASSWORD"],
      ["senha comum", { password: "Unbelievable" }, "WEAK_PASSWORD"],
      ["sem senha", { password: undefined }, "PASSWORD_REQUIRED"],
      ["sem RA", { ra: undefined }, "RA_REQUIRED"],
      ["sem nome", { name: undefined }, "VALIDATION_ERROR"],
      ["RA inválido", { ra: "RA 2026" }, "VALIDATION_ERROR"],
    ])("%s → 400 %s, nada criado", async (_label, change, code) => {
      const { token, invitation: row } = await invitation();
      const res = await accept({ token, ...VALID, ...change });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe(code);
      await nothingCreated(row.id);
    });
  });

  describe("003/US3-6 falha no meio", () => {
    it("falha depois da matrícula desfaz tudo; o convite continua utilizável", async () => {
      const { token, invitation: row } = await invitation();
      const audit = t.get(AuditService);
      const original = audit.record.bind(audit);
      vi.spyOn(audit, "record").mockImplementation(async (db, event) => {
        if (event.type === "class_invitation.accepted") throw new Error("falha simulada");
        return original(db, event);
      });

      const res = await accept({ token, ...VALID });
      expect(res.status).toBe(500);
      expect(sessionCookie(res)).toBeUndefined();
      await nothingCreated(row.id);
      expect(await t.prisma.studentProfile.count()).toBe(0);
      expect(await t.prisma.auditEvent.count({ where: { type: { in: ["role.granted", "enrollment.created"] } } })).toBe(0);

      vi.restoreAllMocks();
      expect((await accept({ token, ...VALID })).status).toBe(200);
    });
  });

  describe("003/US3-7 aceite repetido e simultâneo", () => {
    it("dois aceites ao mesmo tempo → uma conta, uma matrícula", async () => {
      const { token } = await invitation();
      const results = await Promise.all([accept({ token, ...VALID }), accept({ token, ...VALID })]);
      expect(results.map((res) => res.status).sort()).toEqual([200, 400]);
      expect(results.find((res) => res.status === 400)!.body.code).toBe("TOKEN_INVALID");
      expect(await t.prisma.user.count({ where: { email: EMAIL } })).toBe(1);
      expect(await t.prisma.enrollment.count()).toBe(1);
    });

    it("de novo pela conta criada → 200 alreadyEnrolled sem efeito; por anônimo → TOKEN_INVALID", async () => {
      const { token, schoolClass } = await invitation();
      const first = await accept({ token, ...VALID });
      const cookie = sessionCookie(first)!;

      const repeat = await accept({ token }, cookie);
      expect(repeat.status).toBe(200);
      expect(repeat.body).toEqual({ classId: schoolClass.id, mode: "SIGN_IN_REQUIRED", alreadyEnrolled: true });
      expect(sessionCookie(repeat)).toBeUndefined();

      const anonymous = await accept({ token, ...VALID });
      expect(anonymous.status).toBe(400);
      expect(anonymous.body.code).toBe("TOKEN_INVALID");
      expect(await t.prisma.enrollment.count()).toBe(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "class_invitation.accepted" } })).toBe(1);
    });
  });

  describe("003/US3-8 nenhuma resposta contém a senha", () => {
    it("corpo e cabeçalhos do preview e do aceite, com sucesso ou erro", async () => {
      await createUser(t, { email: "veterano@example.test", ra: "RA-9", password: DEFAULT_PASSWORD });
      const { token } = await invitation();
      const responses = [
        await preview(token),
        await accept({ token, ...VALID, ra: "RA-9" }),
        await accept({ token, ...VALID, password: "curta" }),
        await accept({ token, ...VALID }),
      ];
      const user = await t.prisma.user.findUniqueOrThrow({ where: { email: EMAIL } });
      for (const res of responses) {
        const text = JSON.stringify(res.body) + JSON.stringify(res.headers);
        expect(text).not.toContain(PASSWORD);
        expect(text).not.toContain(user.passwordHash);
        expect(text).not.toMatch(/\$argon2/);
      }
    });
  });

  describe("003/FR-013 tokens expirados ou inválidos", () => {
    it("expirado → 400 TOKEN_EXPIRED e o convite é gravado EXPIRED", async () => {
      const { token, invitation: row } = await invitation({ lastSentAt: new Date(Date.now() - 8 * DAY_MS) });
      const res = await preview(token);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TOKEN_EXPIRED");
      expect((await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: row.id } })).status).toBe("EXPIRED");

      const accepted = await accept({ token, ...VALID });
      expect(accepted.status).toBe(400);
      expect(accepted.body.code).toBe("TOKEN_EXPIRED");
      expect(await t.prisma.user.count({ where: { email: EMAIL } })).toBe(0);
    });

    it("adulterado → 400 TOKEN_INVALID; log token_rejected sem o token", async () => {
      const { token, invitation: row } = await invitation();
      const tampered = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
      for (const res of [await preview(tampered), await accept({ token: tampered, ...VALID })]) {
        expect(res.status).toBe(400);
        expect(res.body.code).toBe("TOKEN_INVALID");
      }
      await nothingCreated(row.id);
      const rejected = logs.lines().filter((line) => line.msg === "class_invitation.token_rejected");
      expect(rejected).toMatchObject([{ reason: "UNKNOWN" }, { reason: "UNKNOWN" }]);
      expect(logs.text()).not.toContain(tampered);
    });

    it("convite cancelado → TOKEN_INVALID", async () => {
      const { token } = await invitation({ status: "CANCELLED" });
      expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
      expect((await accept({ token, ...VALID })).body.code).toBe("TOKEN_INVALID");
    });

    it.each([
      ["turma inativa", "CLASS_NOT_OPEN"],
      ["professor sem TEACHER ativo", "TEACHER_INACTIVE"],
    ] as const)("%s → TOKEN_INVALID e recusa auditada (%s)", async (_label, reason) => {
      const { token, schoolClass, invitation: row } = await invitation();
      if (reason === "CLASS_NOT_OPEN") {
        await t.prisma.schoolClass.update({ where: { id: schoolClass.id }, data: { status: "INACTIVE" } });
      } else {
        await t.prisma.userRole.updateMany({ where: { userId: teacher.id }, data: { status: "INACTIVE" } });
      }

      expect((await preview(token)).body.code).toBe("TOKEN_INVALID");
      const res = await accept({ token, ...VALID });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("TOKEN_INVALID");
      await nothingCreated(row.id);
      expect(await t.prisma.auditEvent.findMany({ where: { type: "class_invitation.acceptance_refused" } })).toMatchObject([
        { actorType: "ANONYMOUS", targetType: "CLASS_INVITATION", targetId: row.id, metadata: { reason } },
      ]);
    });
  });
});
