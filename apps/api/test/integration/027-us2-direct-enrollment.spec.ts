import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Cohort } from "../../src/generated/prisma/client";
import { MailDeliveryWorker } from "../../src/platform/mail/outbox/mail-delivery.worker";
import { createClass, createCohort, createSubject, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 027/US2-7…9, FR-034 — the MANAGER finds an existing student by exact e-mail and includes them directly in the turma:
 * no invitation, no acceptance, a notice e-mail with no token. Only an ACTIVE, verified account with the STUDENT role
 * is found; every other case looks the same and the way is the invitation.
 */
describe("027/US2 027/FR-034 — inclusão direta de quem já é aluno", () => {
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
    cohort = await createCohort(t, { name: "ADS 4NA", code: "ADS-4NA", academicYear: 2027, period: "2027.1" });
  });

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const lookup = (email: string, cohortId = cohort.id) => client.post(`/api/cohorts/${cohortId}/student-lookup`, { email });
  const enroll = (email: string, cohortId = cohort.id) => client.post(`/api/cohorts/${cohortId}/enrollments`, { email });

  it("027/US2-7 o gestor vê só o nome do aluno de outra turma e o inclui: matrícula ativa DIRECT na hora e um e-mail de aviso sem token, professor ou disciplina", async () => {
    const bruna = await createUser(t, { name: "Bruna", email: "bruna@exemplo.com" });
    const old = await createCohort(t, { name: "ADS 3NA", code: "ADS-3NA", academicYear: 2026 });
    await t.prisma.enrollment.create({ data: { cohortId: old.id, studentUserId: bruna.id, status: "ACTIVE", enrolledAt: new Date() } });
    const teacher = await createUser(t, { roles: ["TEACHER"], name: "Professora Ada" });
    const subject = await createSubject(t, teacher.id, { name: "Banco de Dados" });
    await createClass(t, teacher.id, { cohortId: cohort.id, subjectId: subject.id });

    const found = await lookup("  BRUNA@exemplo.com ");
    expect(found.status).toBe(200);
    expect(found.body).toEqual({ found: true, studentUserId: bruna.id, name: "Bruna", alreadyEnrolled: false });

    const res = await enroll("bruna@exemplo.com");
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ student: { userId: bruna.id, name: "Bruna", email: "bruna@exemplo.com" }, status: "ACTIVE", source: "DIRECT", removedAt: null });

    expect(await t.prisma.enrollment.findMany({ where: { studentUserId: bruna.id }, orderBy: { enrolledAt: "asc" } })).toMatchObject([
      { cohortId: old.id, status: "ACTIVE" },
      { cohortId: cohort.id, status: "ACTIVE", source: "DIRECT", enrolledById: manager.id, invitationId: null },
    ]);
    expect(await t.prisma.classInvitation.count()).toBe(0);

    await t.flushMail();
    const [mail] = t.mailer.messagesFor("bruna@exemplo.com");
    expect(mail).toMatchObject({ template: "class-enrollment-notice", subject: "Você foi incluído na turma ADS 4NA" });
    for (const text of [mail!.text, mail!.html]) {
      expect(text).toContain("ADS-4NA");
      expect(text).toContain("2027.1");
      expect(text).toContain("/entrar");
      expect(text).not.toMatch(/token=|Professora Ada|Banco de Dados/);
    }
    expect(await t.prisma.mailDelivery.findMany({ where: { kind: "CLASS_ENROLLMENT_NOTICE" } })).toMatchObject([
      { enrollmentId: res.body.id, status: "SENT" },
    ]);

    // Audit: ids and enums only, never the e-mail or the name.
    const [created] = await events("enrollment.created");
    expect(created).toMatchObject({ actorUserId: manager.id, targetId: res.body.id, metadata: { cohortId: cohort.id, userId: bruna.id, invitationId: null, source: "DIRECT" } });
    expect(await events("cohort.student_lookup")).toMatchObject([{ targetId: cohort.id, metadata: { cohortId: cohort.id, found: true } }]);
    const audit = JSON.stringify(
      (await t.prisma.auditEvent.findMany({ where: { type: { in: ["enrollment.created", "cohort.student_lookup"] } } })).map((event) => event.metadata),
    );
    expect(audit).not.toMatch(/bruna@exemplo\.com|"Bruna"/);

    // Nothing of the account changed.
    expect(await t.prisma.user.findUniqueOrThrow({ where: { id: bruna.id } })).toMatchObject({ name: "Bruna", status: "ACTIVE" });
    expect(await t.prisma.userRole.count({ where: { userId: bruna.id } })).toBe(1);
  });

  it("027/US2-7 027/FR-034 um convite pendente do mesmo e-mail na turma é cancelado (ENROLLED_DIRECTLY) na mesma operação", async () => {
    await createUser(t, { name: "Bruna", email: "bruna@exemplo.com" });
    const invited = await client.post(`/api/cohorts/${cohort.id}/invitations`, { email: "bruna@exemplo.com" });
    expect(invited.status).toBe(201);
    expect((await enroll("bruna@exemplo.com")).status).toBe(201);

    expect(await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: invited.body.id } })).toMatchObject({
      status: "CANCELLED",
      cancelReason: "ENROLLED_DIRECTLY",
      cancelledById: manager.id,
    });
    expect(await events("class_invitation.cancelled")).toMatchObject([
      { metadata: { cohortId: cohort.id, invitationId: invited.body.id, reason: "ENROLLED_DIRECTLY" } },
    ]);
  });

  it("027/US2-8 sem conta, conta sem papel de aluno, e-mail não verificado e conta desativada respondem igual: não encontrado, e a inclusão é recusada (422 STUDENT_NOT_ELIGIBLE)", async () => {
    await createUser(t, { roles: ["TEACHER"], email: "professora@exemplo.com" });
    await createUser(t, { email: "nao-verificado@exemplo.com", verified: false });
    await createUser(t, { email: "desativado@exemplo.com", status: "SUSPENDED" });
    for (const email of ["sem-conta@exemplo.com", "professora@exemplo.com", "nao-verificado@exemplo.com", "desativado@exemplo.com"]) {
      const res = await lookup(email);
      expect(res.status, email).toBe(200);
      expect(res.body, email).toEqual({ found: false });
      const refused = await enroll(email);
      expect(refused.status, email).toBe(422);
      expect(refused.body.code, email).toBe("STUDENT_NOT_ELIGIBLE");
    }
    expect(await t.prisma.enrollment.count()).toBe(0);
    expect(await t.prisma.user.count({ where: { email: "sem-conta@exemplo.com" } })).toBe(0);
    expect((await events("cohort.student_lookup")).map((event) => (event.metadata as { found: boolean }).found)).toEqual([false, false, false, false]);
  });

  it("027/US2-9 027/FR-015 aluno já na turma: a consulta diz alreadyEnrolled e a inclusão → 409 ALREADY_ENROLLED; inclusões simultâneas → uma matrícula", async () => {
    const bruna = await createUser(t, { name: "Bruna", email: "bruna@exemplo.com" });
    const results = await Promise.all(Array.from({ length: 5 }, () => enroll("bruna@exemplo.com")));
    expect(results.filter((res) => res.status === 201)).toHaveLength(1);
    expect(results.filter((res) => res.status !== 201).map((res) => res.body.code)).toEqual(Array(4).fill("ALREADY_ENROLLED"));
    expect(await t.prisma.enrollment.count({ where: { studentUserId: bruna.id, status: "ACTIVE" } })).toBe(1);
    expect(await events("enrollment.created")).toHaveLength(1);

    expect((await lookup("bruna@exemplo.com")).body).toEqual({ found: true, studentUserId: bruna.id, name: "Bruna", alreadyEnrolled: true });
    const again = await enroll("bruna@exemplo.com");
    expect(again.status).toBe(409);
    expect(again.body.code).toBe("ALREADY_ENROLLED");
  });

  it("027/FR-034 a lista de alunos da turma mostra nome, e-mail, situação e origem; corpo com id ou campo extra → 400", async () => {
    await createUser(t, { name: "Bruna", email: "bruna@exemplo.com" });
    expect((await enroll("bruna@exemplo.com")).status).toBe(201);
    const list = await client.get(`/api/cohorts/${cohort.id}/enrollments`);
    expect(list.status).toBe(200);
    expect(list.body.items).toMatchObject([{ student: { name: "Bruna", email: "bruna@exemplo.com" }, status: "ACTIVE", source: "DIRECT" }]);
    expect((await client.get(`/api/cohorts/${cohort.id}/enrollments?query=brun`)).body.items).toHaveLength(1);

    for (const body of [{ email: "x" }, { email: "bruna@exemplo.com", studentUserId: crypto.randomUUID() }, {}]) {
      expect((await client.post(`/api/cohorts/${cohort.id}/enrollments`, body)).status).toBe(400);
      expect((await client.post(`/api/cohorts/${cohort.id}/student-lookup`, body)).status).toBe(400);
    }
    expect((await lookup("bruna@exemplo.com", crypto.randomUUID())).status).toBe(404);
    const teacher = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    expect((await teacher.post(`/api/cohorts/${cohort.id}/student-lookup`, { email: "bruna@exemplo.com" })).status).toBe(403);
    expect((await teacher.get(`/api/cohorts/${cohort.id}/enrollments`)).status).toBe(403);
  });

  it("027/FR-034 o aviso não sai se a matrícula deixou de estar ativa antes da nova tentativa", async () => {
    await createUser(t, { name: "Bruna", email: "bruna@exemplo.com" });
    t.mailer.failNext(1);
    const res = await enroll("bruna@exemplo.com");
    await t.flushMail();
    await t.prisma.enrollment.update({ where: { id: res.body.id }, data: { status: "REMOVED", removedAt: new Date(), removedById: manager.id, removalReason: "MANAGER" } });
    await t.get(MailDeliveryWorker).runOnce(new Date(Date.now() + 10 * 60_000));
    await t.flushMail();
    expect(t.mailer.messagesFor("bruna@exemplo.com")).toHaveLength(0);
    expect(await t.prisma.mailDelivery.findFirstOrThrow({ where: { enrollmentId: res.body.id } })).toMatchObject({ status: "DISCARDED", discardReason: "NOT_NEEDED" });
  });
});
