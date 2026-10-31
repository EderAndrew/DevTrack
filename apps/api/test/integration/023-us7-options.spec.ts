import type {
  AttemptCodeRunSummary,
  GroupCandidates,
  StudentActivity,
  StudentHelpState,
  StudentIntegrity,
  TeacherHelpState,
} from "@repo/contracts";
import { StudentHelpItemSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import {
  type CreatedActivity,
  saveAnswers,
  submitAttempt,
} from "../helpers/activities";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import {
  declareExit,
  getMyPause,
  markPresent,
  pauseStudent,
  releasePause,
  unmark,
} from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import {
  asRun,
  createCodeWork,
  createRunWorker,
  doubles,
  drainRuns,
  getAttemptCodeRuns,
  requestRun,
  seedHeartbeat,
} from "../helpers/code-runs";
import {
  createClass,
  createEnrollment,
  createUser,
  loginAs,
  type TestUser,
} from "../helpers/factories";
import {
  addMembers,
  getCandidates,
  handEditing,
  startGroup,
} from "../helpers/group-work";
import {
  getOwnIntegrity,
  integrityEvent,
  recordEvents,
} from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import {
  createWorkHelpApp,
  getHelp,
  requestHelp,
  scriptHelp,
  validGuidance,
} from "../helpers/work-help";

/**
 * 023/US7 — the 015, 016 and 021 options go on per student inside a group (023/FR-021–FR-025, research U9–U15):
 * each member records and reads only their own controlled-mode events and pause; a pause stops only that member
 * (an editing member gives the editing back to the leader); the AI help is the attempt's 3, asked only by the
 * editor and read by every member; any member runs code as themselves, saving nothing; an unmark of a member is
 * refused like one of a student who started; a leader who lost the class is replaced on the next touch.
 */

type Client = ReturnType<typeof api>;

describe("023/US7 modo controlado, pausa, ajuda da IA e execução no grupo", () => {
  let clock: FixedClock;
  let t: AiTestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let schoolClass: SchoolClass;
  let worker: CodeRunWorker;
  /** Ana leads Bruno and Carla (a slot left for Davi); Eva is not marked present. */
  let ana: TestUser;
  let bruno: TestUser;
  let carla: TestUser;
  let davi: TestUser;
  let eva: TestUser;
  const as: Record<string, Client> = {};

  const student = async (name: string) => {
    const user = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, schoolClass.id, user.id);
    as[user.id] = api(t, { cookie: await loginAs(t, user) });
    return user;
  };
  const ok = <T>(res: { status: number; body: unknown }, status = 200): T => {
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return res.body as T;
  };
  const refused = (
    res: { status: number; body: { code?: string } },
    status: number,
    code: string,
  ) =>
    expect([res.status, res.body.code], JSON.stringify(res.body)).toEqual([
      status,
      code,
    ]);
  const view = async (user: TestUser, activityId: string) =>
    ok<StudentActivity>(
      await as[user.id]!.get(`/api/me/activities/${activityId}`),
    );
  const audits = async (type: string) =>
    (
      await t.prisma.auditEvent.findMany({
        where: { type },
        orderBy: { id: "asc" },
      })
    ).map((row) => row.metadata);
  const groupEvents = (attemptId: string) =>
    t.prisma.attemptGroupEvent.findMany({
      where: { attemptId },
      orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
      select: { kind: true, reason: true, fromUserId: true, toUserId: true },
    });

  /**
   * A CONTROLLED group work of 4 with the AI help and code runs (a CODE question with public cases, then a
   * multiple choice one), everyone but Eva marked present, started by Ana with Bruno and Carla.
   */
  const startedGroup = async (): Promise<{
    work: CreatedActivity;
    activityId: string;
    codeId: string;
    choiceId: string;
    attemptId: string;
  }> => {
    const work = await createCodeWork(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      groupSize: 4,
    });
    const activityId = work.activity.id;
    ok(
      await markPresent(teacherClient, schoolClass.id, activityId, [
        ana.id,
        bruno.id,
        carla.id,
        davi.id,
      ]),
    );
    ok(await startGroup(as[ana.id]!, activityId, [bruno.id, carla.id]));
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({
      where: { activityId, studentUserId: ana.id },
      select: { id: true },
    });
    return {
      work,
      activityId,
      codeId: work.questionIds[0]!,
      choiceId: work.questionIds[1]!,
      attemptId: attempt.id,
    };
  };
  const exitRoom = async (user: TestUser, activityId: string) => {
    ok(
      await declareExit(as[user.id]!, activityId, { reason: "BATHROOM" }),
      201,
    );
    return (
      (await getMyPause(as[user.id]!, activityId)).body.pause as { id: string }
    ).id;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createWorkHelpApp({
      clock,
      config: {
        rateLimit: {
          ...testConfig().rateLimit,
          aiExecutionsPerMinute: 100,
          workHelpPerHour: 100,
        },
      },
    });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    schoolClass = await createClass(t, teacher.id);
    ana = await student("Ana Souza");
    bruno = await student("Bruno Lima");
    carla = await student("Carla Dias");
    davi = await student("Davi Rocha");
    eva = await student("Eva Nunes");
    await seedHeartbeat(t, clock.now());
    ({ worker } = createRunWorker(t, clock, {
      sandbox: new FakeSandbox().scriptCases(doubles),
    }));
  });

  it("023/US7-1 os eventos do modo controlado de B ficam com o aluno B; A lê só os próprios", async () => {
    const { activityId, attemptId } = await startedGroup();
    ok(
      await recordEvents(as[bruno.id]!, activityId, [
        integrityEvent("SCREEN_LEFT"),
      ]),
    );
    clock.advance(MINUTE);
    ok(
      await recordEvents(as[bruno.id]!, activityId, [
        integrityEvent("SCREEN_RETURNED"),
      ]),
    );

    const stored = await t.prisma.attemptIntegrityEvent.findMany({
      where: { attemptId },
      select: { studentUserId: true, type: true },
    });
    expect(stored).toHaveLength(2);
    expect(stored.every((row) => row.studentUserId === bruno.id)).toBe(true);
    const own = (user: TestUser) =>
      getOwnIntegrity(as[user.id]!, activityId).then((res) =>
        ok<StudentIntegrity>(res),
      );
    expect((await own(bruno)).events.map((event) => event.type)).toEqual([
      "SCREEN_LEFT",
      "SCREEN_RETURNED",
    ]);
    expect((await own(ana)).events).toEqual([]);
    expect((await own(carla)).totals).toMatchObject({ screenExits: 0 });
  });

  it("023/US7-2 a pausa de B só para B; o pausado pelo professor sem tentativa própria pausa na do grupo; quem editava perde a edição e não a recebe de volta", async () => {
    const { activityId, attemptId, choiceId, work } = await startedGroup();
    ok(await handEditing(as[ana.id]!, activityId, bruno.id));
    clock.advance(MINUTE);
    const pauseId = await exitRoom(bruno, activityId);

    const paused = await view(bruno, activityId);
    expect(paused.questions).toEqual([]);
    refused(
      await saveAnswers(as[bruno.id]!, activityId, [
        {
          questionId: choiceId,
          answer: {
            kind: "ALTERNATIVE",
            alternativeId: work.alternativeIds[1]![0]!,
          },
          baseRevision: 0,
        },
      ]),
      409,
      "ATTEMPT_PAUSED",
    );

    // The next touch gives the editing back to the leader, who goes on saving.
    const leader = await view(ana, activityId);
    expect(leader.questions).toHaveLength(2);
    expect(leader.group).toMatchObject({
      editor: { id: ana.id },
      canEdit: true,
    });
    expect((await groupEvents(attemptId)).at(-1)).toEqual({
      kind: "EDITING_RESET",
      reason: "PAUSED",
      fromUserId: bruno.id,
      toUserId: ana.id,
    });
    ok(
      await saveAnswers(as[ana.id]!, activityId, [
        {
          questionId: choiceId,
          answer: {
            kind: "ALTERNATIVE",
            alternativeId: work.alternativeIds[1]![0]!,
          },
          baseRevision: 0,
        },
      ]),
    );

    // "Pausar aluno" for Carla, who has no attempt of her own: the pause opens on the group's attempt.
    const carlaPause = await pauseStudent(
      teacherClient,
      schoolClass.id,
      activityId,
      carla.id,
    );
    expect(carlaPause.status, JSON.stringify(carlaPause.body)).toBe(201);
    const pauses = await t.prisma.attemptPause.findMany({
      where: { releasedAt: null },
      orderBy: { startedAt: "asc" },
      select: { attemptId: true, studentUserId: true },
    });
    expect(pauses).toEqual([
      { attemptId, studentUserId: bruno.id },
      { attemptId, studentUserId: carla.id },
    ]);
    expect((await view(carla, activityId)).questions).toEqual([]);
    expect((await view(ana, activityId)).questions).toHaveLength(2);

    ok(await releasePause(teacherClient, schoolClass.id, activityId, pauseId));
    const back = await view(bruno, activityId);
    expect(back.questions).toHaveLength(2);
    expect(back.group).toMatchObject({
      editor: { id: ana.id },
      canEdit: false,
    });
  });

  it("023/US7-3 023/SC-008 só quem edita pede ajuda; três entregues e a quarta recusada para qualquer integrante; todos leem as orientações", async () => {
    const { activityId, attemptId, codeId } = await startedGroup();
    const body = {
      questionId: codeId,
      question: "Não entendi o que a questão pede. Por onde começo?",
    };

    refused(
      await requestHelp(as[bruno.id]!, activityId, body),
      409,
      "GROUP_NOT_EDITOR",
    );
    expect(await audits("activity_group.write_refused")).toEqual([
      { activityId, attemptId, operation: "HELP", reason: "NOT_EDITOR" },
    ]);
    expect(await t.prisma.workHelpRequest.count()).toBe(0);

    for (let index = 0; index < 3; index += 1) {
      const item = StudentHelpItemSchema.parse(
        ok(await requestHelp(as[ana.id]!, activityId, body), 202),
      );
      scriptHelp(t.provider, item.id, validGuidance());
      await drain(t);
      clock.advance(MINUTE);
    }
    refused(
      await requestHelp(as[ana.id]!, activityId, body),
      409,
      "HELP_EXHAUSTED",
    );
    ok(await handEditing(as[ana.id]!, activityId, bruno.id));
    refused(
      await requestHelp(as[bruno.id]!, activityId, body),
      409,
      "HELP_EXHAUSTED",
    );

    for (const user of [ana, bruno, carla]) {
      const state = ok<StudentHelpState>(
        await getHelp(as[user.id]!, activityId),
      );
      expect(state).toMatchObject({ allowance: 3, used: 3, pending: false });
      expect(state.items.map((item) => item.status)).toEqual([
        "DELIVERED",
        "DELIVERED",
        "DELIVERED",
      ]);
    }
    expect((await view(carla, activityId)).aiHelp).toEqual({
      allowance: 3,
      used: 3,
    });
    // The teacher sees who asked each one.
    const teacherState = ok<TeacherHelpState>(
      await teacherClient.get(
        `/api/classes/${schoolClass.id}/activities/${activityId}/attempts/${attemptId}/help`,
      ),
    );
    expect(teacherState.items.map((item) => item.studentUserId)).toEqual([
      ana.id,
      ana.id,
      ana.id,
    ]);
  });

  it("023/US7-4 quem só lê executa como si mesmo, sem salvar; pendente por aluno; pausado → 409 ATTEMPT_PAUSED", async () => {
    const { activityId, attemptId, codeId } = await startedGroup();
    const carlaRun = asRun(
      ok(
        await requestRun(
          as[carla.id]!,
          activityId,
          codeId,
          "print(int(input()) * 2)\n",
        ),
        202,
      ),
    );
    // Bruno's run is his own pending one, beside Carla's; Carla asking again gets hers back.
    const brunoRun = asRun(
      ok(
        await requestRun(as[bruno.id]!, activityId, codeId, "print(2)\n"),
        202,
      ),
    );
    expect(brunoRun.id).not.toBe(carlaRun.id);
    expect(
      asRun(ok(await requestRun(as[carla.id]!, activityId, codeId))).id,
    ).toBe(carlaRun.id);
    const rows = await t.prisma.codeRun.findMany({
      where: { attemptId },
      orderBy: { createdAt: "asc" },
      select: { id: true, studentUserId: true },
    });
    expect(rows.map((row) => row.studentUserId).sort()).toEqual(
      [bruno.id, carla.id].sort(),
    );
    expect(await t.prisma.activityAnswer.count({ where: { attemptId } })).toBe(
      0,
    );

    expect(await drainRuns(worker)).toBe(2);
    const summary = ok<AttemptCodeRunSummary>(
      await getAttemptCodeRuns(
        teacherClient,
        schoolClass.id,
        activityId,
        attemptId,
      ),
    );
    expect(summary.questions[0]).toMatchObject({ runCount: 2, pending: false });
    expect([carla.id, bruno.id]).toContain(
      summary.questions[0]!.lastFinished!.studentUserId,
    );
    expect(await t.prisma.activityAnswer.count({ where: { attemptId } })).toBe(
      0,
    );

    const pauseId = await exitRoom(carla, activityId);
    refused(
      await requestRun(as[carla.id]!, activityId, codeId),
      409,
      "ATTEMPT_PAUSED",
    );
    expect(await audits("attempt_pause.write_refused")).toEqual([
      { activityId, pauseId, operation: "CODE_RUN" },
    ]);
    // The others go on running.
    ok(await requestRun(as[ana.id]!, activityId, codeId), 202);
  });

  it("023/US7-5 desmarcar a presença de um integrante → 409 ATTENDANCE_STARTED; o líder só vê colegas presentes", async () => {
    const { activityId } = await startedGroup();
    refused(
      await unmark(teacherClient, schoolClass.id, activityId, [bruno.id]),
      409,
      "ATTENDANCE_STARTED",
    );
    const candidates = ok<GroupCandidates>(
      await getCandidates(as[ana.id]!, activityId),
    );
    expect(candidates.candidates.map((person) => person.id)).toEqual([davi.id]);
    expect(candidates.candidates.map((person) => person.id)).not.toContain(
      eva.id,
    );
    // Davi, not in a group, can still be unmarked.
    ok(await unmark(teacherClient, schoolClass.id, activityId, [davi.id]));
  });

  describe("023/FR-023 liderança e edição quando alguém perde o acesso ou é pausado", () => {
    it("líder com a matrícula encerrada → no próximo toque a liderança passa ao integrante ativo mais antigo", async () => {
      const { activityId, attemptId } = await startedGroup();
      await t.prisma.enrollment.updateMany({
        where: { classId: schoolClass.id, studentUserId: ana.id },
        data: {
          status: "REMOVED",
          removedAt: clock.now(),
          removedById: teacher.id,
        },
      });
      expect((await view(carla, activityId)).group).toMatchObject({
        leader: { id: bruno.id },
        editor: { id: bruno.id },
      });
      expect(await groupEvents(attemptId)).toEqual(
        expect.arrayContaining([
          {
            kind: "LEADER_CHANGED",
            reason: "ACCESS_LOST",
            fromUserId: ana.id,
            toUserId: bruno.id,
          },
        ]),
      );
      expect(await audits("activity_group.leader_changed")).toEqual([
        {
          activityId,
          attemptId,
          fromUserId: ana.id,
          toUserId: bruno.id,
          reason: "ACCESS_LOST",
        },
      ]);
    });

    it("editor removido da turma → a edição volta ao líder (EDITING_RESET, ACCESS_LOST)", async () => {
      const { activityId, attemptId } = await startedGroup();
      ok(await handEditing(as[ana.id]!, activityId, carla.id));
      clock.advance(MINUTE);
      await t.prisma.enrollment.updateMany({
        where: { classId: schoolClass.id, studentUserId: carla.id },
        data: {
          status: "REMOVED",
          removedAt: clock.now(),
          removedById: teacher.id,
        },
      });
      expect((await view(bruno, activityId)).group).toMatchObject({
        leader: { id: ana.id },
        editor: { id: ana.id },
      });
      expect((await groupEvents(attemptId)).at(-1)).toEqual({
        kind: "EDITING_RESET",
        reason: "ACCESS_LOST",
        fromUserId: carla.id,
        toUserId: ana.id,
      });
      // She is still a participant of the attempt, listed in the review.
      expect(
        await t.prisma.attemptParticipant.count({
          where: { attemptId, studentUserId: carla.id },
        }),
      ).toBe(1);
    });

    it("líder pausado: passar a edição, entregar e incluir → 409 ATTEMPT_PAUSED; os integrantes seguem lendo", async () => {
      const { activityId } = await startedGroup();
      ok(
        await pauseStudent(teacherClient, schoolClass.id, activityId, ana.id),
        201,
      );
      refused(
        await handEditing(as[ana.id]!, activityId, bruno.id),
        409,
        "ATTEMPT_PAUSED",
      );
      refused(
        await submitAttempt(as[ana.id]!, activityId),
        409,
        "ATTEMPT_PAUSED",
      );
      refused(
        await addMembers(as[ana.id]!, activityId, [davi.id]),
        409,
        "ATTEMPT_PAUSED",
      );
      expect(
        await t.prisma.attemptParticipant.count({
          where: { studentUserId: davi.id },
        }),
      ).toBe(0);
      for (const user of [bruno, carla])
        expect((await view(user, activityId)).questions).toHaveLength(2);
    });
  });
});
