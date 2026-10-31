import type { GroupCandidates, StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, startAttempt } from "../helpers/activities";
import { markPresent } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { applyGroupWork, getCandidates, startAlone, startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US2 — the student starts a group work and picks the members (023/FR-004–FR-008, research U3, U6):
 * the eligible classmates (same class, ACTIVE, present, not in any attempt of the work, never the caller)
 * by name; the start with `memberIds` creates the attempt, the participants and the group led and edited
 * by the caller, all or nothing under the activity's lock; `{ alone: true }` is an individual attempt.
 */

type Client = ReturnType<typeof api>;

describe("023/US2 aluno inicia e escolhe os integrantes", () => {
  let clock: FixedClock;
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let work: WorkFixture;
  /** Ana leads; Bruno, Carla and Davi are present classmates, by name. */
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;
  let davi: TestUser;
  const as: Record<string, Client> = {};

  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const student = async (name: string) => {
    const user = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, classId, user.id);
    as[user.id] = api(t, { cookie: await loginAs(t, user) });
    return user;
  };
  const groupWork = async (groupSize = 4) => {
    const res = await applyGroupWork(teacherClient, classId, work.id, groupSize);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  const candidatesOf = async (user: TestUser, activityId: string) => {
    const res = await getCandidates(as[user.id]!, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as GroupCandidates;
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
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    work = await createWork(t, teacher.id);
    classId = (await createClass(t, teacher.id, { subjectId: work.subjectId })).id;
    // Created out of name order: the list sorts them.
    carla = await student("Carla Dias");
    ana = await student("Ana Souza");
    davi = await student("Davi Rocha");
    bruno = await student("Bruno Lima");
  });

  it("023/US2-1 a lista: groupSize, vagas e os colegas elegíveis em ordem de nome, só id e nome", async () => {
    const activity = await groupWork(4);
    const body = await candidatesOf(ana, activity.id);
    expect(body).toEqual({
      groupSize: 4,
      freeSlots: 3,
      candidates: [
        { id: bruno.id, name: "Bruno Lima" },
        { id: carla.id, name: "Carla Dias" },
        { id: davi.id, name: "Davi Rocha" },
      ],
    });
  });

  it("023/US2-2 início com dois colegas: participantes, grupo liderado e editado pelo aluno, eventos", async () => {
    const activity = await groupWork(4);
    const res = await startGroup(as[ana.id]!, activity.id, [bruno.id, carla.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const view = res.body as StudentActivity;
    expect(view.attempt).not.toBeNull();
    expect(view.group).toEqual({
      groupSize: 4,
      leader: { id: ana.id, name: "Ana Souza" },
      members: [
        { id: ana.id, name: "Ana Souza" },
        { id: bruno.id, name: "Bruno Lima" },
        { id: carla.id, name: "Carla Dias" },
      ],
      editor: { id: ana.id, name: "Ana Souza" },
      myRole: "LEADER",
      canEdit: true,
      addedBy: null,
      freeSlots: 1,
      version: 1,
    });

    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id }, select: { id: true, studentUserId: true } });
    expect(attempt.studentUserId).toBe(ana.id);
    const participants = await t.prisma.attemptParticipant.findMany({
      where: { attemptId: attempt.id },
      orderBy: { studentUserId: "asc" },
      select: { studentUserId: true, addedByUserId: true },
    });
    expect(participants).toEqual(
      [
        { studentUserId: ana.id, addedByUserId: null },
        { studentUserId: bruno.id, addedByUserId: ana.id },
        { studentUserId: carla.id, addedByUserId: ana.id },
      ].sort((a, b) => a.studentUserId.localeCompare(b.studentUserId)),
    );
    expect(await t.prisma.attemptGroup.findUniqueOrThrow({ where: { attemptId: attempt.id }, select: { leaderUserId: true, editorUserId: true } })).toEqual({
      leaderUserId: ana.id,
      editorUserId: ana.id,
    });

    const [started] = await events("activity_attempt.started");
    expect(started).toMatchObject({ actorUserId: ana.id, targetId: attempt.id });
    expect(started!.metadata).toMatchObject({ activityId: activity.id, group: true, memberCount: 3 });
    const [created] = await events("activity_group.created");
    expect(created).toMatchObject({ actorUserId: ana.id, targetType: "ACTIVITY_ATTEMPT", targetId: attempt.id });
    expect(created!.metadata).toEqual({ activityId: activity.id, attemptId: attempt.id, memberCount: 3 });
    expect((await events("activity_group.member_added")).map((event) => event.metadata)).toEqual([
      { activityId: activity.id, attemptId: attempt.id, memberId: bruno.id },
      { activityId: activity.id, attemptId: attempt.id, memberId: carla.id },
    ]);

    // Every member reads the same attempt; the member's view says who added them.
    const asBruno = (await as[bruno.id]!.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
    expect(asBruno.attempt?.startedAt).toBe(view.attempt!.startedAt);
    expect(asBruno.group).toMatchObject({ myRole: "MEMBER", canEdit: false, addedBy: { id: ana.id, name: "Ana Souza" }, editor: { id: ana.id } });
  });

  describe("023/US2-3 escolha inválida → 400 sem criar nada", () => {
    it("nenhum colega, ids repetidos, mais que groupSize − 1, o próprio id", async () => {
      const activity = await groupWork(3);
      for (const memberIds of [[], [bruno.id, bruno.id], [bruno.id, carla.id, davi.id], [ana.id], [ana.id, bruno.id]]) {
        const res = await startGroup(as[ana.id]!, activity.id, memberIds);
        expect(res.status, JSON.stringify(memberIds)).toBe(400);
      }
      expect(await t.prisma.activityAttempt.count()).toBe(0);
      expect(await events("activity_group.created")).toEqual([]);
    });
  });

  describe("023/US2-4 continuar sozinho", () => {
    it("{ alone: true } é uma tentativa individual e o aluno some da lista dos colegas", async () => {
      const activity = await groupWork(3);
      const res = await startAlone(as[bruno.id]!, activity.id);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect((res.body as StudentActivity).group).toBeNull();
      expect((res.body as StudentActivity).attempt).not.toBeNull();
      expect(await t.prisma.attemptGroup.count()).toBe(0);
      const [started] = await events("activity_attempt.started");
      expect(started!.metadata).toMatchObject({ group: false, memberCount: 1 });
      expect((await candidatesOf(ana, activity.id)).candidates.map((candidate) => candidate.id)).toEqual([carla.id, davi.id]);
    });

    it("{} num trabalho em grupo → 400; memberIds ou alone num trabalho individual → 400", async () => {
      const group = await groupWork(3);
      expect((await startAttempt(as[ana.id]!, group.id)).status).toBe(400);
      const individual = (await applyWork(teacherClient, classId, work.id)).body as TeacherActivity;
      expect((await startGroup(as[ana.id]!, individual.id, [bruno.id])).status).toBe(400);
      expect((await startAlone(as[ana.id]!, individual.id)).status).toBe(400);
      expect(await t.prisma.activityAttempt.count()).toBe(0);
      // The individual work starts as before 023.
      const res = await startAttempt(as[ana.id]!, individual.id);
      expect(res.status).toBe(200);
      expect((res.body as StudentActivity).group).toBeNull();
      expect((await events("activity_attempt.started"))[0]!.metadata).not.toHaveProperty("group");
    });
  });

  it("023/US2-5 colega que começou depois da lista aberta → 409 GROUP_MEMBERS_UNAVAILABLE e nada criado", async () => {
    const activity = await groupWork(4);
    expect((await candidatesOf(ana, activity.id)).candidates).toHaveLength(3);
    expect((await startAlone(as[bruno.id]!, activity.id)).status).toBe(200);

    const res = await startGroup(as[ana.id]!, activity.id, [bruno.id, carla.id]);
    expect([res.status, res.body.code]).toEqual([409, "GROUP_MEMBERS_UNAVAILABLE"]);
    expect(res.body.details).toEqual({ unavailableIds: [bruno.id] });
    expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
    expect(await t.prisma.attemptParticipant.count({ where: { studentUserId: { in: [ana.id, carla.id] } } })).toBe(0);
    expect(await events("activity_group.created")).toEqual([]);
  });

  it("023/US2-6 a lista nunca traz o próprio aluno, ausentes, matrícula inativa, outra turma nem quem já participa", async () => {
    const activity = (await applyWork(teacherClient, classId, work.id, { groupSize: 5, attendance: "NONE" })).body as TeacherActivity;
    const absent = await student("Elisa Ausente");
    const removed = await student("Fábio Removido");
    const otherClass = await createClass(t, teacher.id, { subjectId: work.subjectId });
    const outsider = await createUser(t, { roles: ["STUDENT"], name: "Gabi de Outra Turma" });
    await createEnrollment(t, otherClass.id, outsider.id);
    expect((await markPresent(teacherClient, classId, activity.id, [ana.id, bruno.id, carla.id, davi.id, removed.id])).status).toBe(200);
    await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: removed.id }, data: { status: "REMOVED", removedAt: new Date() } });
    // Davi leads a group with Carla: neither is a candidate any more.
    expect((await startGroup(as[davi.id]!, activity.id, [carla.id])).status).toBe(200);

    const ids = (await candidatesOf(ana, activity.id)).candidates.map((candidate) => candidate.id);
    expect(ids).toEqual([bruno.id]);
    for (const excluded of [ana.id, absent.id, removed.id, outsider.id, carla.id, davi.id]) expect(ids).not.toContain(excluded);
  });

  describe("023/FR-008 um grupo por aluno e trabalho", () => {
    it("repetir o início com membros → 200 com a mesma tentativa, nada novo", async () => {
      const activity = await groupWork(4);
      const first = (await startGroup(as[ana.id]!, activity.id, [bruno.id])).body as StudentActivity;
      const again = await startGroup(as[ana.id]!, activity.id, [carla.id]);
      expect(again.status).toBe(200);
      expect((again.body as StudentActivity).attempt?.startedAt).toBe(first.attempt!.startedAt);
      expect((again.body as StudentActivity).group?.members.map((member) => member.id)).toEqual([ana.id, bruno.id]);
      // A member who "starts" lands in the group's attempt (023/FR-010).
      expect(((await startGroup(as[bruno.id]!, activity.id, [davi.id])).body as StudentActivity).group?.leader.id).toBe(ana.id);
      expect(await t.prisma.activityAttempt.count()).toBe(1);
      expect(await t.prisma.attemptParticipant.count()).toBe(2);
      expect(await events("activity_group.created")).toHaveLength(1);
    });

    it("quem já participa pede a lista → 409 GROUP_ALREADY_JOINED; trabalho individual → 404", async () => {
      const activity = await groupWork(4);
      await startGroup(as[ana.id]!, activity.id, [bruno.id]);
      expect((await getCandidates(as[bruno.id]!, activity.id)).body.code).toBe("GROUP_ALREADY_JOINED");
      await startAlone(as[carla.id]!, activity.id);
      const res = await getCandidates(as[carla.id]!, activity.id);
      expect([res.status, res.body.code]).toEqual([409, "GROUP_ALREADY_JOINED"]);
      // The leader still reads the list, with the slots left.
      expect(await candidatesOf(ana, activity.id)).toMatchObject({ freeSlots: 2, candidates: [{ id: davi.id }] });
      const individual = (await applyWork(teacherClient, classId, work.id)).body as TeacherActivity;
      expect((await getCandidates(as[ana.id]!, individual.id)).status).toBe(404);
    });
  });
});
