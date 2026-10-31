import type { Answer, StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, saveAnswers, submitAttempt } from "../helpers/activities";
import { pauseStudent } from "../helpers/attendance";
import { FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { handEditing, returnEditing, startGroup, takeBackEditing } from "../helpers/group-work";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US4 — one member edits at a time and the leader hands the editing over (023/FR-012, FR-013,
 * FR-015, FR-023, research U7–U9): HAND and TAKE_BACK by the leader, RETURN by the member who edits, one
 * `attempt_group_events` row and one `activity_group.editing_changed` per applied change; only the
 * editor saves (`409 GROUP_NOT_EDITOR`, `activity_group.write_refused`), every accepted save logged in
 * `activity_answer_saves`; after the end nothing moves; the settlement gives the editing back to the
 * leader when the editor is paused and the leadership to the first active member when the leader leaves.
 */

type Client = ReturnType<typeof api>;

const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });

describe("023/US4 um integrante edita por vez e o líder passa a edição", () => {
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
  /** A group work of 4 led by Ana with Bruno and Carla. */
  const startedGroup = async (overrides: Record<string, unknown> = {}) => {
    const created = await applyWork(teacherClient, classId, work.id, { groupSize: 4, ...overrides });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const activity = created.body as TeacherActivity;
    const res = await startGroup(as[ana.id]!, activity.id, [bruno.id, carla.id]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const question = (res.body as StudentActivity).questions[0]!;
    const [first, second] = question.alternatives;
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id }, select: { id: true } });
    return { activity, questionId: question.id, first: first!.id, second: second!.id, attemptId: attempt.id };
  };
  const groupRow = (attemptId: string) =>
    t.prisma.attemptGroup.findUniqueOrThrow({ where: { attemptId }, select: { leaderUserId: true, editorUserId: true, version: true } });
  const events = (attemptId: string) =>
    t.prisma.attemptGroupEvent.findMany({
      where: { attemptId },
      orderBy: { occurredAt: "asc" },
      select: { kind: true, reason: true, actorUserId: true, fromUserId: true, toUserId: true },
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
    work = await createWork(t, teacher.id);
    classId = (await createClass(t, teacher.id, { subjectId: work.subjectId })).id;
    ana = await student("Ana Souza");
    bruno = await student("Bruno Lima");
    carla = await student("Carla Dias");
    davi = await student("Davi Rocha");
  });

  it("023/US4-1 o líder passa a edição para B: B edita, version +1, um evento e uma auditoria; A e C veem B", async () => {
    const { activity, attemptId } = await startedGroup();
    const res = await handEditing(as[ana.id]!, activity.id, bruno.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as StudentActivity).group).toMatchObject({ editor: { id: bruno.id, name: "Bruno Lima" }, canEdit: false, version: 2 });

    expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: bruno.id, version: 2 });
    expect(await events(attemptId)).toEqual([
      { kind: "EDITING_HANDED", reason: null, actorUserId: ana.id, fromUserId: ana.id, toUserId: bruno.id },
    ]);
    expect(await audits("activity_group.editing_changed")).toEqual([
      {
        actorType: "USER",
        actorUserId: ana.id,
        metadata: { activityId: activity.id, attemptId, kind: "EDITING_HANDED", reason: null, fromUserId: ana.id, toUserId: bruno.id },
      },
    ]);
    for (const reader of [ana, carla]) {
      expect((await read(reader, activity.id)).group).toMatchObject({ editor: { id: bruno.id, name: "Bruno Lima" }, canEdit: false });
    }
    expect((await read(bruno, activity.id)).group).toMatchObject({ editor: { id: bruno.id }, canEdit: true, myRole: "MEMBER" });
  });

  it("023/US4-2 o líder retoma: A edita; o salvamento atrasado de B → 409 GROUP_NOT_EDITOR, nada muda, write_refused", async () => {
    const { activity, attemptId, questionId, first, second } = await startedGroup();
    expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
    const saved = await saveAnswers(as[bruno.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    const back = await takeBackEditing(as[ana.id]!, activity.id);
    expect(back.status, JSON.stringify(back.body)).toBe(200);
    expect((back.body as StudentActivity).group).toMatchObject({ editor: { id: ana.id }, canEdit: true, version: 3 });
    // What Bruno saved stays.
    expect((back.body as StudentActivity).attempt?.answers).toEqual([
      { questionId, answer: choice(first), revision: 1, savedBy: { id: bruno.id, name: "Bruno Lima" } },
    ]);

    const late = await saveAnswers(as[bruno.id]!, activity.id, [{ questionId, answer: choice(second), baseRevision: 1 }]);
    expect([late.status, late.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    const answer = await t.prisma.activityAnswer.findFirstOrThrow({ where: { attemptId }, select: { alternativeId: true, revision: true, savedByUserId: true } });
    expect(answer).toEqual({ alternativeId: first, revision: 1, savedByUserId: bruno.id });
    expect((await events(attemptId)).map((row) => row.kind)).toEqual(["EDITING_HANDED", "EDITING_TAKEN_BACK"]);
    expect(await audits("activity_group.write_refused")).toEqual([
      {
        actorType: "USER",
        actorUserId: bruno.id,
        metadata: { activityId: activity.id, attemptId, operation: "SAVE", reason: "NOT_EDITOR" },
      },
    ]);
  });

  it("023/US4-3 023/SC-003 só quem edita salva: pedido direto ou outra aba → 409; cada revisão aceita registra o aluno", async () => {
    const { activity, attemptId, questionId, first, second } = await startedGroup();
    // Carla, who isn't editing, from another tab or a direct request: refused, nothing written.
    for (const user of [carla, bruno]) {
      const res = await saveAnswers(as[user.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }]);
      expect([res.status, res.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    }
    expect(await t.prisma.activityAnswer.count({ where: { attemptId } })).toBe(0);
    expect(await t.prisma.activityAnswerSave.count({ where: { attemptId } })).toBe(0);

    expect((await saveAnswers(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }])).status).toBe(200);
    expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
    clock.advance(MINUTE);
    expect((await saveAnswers(as[bruno.id]!, activity.id, [{ questionId, answer: choice(second), baseRevision: 1 }])).status).toBe(200);
    // The leader, now reading, is refused too.
    const leader = await saveAnswers(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 2 }]);
    expect([leader.status, leader.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);

    const saves = await t.prisma.activityAnswerSave.findMany({ where: { attemptId }, orderBy: { revision: "asc" }, select: { revision: true, studentUserId: true } });
    expect(saves).toEqual([
      { revision: 1, studentUserId: ana.id },
      { revision: 2, studentUserId: bruno.id },
    ]);
    // A submit by a member is the leader's alone.
    const submit = await submitAttempt(as[bruno.id]!, activity.id);
    expect([submit.status, submit.body.code]).toEqual([409, "GROUP_NOT_LEADER"]);
    // The leader must hold the editing to submit.
    const leaderSubmit = await submitAttempt(as[ana.id]!, activity.id);
    expect([leaderSubmit.status, leaderSubmit.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    expect(await t.prisma.activitySubmission.count({ where: { attemptId } })).toBe(0);
  });

  it("023/US4-4 quem edita devolve: o líder volta a editar; devolver pelo líder ou por quem só lê → 409", async () => {
    const { activity, attemptId } = await startedGroup();
    const notYet = await returnEditing(as[ana.id]!, activity.id);
    expect([notYet.status, notYet.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
    for (const user of [ana, carla]) {
      const res = await returnEditing(as[user.id]!, activity.id);
      expect([res.status, res.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    }
    const res = await returnEditing(as[bruno.id]!, activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((res.body as StudentActivity).group).toMatchObject({ editor: { id: ana.id }, canEdit: false });
    expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: ana.id, version: 3 });
    expect(await events(attemptId)).toEqual([
      { kind: "EDITING_HANDED", reason: null, actorUserId: ana.id, fromUserId: ana.id, toUserId: bruno.id },
      { kind: "EDITING_RETURNED", reason: null, actorUserId: bruno.id, fromUserId: bruno.id, toUserId: ana.id },
    ]);
    const refusals = (await audits("activity_group.write_refused")).map((row) => [row.actorUserId, row.metadata]);
    expect(refusals).toEqual([
      [ana.id, { activityId: activity.id, attemptId, operation: "EDITING", reason: "NOT_EDITOR" }],
      [ana.id, { activityId: activity.id, attemptId, operation: "EDITING", reason: "NOT_EDITOR" }],
      [carla.id, { activityId: activity.id, attemptId, operation: "EDITING", reason: "NOT_EDITOR" }],
    ]);
  });

  it("023/US4-5 dois HAND simultâneos → um só editor, uma linha por mudança aplicada; HAND para quem já edita → 200 sem linha", async () => {
    const { activity, attemptId } = await startedGroup();
    const results = await Promise.all([handEditing(as[ana.id]!, activity.id, bruno.id), handEditing(as[ana.id]!, activity.id, carla.id)]);
    for (const res of results) expect(res.status, JSON.stringify(res.body)).toBe(200);
    const group = await groupRow(attemptId);
    expect([bruno.id, carla.id]).toContain(group.editorUserId);
    const rows = await events(attemptId);
    expect(group.version).toBe(1 + rows.length);
    // Each applied change is one row whose `from` is the editor before it: a chain ending at the editor.
    expect(rows[0]!.fromUserId).toBe(ana.id);
    for (let i = 1; i < rows.length; i += 1) expect(rows[i]!.fromUserId).toBe(rows[i - 1]!.toUserId);
    expect(rows.at(-1)!.toUserId).toBe(group.editorUserId);
    expect(await t.prisma.auditEvent.count({ where: { type: "activity_group.editing_changed" } })).toBe(rows.length);

    const before = await t.prisma.auditEvent.count();
    const again = await handEditing(as[ana.id]!, activity.id, group.editorUserId);
    expect(again.status).toBe(200);
    expect(await events(attemptId)).toHaveLength(rows.length);
    expect(await groupRow(attemptId)).toEqual(group);
    expect(await t.prisma.auditEvent.count()).toBe(before);
  });

  describe("023/US4-6 depois do fim nada muda", () => {
    const expectFinal = async (activityId: string, attemptId: string) => {
      const before = await groupRow(attemptId);
      for (const res of [
        await handEditing(as[ana.id]!, activityId, bruno.id),
        await takeBackEditing(as[ana.id]!, activityId),
        await returnEditing(as[bruno.id]!, activityId),
      ]) {
        expect([res.status, res.body.code], JSON.stringify(res.body)).toEqual([409, "INVALID_STATE_TRANSITION"]);
      }
      expect(await groupRow(attemptId)).toEqual(before);
    };

    it("entregue: passar, retomar e devolver → 409; salvar → a recusa da 012", async () => {
      const { activity, attemptId, questionId, first } = await startedGroup();
      expect((await submitAttempt(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }])).status).toBe(200);
      await expectFinal(activity.id, attemptId);
      const save = await saveAnswers(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 1 }]);
      expect([save.status, save.body.code]).toEqual([409, "ATTEMPT_ALREADY_SUBMITTED"]);
    });

    it("prazo vencido sem entrega atrasada → 409; salvar → DEADLINE_PASSED", async () => {
      const deadline = new Date(clock.now().getTime() + HOUR).toISOString();
      const { activity, attemptId, questionId, first } = await startedGroup({ deadline, latePolicy: "REJECT" });
      expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
      clock.advance(2 * HOUR);
      await expectFinal(activity.id, attemptId);
      const save = await saveAnswers(as[bruno.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }]);
      expect([save.status, save.body.code]).toEqual([409, "DEADLINE_PASSED"]);
    });

    it("cancelado → 409; salvar → 404 como na 012", async () => {
      const { activity, attemptId, questionId, first } = await startedGroup();
      expect((await teacherClient.post(`/api/classes/${classId}/activities/${activity.id}/cancel`, {})).status).toBe(200);
      await expectFinal(activity.id, attemptId);
      const save = await saveAnswers(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }]);
      expect([save.status, save.body.code]).toEqual([404, "NOT_FOUND"]);
    });
  });

  describe("023/FR-013 quem passa e para quem", () => {
    it("HAND ou TAKE_BACK por um integrante → 409 GROUP_NOT_LEADER, auditado", async () => {
      const { activity, attemptId } = await startedGroup();
      const hand = await handEditing(as[bruno.id]!, activity.id, carla.id);
      expect([hand.status, hand.body.code]).toEqual([409, "GROUP_NOT_LEADER"]);
      const take = await takeBackEditing(as[bruno.id]!, activity.id);
      expect([take.status, take.body.code]).toEqual([409, "GROUP_NOT_LEADER"]);
      expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: ana.id, version: 1 });
      expect((await audits("activity_group.write_refused")).map((row) => row.metadata)).toEqual([
        { activityId: activity.id, attemptId, operation: "EDITING", reason: "NOT_LEADER" },
        { activityId: activity.id, attemptId, operation: "EDITING", reason: "NOT_LEADER" },
      ]);
    });

    it("HAND para quem não é do grupo, está pausado ou perdeu a matrícula → 422 GROUP_MEMBER_NOT_AVAILABLE", async () => {
      const { activity, attemptId } = await startedGroup();
      const outsider = await handEditing(as[ana.id]!, activity.id, davi.id);
      expect([outsider.status, outsider.body.code]).toEqual([422, "GROUP_MEMBER_NOT_AVAILABLE"]);

      expect((await pauseStudent(teacherClient, classId, activity.id, bruno.id)).status).toBe(201);
      const paused = await handEditing(as[ana.id]!, activity.id, bruno.id);
      expect([paused.status, paused.body.code]).toEqual([422, "GROUP_MEMBER_NOT_AVAILABLE"]);

      await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: carla.id }, data: { status: "REMOVED", removedAt: clock.now(), removedById: teacher.id } });
      const removed = await handEditing(as[ana.id]!, activity.id, carla.id);
      expect([removed.status, removed.body.code]).toEqual([422, "GROUP_MEMBER_NOT_AVAILABLE"]);
      expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: ana.id, version: 1 });
    });

    it("o líder pausado não passa a edição → 409 ATTEMPT_PAUSED, auditado como as outras escritas pausadas", async () => {
      const { activity, attemptId } = await startedGroup();
      const pause = await pauseStudent(teacherClient, classId, activity.id, ana.id);
      expect(pause.status).toBe(201);
      const res = await handEditing(as[ana.id]!, activity.id, bruno.id);
      expect([res.status, res.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);
      expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: ana.id, version: 1 });
      expect((await audits("attempt_pause.write_refused")).map((row) => row.metadata)).toEqual([
        { activityId: activity.id, pauseId: (pause.body as { id: string }).id, operation: "GROUP_EDITING" },
      ]);
    });
  });

  describe("023/FR-023 a acomodação no próximo toque (research U9)", () => {
    it("quem edita é pausado: a edição volta ao líder (EDITING_RESET, PAUSED) e não volta com o retorno", async () => {
      const { activity, attemptId, questionId, first } = await startedGroup();
      expect((await handEditing(as[ana.id]!, activity.id, bruno.id)).status).toBe(200);
      expect((await pauseStudent(teacherClient, classId, activity.id, bruno.id)).status).toBe(201);

      expect((await read(carla, activity.id)).group).toMatchObject({ editor: { id: ana.id } });
      expect(await groupRow(attemptId)).toEqual({ leaderUserId: ana.id, editorUserId: ana.id, version: 3 });
      expect((await events(attemptId)).at(-1)).toEqual({ kind: "EDITING_RESET", reason: "PAUSED", actorUserId: null, fromUserId: bruno.id, toUserId: ana.id });
      expect((await audits("activity_group.editing_changed")).at(-1)).toEqual({
        actorType: "SYSTEM",
        actorUserId: null,
        metadata: { activityId: activity.id, attemptId, kind: "EDITING_RESET", reason: "PAUSED", fromUserId: bruno.id, toUserId: ana.id },
      });
      // The leader saves at once; the settlement is written once.
      expect((await saveAnswers(as[ana.id]!, activity.id, [{ questionId, answer: choice(first), baseRevision: 0 }])).status).toBe(200);
      expect(await events(attemptId)).toHaveLength(2);
    });

    it("o líder perde o acesso: a liderança e a edição passam ao integrante ativo que entrou primeiro", async () => {
      const { activity, attemptId } = await startedGroup();
      await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: ana.id }, data: { status: "REMOVED", removedAt: clock.now(), removedById: teacher.id } });

      const view = await read(carla, activity.id);
      expect(view.group).toMatchObject({ leader: { id: bruno.id }, editor: { id: bruno.id }, myRole: "MEMBER" });
      expect(await groupRow(attemptId)).toEqual({ leaderUserId: bruno.id, editorUserId: bruno.id, version: 3 });
      // Both in the same instant of the settlement.
      const settled = await events(attemptId);
      expect(settled).toHaveLength(2);
      expect(settled).toEqual(
        expect.arrayContaining([
          { kind: "LEADER_CHANGED", reason: "ACCESS_LOST", actorUserId: null, fromUserId: ana.id, toUserId: bruno.id },
          { kind: "EDITING_RESET", reason: "ACCESS_LOST", actorUserId: null, fromUserId: ana.id, toUserId: bruno.id },
        ]),
      );
      expect(await audits("activity_group.leader_changed")).toEqual([
        {
          actorType: "SYSTEM",
          actorUserId: null,
          metadata: { activityId: activity.id, attemptId, fromUserId: ana.id, toUserId: bruno.id, reason: "ACCESS_LOST" },
        },
      ]);
      // Bruno now leads: he hands the editing to Carla.
      expect((await handEditing(as[bruno.id]!, activity.id, carla.id)).status).toBe(200);
    });
  });
});
