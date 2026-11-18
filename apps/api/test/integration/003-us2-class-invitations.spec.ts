import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "../../src/platform/crypto/tokens";
import {
  createClass,
  createClassInvitation,
  createCohort,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
  uniqueEmail,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const DAY_MS = 24 * 60 * 60 * 1000;
const saoPaulo = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/**
 * 003/US2 rewritten by 027 (T028): the MANAGER invites to the turma (`/cohorts/:id/invitations`); the e-mail names the
 * turma and never a teacher (027/FR-010). Each scenario keeps the 003 behavior.
 */
describe("003/US2 — o gestor convida aluno informando só o e-mail (FR-010–FR-021, emenda 027)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const newTeacher = (name = "Gestora Ada") => createUser(t, { roles: ["MANAGER"], name });
  const asUser = async (user: TestUser) => api(t, { cookie: await loginAs(t, user) });
  const invitePath = (cohortId: string) => `/api/cohorts/${cohortId}/invitations`;
  const invitationCount = () => t.prisma.classInvitation.count();

  describe("003/US2-1 convite criado e e-mail enviado", () => {
    it("201 com convite PENDING de 7 dias para o e-mail normalizado, e-mail com turma, prazo e link e sem professor (027/FR-010)", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id, {
        name: "Estruturas de Dados",
        code: "ED-1",
        period: "1º semestre",
      });
      const client = await asUser(teacher);

      const before = Date.now();
      const res = await client.post(invitePath(schoolClass.cohortId), { email: "  Aluno@Example.TEST " });
      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        email: "aluno@example.test",
        status: "PENDING",
        expiresAt: expect.any(String),
        sendCount: 1,
        lastSentAt: expect.any(String),
        delivery: "SENDING",
        deliveryIssue: null,
        createdAt: expect.any(String),
      });
      const expiresAt = new Date(res.body.expiresAt as string);
      expect(expiresAt.getTime() - new Date(res.body.lastSentAt as string).getTime()).toBe(7 * DAY_MS);
      expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 7 * DAY_MS - 1000);

      await t.flushMail();
      const mails = t.mailer.messagesFor("aluno@example.test");
      expect(mails).toHaveLength(1);
      const [mail] = mails;
      expect(mail!.template).toBe("class-invitation");
      expect(mail!.subject).toBe("Convite para a turma Estruturas de Dados");
      for (const text of ["Estruturas de Dados", "ED-1", "1º semestre", saoPaulo.format(expiresAt)]) {
        expect(mail!.text).toContain(text);
        expect(mail!.html).toContain(text);
      }
      expect(mail!.text).not.toMatch(/Gestora Ada|Professor/);
      const link = t.mailer.lastLinkFor("aluno@example.test", "class-invitation")!;
      expect(link.startsWith(`${t.config.webOrigin}/convite-turma?token=`)).toBe(true);

      const row = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: res.body.id } });
      expect(row).toMatchObject({ cohortId: schoolClass.cohortId, invitedById: teacher.id, status: "PENDING", sendCount: 1 });
      expect(row.tokenHash).toBe(hashToken(t.mailer.lastTokenFor("aluno@example.test", "class-invitation")!));

      const deliveries = await t.prisma.mailDelivery.findMany({ where: { classInvitationId: row.id } });
      expect(deliveries).toMatchObject([{ status: "SENT", attempts: 1, nextAttemptAt: null }]);

      const events = await t.prisma.auditEvent.findMany({ where: { type: "class_invitation.created" } });
      expect(events).toMatchObject([
        {
          actorType: "USER",
          actorUserId: teacher.id,
          targetType: "CLASS_INVITATION",
          targetId: row.id,
          requestId: expect.any(String),
          metadata: { cohortId: schoolClass.cohortId, email: "aluno@example.test" },
        },
      ]);
    });

    it("turma desconhecida → 404 e professor → 403, nada criado", async () => {
      const client = await asUser(await newTeacher());
      const teacher = await asUser(await createUser(t, { roles: ["TEACHER"] }));
      const schoolClass = await createClass(t, (await createUser(t, { roles: ["TEACHER"] })).id);
      expect((await teacher.post(invitePath(schoolClass.cohortId), { email: uniqueEmail("aluno") })).status).toBe(403);

      const res = await client.post(invitePath(crypto.randomUUID()), { email: uniqueEmail("aluno") });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe("NOT_FOUND");
      expect(await invitationCount()).toBe(0);
    });
  });

  describe("003/US2-2 e-mail inválido ou campos extras", () => {
    it.each([
      ["e-mail inválido", { email: "nao-e-um-email" }],
      ["e-mail vazio", { email: "   " }],
      ["sem e-mail", {}],
      ["campo extra", { email: "aluno@example.test", name: "Aluno" }],
      ["senha no pedido", { email: "aluno@example.test", password: "segredo-qualquer-123" }],
    ])("%s → 400 VALIDATION_ERROR, nada criado", async (_label, body) => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const res = await (await asUser(teacher)).post(invitePath(schoolClass.cohortId), body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe("VALIDATION_ERROR");
      expect(await invitationCount()).toBe(0);
      await t.flushMail();
      expect(t.mailer.outbox).toHaveLength(0);
    });
  });

  describe("003/US2-3 convite pendente repetido", () => {
    it("409 INVITATION_ALREADY_PENDING, sem convite nem e-mail novos", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const client = await asUser(teacher);

      expect((await client.post(invitePath(schoolClass.cohortId), { email: "aluno@example.test" })).status).toBe(201);
      const again = await client.post(invitePath(schoolClass.cohortId), { email: "ALUNO@example.test" });
      expect(again.status).toBe(409);
      expect(again.body.code).toBe("INVITATION_ALREADY_PENDING");

      await t.flushMail();
      expect(await invitationCount()).toBe(1);
      expect(t.mailer.messagesFor("aluno@example.test")).toHaveLength(1);
      expect(await t.prisma.auditEvent.count({ where: { type: "class_invitation.created" } })).toBe(1);
    });

    it("o mesmo e-mail pode ter convites pendentes em turmas diferentes", async () => {
      const teacher = await newTeacher();
      const client = await asUser(teacher);
      for (const code of ["A-1", "B-1"]) {
        const schoolClass = await createClass(t, teacher.id, { code });
        expect((await client.post(invitePath(schoolClass.cohortId), { email: "aluno@example.test" })).status).toBe(201);
      }
    });

    it("pendente vencido não bloqueia: vira EXPIRED e um convite novo é criado", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const { invitation: old } = await createClassInvitation(t, schoolClass.id, "aluno@example.test", {
        lastSentAt: new Date(Date.now() - 8 * DAY_MS),
      });

      const res = await (await asUser(teacher)).post(invitePath(schoolClass.cohortId), { email: "aluno@example.test" });
      expect(res.status).toBe(201);
      expect(res.body.id).not.toBe(old.id);
      expect((await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: old.id } })).status).toBe("EXPIRED");
    });
  });

  describe("003/US2-4 aluno já matriculado", () => {
    it("409 ALREADY_ENROLLED para matrícula ativa na turma, sem convite nem e-mail", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const student = await createUser(t, { email: "matriculado@example.test" });
      await createEnrollment(t, schoolClass.id, student.id);

      const res = await (await asUser(teacher)).post(invitePath(schoolClass.cohortId), { email: "Matriculado@Example.test" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("ALREADY_ENROLLED");
      await t.flushMail();
      expect(await invitationCount()).toBe(0);
      expect(t.mailer.outbox).toHaveLength(0);
    });

    it("matrícula em outra turma não impede o convite", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const other = await createClass(t, teacher.id);
      const student = await createUser(t, { email: "outra-turma@example.test" });
      await createEnrollment(t, other.id, student.id);

      const res = await (await asUser(teacher)).post(invitePath(schoolClass.cohortId), { email: student.email });
      expect(res.status).toBe(201);
    });
  });

  describe("003/US2-5 convites simultâneos", () => {
    it("duas requisições ao mesmo tempo → um convite pendente e um 409", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id);
      const client = await asUser(teacher);

      const results = await Promise.all(
        [0, 1].map(() => client.post(invitePath(schoolClass.cohortId), { email: "corrida@example.test" })),
      );
      expect(results.map((res) => res.status).sort()).toEqual([201, 409]);
      expect(results.find((res) => res.status === 409)!.body.code).toBe("INVITATION_ALREADY_PENDING");
      expect(await t.prisma.classInvitation.count({ where: { status: "PENDING" } })).toBe(1);
      expect(await t.prisma.mailDelivery.count()).toBe(1);
    });
  });

  describe("003/US2-7 turma que não aceita alunos", () => {
    it.each(["INACTIVE", "ARCHIVED"] as const)("turma %s → 409 COHORT_NOT_ACTIVE, nada criado", async (status) => {
      const teacher = await newTeacher();
      const cohort = await createCohort(t, { status });
      const res = await (await asUser(teacher)).post(invitePath(cohort.id), { email: "aluno@example.test" });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe("COHORT_NOT_ACTIVE");
      await t.flushMail();
      expect(await invitationCount()).toBe(0);
      expect(t.mailer.outbox).toHaveLength(0);
    });
  });

  describe("003/US2-8 conteúdo do e-mail", () => {
    it("sem senha nem hash; o token aparece só dentro do link", async () => {
      const teacher = await newTeacher();
      const schoolClass = await createClass(t, teacher.id, { name: "Turma <b>&</b> Cia" });
      const res = await (await asUser(teacher)).post(invitePath(schoolClass.cohortId), { email: "aluno@example.test" });
      expect(res.status).toBe(201);
      expect(JSON.stringify(res.body)).not.toMatch(/token|hash/i);

      await t.flushMail();
      const mail = t.mailer.messagesFor("aluno@example.test")[0]!;
      const token = t.mailer.lastTokenFor("aluno@example.test", "class-invitation")!;
      const link = t.mailer.lastLinkFor("aluno@example.test", "class-invitation")!;
      const { tokenHash } = await t.prisma.classInvitation.findUniqueOrThrow({ where: { id: res.body.id } });

      for (const body of [mail.subject, mail.text, mail.html!]) {
        expect(body).not.toMatch(/senha/i);
        expect(body).not.toContain(tokenHash);
      }
      expect(mail.text.split(token)).toHaveLength(2);
      expect(mail.text.replace(link, "")).not.toContain(token);
      // Since 017 (FR-022) the HTML also writes the link out: the button's href, then the written-out
      // link's href and text, nothing else.
      expect(mail.html!.split(link)).toHaveLength(4);
      expect(mail.html!.replaceAll(link, "")).not.toContain(token);
      expect(mail.html).toContain("Turma &lt;b&gt;&amp;&lt;/b&gt; Cia");
      expect(mail.html).not.toContain("<b>&</b>");
    });
  });
});

describe("003/FR-021 limites de convites por quem convida (o gestor, emenda 027)", () => {
  let t: TestApp;

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({
      config: { rateLimit: { ...base.rateLimit, classInviteTeacherHourly: 3, classInviteDailySends: 2 } },
    });
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    t.mailer.clear();
  });

  const invite = async (cookie: string, classId: string, email: string) =>
    api(t, { cookie }).post(`/api/cohorts/${classId}/invitations`, { email });

  it("acima do limite por hora do professor → 429 RATE_LIMITED com Retry-After, sem gravar", async () => {
    const teacher = await createUser(t, { roles: ["MANAGER"] });
    const schoolClass = await createClass(t, teacher.id);
    const cookie = await loginAs(t, teacher);

    expect((await invite(cookie, schoolClass.cohortId, "a@example.test")).status).toBe(201);
    expect((await invite(cookie, schoolClass.cohortId, "b@example.test")).status).toBe(201);
    expect((await invite(cookie, schoolClass.cohortId, "c@example.test")).status).toBe(201);
    const blocked = await invite(cookie, schoolClass.cohortId, "d@example.test");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);
    expect(await t.prisma.classInvitation.count()).toBe(3);

    // The limit is per inviter: another MANAGER still invites.
    const other = await createUser(t, { roles: ["MANAGER"] });
    const otherClass = await createClass(t, other.id);
    expect((await invite(await loginAs(t, other), otherClass.cohortId, "d@example.test")).status).toBe(201);
  });

  it("envios para o mesmo e-mail na turma contam no limite de 24 h, mesmo depois de cancelar", async () => {
    const teacher = await createUser(t, { roles: ["MANAGER"] });
    const schoolClass = await createClass(t, teacher.id);
    const cookie = await loginAs(t, teacher);
    const cancelAll = () =>
      t.prisma.classInvitation.updateMany({
        where: { status: "PENDING" },
        data: { status: "CANCELLED", cancelledAt: new Date(), cancelledById: teacher.id, cancelReason: "TEACHER" },
      });

    expect((await invite(cookie, schoolClass.cohortId, "repetido@example.test")).status).toBe(201);
    await cancelAll();
    expect((await invite(cookie, schoolClass.cohortId, "repetido@example.test")).status).toBe(201);
    await cancelAll();
    // 3rd send to this e-mail in this class: within the teacher's hourly limit (3), over the daily one (2).
    const blocked = await invite(cookie, schoolClass.cohortId, "repetido@example.test");
    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe("RATE_LIMITED");
    expect(await t.prisma.classInvitation.count({ where: { status: "PENDING" } })).toBe(0);
  });
});
