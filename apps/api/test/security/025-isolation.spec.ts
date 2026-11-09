import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../helpers/clock";
import { createNudge, dismissNudge, getStudentNudge, type NudgeScene, nudgeScene, nudgesPath, sendNudge } from "../helpers/exam-nudges";
import { createUser, loginAs } from "../helpers/factories";
import { mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 025 isolation (contracts/http-api.md "Permission matrix", spec Edge Cases, analysis C3): only the class's teacher
 * sends, from the app; teacher B, a manager, an ADMIN and a student are refused; student B never dismisses A's
 * warning; no student answer carries who sent it; a teacher who lost the class (archived, moved to another teacher)
 * or whose MOBILE session was revoked is refused like the 024 reads. No refusal creates a warning or an event.
 */
describe("025 isolamento do aviso discreto", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
  });

  const nothingWritten = async () => {
    expect(await t.prisma.examNudge.count()).toBe(0);
    expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "exam_nudge." } } })).toBe(0);
  };
  const path = (scene: NudgeScene) => nudgesPath(scene.classId, scene.activityId, scene.attemptId);

  it("o professor B, pelo celular, recebe 404 no envio a um aluno da turma de A", async () => {
    const scene = await nudgeScene(t, clock);
    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const { token } = await openMobileSession(t, teacherB);
    const res = await mobileApi(t, token).post(path(scene), {});
    expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    await nothingWritten();
  });

  it("gestor, ADMIN e aluno recebem 403 no envio, pela web e com uma sessão do celular", async () => {
    const scene = await nudgeScene(t, clock);
    const others = {
      MANAGER: await createUser(t, { roles: ["MANAGER"] }),
      ADMIN: await createUser(t, { roles: ["ADMIN"] }),
      STUDENT: scene.student,
    };
    for (const [role, user] of Object.entries(others)) {
      const web = await api(t, { cookie: await loginAs(t, user) }).post(path(scene), {});
      const { token } = await openMobileSession(t, user);
      const phone = await mobileApi(t, token).post(path(scene), {});
      expect({ role, statuses: [web.status, phone.status] }).toEqual({ role, statuses: [403, 403] });
    }
    await nothingWritten();
  });

  it("o aluno B da mesma prova recebe 404 ao fechar o aviso de A, e o aviso continua pendente", async () => {
    const scene = await nudgeScene(t, clock, { classmates: 1 });
    const nudge = await createNudge(t, scene, { sentAt: clock.now() });
    const classmate = scene.classmates[0]!;
    const res = await dismissNudge(classmate.client, scene.activityId, nudge.id);
    expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    expect((await getStudentNudge(classmate.client, scene.activityId)).body).toEqual({ nudge: null });
    expect(await t.prisma.examNudge.findUniqueOrThrow({ where: { id: nudge.id } })).toMatchObject({ dismissedAt: null });
    expect(await t.prisma.auditEvent.count({ where: { type: "exam_nudge.dismissed" } })).toBe(0);
  });

  it("nenhuma resposta do aluno traz quem enviou: nem sentBy, nem o id ou o nome do professor", async () => {
    const scene = await nudgeScene(t, clock);
    const nudge = await createNudge(t, scene, { sentAt: clock.now() });
    const shown = await getStudentNudge(scene.studentClient, scene.activityId);
    expect(shown.status).toBe(200);
    expect(Object.keys(shown.body.nudge).sort()).toEqual(["id", "studentName"]);
    const dismissed = await dismissNudge(scene.studentClient, scene.activityId, nudge.id);
    expect(dismissed.status).toBe(200);
    for (const body of [shown.body, dismissed.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toMatch(/sentBy/i);
      expect(text).not.toContain(scene.teacher.id);
      expect(text).not.toContain(scene.teacher.name);
    }
  });

  it("turma arquivada → 404 no envio, sem aviso nem evento", async () => {
    const scene = await nudgeScene(t, clock);
    await t.prisma.schoolClass.update({ where: { id: scene.classId }, data: { status: "ARCHIVED" } });
    const res = await sendNudge(t, scene);
    expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    await nothingWritten();
  });

  it("professor que deixou de ser o da turma → 404 no envio; o novo professor envia", async () => {
    const scene = await nudgeScene(t, clock);
    const successor = await createUser(t, { roles: ["TEACHER"] });
    await t.prisma.schoolClass.update({ where: { id: scene.classId }, data: { teacherId: successor.id } });
    const res = await sendNudge(t, scene);
    expect([res.status, res.body.code]).toEqual([404, "NOT_FOUND"]);
    await nothingWritten();
    const { token } = await openMobileSession(t, successor);
    expect((await sendNudge(t, { ...scene, token })).status).toBe(201);
  });

  it("sessão do celular revogada em Minhas sessões → 401 no envio", async () => {
    const scene = await nudgeScene(t, clock);
    const web = api(t, { cookie: await loginAs(t, scene.teacher) });
    const sessions = (await web.get("/api/me/sessions")).body.items as { id: string; client?: string }[];
    const phoneSession = await t.prisma.session.findFirstOrThrow({ where: { userId: scene.teacher.id, client: "MOBILE" } });
    expect(sessions.some((session) => session.id === phoneSession.id)).toBe(true);
    expect((await web.delete(`/api/me/sessions/${phoneSession.id}`)).status).toBe(204);
    const res = await sendNudge(t, scene);
    expect(res.status).toBe(401);
    await nothingWritten();
  });
});
