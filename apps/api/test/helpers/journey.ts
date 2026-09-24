import { expect } from "vitest";
import { AdminBootstrapService } from "../../src/modules/admin-bootstrap/admin-bootstrap.service";
import { SESSION_COOKIE_NAME } from "../../src/modules/auth/session-cookie";
import { UNVERIFIED_ACCOUNT_TTL_DAYS } from "../../src/modules/retention/unverified-accounts.job";
import { hashToken } from "../../src/platform/crypto/tokens";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { createUser, DEFAULT_PASSWORD, loginAs, requestVerificationToken, uniqueEmail } from "./factories";
import { api, type TestApp } from "./test-app";

const DAY_MS = 24 * 3600 * 1000;
const OPERATOR = { host: "host-jornada", user: "operador-jornada" };

/** A secret produced during the journey; `kind` names it in failure messages, never the value. */
export interface JourneySecret {
  kind: string;
  value: string;
}

export interface JourneyResult {
  secrets: JourneySecret[];
}

/**
 * Runs every flow of feature 001 once against `t`, in order, on an empty database: admin
 * bootstrap (CLI service), e-mail verification, login and sessions, manager and teacher
 * invitations (accept, refuse, claim, revoke, self-invite), teacher and account lifecycle,
 * password reset, rate limit, last-ADMIN protection, the maintenance jobs and the 003 flows
 * implemented so far (classes, class invitations, their management and acceptance, enrollments, own classes), and the 004
 * flows implemented so far (subjects, classes as offerings). Together they emit every audit event
 * type of the contracts/audit-events.md of 001, 003 and 004, except the retired
 * ones and those still pending in audit-coverage.spec.ts.
 *
 * `t` must be created with a no-op LOGIN_DELAY (the rate-limit alert needs 10 failed logins).
 * Used by the SC-005 secret scan and the SC-008 audit coverage tests.
 */
export async function runFullJourney(t: TestApp): Promise<JourneyResult> {
  const secrets: JourneySecret[] = [];
  const keep = (kind: string, value: string | undefined) => {
    expect(value, `${kind} ausente`).toBeTruthy();
    secrets.push({ kind, value: value! });
    return value!;
  };
  const keepToken = (kind: string, value: string | undefined) => {
    const token = keep(kind, value);
    secrets.push({ kind: `hash de ${kind}`, value: hashToken(token) });
    return token;
  };
  const keepCookie = (res: { headers: Record<string, unknown> }) => {
    const header = ([] as string[]).concat((res.headers["set-cookie"] as string[] | undefined) ?? []);
    const pair = header.map((c) => c.split(";")[0]!).find((c) => c.startsWith(`${SESSION_COOKIE_NAME}=`));
    const secret = keep("cookie de sessão", pair?.slice(SESSION_COOKIE_NAME.length + 1));
    return `${SESSION_COOKIE_NAME}=${secret}`;
  };
  const keepLoginAs = async (user: { id: string }) => {
    const cookie = await loginAs(t, user);
    keep("cookie de sessão", cookie.slice(SESSION_COOKIE_NAME.length + 1));
    return cookie;
  };
  const tokenFromLink = (link: string | undefined) =>
    link ? (new URL(link).searchParams.get("token") ?? undefined) : undefined;

  keep("APP_HMAC_SECRET", process.env.APP_HMAC_SECRET);
  keep("APP_HMAC_SECRET (hex)", t.config.hmacSecret.toString("hex"));
  keep("senha padrão das fábricas", DEFAULT_PASSWORD);
  const login = async (email: string, password: string) => {
    const res = await api(t).post("/api/auth/login", { email, password });
    expect(res.status, `login de ${email}`).toBe(200);
    return keepCookie(res);
  };

  // US3 — bootstrap: requested + link_printed, superseded (cancelled), activation, refusal.
  const bootstrap = t.get(AdminBootstrapService);
  const adminEmail = uniqueEmail("admin");
  const adminPassword = keep("senha do ADMIN", "senha-do-admin-da-jornada-2026");
  const first = await bootstrap.run({ email: adminEmail, printLink: true, operator: OPERATOR });
  keepToken("token de ativação de ADMIN", tokenFromLink("link" in first ? first.link : undefined));
  const second = await bootstrap.run({ email: adminEmail, printLink: true, operator: OPERATOR });
  expect(second).toMatchObject({ outcome: "PENDING", cancelledPrevious: true });
  const activationToken = keepToken("token de ativação de ADMIN", tokenFromLink("link" in second ? second.link : undefined));
  const activation = await api(t).post("/api/admin-activation", { token: activationToken, password: adminPassword });
  expect(activation.status).toBe(200);
  expect((await bootstrap.run({ email: uniqueEmail("outro-admin"), printLink: false, operator: OPERATOR })).outcome).toBe(
    "REFUSED",
  );
  const admin = await login(adminEmail, adminPassword);
  const adminClient = api(t, { cookie: admin });

  // US1 — e-mail verification of an unverified account (public signup is gone, 003 FR-048).
  const studentEmail = uniqueEmail("aluno");
  const studentPassword = keep("senha do aluno", "senha-do-aluno-da-jornada");
  await createUser(t, { name: "Aluna da Jornada", email: studentEmail, password: studentPassword, verified: false });
  const verifyToken = keepToken("token de verificação", await requestVerificationToken(t, studentEmail));
  expect((await api(t).post("/api/auth/verify-email", { token: verifyToken })).status).toBe(200);

  // US2 — login, own sessions, logout, logout-all.
  const studentA = await login(studentEmail, studentPassword);
  const studentB = await login(studentEmail, studentPassword);
  const studentClient = api(t, { cookie: studentA });
  expect((await studentClient.get("/api/me")).status).toBe(200);
  const sessions = (await studentClient.get("/api/me/sessions")).body.items as { id: string; current: boolean }[];
  const other = sessions.find((s) => !s.current)!;
  expect((await studentClient.delete(`/api/me/sessions/${other.id}`)).status).toBe(204);
  expect((await api(t, { cookie: studentB }).get("/api/me")).status).toBe(401);
  expect((await studentClient.post("/api/auth/logout")).status).toBe(204);
  const studentC = await login(studentEmail, studentPassword);
  expect((await api(t, { cookie: studentC }).post("/api/auth/logout-all")).status).toBe(204);
  const student = await t.prisma.user.findUniqueOrThrow({ where: { email: studentEmail } });

  // US4 — manager invitations: self-invite, resend, accept, revoke.
  expect(
    (await adminClient.post("/api/manager-invitations", { email: adminEmail, displayName: "Eu mesmo" })).body.code,
  ).toBe("SELF_INVITE_FORBIDDEN");
  const managerEmail = uniqueEmail("gestora");
  const managerPassword = keep("senha da MANAGER", "senha-da-gestora-da-jornada");
  const managerInvite = await adminClient.post("/api/manager-invitations", { email: managerEmail, displayName: "Gestora" });
  expect(managerInvite.status).toBe(201);
  expect((await adminClient.post(`/api/manager-invitations/${managerInvite.body.id}/resend`)).status).toBe(200);
  await t.flushMail();
  for (const mail of t.mailer.messagesFor(managerEmail)) keepToken("token de convite", tokenFromLink(mail.text.match(/https?:\/\/\S+/)?.[0]));
  const managerToken = t.mailer.lastTokenFor(managerEmail, "invitation-manager")!;
  expect((await api(t).post("/api/invitations/accept", { token: managerToken, password: managerPassword })).status).toBe(200);
  const revoked = await adminClient.post("/api/manager-invitations", { email: uniqueEmail("revogada"), displayName: "Revogada" });
  expect((await adminClient.post(`/api/manager-invitations/${revoked.body.id}/revoke`)).status).toBe(200);

  // US5/US6 — teacher invitations: new account, SIGN_IN_REQUIRED refusal, claim of an unverified account.
  const manager = await login(managerEmail, managerPassword);
  const managerClient = api(t, { cookie: manager });
  const inviteTeacher = async (email: string) => {
    const res = await managerClient.post("/api/teacher-invitations", { email, displayName: "Docente" });
    expect(res.status, `convite de professor para ${email}`).toBe(201);
    await t.flushMail();
    return keepToken("token de convite", t.mailer.lastTokenFor(email, "invitation-teacher"));
  };
  const teacherEmail = uniqueEmail("docente");
  const teacherPassword = keep("senha do professor", "senha-do-docente-da-jornada");
  const teacherToken = await inviteTeacher(teacherEmail);
  expect((await api(t).post("/api/invitations/accept", { token: teacherToken, password: teacherPassword })).status).toBe(200);

  const refusedToken = await inviteTeacher(studentEmail);
  expect((await api(t).post("/api/invitations/accept", { token: refusedToken })).body.code).toBe("SIGN_IN_REQUIRED");

  const unverified = await createUser(t, { verified: false });
  await keepLoginAs(unverified);
  const claimPassword = keep("senha do aceite com posse", "senha-nova-do-aceite-com-posse");
  const claimToken = await inviteTeacher(unverified.email);
  expect((await api(t).post("/api/invitations/accept", { token: claimToken, password: claimPassword })).body.mode).toBe(
    "CLAIM_ACCOUNT",
  );

  // 003/US1 — classes: create, edit, inactivate, archive (before the teacher is deactivated below).
  // 003/US2 — while the class is active, students are invited by e-mail.
  // 003/US3 — the first one accepts by creating an account; the second is refused once the
  // class is inactive, and archiving then cancels it.
  const teacherClient = api(t, { cookie: await login(teacherEmail, teacherPassword) });
  const created = await teacherClient.post("/api/classes", { name: "Turma da Jornada", code: "JOR-1", academicYear: 2026 });
  expect(created.status).toBe(201);
  const classId = created.body.id as string;
  expect((await teacherClient.patch(`/api/classes/${classId}`, { period: "1º semestre" })).status).toBe(200);
  // 004/US1 — the teacher creates, renames and deactivates a subject, and links the class to it.
  const subject = await teacherClient.post("/api/subjects", { name: "Disciplina da Jornada" });
  expect(subject.status).toBe(201);
  const subjectId = subject.body.id as string;
  const offering = { subjectId, startsOn: "2026-02-02", endsOn: "2026-06-30" };
  expect((await teacherClient.patch(`/api/classes/${classId}`, offering)).body.plannable).toBe(true);
  expect((await teacherClient.patch(`/api/subjects/${subjectId}`, { description: "Ementa da jornada" })).status).toBe(200);
  expect((await teacherClient.post(`/api/subjects/${subjectId}/status`, { status: "INACTIVE" })).status).toBe(200);
  const inviteToClass = async (email: string) => {
    expect((await teacherClient.post(`/api/classes/${classId}/invitations`, { email })).status).toBe(201);
    await t.flushMail();
    return keepToken("token de convite de turma", t.mailer.lastTokenFor(email, "class-invitation"));
  };
  const classToken = await inviteToClass("aluno-convidado-jornada@example.test");
  const classStudentPassword = keep("senha do aluno convidado", "aluno-convidado-da-jornada");
  const classAccepted = await api(t).post("/api/class-invitations/accept", {
    token: classToken,
    name: "Aluno Convidado",
    ra: "JOR-0001",
    password: classStudentPassword,
  });
  expect(classAccepted.status).toBe(200);
  // 003/US7 — the new student sees the class in "Minhas turmas".
  const myClasses = await api(t, { cookie: keepCookie(classAccepted) }).get("/api/me/classes");
  expect(myClasses.body.items.map((c: { id: string }) => c.id)).toEqual([classId]);
  // 003/US6 — the teacher lists the class's students and removes the one who joined.
  const students = await teacherClient.get(`/api/classes/${classId}/enrollments?query=Aluno`);
  expect(students.body.items).toHaveLength(1);
  const enrollmentId = students.body.items[0].id as string;
  expect((await teacherClient.post(`/api/classes/${classId}/enrollments/${enrollmentId}/remove`, {})).status).toBe(200);
  const lateToken = await inviteToClass("aluno-atrasado-jornada@example.test");
  // 003/US5 — the teacher lists, resends and cancels an invitation.
  const resentEmail = "aluno-reenvio-jornada@example.test";
  const resentId = (await teacherClient.post(`/api/classes/${classId}/invitations`, { email: resentEmail })).body.id as string;
  await t.flushMail();
  keepToken("token de convite de turma", t.mailer.lastTokenFor(resentEmail, "class-invitation"));
  expect((await teacherClient.get(`/api/classes/${classId}/invitations?query=reenvio`)).body.items).toHaveLength(1);
  expect((await teacherClient.post(`/api/classes/${classId}/invitations/${resentId}/resend`, {})).status).toBe(200);
  await t.flushMail();
  keepToken("token de convite de turma reenviado", t.mailer.lastTokenFor(resentEmail, "class-invitation"));
  expect((await teacherClient.post(`/api/classes/${classId}/invitations/${resentId}/cancel`, {})).status).toBe(200);
  expect((await teacherClient.post(`/api/classes/${classId}/status`, { status: "INACTIVE" })).status).toBe(200);
  expect((await api(t).post("/api/class-invitations/preview", { token: lateToken })).status).toBe(400);
  const refused = await api(t).post("/api/class-invitations/accept", {
    token: lateToken,
    name: "Aluno Atrasado",
    ra: "JOR-0002",
    password: classStudentPassword,
  });
  expect(refused.body.code).toBe("TOKEN_INVALID");
  expect((await teacherClient.post(`/api/classes/${classId}/status`, { status: "ARCHIVED" })).status).toBe(200);

  // US5 — teacher lifecycle; US4/FR-052 — account suspension and reactivation.
  const teacher = await t.prisma.user.findUniqueOrThrow({ where: { email: teacherEmail } });
  expect((await managerClient.post(`/api/teachers/${teacher.id}/deactivate`)).status).toBe(200);
  await keepLoginAs(student);
  expect((await adminClient.post(`/api/users/${student.id}/suspend`)).status).toBe(200);
  expect((await adminClient.post(`/api/users/${student.id}/reactivate`)).status).toBe(200);

  // US8 — password reset.
  expect((await api(t).post("/api/auth/password-reset/request", { email: studentEmail })).status).toBe(202);
  await t.flushMail();
  const resetToken = keepToken("token de recuperação", t.mailer.lastTokenFor(studentEmail, "password-reset"));
  const resetPassword = keep("senha redefinida", "senha-redefinida-da-jornada");
  expect(
    (await api(t).post("/api/auth/password-reset/confirm", { token: resetToken, password: resetPassword })).status,
  ).toBe(200);

  // FR-022 — rate limit: e-mail+origin block, then the cross-origin alert (10 origins).
  const wrong = "senha-errada-da-jornada";
  for (let i = 0; i < 6; i += 1) {
    await api(t).post("/api/auth/login", { email: teacherEmail, password: wrong }).set("X-Forwarded-For", "203.0.113.50");
  }
  for (let i = 0; i < 10; i += 1) {
    await api(t)
      .post("/api/auth/login", { email: managerEmail, password: wrong })
      .set("X-Forwarded-For", `198.51.100.${i + 1}`);
  }

  // FR-054 — two ADMINs suspending each other at once: one refusal, audited.
  const secondAdmin = await createUser(t, { roles: ["ADMIN"], name: "Segunda Admin" });
  const secondAdminCookie = await keepLoginAs(secondAdmin);
  const adminUser = await t.prisma.user.findUniqueOrThrow({ where: { email: adminEmail } });
  const race = await Promise.all([
    adminClient.post(`/api/users/${secondAdmin.id}/suspend`),
    api(t, { cookie: secondAdminCookie }).post(`/api/users/${adminUser.id}/suspend`),
  ]);
  expect(race.map((r) => r.status).sort()).toEqual([200, 409]);

  // FR-017, FR-076, FR-077 — retention jobs.
  await createUser(t, { verified: false, createdAt: new Date(Date.now() - (UNVERIFIED_ACCOUNT_TTL_DAYS + 1) * DAY_MS) });
  await t.prisma.$executeRaw`
    INSERT INTO access_records (user_id, ip, occurred_at)
    VALUES (${student.id}::uuid, '203.0.113.99'::inet, ${new Date(Date.now() - 200 * DAY_MS)}::timestamptz)`;
  await t.prisma.$executeRaw`
    INSERT INTO audit_events (occurred_at, type, actor_type, metadata)
    VALUES (${new Date(Date.now() - 6 * 365 * DAY_MS)}::timestamptz, 'auth.signup', 'ANONYMOUS', '{}'::jsonb)`;
  expect((await t.get(MaintenanceService).run()).status).toBe("completed");

  await t.flushMail();
  return { secrets };
}
