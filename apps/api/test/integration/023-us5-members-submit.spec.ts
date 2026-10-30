import { endpoints, type Answer, type StudentActivity, type TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { acceptSubmission, applyWork, gradeAttempt, releaseResult, saveAnswers, submitAttempt } from "../helpers/activities";
import { FixedClock, HOUR } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, handEditing, startAlone, startGroup, takeBackEditing } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US5 — the leader adds members up to the maximum and submits for the group (023/FR-016–FR-018,
 * research U6): `POST …/group/members` under the activity's group lock, all or nothing (`409 GROUP_FULL`,
 * `GROUP_MEMBERS_UNAVAILABLE`), only by the leader (`409 GROUP_NOT_LEADER`) and only while the attempt is in
 * progress; the leader's submission, holding the editing, is the group's, with `submitted_by_user_id`; the
 * teacher's acceptance and the released result reach every member as in 012.
 */

type Client = ReturnType<typeof api>;

const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });
const text = (value: string): Answer => ({ kind: "TEXT", text: value });

describe("023/US5 líder inclui integrantes e entrega pelo grupo", () => {
  let clock: FixedClock;
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let work: WorkFixture;
  /** Ana leads Bruno; Carla, Davi and Eva are present classmates outside the group. */
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;
  let davi: TestUser;
  let eva: TestUser;
  const as: Record<string, Client> = {};

  const student = async (name: string) => {
    const user = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, classId, user.id);
    as[user.id] = api(t, { cookie: await loginAs(t, user) });
    return user;
  };
  const read = async (user: TestUser, activityId: string) => {
    const res = await as[user.id]!.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  /** A group work of `groupSize` led by Ana with Bruno. */
  const startedGroup = async (overrides: Record<string, unknown> = {}) => {
    const created = await applyWork(teacherClient, classId, work.id, { groupSize: 4, ...overrides });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const activity = created.body as TeacherActivity;
    const res = await startGroup(as[ana.id]!, activity.id, [bruno.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const questions = (res.body as StudentActivity).questions;
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id }, select: { id: true } });
    return { activity, questions, attemptId: attempt.id };
  };
  const participants = (attemptId: string) =>
    t.prisma.attemptParticipant.findMany({
      where: { attemptId },
      orderBy: [{ joinedAt: "asc" }, { studentUserId: "asc" }],
      select: { studentUserId: true, addedByUserId: true },
    });
  const audits = (type: string) =>
    t.prisma.auditEvent.findMany({ where: { type }, orderBy: { occurredAt: "asc" }, select: { actorType: true, actorUserId: true, metadata: true } });

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
    work = await createWork(t, teacher.id, { questions: [{ type: "MULTIPLE_CHOICE" }, { type: "OPEN_ANSWER" }] });
    classId = (await createClass(t, teacher.id, { subjectId: work.subjectId })).id;
    ana = await student("Ana Souza");
    bruno = await student("Bruno Lima");
    carla = await student("Carla Dias");
    davi = await student("Davi Rocha");
    eva = await student("Eva Nunes");
  });

  it("023/US5-1 o líder inclui elegíveis até o máximo: participações com added_by = líder e member_added por integrante", async () => {
    const { activity, attemptId } = await startedGroup();
    const res = await addMembers(as[ana.id]!, activity.id, [carla.id, davi.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as StudentActivity).group).toMatchObject({ freeSlots: 0, myRole: "LEADER" });
    expect((res.body as StudentActivity).group!.members.map((member) => member.id)).toEqual(expect.arrayContaining([ana.id, bruno.id, carla.id, davi.id]));

    const rows = await participants(attemptId);
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.studentUserId === carla.id || row.studentUserId === davi.id)).toEqual(
      expect.arrayContaining([
        { studentUserId: carla.id, addedByUserId: ana.id },
        { studentUserId: davi.id, addedByUserId: ana.id },
      ]),
    );
    const added = (await audits("activity_group.member_added")).filter((event) => (event.metadata as { memberId: string }).memberId !== bruno.id);
    expect(added).toEqual(
      expect.arrayContaining([
        { actorType: "USER", actorUserId: ana.id, metadata: { activityId: activity.id, attemptId, memberId: carla.id } },
        { actorType: "USER", actorUserId: ana.id, metadata: { activityId: activity.id, attemptId, memberId: davi.id } },
      ]),
    );
    expect(added).toHaveLength(2);

    // The new member sees the group and who added them (FR-009).
    expect((await read(carla, activity.id)).group).toMatchObject({ myRole: "MEMBER", addedBy: { id: ana.id, name: "Ana Souza" }, leader: { id: ana.id } });
  });

  it("023/US5-1 a lista de candidatos do líder já não traz os incluídos e as vagas diminuem", async () => {
    const { activity } = await startedGroup();
    expect((await addMembers(as[ana.id]!, activity.id, [carla.id])).status).toBe(200);
    const res = await as[ana.id]!.get(`/api/me/activities/${activity.id}/group/candidates`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ groupSize: 4, freeSlots: 1 });
    expect(res.body.candidates.map((candidate: { id: string }) => candidate.id)).toEqual([davi.id, eva.id]);
  });

  it("023/US5-2 além do máximo → 409 GROUP_FULL, nada é incluído, write_refused FULL", async () => {
    const { activity, attemptId } = await startedGroup();
    const res = await addMembers(as[ana.id]!, activity.id, [carla.id, davi.id, eva.id]);
    expect([res.status, res.body.code]).toEqual([409, "GROUP_FULL"]);
    expect(await participants(attemptId)).toHaveLength(2);
    expect((await audits("activity_group.write_refused")).map((event) => event.metadata)).toEqual([
      { activityId: activity.id, attemptId, operation: "ADD_MEMBERS", reason: "FULL" },
    ]);

    expect((await addMembers(as[ana.id]!, activity.id, [carla.id, davi.id])).status).toBe(200);
    const full = await addMembers(as[ana.id]!, activity.id, [eva.id]);
    expect([full.status, full.body.code]).toEqual([409, "GROUP_FULL"]);
    expect(await participants(attemptId)).toHaveLength(4);
  });

  it("023/US5-1 um colega que já participa ou não está presente → 409 GROUP_MEMBERS_UNAVAILABLE com os ids, nada é incluído", async () => {
    const { activity, attemptId } = await startedGroup();
    expect((await startAlone(as[eva.id]!, activity.id)).status).toBe(200);
    await t.prisma.activityAttendance.deleteMany({ where: { activityId: activity.id, studentUserId: davi.id } });
    const res = await addMembers(as[ana.id]!, activity.id, [carla.id, davi.id]);
    expect([res.status, res.body.code]).toEqual([409, "GROUP_MEMBERS_UNAVAILABLE"]);
    expect(res.body.details).toEqual({ unavailableIds: [davi.id] });
    const solo = await addMembers(as[ana.id]!, activity.id, [eva.id]);
    expect([solo.status, solo.body.code]).toEqual([409, "GROUP_MEMBERS_UNAVAILABLE"]);
    expect(solo.body.details).toEqual({ unavailableIds: [eva.id] });
    expect(await participants(attemptId)).toHaveLength(2);
    expect((await audits("activity_group.write_refused")).map((event) => (event.metadata as { reason: string }).reason)).toEqual([
      "MEMBERS_UNAVAILABLE",
      "MEMBERS_UNAVAILABLE",
    ]);
  });

  it("023/US5-3 incluir ou entregar por um integrante → 409 GROUP_NOT_LEADER, auditado", async () => {
    const { activity, attemptId } = await startedGroup();
    const add = await addMembers(as[bruno.id]!, activity.id, [carla.id]);
    expect([add.status, add.body.code]).toEqual([409, "GROUP_NOT_LEADER"]);
    expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
    const submit = await submitAttempt(as[bruno.id]!, activity.id);
    expect([submit.status, submit.body.code]).toEqual([409, "GROUP_NOT_LEADER"]);
    expect(await participants(attemptId)).toHaveLength(2);
    expect((await audits("activity_group.write_refused")).map((event) => event.metadata)).toEqual([
      { activityId: activity.id, attemptId, operation: "ADD_MEMBERS", reason: "NOT_LEADER" },
      { activityId: activity.id, attemptId, operation: "SUBMIT", reason: "NOT_LEADER" },
    ]);
  });

  it("023/US5-4 a entrega do líder com a edição fica entregue para todos, com submitted_by e submittedById; sem a edição → GROUP_NOT_EDITOR", async () => {
    const deadline = new Date(clock.now().getTime() + HOUR).toISOString();
    const { activity, attemptId, questions } = await startedGroup({ deadline, latePolicy: "ACCEPT_MARKED" });
    expect((await addMembers(as[ana.id]!, activity.id, [carla.id])).status).toBe(200);
    expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
    const withoutEditing = await submitAttempt(as[ana.id]!, activity.id);
    expect([withoutEditing.status, withoutEditing.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(0);

    expect((await takeBackEditing(as[ana.id]!, activity.id)).status).toBe(200);
    clock.advance(2 * HOUR); // past the deadline under ACCEPT_MARKED: late (012).
    const res = await submitAttempt(as[ana.id]!, activity.id, [{ questionId: questions[0]!.id, answer: choice(questions[0]!.alternatives[0]!.id), baseRevision: 0 }]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const submission = await t.prisma.activitySubmission.findUniqueOrThrow({
      where: { attemptId },
      select: { id: true, submittedAt: true, late: true, submittedByUserId: true, acceptedById: true },
    });
    expect(submission).toMatchObject({ submittedAt: clock.now(), late: true, submittedByUserId: ana.id, acceptedById: null });
    expect(await audits("activity_submission.created")).toEqual([
      {
        actorType: "USER",
        actorUserId: ana.id,
        metadata: expect.objectContaining({ activityId: activity.id, attemptId, late: true, submittedById: ana.id }),
      },
    ]);

    for (const member of [ana, bruno, carla]) {
      const view = await read(member, activity.id);
      expect(view).toMatchObject({ status: "SUBMITTED", submission: { submittedAt: clock.now().toISOString(), late: true } });
    }
    // Nobody edits after the submission.
    const save = await saveAnswers(as[ana.id]!, activity.id, [{ questionId: questions[1]!.id, answer: text("depois"), baseRevision: 0 }]);
    expect(save.status).toBe(409);
  });

  it("023/FR-016 incluir depois da entrega → 409 INVALID_STATE_TRANSITION", async () => {
    const { activity, attemptId } = await startedGroup();
    expect((await submitAttempt(as[ana.id]!, activity.id)).status).toBe(200);
    const res = await addMembers(as[ana.id]!, activity.id, [carla.id]);
    expect([res.status, res.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
    expect(await participants(attemptId)).toHaveLength(2);
  });

  it("023/FR-018 o \"Aceitar como entrega\" do professor numa tentativa de grupo vale para todos os integrantes", async () => {
    const deadline = new Date(clock.now().getTime() + HOUR).toISOString();
    const { activity, attemptId, questions } = await startedGroup({ deadline, latePolicy: "REJECT" });
    const saved = await saveAnswers(as[ana.id]!, activity.id, [{ questionId: questions[0]!.id, answer: choice(questions[0]!.alternatives[0]!.id), baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    clock.advance(2 * HOUR);
    const res = await acceptSubmission(teacherClient, classId, activity.id, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(await t.prisma.activitySubmission.findUniqueOrThrow({ where: { attemptId }, select: { submittedByUserId: true, acceptedById: true } })).toEqual({
      submittedByUserId: null,
      acceptedById: teacher.id,
    });
    for (const member of [ana, bruno]) {
      expect(await read(member, activity.id)).toMatchObject({ status: "SUBMITTED", submission: { acceptedByTeacher: true } });
    }
  });

  it("023/US5-5 023/SC-006 cada integrante lê a mesma nota e o mesmo retorno, só depois da liberação e com notas.proprias.visualizar", async () => {
    const { activity, attemptId, questions } = await startedGroup();
    expect((await addMembers(as[ana.id]!, activity.id, [carla.id])).status).toBe(200);
    const [choiceQuestion, openQuestion] = questions;
    expect(
      (
        await submitAttempt(as[ana.id]!, activity.id, [
          { questionId: choiceQuestion!.id, answer: choice(choiceQuestion!.alternatives[0]!.id), baseRevision: 0 },
          { questionId: openQuestion!.id, answer: text("Encapsulamento protege o estado."), baseRevision: 0 },
        ])
      ).status,
    ).toBe(200);
    const graded = await gradeAttempt(teacherClient, classId, activity.id, attemptId, {
      version: 1,
      decisions: [{ questionId: openQuestion!.id, grade: "0.40", feedback: "Quase completo." }],
      generalFeedback: "Bom trabalho do grupo.",
    });
    expect(graded.status, JSON.stringify(graded.body)).toBe(200);
    for (const member of [ana, bruno, carla]) expect((await read(member, activity.id)).result).toBeNull();

    expect((await releaseResult(teacherClient, classId, activity.id)).status).toBe(200);
    const results = await Promise.all([ana, bruno, carla].map(async (member) => (await read(member, activity.id)).result));
    expect(results[0]).toMatchObject({ grade: "0.90", generalFeedback: "Bom trabalho do grupo." });
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);

    const grant = await t.prisma.rolePermission.findFirstOrThrow({
      where: { role: { key: "STUDENT" }, permission: { key: "notas.proprias.visualizar" } },
    });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
    try {
      for (const member of [ana, bruno, carla]) expect((await read(member, activity.id)).result).toBeNull();
    } finally {
      await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
    }
  });

  it("023/US5-6 não existe rota de sair do grupo nem de remover integrante", () => {
    const groupRoutes = Object.values(endpoints)
      .filter((endpoint) => endpoint.path.includes("/group"))
      .map((endpoint) => `${endpoint.method} ${endpoint.path}`);
    expect(groupRoutes).toEqual(
      expect.arrayContaining([
        "GET /me/activities/:activityId/group/candidates",
        "POST /me/activities/:activityId/group/members",
        "POST /me/activities/:activityId/group/editing",
      ]),
    );
    // Besides those, only the teacher's read of a group attempt (US6), never a leave or a removal.
    const others = groupRoutes.filter((route) => !route.startsWith("POST /me/") && !route.startsWith("GET /me/"));
    expect(others.every((route) => route === "GET /classes/:classId/activities/:activityId/attempts/:attemptId/group")).toBe(true);
    expect(groupRoutes.some((route) => /DELETE|PATCH|leave|remove|sair|remover/i.test(route))).toBe(false);
  });
});
