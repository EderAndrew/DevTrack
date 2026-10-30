import { randomUUID } from "node:crypto";
import type { StudentActivity, StudentActivityPage, TeacherActivity, TeacherActivityList } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, applyWork, createActivity, createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { applyExam } from "../helpers/exams";
import { applyGroupWork } from "../helpers/group-work";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US1 — the teacher applies a work "Individual" or "Em grupo" (023/FR-001–FR-003, research U2):
 * `groupSize` 2–5 (leader included) or null by default, one of the 015 options (fixed once a student
 * starts, `activity.settings_changed`), only on a work that takes attendance (`422
 * GROUP_NEEDS_ATTENDANCE`), never in an EXERCISE or EXAM body (400). Works applied before 023 stay
 * individual.
 */

type Client = ReturnType<typeof api>;

describe("023/US1 professor aplica um Trabalho em grupo", () => {
  let clock: FixedClock;
  let t: TestApp;
  let teacher: TestUser;
  let client: Client;
  let studentClient: Client;
  let classId: string;
  let schoolClass: { id: string; teacherId: string };
  let work: WorkFixture;

  const base = () => `/api/classes/${classId}/activities`;
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const patch = (activityId: string, body: object) => client.patch(`${base()}/${activityId}`, body);
  const detail = async (activityId: string) => (await client.get(`${base()}/${activityId}`)).body as TeacherActivity;
  const applied = async (overrides: Parameters<typeof applyWork>[3] = {}) => {
    const res = await applyWork(client, classId, work.id, overrides);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(async () => {
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    work = await createWork(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 1 });
    schoolClass = created.schoolClass;
    classId = created.schoolClass.id;
    studentClient = api(t, { cookie: await loginAs(t, created.students[0]!) });
  });

  it("023/US1-1 sem groupSize o trabalho é individual (groupSize null) e o aluno o vê como hoje", async () => {
    const activity = await applied();
    expect(activity.groupSize).toBeNull();
    expect(await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id }, select: { groupSize: true } })).toEqual({ groupSize: null });
    expect(((await studentClient.get(`/api/me/activities/${activity.id}`)).body as StudentActivity).groupSize).toBeNull();
    // An explicit null is the same "Individual".
    expect((await applied({ groupSize: null })).groupSize).toBeNull();
  });

  it("023/US1-2 groupSize 4: em grupo no detalhe, na lista do professor e no detalhe do aluno", async () => {
    const res = await applyGroupWork(client, classId, work.id, 4);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    const activity = res.body as TeacherActivity;
    expect(activity.groupSize).toBe(4);
    expect((await detail(activity.id)).groupSize).toBe(4);
    const list = (await client.get(base())).body as TeacherActivityList;
    expect(list.items.map((item) => [item.id, item.groupSize])).toEqual([[activity.id, 4]]);

    // The student's list keeps the 012 summary (SC-007); the detail carries the format.
    const page = (await studentClient.get("/api/me/activities")).body as StudentActivityPage;
    expect(page.items.map((item) => item.id)).toEqual([activity.id]);
    expect(page.items[0]).not.toHaveProperty("groupSize");
    expect(((await studentClient.get(`/api/me/activities/${activity.id}`)).body as StudentActivity).groupSize).toBe(4);
  });

  it("023/US1-3 máximo fora de 2 a 5 ou não inteiro → 400 sem criar nada", async () => {
    for (const groupSize of [1, 6, 0, -2, 2.5, "3", true]) {
      const res = await applyWork(client, classId, work.id, { groupSize });
      expect(res.status, String(groupSize)).toBe(400);
    }
    expect(await t.prisma.classActivity.count()).toBe(0);
    expect(await events("activity.published")).toEqual([]);
  });

  describe("023/US1-4 mudar o formato", () => {
    it("antes do primeiro início: muda e audita activity.settings_changed com groupSize", async () => {
      const activity = await applied();
      const group = await patch(activity.id, { version: 1, groupSize: 3 });
      expect(group.status, JSON.stringify(group.body)).toBe(200);
      expect(group.body).toMatchObject({ version: 2, groupSize: 3 });
      expect((await patch(activity.id, { version: 2, groupSize: 5 })).body).toMatchObject({ version: 3, groupSize: 5 });
      expect((await patch(activity.id, { version: 3, groupSize: null })).body).toMatchObject({ version: 4, groupSize: null });
      expect((await events("activity.settings_changed")).map((event) => event.metadata)).toEqual([
        { classId, executionMode: "NORMAL", aiHelpAllowance: 0, codeExecution: false, groupSize: 3 },
        { classId, executionMode: "NORMAL", aiHelpAllowance: 0, codeExecution: false, groupSize: 5 },
        { classId, executionMode: "NORMAL", aiHelpAllowance: 0, codeExecution: false, groupSize: null },
      ]);
      // The same value: nothing changes, no event and no new version.
      expect((await patch(activity.id, { version: 4, groupSize: null })).body).toMatchObject({ version: 4 });
      expect(await events("activity.settings_changed")).toHaveLength(3);
      // Out of range in the PATCH too.
      for (const groupSize of [1, 6, 2.5, "3"]) expect((await patch(activity.id, { version: 4, groupSize })).status, String(groupSize)).toBe(400);
    });

    it("depois do primeiro início → 409 ACTIVITY_ALREADY_STARTED e o formato igual", async () => {
      const activity = await applied();
      expect((await startAttempt(studentClient, activity.id)).status).toBe(200);
      const res = await patch(activity.id, { version: 1, groupSize: 3 });
      expect([res.status, res.body.code]).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
      expect(await detail(activity.id)).toMatchObject({ version: 1, groupSize: null });
      expect(await events("activity.settings_changed")).toEqual([]);
    });
  });

  it("023/FR-002 PATCH de groupSize num trabalho sem chamada (ALL_ENROLLED) → 422 GROUP_NEEDS_ATTENDANCE", async () => {
    const { activity } = await createActivity(t, schoolClass, { type: "ASSIGNMENT", releaseMode: "ALL_ENROLLED" });
    const res = await patch(activity.id, { version: activity.version, groupSize: 3 });
    expect([res.status, res.body.code]).toEqual([422, "GROUP_NEEDS_ATTENDANCE"]);
    expect(await detail(activity.id)).toMatchObject({ version: activity.version, groupSize: null });
    expect(await events("activity.settings_changed")).toEqual([]);
    // Individual stays allowed: nothing to change.
    expect((await patch(activity.id, { version: activity.version, groupSize: null })).status).toBe(200);
  });

  describe("023/US1-5 Exercícios e Provas não têm formato", () => {
    it("corpo de aplicar Exercícios ou Prova com groupSize → 400", async () => {
      for (const groupSize of [3, null]) {
        expect((await applyExercises(client, classId, [randomUUID()], { groupSize })).status).toBe(400);
        expect((await applyExam(client, classId, randomUUID(), { groupSize, attendance: "NONE" })).status).toBe(400);
      }
      expect(await t.prisma.classActivity.count()).toBe(0);
    });

    it("PATCH de Exercícios ou de Prova com groupSize → 400", async () => {
      for (const type of ["EXERCISE", "EXAM"] as const) {
        const { activity } = await createActivity(t, schoolClass, { type });
        for (const groupSize of [3, null]) {
          expect((await patch(activity.id, { version: activity.version, groupSize })).status, type).toBe(400);
        }
        expect((await detail(activity.id)).groupSize, type).toBeNull();
      }
    });
  });

  it("023/US1-6 trabalho antigo (linha sem group_size) continua individual", async () => {
    // Written without the column, as every work applied before 023.
    const { activity } = await createActivity(t, schoolClass, { type: "ASSIGNMENT" });
    expect((await detail(activity.id)).groupSize).toBeNull();
    expect(((await studentClient.get(`/api/me/activities/${activity.id}`)).body as StudentActivity).groupSize).toBeNull();
    expect((await startAttempt(studentClient, activity.id)).status).toBe(200);
  });

  it("023/FR-001 activity.published traz groupSize do trabalho em grupo; o individual fica como antes da 023", async () => {
    await applied({ groupSize: 3 });
    await applied();
    const [group, individual] = (await events("activity.published")).map((event) => event.metadata as Record<string, unknown>);
    expect(group).toMatchObject({ type: "ASSIGNMENT", groupSize: 3 });
    expect(individual).not.toHaveProperty("groupSize");
  });
});
