import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  createClass,
  createClassInvitation,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const PARALLEL = 8;
const PASSWORD = "girassol-azul-de-outono";

/**
 * 003/SC-004 (FR-012, FR-037, FR-043): invitations, acceptances and removals fired at the same
 * time never leave duplicate accounts, student profiles, roles, pending invitations or active
 * enrollments, nor a half-applied state. The limits are raised so only the concurrency rules decide.
 */
describe("003/SC-004 — concorrência de convites, aceites e remoções", () => {
  let t: TestApp;
  let teacher: TestUser;
  let schoolClass: SchoolClass;
  let teacherClient: ReturnType<typeof api>;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({
      config: {
        rateLimit: {
          ...base.rateLimit,
          classInviteTeacherHourly: 1000,
          classInviteDailySends: 1000,
          publicOrigin: 1000,
          publicTarget: 1000,
        },
      },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    schoolClass = await createClass(t, teacher.id, { code: "ALG-1" });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
  });

  const times = <T>(n: number, fn: () => Promise<T>) => Promise.all(Array.from({ length: n }, fn));
  const statuses = (results: { status: number }[]) => results.map((res) => res.status);
  const accept = (body: object, cookie?: string) => api(t, { cookie }).post("/api/class-invitations/accept", body);

  it("003/FR-012 convites simultâneos para o mesmo e-mail → um pendente, uma entrega, uma auditoria", async () => {
    const results = await times(PARALLEL, () =>
      teacherClient.post(`/api/classes/${schoolClass.id}/invitations`, { email: "corrida@example.test" }),
    );
    expect(statuses(results).filter((s) => s === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status !== 201).map((res) => res.body.code)).toEqual(
      Array(PARALLEL - 1).fill("INVITATION_ALREADY_PENDING"),
    );
    await t.flushMail();
    expect(await t.prisma.classInvitation.count()).toBe(1);
    expect(await t.prisma.mailDelivery.count()).toBe(1);
    expect(await t.prisma.auditEvent.count({ where: { type: "class_invitation.created" } })).toBe(1);
  });

  it("003/FR-037 aceites simultâneos criando conta → uma conta, um cadastro de aluno, um papel, uma matrícula", async () => {
    const email = "aluna.nova@example.test";
    const { invitation, token } = await createClassInvitation(t, schoolClass.id, email);
    const results = await times(PARALLEL, () => accept({ token, name: "Aluna Nova", ra: "RA-1", password: PASSWORD }));

    expect(statuses(results).filter((s) => s === 200)).toHaveLength(1);
    expect(new Set(results.filter((res) => res.status !== 200).map((res) => res.body.code))).toEqual(new Set(["TOKEN_INVALID"]));
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email }, include: { roles: true, studentProfile: true } });
    expect(await t.prisma.user.count({ where: { email } })).toBe(1);
    expect(user.roles).toHaveLength(1);
    expect(user.studentProfile).not.toBeNull();
    expect(await t.prisma.studentProfile.count({ where: { userId: user.id } })).toBe(1);
    expect(await t.prisma.enrollment.count({ where: { studentUserId: user.id, status: "ACTIVE" } })).toBe(1);
    expect((await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("ACCEPTED");
    expect(await t.prisma.auditEvent.count({ where: { type: "enrollment.created" } })).toBe(1);
  });

  it("003/FR-043 aceites simultâneos com a conta existente → uma matrícula ativa", async () => {
    const student = await createUser(t, { name: "Aluna Bia", ra: "RA-2" });
    const cookie = await loginAs(t, student);
    const { token } = await createClassInvitation(t, schoolClass.id, student.email);
    const results = await times(PARALLEL, () => accept({ token }, cookie));

    // One acceptance enrolls; the others see it done (alreadyEnrolled) or the token already used.
    const ok = results.filter((res) => res.status === 200);
    expect(ok.filter((res) => res.body.alreadyEnrolled === false)).toHaveLength(1);
    expect(results.filter((res) => res.status !== 200).every((res) => res.body.code === "TOKEN_INVALID")).toBe(true);
    expect(await t.prisma.enrollment.count({ where: { studentUserId: student.id, status: "ACTIVE" } })).toBe(1);
    expect(await t.prisma.userRole.count({ where: { userId: student.id } })).toBe(1);
  });

  it("003/FR-037 aceite e cancelamento ao mesmo tempo → ou aceito com matrícula, ou cancelado sem conta", async () => {
    for (let round = 0; round < 4; round += 1) {
      const email = `disputa-${round}@example.test`;
      const { invitation, token } = await createClassInvitation(t, schoolClass.id, email);
      const [accepted, cancelled] = await Promise.all([
        accept({ token, name: "Aluno Disputa", ra: `RA-D${round}`, password: PASSWORD }),
        teacherClient.post(`/api/classes/${schoolClass.id}/invitations/${invitation.id}/cancel`, {}),
      ]);
      const final = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invitation.id } });
      const user = await t.prisma.user.findUnique({ where: { email } });
      const enrollments = await t.prisma.enrollment.count({ where: { invitationId: invitation.id } });
      if (final.status === "ACCEPTED") {
        expect([accepted.status, cancelled.status, cancelled.body.code]).toEqual([200, 409, "INVALID_STATE_TRANSITION"]);
        expect(user).not.toBeNull();
        expect(enrollments).toBe(1);
      } else {
        expect(final.status).toBe("CANCELLED");
        expect([cancelled.status, accepted.body.code]).toEqual([200, "TOKEN_INVALID"]);
        expect(user).toBeNull();
        expect(enrollments).toBe(0);
      }
    }
  });

  it("003/FR-044 remoções simultâneas → REMOVED uma vez, uma auditoria, conta intacta", async () => {
    const student = await createUser(t, { name: "Aluna Bia", ra: "RA-3" });
    const enrollment = await createEnrollment(t, schoolClass.id, student.id);
    const results = await times(PARALLEL, () =>
      teacherClient.post(`/api/classes/${schoolClass.id}/enrollments/${enrollment.id}/remove`, {}),
    );
    expect(statuses(results)).toEqual(Array(PARALLEL).fill(200));
    expect((await t.prisma.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("REMOVED");
    expect(await t.prisma.auditEvent.count({ where: { type: "enrollment.removed" } })).toBe(1);
    expect(await t.prisma.user.count({ where: { id: student.id } })).toBe(1);
  });
});
