import type { Answer, GroupCandidates, Room, StudentActivity, StudentActivitySummary, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, saveAnswers, startAttempt } from "../helpers/activities";
import { getRoom } from "../helpers/attendance";
import { FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { applyGroupWork, getCandidates, startAlone, startGroup } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US3 — the members take part and whoever is already in a group is told so (023/FR-009, FR-010,
 * research U5): a member reads the group's attempt and answers (with who saved each), never starts the
 * work again, sees it in "Minhas atividades" with the group attempt's situation, and the teacher's room and
 * roster show every member with that attempt. Outside the group, nothing of it reaches anyone.
 */

type Client = ReturnType<typeof api>;

const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });

describe("023/US3 integrantes participam e quem já está num grupo é avisado", () => {
  let clock: FixedClock;
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let work: WorkFixture;
  /** Ana leads Bruno and Carla; Davi is a present classmate outside the group. */
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;
  let davi: TestUser;
  const as: Record<string, Client> = {};

  const student = async (name: string, inClass = classId) => {
    const user = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, inClass, user.id);
    as[user.id] = api(t, { cookie: await loginAs(t, user) });
    return user;
  };
  const read = async (user: TestUser, activityId: string) => {
    const res = await as[user.id]!.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  /** A group work of 4 led by Ana with Bruno and Carla, with Ana's answer to its question saved. */
  const startedGroup = async (overrides: { deadline?: string } = {}) => {
    const created = await applyWork(teacherClient, classId, work.id, { groupSize: 4, ...overrides });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const activity = created.body as TeacherActivity;
    const res = await startGroup(as[ana.id]!, activity.id, [bruno.id, carla.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const view = res.body as StudentActivity;
    const question = view.questions[0]!;
    const alternativeId = question.alternatives[0]!.id;
    const saved = await saveAnswers(as[ana.id]!, activity.id, [{ questionId: question.id, answer: choice(alternativeId), baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id }, select: { id: true } });
    return { activity, questionId: question.id, alternativeId, attemptId: attempt.id };
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
    ana = await student("Ana Souza");
    bruno = await student("Bruno Lima");
    carla = await student("Carla Dias");
    davi = await student("Davi Rocha");
  });

  it("023/US3-1 o integrante lê o grupo, a tentativa e as respostas do grupo com quem salvou", async () => {
    const { activity, questionId, alternativeId } = await startedGroup();
    const asAna = await read(ana, activity.id);
    const asBruno = await read(bruno, activity.id);

    expect(asBruno.group).toEqual({
      groupSize: 4,
      leader: { id: ana.id, name: "Ana Souza" },
      members: [
        { id: ana.id, name: "Ana Souza" },
        { id: bruno.id, name: "Bruno Lima" },
        { id: carla.id, name: "Carla Dias" },
      ],
      editor: { id: ana.id, name: "Ana Souza" },
      myRole: "MEMBER",
      canEdit: false,
      addedBy: { id: ana.id, name: "Ana Souza" },
      freeSlots: 1,
      version: 1,
    });
    expect(asBruno.attempt).toEqual(asAna.attempt);
    expect(asBruno.attempt?.answers).toEqual([
      { questionId, answer: choice(alternativeId), revision: 1, savedBy: { id: ana.id, name: "Ana Souza" } },
    ]);
    // Only ids and names: no e-mail of a classmate reaches the member.
    expect(JSON.stringify(asBruno)).not.toContain(ana.email);
  });

  describe("023/US3-2 o integrante não inicia o trabalho de novo", () => {
    it("com ou sem membros, de duas abas ao mesmo tempo → 200 com a tentativa do grupo, nada novo", async () => {
      const { activity } = await startedGroup();
      const before = await t.prisma.auditEvent.count();
      const results = await Promise.all([
        startGroup(as[bruno.id]!, activity.id, [davi.id]),
        startAlone(as[bruno.id]!, activity.id),
        startGroup(as[bruno.id]!, activity.id, [davi.id]),
      ]);
      for (const res of results) {
        expect(res.status, JSON.stringify(res.body)).toBe(200);
        expect((res.body as StudentActivity).group).toMatchObject({ leader: { id: ana.id }, myRole: "MEMBER" });
      }
      expect(await t.prisma.activityAttempt.count({ where: { activityId: activity.id } })).toBe(1);
      expect(await t.prisma.attemptParticipant.count({ where: { activityId: activity.id } })).toBe(3);
      expect(await t.prisma.attemptParticipant.count({ where: { studentUserId: davi.id } })).toBe(0);
      expect(await t.prisma.auditEvent.count()).toBe(before);
    });

    it("a lista de candidatos pedida pelo integrante → 409 GROUP_ALREADY_JOINED", async () => {
      const { activity } = await startedGroup();
      const res = await getCandidates(as[bruno.id]!, activity.id);
      expect([res.status, res.body.code]).toEqual([409, "GROUP_ALREADY_JOINED"]);
      expect(res.body).not.toHaveProperty("candidates");
    });
  });

  it("023/US3-3 \"Minhas atividades\" do integrante: a situação da tentativa do grupo e o tamanho do grupo", async () => {
    const { activity } = await startedGroup();
    const individual = (await applyWork(teacherClient, classId, work.id)).body as TeacherActivity;
    const res = await as[bruno.id]!.get("/api/me/activities");
    expect(res.status).toBe(200);
    const items = (res.body as { items: StudentActivitySummary[] }).items;
    const group = items.find((item) => item.id === activity.id)!;
    expect(group).toMatchObject({ status: "IN_PROGRESS", groupSize: 4 });
    // An individual work's summary reads as before 023 (SC-007).
    expect(items.find((item) => item.id === individual.id)).not.toHaveProperty("groupSize");
    // Davi, outside the group, still sees the work not started.
    const daviItems = ((await as[davi.id]!.get("/api/me/activities")).body as { items: StudentActivitySummary[] }).items;
    expect(daviItems.find((item) => item.id === activity.id)).toMatchObject({ status: "PENDING", groupSize: 4 });
  });

  describe("023/FR-010 fora do grupo nada da tentativa do grupo chega", () => {
    it("um colega da turma lê o trabalho sem tentativa, grupo nem respostas; um aluno de outra turma recebe 404", async () => {
      const { activity, questionId, alternativeId } = await startedGroup();
      const asDavi = await read(davi, activity.id);
      expect([asDavi.attempt, asDavi.group]).toEqual([null, null]);
      // His own writes stay his: there is no attempt of his to write to.
      const save = await saveAnswers(as[davi.id]!, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 1 }]);
      expect([save.status, save.body.code]).toEqual([409, "NOT_STARTED"]);

      const otherClass = await createClass(t, teacher.id, { subjectId: work.subjectId });
      const outsider = await student("Gabi de Outra Turma", otherClass.id);
      const client = as[outsider.id]!;
      const base = `/api/me/activities/${activity.id}`;
      for (const res of [
        await client.get(base),
        await client.get(`${base}/group/candidates`),
        await client.post(`${base}/attempt`, { alone: true }),
        await client.put(`${base}/attempt/answers`, { answers: [{ questionId, answer: choice(alternativeId), baseRevision: 1 }] }),
        await client.post(`${base}/attempt/submit`, { answers: [] }),
        await client.get(`${base}/attempt/help`),
        await client.get(`${base}/attempt/integrity`),
      ]) {
        expect([res.status, res.body.code], JSON.stringify(res.body)).toEqual([404, "NOT_FOUND"]);
      }
      expect(await t.prisma.activityAnswer.count({ where: { activityId: activity.id } })).toBe(1);
    });
  });

  it("023/FR-009 a chamada e a lista de entregas do professor mostram o integrante com a tentativa do grupo", async () => {
    const { activity, attemptId } = await startedGroup();
    const room = (await getRoom(teacherClient, classId, activity.id)).body as Room;
    const roomOf = (id: string) => room.students.find((entry) => entry.studentUserId === id)!;
    for (const member of [ana, bruno, carla]) expect(roomOf(member.id)).toMatchObject({ roomStatus: "ANSWERING", attemptId });
    expect(roomOf(davi.id)).toMatchObject({ roomStatus: "PRESENT", attemptId: null });

    const detail = (await teacherClient.get(`/api/classes/${classId}/activities/${activity.id}`)).body as TeacherActivity;
    const rosterOf = (id: string) => detail.roster.find((entry) => entry.studentUserId === id)!;
    for (const member of [ana, bruno, carla]) expect(rosterOf(member.id)).toMatchObject({ status: "IN_PROGRESS", attemptId });
    expect(rosterOf(davi.id)).toMatchObject({ status: "NOT_STARTED", attemptId: null });
  });

  describe("023/FR-005 a lista de candidatos segue a regra de início da 012", () => {
    it("trabalho encerrado → 409 ACTIVITY_CLOSED, sem a lista", async () => {
      const activity = (await applyGroupWork(teacherClient, classId, work.id, 3)).body as TeacherActivity;
      expect((await teacherClient.post(`/api/classes/${classId}/activities/${activity.id}/close`, {})).status).toBe(200);
      const res = await getCandidates(as[ana.id]!, activity.id);
      expect([res.status, res.body.code]).toEqual([409, "ACTIVITY_CLOSED"]);
      expect(res.body).not.toHaveProperty("candidates");
    });

    it("prazo vencido sem entrega atrasada → 409 DEADLINE_PASSED; com entrega atrasada a lista continua", async () => {
      const deadline = new Date(clock.now().getTime() + HOUR).toISOString();
      const rejecting = (await applyWork(teacherClient, classId, work.id, { groupSize: 3, deadline, latePolicy: "REJECT" })).body as TeacherActivity;
      const accepting = (await applyWork(teacherClient, classId, work.id, { groupSize: 3, deadline, latePolicy: "ACCEPT_MARKED" })).body as TeacherActivity;
      clock.advance(2 * HOUR);
      const refused = await getCandidates(as[ana.id]!, rejecting.id);
      expect([refused.status, refused.body.code]).toEqual([409, "DEADLINE_PASSED"]);
      expect(refused.body).not.toHaveProperty("candidates");
      const open = await getCandidates(as[ana.id]!, accepting.id);
      expect(open.status, JSON.stringify(open.body)).toBe(200);
      expect((open.body as GroupCandidates).candidates.map((candidate) => candidate.id)).toEqual([bruno.id, carla.id, davi.id]);
    });

    it("um trabalho individual continua começando como antes", async () => {
      const individual = (await applyWork(teacherClient, classId, work.id)).body as TeacherActivity;
      const res = await startAttempt(as[ana.id]!, individual.id);
      expect(res.status).toBe(200);
      expect((res.body as StudentActivity).attempt?.answers).toEqual([]);
    });
  });
});
