import type { StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createActivity, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { declareExit, getMyPause, markAllPresent, markPresent } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createCodeWork, getLatestRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, getAttemptGroup, getCandidates, handEditing, returnEditing, startGroup, takeBackEditing } from "../helpers/group-work";
import { getOwnIntegrity, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

/**
 * 023 contracts/permissions.md: a group's routes answer only inside the student's context and the teacher's
 * class. Out of the group's reach — another class, not marked present, teacher B — is the same 404 on every
 * route; other roles → 403. Inside a group each member reads only their own events, pause and runs, and what
 * a classmate's screen gets of a colleague is id and name, never the e-mail or the RA.
 */
describe("023 isolamento do trabalho em grupo", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacherA: Client;
  let teacherB: Client;
  let classAId: string;
  let classBId: string;
  let leader: TestUser;
  let member: TestUser;
  let free: TestUser;
  let absent: TestUser;
  let leaderClient: Client;
  let memberClient: Client;
  let freeClient: Client;
  let absentClient: Client;
  let foreignClient: Client;
  let work: CreatedActivity;
  let attemptId: string;

  /** Every student route of a group, with a valid body. */
  const studentRoutes = (client: Client, activityId: string, someoneId: string) => [
    () => client.get(`/api/me/activities/${activityId}`),
    () => getCandidates(client, activityId),
    () => startGroup(client, activityId, [someoneId]),
    () => addMembers(client, activityId, [someoneId]),
    () => handEditing(client, activityId, someoneId),
    () => takeBackEditing(client, activityId),
    () => returnEditing(client, activityId),
  ];

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const userA = await createUser(t, { roles: ["TEACHER"] });
    const userB = await createUser(t, { roles: ["TEACHER"] });
    teacherA = api(t, { cookie: await loginAs(t, userA) });
    teacherB = api(t, { cookie: await loginAs(t, userB) });
    const a = await createClassWithStudents(t, userA.id, { students: 0 });
    const b = await createClassWithStudents(t, userB.id, { students: 1 });
    classAId = a.schoolClass.id;
    classBId = b.schoolClass.id;
    const enrolled = await Promise.all(
      ["11110001", "11110002", "11110003", "11110004"].map(async (ra) => {
        const user = await createUser(t, { roles: ["STUDENT"], ra });
        await createEnrollment(t, classAId, user.id);
        return user;
      }),
    );
    [leader, member, free, absent] = enrolled as [TestUser, TestUser, TestUser, TestUser];
    leaderClient = api(t, { cookie: await loginAs(t, leader) });
    memberClient = api(t, { cookie: await loginAs(t, member) });
    freeClient = api(t, { cookie: await loginAs(t, free) });
    absentClient = api(t, { cookie: await loginAs(t, absent) });
    foreignClient = api(t, { cookie: await loginAs(t, b.students[0]!) });

    work = await createCodeWork(t, a.schoolClass, { releaseMode: "PRESENT_ONLY", groupSize: 3, executionMode: "CONTROLLED" });
    expect((await markPresent(teacherA, classAId, work.activity.id, [leader.id, member.id, free.id])).status).toBe(200);
    await seedHeartbeat(t, clock.now());
    expect((await startGroup(leaderClient, work.activity.id, [member.id])).status).toBe(200);
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: work.activity.id } })).id;
  });

  it("023 aluno de outra turma e aluno sem presença → o mesmo 404 em todas as rotas do grupo", async () => {
    for (const client of [foreignClient, absentClient]) {
      for (const route of studentRoutes(client, work.activity.id, member.id)) {
        const res = await route();
        expect([res.status, res.body.code], JSON.stringify(res.body)).toEqual([404, "NOT_FOUND"]);
      }
    }
    expect(await t.prisma.attemptParticipant.count({ where: { activityId: work.activity.id } })).toBe(2);
  });

  it("023 quem está na turma e fora do grupo não mexe no grupo: 409 sem nada mudar", async () => {
    for (const res of [await handEditing(freeClient, work.activity.id, member.id), await takeBackEditing(freeClient, work.activity.id), await returnEditing(freeClient, work.activity.id)]) {
      expect([404, 409]).toContain(res.status);
    }
    expect((await addMembers(freeClient, work.activity.id, [absent.id])).status).toBeGreaterThanOrEqual(400);
    const group = await t.prisma.attemptGroup.findUniqueOrThrow({ where: { attemptId } });
    expect(group).toMatchObject({ leaderUserId: leader.id, editorUserId: leader.id, version: 1 });
  });

  it("023 os fatos do grupo: professor B e tentativa de outra atividade → 404; outros papéis → 403", async () => {
    expect((await getAttemptGroup(teacherA, classAId, work.activity.id, attemptId)).status).toBe(200);
    expect((await getAttemptGroup(teacherB, classAId, work.activity.id, attemptId)).status).toBe(404);
    expect((await getAttemptGroup(teacherB, classBId, work.activity.id, attemptId)).status).toBe(404);
    const other = await createActivity(t, { id: classAId, teacherId: (await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classAId } })).teacherId }, {
      type: "ASSIGNMENT",
      releaseMode: "PRESENT_ONLY",
      groupSize: 2,
    });
    expect((await getAttemptGroup(teacherA, classAId, other.activity.id, attemptId)).status).toBe(404);
    expect((await getAttemptGroup(leaderClient, classAId, work.activity.id, attemptId)).status).toBe(403);
    const manager = await createUser(t, { roles: ["MANAGER"] });
    const admin = await createUser(t, { roles: ["ADMIN"] });
    for (const user of [manager, admin]) {
      const client = api(t, { cookie: await loginAs(t, user) });
      expect((await getAttemptGroup(client, classAId, work.activity.id, attemptId)).status).toBe(403);
    }
  });

  it("023 um integrante nunca lê eventos, pausa ou execuções de outro", async () => {
    const id = work.activity.id;
    expect((await recordEvents(memberClient, id, [integrityEvent("SCREEN_LEFT")])).status).toBeLessThan(300);
    const own = await getOwnIntegrity(memberClient, id);
    expect(own.body.events.length).toBeGreaterThan(0);
    expect((await getOwnIntegrity(leaderClient, id)).body.events).toEqual([]);

    expect((await requestRun(memberClient, id, work.questionIds[0]!, "print(1)")).status).toBe(202);
    expect((await getLatestRun(memberClient, id, work.questionIds[0]!)).body).not.toBeNull();
    const leaderRun = await getLatestRun(leaderClient, id, work.questionIds[0]!);
    expect(JSON.stringify(leaderRun.body)).not.toContain("print(1)");

    expect((await declareExit(memberClient, id, { reason: "WATER" })).status).toBe(201);
    expect((await getMyPause(memberClient, id)).body.pause).not.toBeNull();
    expect((await getMyPause(leaderClient, id)).body).toEqual({ pause: null });
    // The leader's own view stays open while the member is out.
    const leaderView = (await leaderClient.get(`/api/me/activities/${id}`)).body as StudentActivity;
    expect(leaderView.questions.length).toBeGreaterThan(0);
  });

  it("023 nenhuma resposta traz e-mail ou RA de colega", async () => {
    const id = work.activity.id;
    const responses = [
      await getCandidates(leaderClient, id),
      await leaderClient.get(`/api/me/activities/${id}`),
      await memberClient.get(`/api/me/activities/${id}`),
      await leaderClient.get("/api/me/activities"),
      await memberClient.get("/api/me/activities"),
      await addMembers(leaderClient, id, [free.id]),
      await handEditing(leaderClient, id, member.id),
    ];
    for (const res of responses) expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = JSON.stringify(responses.map((res) => res.body));
    expect(body).toContain(member.name);
    for (const colleague of [leader, member, free]) {
      expect(body).not.toContain(colleague.email);
    }
    expect(body).not.toMatch(/1111000[1-4]/);
    expect(body).not.toContain('"email"');
    expect(body).not.toContain('"ra"');
  });

  it("023 a turma inteira marcada não muda nada: o candidato de outra turma nunca aparece", async () => {
    await markAllPresent(teacherA, classAId, work.activity.id);
    const res = await getCandidates(leaderClient, work.activity.id);
    expect(res.status).toBe(200);
    expect(res.body.candidates.map((candidate: { id: string }) => candidate.id).sort()).toEqual([absent.id, free.id].sort());
  });
});
