import type { Answer, StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { markAllPresent } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, handEditing, startAlone, startGroup, takeBackEditing } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

type Client = ReturnType<typeof api>;
type Created = Awaited<ReturnType<typeof createClassWithStudents>>;

const ROUNDS = 5;
const text = (value: string): Answer => ({ kind: "TEXT", text: value });

/**
 * 023/SC-002 under concurrency (research U5, U6): the activity's group lock makes a student's place unique.
 * Whatever wins, no student ends in two groups, or in a group and alone (the UNIQUE per activity, student and
 * attempt number underneath), a group never passes its maximum, a save races the take-back with one editor at
 * the end, and a submission racing an inclusion leaves a coherent group.
 */
describe("023/SC-002 concorrência: nunca um aluno em dois grupos nem em grupo e sozinho", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let created: Created;
  let as: Client[];

  const newWork = async (groupSize: number) => {
    const { activity, questionIds } = await createActivity(t, created.schoolClass, {
      type: "ASSIGNMENT",
      releaseMode: "PRESENT_ONLY",
      groupSize,
      questions: [{ type: "OPEN_ANSWER" }],
    });
    await markAllPresent(teacherClient, created.schoolClass.id, activity.id);
    return { activityId: activity.id, questionId: questionIds[0]! };
  };
  const placesOf = async (activityId: string) => {
    const rows = await t.prisma.attemptParticipant.findMany({ where: { activityId, attemptNumber: 1 }, select: { studentUserId: true, attemptId: true } });
    expect(new Set(rows.map((row) => row.studentUserId)).size, "um aluno em duas tentativas").toBe(rows.length);
    return rows;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, activitySavesPerMinute: 10_000, activitySubmitsPerHour: 10_000 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    created = await createClassWithStudents(t, teacher.id, { students: 12 });
    as = await Promise.all(created.students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
  });

  it("023/SC-002 dois líderes × o mesmo colega: um forma o grupo, o outro recebe GROUP_MEMBERS_UNAVAILABLE", async () => {
    const [ana, bruno, carla] = created.students;
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activityId } = await newWork(3);
      const [first, second] = await Promise.all([startGroup(as[0]!, activityId, [carla!.id]), startGroup(as[1]!, activityId, [carla!.id])]);
      const statuses = [first.status, second.status].sort();
      expect(statuses, JSON.stringify([first.body, second.body])).toEqual([200, 409]);
      const refused = first.status === 409 ? first : second;
      expect(refused.body.code).toBe("GROUP_MEMBERS_UNAVAILABLE");
      const places = await placesOf(activityId);
      expect(places).toHaveLength(2);
      expect(places.map((place) => place.studentUserId)).toContain(carla!.id);
      expect(places.map((place) => place.studentUserId)).toContain(first.status === 200 ? ana!.id : bruno!.id);
      expect(await t.prisma.attemptGroup.count({ where: { activityId } })).toBe(1);
    }
  });

  it("023/SC-002 início sozinho × incluído pelo líder: ou fica no grupo, ou fica sozinho", async () => {
    const [, bruno, carla] = created.students;
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activityId } = await newWork(4);
      expect((await startGroup(as[0]!, activityId, [bruno!.id])).status).toBe(200);
      const [alone, added] = await Promise.all([startAlone(as[2]!, activityId), addMembers(as[0]!, activityId, [carla!.id])]);
      expect(alone.status, JSON.stringify(alone.body)).toBe(200);
      if (added.status === 200) {
        // Carla was added first: "Continuar sozinho" answered with the group's attempt, nothing created.
        expect((alone.body as StudentActivity).group).not.toBeNull();
      } else {
        expect([added.status, added.body.code]).toEqual([409, "GROUP_MEMBERS_UNAVAILABLE"]);
        expect((alone.body as StudentActivity).group ?? null).toBeNull();
      }
      const places = await placesOf(activityId);
      expect(places.filter((place) => place.studentUserId === carla!.id)).toHaveLength(1);
      expect(await t.prisma.activityAttempt.count({ where: { activityId } })).toBe(added.status === 200 ? 1 : 2);
    }
  });

  it("023/SC-002 dois inícios do mesmo aluno × ser escolhido: uma só participação", async () => {
    const [, bruno] = created.students;
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activityId } = await newWork(3);
      const responses = await Promise.all([startGroup(as[0]!, activityId, [bruno!.id]), startAlone(as[1]!, activityId), startAlone(as[1]!, activityId)]);
      for (const res of responses) expect([200, 409], JSON.stringify(res.body)).toContain(res.status);
      await placesOf(activityId);
    }
  });

  it("023/SC-002 dez inclusões simultâneas no limite: entra uma, as outras recebem GROUP_FULL", async () => {
    const { activityId } = await newWork(3);
    const [, bruno, ...others] = created.students;
    expect((await startGroup(as[0]!, activityId, [bruno!.id])).status).toBe(200);
    const responses = await Promise.all(others.slice(0, 10).map((other) => addMembers(as[0]!, activityId, [other.id])));
    const statuses = responses.map((res) => res.status).sort();
    expect(statuses).toEqual([200, ...Array.from({ length: 9 }, () => 409)]);
    expect(responses.filter((res) => res.status === 409).every((res) => res.body.code === "GROUP_FULL")).toBe(true);
    expect(await placesOf(activityId)).toHaveLength(3);
    expect(await t.prisma.auditEvent.count({ where: { type: "activity_group.member_added" } })).toBe(2);
  });

  it("023/SC-002 salvar × TAKE_BACK: o salvamento vence antes ou é recusado; a edição termina com o líder", async () => {
    const [, bruno] = created.students;
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activityId, questionId } = await newWork(2);
      expect((await startGroup(as[0]!, activityId, [bruno!.id])).status).toBe(200);
      expect((await handEditing(as[0]!, activityId, bruno!.id)).status).toBe(200);
      const [saved, taken] = await Promise.all([
        saveAnswers(as[1]!, activityId, [{ questionId, answer: text(`corrida ${round}`), baseRevision: 0 }]),
        takeBackEditing(as[0]!, activityId),
      ]);
      expect(taken.status, JSON.stringify(taken.body)).toBe(200);
      if (saved.status !== 200) expect([saved.status, saved.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId } });
      const group = await t.prisma.attemptGroup.findUniqueOrThrow({ where: { attemptId: attempt.id } });
      expect(group.editorUserId).toBe(group.leaderUserId);
      const logged = await t.prisma.activityAnswerSave.count({ where: { attemptId: attempt.id } });
      expect(logged).toBe(saved.status === 200 ? 1 : 0);
    }
  });

  it("023/SC-002 entregar × incluir: a inclusão entra antes da entrega ou é recusada, nunca depois", async () => {
    const [, bruno, carla] = created.students;
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activityId } = await newWork(3);
      expect((await startGroup(as[0]!, activityId, [bruno!.id])).status).toBe(200);
      const [submitted, added] = await Promise.all([submitAttempt(as[0]!, activityId, []), addMembers(as[0]!, activityId, [carla!.id])]);
      expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
      if (added.status !== 200) expect([added.status, added.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId } });
      expect(attempt.status).toBe("SUBMITTED");
      expect(await placesOf(activityId)).toHaveLength(added.status === 200 ? 3 : 2);
    }
  });
});
