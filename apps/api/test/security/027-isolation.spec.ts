import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createActivity, type CreatedActivity, createAttemptRow } from "../helpers/activities";
import { DAY, FixedClock } from "../helpers/clock";
import {
  cohortIdOf,
  createClass,
  createClassInvitation,
  createCohort,
  createEnrollment,
  createSubject,
  createUser,
  loginAs,
  syllabusFixture,
  type TestClass,
  type TestUser,
} from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import {
  buildTeacherArea,
  curriculumSnapshot,
  type TeacherArea,
  VALID_BODY as CURRICULUM_BODY,
} from "./004-curriculum-authorization-matrix";
import { MATRIX, type MatrixEntry, ROLE_PERMISSIONS, routeKey } from "./authorization-matrix";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };
const FORBIDDEN = { status: 403, code: "FORBIDDEN" };
const START = "2026-11-19T12:00:00.000Z";
const MISSING = "00000000-0000-4000-8000-0000000000aa";

const teacherHolds = (entry: MatrixEntry) =>
  entry.access !== "session" && (ROLE_PERMISSIONS.TEACHER as readonly string[]).includes(entry.access);

/**
 * Every route of a disciplina da turma, read from `MATRIX` (`027/SC-003`): the teacher's routes under
 * `/classes/:id` or `/classes/:classId` (the class itself, its roster, 004 calendar and plan, 012–025 activities,
 * review, attendance, pauses, exams, alerts and the ranking). The app-only bell (025) never takes a web session.
 */
const CLASS_ROUTES = MATRIX.filter(
  (entry) => /^\/classes\/:(id|classId)(\/|$)/.test(entry.path) && teacherHolds(entry) && !entry.mobileOnly,
);

/** The ids of the scene a path stands for; `classId` is replaced on each call. */
interface Ids {
  classId: string;
  activityId: string;
  attemptId: string;
  questionId: string;
  studentUserId: string;
  topicId: string;
}

/** Bodies that pass validation, so the class's context is what answers (`404`). */
const ACTIVITY_BODY: Record<string, (ids: Ids) => object> = {
  "GET /classes/:id": () => ({}),
  "PATCH /classes/:id": () => ({ startsOn: null, endsOn: null }),
  "POST /classes/:id/status": () => ({ status: "INACTIVE" }),
  "GET /classes/:id/enrollments": () => ({}),
  "GET /classes/:classId/activities": () => ({}),
  "POST /classes/:classId/activities/scope-check": () => ({ type: "EXERCISE", exerciseIds: [crypto.randomUUID()] }),
  "POST /classes/:classId/activities": () => ({
    idempotencyKey: crypto.randomUUID(),
    source: { type: "EXERCISE", exerciseIds: [crypto.randomUUID()] },
    title: "x",
    publishAt: null,
    acknowledgeOutOfScope: true,
  }),
  "GET /classes/:classId/activities/:activityId": () => ({}),
  "PATCH /classes/:classId/activities/:activityId": () => ({ version: 1, title: "Outro" }),
  "POST /classes/:classId/activities/:activityId/close": () => ({}),
  "POST /classes/:classId/activities/:activityId/cancel": () => ({}),
  "POST /classes/:classId/activities/:activityId/release": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId": () => ({}),
  "PUT /classes/:classId/activities/:activityId/attempts/:attemptId/grades": (ids) => ({
    version: 1,
    decisions: [{ questionId: ids.questionId, grade: "0.10" }],
  }),
  "POST /classes/:classId/activities/:activityId/attempts/:attemptId/accept-submission": () => ({}),
  "PUT /classes/:classId/activities/:activityId/attempts/:attemptId/marks": (ids) => ({
    marks: [{ questionId: ids.questionId, result: "CORRECT" }],
  }),
  "GET /classes/:classId/ranking": () => ({}),
  "GET /classes/:classId/activities/:activityId/integrity": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/integrity": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/help": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/code-runs": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/group": () => ({}),
  "GET /classes/:classId/activities/:activityId/attendance": () => ({}),
  "POST /classes/:classId/activities/:activityId/attendance": (ids) => ({ mark: [ids.studentUserId], unmark: [] }),
  "POST /classes/:classId/activities/:activityId/pauses/:pauseId/release": () => ({}),
  "POST /classes/:classId/activities/:activityId/students/:studentUserId/pause": () => ({}),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/pauses": () => ({}),
  "GET /classes/:classId/activities/:activityId/exam-monitor": () => ({}),
  "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/cancel": () => ({}),
  "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/return": () => ({}),
  "POST /classes/:classId/activities/:activityId/exam-holds/:holdId/keep": () => ({}),
  "PUT /classes/:classId/activities/:activityId/exam-alerts": () => ({ muted: true }),
  "GET /classes/:classId/activities/:activityId/attempts/:attemptId/timeline": () => ({}),
};

/**
 * 027/US7 (spec FR-007, FR-016, SC-003; contracts/permissions.md): "ADS 3NA" holds "Banco de Dados" of teacher A
 * and "Redes" of teacher B; "ADS 3NB" holds a subject of B. The separation of turma and disciplina da turma opens
 * no access: A on B's disciplina (same turma) answers exactly as a missing id, the MANAGER and the ADMIN never reach
 * pedagogical data, a teacher never reaches the turma's management, and a student of 3NA never reaches 3NB.
 */
describe("027/US7 cada um só vê o que é seu", () => {
  let t: TestApp;
  let clock: FixedClock;
  let manager: TestUser;
  let admin: TestUser;
  let teacherA: TestUser;
  let teacherB: TestUser;
  let studentNa: TestUser;
  let studentNb: TestUser;
  /** B's "Redes" in 3NA, with a complete 004 area (calendar, plan, topics). */
  let areaB: TeacherArea;
  let classA: TestClass;
  let classNb: TestClass;
  let activityB: CreatedActivity;
  let activityA: CreatedActivity;
  let activityNb: CreatedActivity;
  let attemptB: string;
  let cohortNa: string;
  let invitationNa: string;
  let enrollmentNa: string;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);

  async function submittedAttempt(activity: CreatedActivity, student: TestUser): Promise<string> {
    const { attemptId } = await createAttemptRow(t, activity.activity.id, student.id, {
      submission: { submittedAt: at(0) },
    });
    return attemptId;
  }

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
    await resetDb(t.prisma);
    manager = await createUser(t, { roles: ["MANAGER"], name: "Gestora" });
    admin = await createUser(t, { roles: ["ADMIN"] });
    teacherA = await createUser(t, { roles: ["TEACHER"], name: "Professor A" });
    teacherB = await createUser(t, { roles: ["TEACHER"], name: "Professora B" });
    studentNa = await createUser(t, { roles: ["STUDENT"], name: "Aluno 3NA" });
    studentNb = await createUser(t, { roles: ["STUDENT"], name: "Aluno 3NB" });

    areaB = await buildTeacherArea(t, teacherB);
    cohortNa = await cohortIdOf(t, areaB.classId);
    await t.prisma.cohort.update({ where: { id: cohortNa }, data: { name: "ADS 3NA" } });
    const subjectA = await createSubject(t, teacherA.id, { name: "Banco de Dados" });
    classA = await createClass(t, teacherA.id, { cohortId: cohortNa, subjectId: subjectA.id });
    const cohortNb = await createCohort(t, { name: "ADS 3NB", createdById: manager.id });
    classNb = await createClass(t, teacherB.id, { cohortId: cohortNb.id });

    enrollmentNa = (await createEnrollment(t, classA.id, studentNa.id)).id;
    await createEnrollment(t, classNb.id, studentNb.id);
    invitationNa = (await createClassInvitation(t, classA.id, "convidado-3na@example.test", { invitedById: manager.id })).invitation.id;

    const classB = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: areaB.classId } });
    const open = { publishAt: at(-DAY), deadline: at(7 * DAY), questions: [{ type: "OPEN_ANSWER" as const, valueCents: 100 }] };
    activityB = await createActivity(t, classB, { ...open, title: "Atividade de Redes" });
    activityA = await createActivity(t, classA, { ...open, title: "Atividade de Banco de Dados" });
    activityNb = await createActivity(t, classNb, { ...open, title: "Atividade da 3NB" });
    attemptB = await submittedAttempt(activityB, studentNa);
    await submittedAttempt(activityA, studentNa);
  });
  afterAll(() => t.close());

  const idsOf = (classId: string, activity: CreatedActivity, attemptId: string): Ids => ({
    classId,
    activityId: activity.activity.id,
    attemptId,
    questionId: activity.questionIds[0]!,
    studentUserId: studentNa.id,
    topicId: areaB.topicId,
  });

  function bodyFor(entry: MatrixEntry, ids: Ids): object {
    const key = routeKey(entry);
    if (ACTIVITY_BODY[key]) return ACTIVITY_BODY[key](ids);
    if (CURRICULUM_BODY[key]) return CURRICULUM_BODY[key](areaB);
    throw new Error(`sem corpo para ${key}`);
  }

  async function call(entry: MatrixEntry, user: TestUser, ids: Ids, body: object | null = bodyFor(entry, ids)) {
    const client = api(t, { cookie: await loginAs(t, user) });
    const url = `/api${entry.path
      .replace(/:(id|classId)\b/, ids.classId)
      .replace(":activityId", ids.activityId)
      .replace(":attemptId", ids.attemptId)
      .replace(":topicId", ids.topicId)
      .replace(":studentUserId", ids.studentUserId)
      .replace(/:[A-Za-z]+/g, () => crypto.randomUUID())}`;
    if (entry.upload) return client.upload(url, { bytes: syllabusFixture("poo.docx"), filename: "ementa.docx" });
    // The 004 topic list needs its filter (as in the 004 matrix).
    if (entry.method === "GET") return client.get(routeKey(entry) === "GET /classes/:id/plan/topics" ? `${url}?status=ARCHIVED` : url);
    if (entry.method === "DELETE") return client.delete(url);
    if (entry.method === "PATCH") return client.patch(url, body ?? {});
    if (entry.method === "PUT") return client.put(url, body ?? {});
    return client.post(url, body ?? {});
  }

  /** Everything a refused call must leave as it was. */
  const snapshot = async () => ({
    curriculum: await curriculumSnapshot(t),
    cohorts: await t.prisma.cohort.findMany({ orderBy: { id: "asc" } }),
    classes: await t.prisma.schoolClass.findMany({ orderBy: { id: "asc" } }),
    enrollments: await t.prisma.enrollment.findMany({ orderBy: { id: "asc" } }),
    invitations: await t.prisma.classInvitation.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, sendCount: true } }),
    activities: await t.prisma.classActivity.findMany({ orderBy: { id: "asc" }, select: { id: true, status: true, version: true, resultReleasedAt: true } }),
    attempts: await t.prisma.activityAttempt.count(),
    submissions: await t.prisma.activitySubmission.findMany({ orderBy: { id: "asc" }, select: { id: true, version: true } }),
    attendances: await t.prisma.activityAttendance.count(),
    pauses: await t.prisma.attemptPause.count(),
  });

  it("027/SC-003 toda rota da disciplina da turma do MATRIX tem corpo definido neste teste", () => {
    expect(CLASS_ROUTES.length).toBeGreaterThan(40);
    const missing = CLASS_ROUTES.map(routeKey).filter((key) => !ACTIVITY_BODY[key] && !CURRICULUM_BODY[key]);
    expect(missing).toEqual([]);
  });

  it.each(CLASS_ROUTES.map((entry) => [routeKey(entry), entry] as const))(
    "027/US7-1 027/SC-003 %s — professor A na disciplina de B da mesma turma → 404 idêntico ao de id inexistente, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const foreign = await call(entry, teacherA, idsOf(areaB.classId, activityB, attemptB));
      const missing = await call(entry, teacherA, idsOf(MISSING, activityB, attemptB));
      expect({ status: foreign.status, body: foreign.body }).toEqual({ status: 404, body: NOT_FOUND });
      expect(foreign.body).toEqual(missing.body);
      expect(await snapshot()).toEqual(before);
    },
  );

  const nested = CLASS_ROUTES.filter((entry) => entry.path.includes(":activityId"));
  it.each(nested.map((entry) => [routeKey(entry), entry] as const))(
    "027/US7-1 %s — atividade e tentativa de B sob a disciplina do próprio A → 404, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const res = await call(entry, teacherA, idsOf(classA.id, activityB, attemptB));
      expect({ status: res.status, body: res.body }).toEqual({ status: 404, body: NOT_FOUND });
      expect(await snapshot()).toEqual(before);
    },
  );

  it("027/US7-1 a disciplina de B não aparece na lista nem no ranking de A; o dono continua lendo a sua", async () => {
    const clientA = api(t, { cookie: await loginAs(t, teacherA) });
    const list = await clientA.get("/api/classes");
    expect(list.status).toBe(200);
    expect(list.body.items.map((item: { id: string }) => item.id)).toEqual([classA.id]);
    expect(JSON.stringify(list.body)).not.toContain("Atividade de Redes");
    expect((await clientA.get(`/api/classes/${classA.id}/activities`)).status).toBe(200);
    const clientB = api(t, { cookie: await loginAs(t, teacherB) });
    expect((await clientB.get(`/api/classes/${areaB.classId}/plan`)).status).toBe(200);
    expect((await clientB.get(`/api/classes/${areaB.classId}/ranking`)).status).toBe(200);
  });

  /** Every pedagogical route (004–025): the TEACHER's permissions that the MANAGER and the ADMIN never hold. */
  const PEDAGOGICAL = MATRIX.filter(
    (entry) =>
      teacherHolds(entry) &&
      !entry.mobileOnly &&
      !entry.access.startsWith("turmas.") &&
      !entry.access.startsWith("disciplinas_turma.") &&
      !(ROLE_PERMISSIONS.MANAGER as readonly string[]).includes(entry.access),
  );
  const managerCases = (["MANAGER", "ADMIN"] as const).flatMap((role) =>
    PEDAGOGICAL.map((entry) => [routeKey(entry), role, entry] as const),
  );

  it.each(managerCases)("027/US7-2 027/SC-003 %s como %s (ids reais) → 403, sem efeito", async (_key, role, entry) => {
    const before = await snapshot();
    const user = role === "MANAGER" ? manager : admin;
    const ids = idsOf(areaB.classId, activityB, attemptB);
    const res = await call(entry, user, ids, CLASS_ROUTES.includes(entry) ? bodyFor(entry, ids) : null);
    expect({ status: res.status, code: res.body.code }).toEqual(FORBIDDEN);
    expect(await snapshot()).toEqual(before);
  });

  it("027/US7-2 os pedagógicos cobrem atividade, entrega, nota, plano e ementa", () => {
    const keys = PEDAGOGICAL.map(routeKey);
    for (const route of [
      "GET /classes/:classId/activities/:activityId",
      "GET /classes/:classId/activities/:activityId/attempts/:attemptId",
      "PUT /classes/:classId/activities/:activityId/attempts/:attemptId/grades",
      "GET /classes/:id/plan",
      "GET /syllabus-documents/:id",
      "GET /classes/:classId/ranking",
      "GET /classes/:classId/activities/:activityId/attendance",
    ]) {
      expect(keys).toContain(route);
    }
  });

  const COHORT_ROUTES = MATRIX.filter((entry) => entry.path.startsWith("/cohorts"));
  const cohortBody: Record<string, object> = {
    "POST /cohorts": { name: "Turma do Professor", code: "PROF-1", academicYear: 2026 },
    "PATCH /cohorts/:id": { name: "Outro nome" },
    "POST /cohorts/:id/status": { to: "INACTIVE" },
    "POST /cohorts/:id/invitations": { email: "novo-3na@example.test" },
    "POST /cohorts/:id/student-lookup": { email: "aluno-3nb@example.test" },
    "POST /cohorts/:id/enrollments": { email: "aluno-3nb@example.test" },
  };

  it.each(COHORT_ROUTES.map((entry) => [routeKey(entry), entry] as const))(
    "027/US7-3 %s como professor da turma (ids reais) → 403, sem efeito",
    async (_key, entry) => {
      const before = await snapshot();
      const client = api(t, { cookie: await loginAs(t, teacherA) });
      const url = `/api${entry.path
        .replace(":invitationId", invitationNa)
        .replace(":enrollmentId", enrollmentNa)
        .replace(":id", cohortNa)}`;
      const body = cohortBody[routeKey(entry)] ?? {};
      const res =
        entry.method === "GET" ? await client.get(url) : entry.method === "PATCH" ? await client.patch(url, body) : await client.post(url, body);
      expect({ status: res.status, code: res.body.code }).toEqual(FORBIDDEN);
      expect(await snapshot()).toEqual(before);
    },
  );

  it("027/US7-3 na sua disciplina da turma o professor vê só a lista de alunos de hoje: sem convites, e-mail de quem não está matriculado ou turma de gestão", async () => {
    const client = api(t, { cookie: await loginAs(t, teacherA) });
    const roster = await client.get(`/api/classes/${classA.id}/enrollments`);
    expect(roster.status).toBe(200);
    expect(roster.body.items.map((item: { id: string }) => item.id)).toEqual([enrollmentNa]);
    expect(Object.keys(roster.body.items[0]).sort()).toEqual(["enrolledAt", "id", "removedAt", "status", "student"]);
    expect(Object.keys(roster.body.items[0].student).sort()).toEqual(["email", "name", "ra", "userId"]);
    const detail = await client.get(`/api/classes/${classA.id}`);
    expect(detail.status).toBe(200);
    const text = JSON.stringify([roster.body, detail.body]);
    expect(text).not.toContain("convidado-3na@example.test");
    expect(text).not.toContain("Aluno 3NB");
    expect(text).not.toMatch(/"invitations"|"students"|"enrollments"/);
  });

  it("027/US7-4 aluno de 3NA na disciplina, atividade e ranking de 3NB → 404 idêntico ao de id inexistente", async () => {
    const client = api(t, { cookie: await loginAs(t, studentNa) });
    const routes = (classId: string, activityId: string) => [
      `/api/me/activities?classId=${classId}`,
      `/api/me/dashboard?classId=${classId}`,
      `/api/me/activities/${activityId}`,
      `/api/me/activities/${activityId}/attempt`,
      `/api/me/classes/${classId}/ranking`,
    ];
    const foreign = routes(classNb.id, activityNb.activity.id);
    const missing = routes(MISSING, MISSING);
    for (const [index, route] of foreign.entries()) {
      const res = await client.get(route);
      const absent = await client.get(missing[index]!);
      expect({ route, status: res.status, body: res.body }).toEqual({ route, status: 404, body: NOT_FOUND });
      expect(res.body).toEqual(absent.body);
    }
    const mine = await client.get("/api/me/activities");
    expect(JSON.stringify(mine.body)).not.toContain("Atividade da 3NB");
    // Both disciplinas of the student's own turma stay open to them.
    expect((await client.get(`/api/me/activities?classId=${classA.id}`)).status).toBe(200);
    expect((await client.get(`/api/me/classes/${areaB.classId}/ranking`)).status).toBe(200);
  });

  it("027/US7-4 aluno de 3NB não lê nada de 3NA, nem o roster da disciplina pela rota do professor (403)", async () => {
    const client = api(t, { cookie: await loginAs(t, studentNb) });
    expect((await client.get(`/api/me/activities/${activityA.activity.id}`)).status).toBe(404);
    expect((await client.get(`/api/me/classes/${classA.id}/ranking`)).status).toBe(404);
    const roster = await client.get(`/api/classes/${classA.id}/enrollments`);
    expect({ status: roster.status, code: roster.body.code }).toEqual(FORBIDDEN);
  });
});
