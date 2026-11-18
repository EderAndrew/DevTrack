import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Cohort } from "../../src/generated/prisma/client";
import { createClass, createCohort, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const PASSWORD = "Girassol-azul-de-outono-7";

/**
 * 027/US2 — the MANAGER invites students to the turma (FR-009–FR-013): the 003 invitation, now on
 * `/cohorts/:id/invitations`, whose e-mail and public page name the turma and never a teacher or a subject.
 */
describe("027/US2 — gestor convida alunos para a turma (FR-009–FR-013)", () => {
  let t: TestApp;
  let manager: TestUser;
  let client: ReturnType<typeof api>;
  let cohort: Cohort;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora Teste" });
    client = api(t, { cookie: await loginAs(t, manager) });
    cohort = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", period: "2026.2" });
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const invite = (email: string, cohortId = cohort.id) => client.post(`/api/cohorts/${cohortId}/invitations`, { email });
  const tokenFor = async (email: string) => {
    await t.flushMail();
    return t.mailer.lastTokenFor(email, "class-invitation")!;
  };
  /** A disciplina da turma of a teacher, so the e-mail and the page could leak a teacher or a subject. */
  const addClass = async (teacherName: string, subjectName: string) => {
    const teacher = await createUser(t, { roles: ["TEACHER"], name: teacherName });
    const subject = await createSubject(t, teacher.id, { name: subjectName });
    return createClass(t, teacher.id, { cohortId: cohort.id, subjectId: subject.id });
  };

  it("027/US2-1 027/FR-010 o convite fica pendente e o e-mail cita a turma (nome, código e período), sem professor nem disciplina", async () => {
    await addClass("Professora Ada", "Banco de Dados");
    const res = await invite("Ana@Exemplo.com");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: "ana@exemplo.com", status: "PENDING", sendCount: 1 });

    const row = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(row).toMatchObject({ cohortId: cohort.id, invitedById: manager.id });
    expect(await events("class_invitation.created")).toMatchObject([
      { actorUserId: manager.id, targetType: "CLASS_INVITATION", targetId: row.id, metadata: { cohortId: cohort.id, email: "ana@exemplo.com" } },
    ]);

    const token = await tokenFor("ana@exemplo.com");
    const [mail] = t.mailer.messagesFor("ana@exemplo.com");
    expect(mail!.subject).toBe("Convite para a turma ADS 3NA");
    for (const text of [mail!.text, mail!.html]) {
      expect(text).toContain("ADS-3NA");
      expect(text).toContain("2026.2");
      expect(text).not.toContain("Professora Ada");
      expect(text).not.toContain("Banco de Dados");
    }

    const preview = await api(t).post("/api/class-invitations/preview", { token });
    expect(preview.status).toBe(200);
    expect(preview.body.class).toEqual({ name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026, period: "2026.2" });
    expect(JSON.stringify(preview.body)).not.toMatch(/Professora Ada|Banco de Dados|teacher/);
  });

  it("027/US2-2 o mesmo e-mail com convite pendente na turma → 409 INVITATION_ALREADY_PENDING", async () => {
    expect((await invite("ana@exemplo.com")).status).toBe(201);
    const again = await invite("ANA@exemplo.com");
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("INVITATION_ALREADY_PENDING");
    expect(await t.prisma.classInvitation.count()).toBe(1);
  });

  it("027/US2-3 027/FR-011 reenviar troca o link e a validade; cancelar invalida o link com o motivo MANAGER; a entrega aparece na lista", async () => {
    const created = await invite("ana@exemplo.com");
    const first = await tokenFor("ana@exemplo.com");

    const listed = await client.get(`/api/cohorts/${cohort.id}/invitations`);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toMatchObject([{ id: created.body.id, status: "PENDING", delivery: "SENT" }]);

    const resent = await client.post(`/api/cohorts/${cohort.id}/invitations/${created.body.id}/resend`, {});
    expect(resent.status).toBe(200);
    expect(resent.body.sendCount).toBe(2);
    const second = await tokenFor("ana@exemplo.com");
    expect(second).not.toBe(first);
    expect((await api(t).post("/api/class-invitations/preview", { token: first })).status).toBe(400);
    expect(await events("class_invitation.resent")).toMatchObject([{ actorUserId: manager.id, metadata: { cohortId: cohort.id, sendCount: 2 } }]);

    const cancelled = await client.post(`/api/cohorts/${cohort.id}/invitations/${created.body.id}/cancel`, {});
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: created.body.id } })).toMatchObject({
      cancelReason: "MANAGER",
      cancelledById: manager.id,
    });
    expect((await api(t).post("/api/class-invitations/preview", { token: second })).status).toBe(400);
    expect(await events("class_invitation.cancelled")).toMatchObject([
      { metadata: { cohortId: cohort.id, invitationId: created.body.id, reason: "MANAGER" } },
    ]);

    // An invitation of another turma is 404 on this turma's routes.
    const other = await createCohort(t);
    expect((await client.post(`/api/cohorts/${other.id}/invitations/${created.body.id}/cancel`, {})).status).toBe(404);
  });

  it("027/US2-4 027/FR-012 o aceite de uma pessoa nova cria a conta só com o papel de aluno e a matrícula ativa na turma", async () => {
    await invite("nova@exemplo.com");
    const token = await tokenFor("nova@exemplo.com");
    const accepted = await api(t).post("/api/class-invitations/accept", { token, name: "Nova Aluna", ra: "RA-2701", password: PASSWORD });
    expect(accepted.status).toBe(200);
    expect(accepted.body.mode).toBe("CREATE_ACCOUNT");

    const user = await t.prisma.user.findUniqueOrThrow({
      where: { email: "nova@exemplo.com" },
      include: { roles: { include: { role: true } } },
    });
    expect(user.roles.map((role) => role.role.key)).toEqual(["STUDENT"]);
    expect(await t.prisma.enrollment.findMany({ where: { studentUserId: user.id } })).toMatchObject([
      { cohortId: cohort.id, status: "ACTIVE", source: "INVITATION", enrolledById: null },
    ]);
    expect(await events("enrollment.created")).toMatchObject([{ metadata: { cohortId: cohort.id, userId: user.id, source: "INVITATION" } }]);
  });

  it("027/US2-5 027/FR-013 027/SC-001 um convite para a turma dá ao aluno todas as disciplinas dela: as duas aparecem no card e em Minhas atividades", async () => {
    const bd = await addClass("Professora Ada", "Banco de Dados");
    const redes = await addClass("Professor Turing", "Redes");
    await invite("bruna@exemplo.com");
    const token = await tokenFor("bruna@exemplo.com");
    expect((await api(t).post("/api/class-invitations/accept", { token, name: "Bruna", ra: "RA-2702", password: PASSWORD })).status).toBe(200);
    const bruna = await t.prisma.user.findUniqueOrThrow({ where: { email: "bruna@exemplo.com" }, select: { id: true } });
    const student = api(t, { cookie: await loginAs(t, bruna) });

    const mine = await student.get("/api/me/classes");
    expect(mine.status).toBe(200);
    const text = JSON.stringify(mine.body);
    expect(text).toContain(bd.id);
    expect(text).toContain(redes.id);
    for (const classId of [bd.id, redes.id]) {
      expect((await student.get(`/api/me/activities?classId=${classId}`)).status).toBe(200);
      expect((await student.get(`/api/me/dashboard?classId=${classId}`)).status).toBe(200);
    }
    // One invitation, no invitation per subject.
    expect(await t.prisma.classInvitation.count()).toBe(1);
    expect(t.mailer.messagesFor("bruna@exemplo.com")).toHaveLength(1);
  });

  it.each(["INACTIVE", "ARCHIVED"] as const)("027/US2-6 turma %s → convidar, reenviar, consultar e incluir são recusados com 409 COHORT_NOT_ACTIVE", async (status) => {
    const closed = await createCohort(t, { status });
    const student = await createUser(t, { name: "Aluna" });
    const responses = [
      await invite("ana@exemplo.com", closed.id),
      await client.post(`/api/cohorts/${closed.id}/student-lookup`, { email: student.email }),
      await client.post(`/api/cohorts/${closed.id}/enrollments`, { email: student.email }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COHORT_NOT_ACTIVE");
    }
    expect(await t.prisma.classInvitation.count()).toBe(0);
    expect(await t.prisma.enrollment.count()).toBe(0);
  });

  it("027/US2-6 turma desconhecida → 404; professor e aluno → 403 nos convites da turma", async () => {
    expect((await invite("ana@exemplo.com", crypto.randomUUID())).status).toBe(404);
    for (const role of ["TEACHER", "STUDENT"] as const) {
      const other = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
      expect((await other.post(`/api/cohorts/${cohort.id}/invitations`, { email: "ana@exemplo.com" })).status).toBe(403);
      expect((await other.get(`/api/cohorts/${cohort.id}/invitations`)).status).toBe(403);
    }
  });
});
