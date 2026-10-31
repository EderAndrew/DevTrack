import type { TeacherActivity } from "@repo/contracts";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RateLimitService } from "../../src/platform/rate-limit/rate-limit.service";
import { applyExercises, applyWork, createClassWithStudents } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, handEditing, startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

type Client = ReturnType<typeof api>;

/**
 * 023 boundaries (contracts/http-api.md): strict bodies — a field the server decides is a 400, never ignored —,
 * the maximum 2–5 on apply, 1 to `groupSize − 1` classmates at the start, and a change of the editing
 * counted in the `activity-saves` limit (research U18).
 */
describe("023 fronteiras do trabalho em grupo", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherClient: Client;
  let classId: string;
  let work: WorkFixture;
  let students: TestUser[];
  let as: Client[];

  const apply = async (groupSize: number) => {
    const res = await applyWork(teacherClient, classId, work.id, { groupSize });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    work = await createWork(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 6 });
    classId = created.schoolClass.id;
    students = created.students;
    as = await Promise.all(students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
  });

  it("023 groupSize 1 e 6 → 400; 2 e 5 → aplicado; num exercício → 400", async () => {
    for (const groupSize of [1, 6, 0, "3", 2.5]) {
      const res = await applyWork(teacherClient, classId, work.id, { groupSize });
      expect(res.status, String(groupSize)).toBe(400);
    }
    for (const groupSize of [2, 5]) expect((await apply(groupSize)).groupSize).toBe(groupSize);
    const exercise = await createExercise(t, (await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } })).teacherId, {});
    const res = await applyExercises(teacherClient, classId, [exercise.id], { groupSize: 2 } as never);
    expect(res.status).toBe(400);
  });

  it("023 0, 1, 4 e 5 ids no início de um grupo de 5", async () => {
    const ids = students.map((student) => student.id);
    const activity = await apply(5);
    expect((await startGroup(as[0]!, activity.id, [])).status).toBe(400);
    expect((await startGroup(as[0]!, activity.id, ids.slice(1, 6))).status).toBe(400);
    expect((await startGroup(as[0]!, activity.id, [ids[1]!, ids[2]!, ids[3]!, ids[4]!])).status).toBe(200);
    const small = await apply(5);
    expect((await startGroup(as[0]!, small.id, [ids[1]!])).status).toBe(200);
    expect(await t.prisma.attemptParticipant.count({ where: { activityId: small.id } })).toBe(2);
  });

  it("023 corpos estritos: leaderId, editorId, groupId, attemptId e joinedAt → 400 em todas as rotas", async () => {
    const activity = await apply(3);
    const member = students[1]!.id;
    const extras = [{ leaderId: students[2]!.id }, { editorId: member }, { groupId: randomUUID() }, { attemptId: randomUUID() }, { joinedAt: new Date().toISOString() }];
    for (const extra of extras) {
      expect((await as[0]!.post(`/api/me/activities/${activity.id}/attempt`, { memberIds: [member], ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(0);

    expect((await startGroup(as[0]!, activity.id, [member])).status).toBe(200);
    for (const extra of extras) {
      expect((await as[0]!.post(`/api/me/activities/${activity.id}/group/members`, { memberIds: [students[2]!.id], ...extra })).status, JSON.stringify(extra)).toBe(400);
      expect((await as[0]!.post(`/api/me/activities/${activity.id}/group/editing`, { action: "HAND", toUserId: member, ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    expect((await as[0]!.post(`/api/me/activities/${activity.id}/group/editing`, { action: "TAKE_BACK", toUserId: member })).status).toBe(400);
    expect((await as[0]!.post(`/api/me/activities/${activity.id}/group/editing`, { action: "DELETE" })).status).toBe(400);
    expect((await as[0]!.post(`/api/me/activities/${activity.id}/group/members`, { memberIds: [] })).status).toBe(400);
    expect((await addMembers(as[0]!, activity.id, ["não-é-uuid"])).status).toBe(400);
    expect(await t.prisma.attemptParticipant.count({ where: { activityId: activity.id } })).toBe(2);
  });

  it("023 uma passagem recusada pelo limite activity-saves → 429, a edição fica onde estava", async () => {
    const activity = await apply(3);
    expect((await startGroup(as[0]!, activity.id, [students[1]!.id])).status).toBe(200);
    const limit = t.config.rateLimit.activitySavesPerMinute;
    await t.get(RateLimitService).hit("activity-saves", students[0]!.id, { limit, windowSec: 60, weight: limit });
    const res = await handEditing(as[0]!, activity.id, students[1]!.id);
    expect(res.status, JSON.stringify(res.body)).toBe(429);
    const group = await t.prisma.attemptGroup.findFirstOrThrow({ where: { activityId: activity.id } });
    expect([group.editorUserId, group.version]).toEqual([students[0]!.id, 1]);
    expect(await t.prisma.attemptGroupEvent.count({ where: { attemptId: group.attemptId } })).toBe(0);
  });
});
