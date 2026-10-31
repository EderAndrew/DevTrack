import type { Answer, StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, saveAnswers, submitAttempt } from "../helpers/activities";
import { declareExit, getMyPause } from "../helpers/attendance";
import { FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, getAttemptGroup, getCandidates, handEditing, returnEditing, startGroup, takeBackEditing } from "../helpers/group-work";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork } from "../helpers/works";

type Client = ReturnType<typeof api>;

const MARKER = "MARCADOR-GRUPO-023";
const answer = (value: string): Answer => ({ kind: "TEXT", text: `${MARKER} ${value}` });

/**
 * 023 contracts/audit-events.md: forming a group, passing and taking back the editing, a refusal, a pause and the
 * submission leave names and answers out of the audit trail and the logs. Each event carries only the contract's
 * keys, the reads (candidates, the teacher's facts) write nothing, and each save is in `activity_answer_saves`,
 * not an event. The journey (`test/helpers/journey.ts`) runs the same flow for `secret-leak-scan.spec.ts`.
 */
describe("023 nomes e respostas fora da auditoria e dos logs", () => {
  let t: TestApp;
  let clock: FixedClock;
  let logs: LogCapture;
  let teacherClient: Client;
  let classId: string;
  let workId: string;
  let leader: TestUser;
  let member: TestUser;
  let late: TestUser;
  const as: Record<string, Client> = {};

  const student = async (name: string) => {
    const user = await createUser(t, { roles: ["STUDENT"], name: `${MARKER} ${name}` });
    await createEnrollment(t, classId, user.id);
    as[user.id] = api(t, { cookie: await loginAs(t, user) });
    return user;
  };
  const groupEvents = () =>
    t.prisma.auditEvent.findMany({ where: { type: { startsWith: "activity_group." } }, orderBy: { id: "asc" }, select: { type: true, actorType: true, metadata: true } });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    logs = new LogCapture();
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    logs.clear();
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const work = await createWork(t, teacher.id, { questions: [{ type: "OPEN_ANSWER" }] });
    workId = work.id;
    classId = (await createClass(t, teacher.id, { subjectId: work.subjectId })).id;
    leader = await student("Líder");
    member = await student("Integrante");
    late = await student("Atrasada");
  });

  it("023 cada fluxo grava só ids, enums e contagens, e nada do grupo chega à auditoria ou aos logs", async () => {
    const applied = await applyWork(teacherClient, classId, workId, { groupSize: 3 });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const activity = applied.body as TeacherActivity;

    expect((await getCandidates(as[leader.id]!, activity.id)).status).toBe(200);
    const started = await startGroup(as[leader.id]!, activity.id, [member.id]);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const questionId = (started.body as StudentActivity).questions[0]!.id;
    const attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } })).id;

    expect((await addMembers(as[leader.id]!, activity.id, [late.id])).status).toBe(200);
    expect((await handEditing(as[leader.id]!, activity.id, member.id)).status).toBe(200);
    const saved = await saveAnswers(as[member.id]!, activity.id, [{ questionId, answer: answer("salva pelo integrante"), baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const refused = await saveAnswers(as[leader.id]!, activity.id, [{ questionId, answer: answer("recusada"), baseRevision: 1 }]);
    expect([refused.status, refused.body.code]).toEqual([409, "GROUP_NOT_EDITOR"]);
    expect((await returnEditing(as[member.id]!, activity.id)).status).toBe(200);
    expect((await handEditing(as[leader.id]!, activity.id, member.id)).status).toBe(200);
    expect((await takeBackEditing(as[leader.id]!, activity.id)).status).toBe(200);

    // A pause of the editor settles the editing with no name either (EDITING_RESET, SYSTEM).
    expect((await handEditing(as[leader.id]!, activity.id, member.id)).status).toBe(200);
    expect((await declareExit(as[member.id]!, activity.id, { reason: "OTHER", note: `${MARKER} nota da saída` })).status).toBe(201);
    expect((await getMyPause(as[member.id]!, activity.id)).status).toBe(200);
    expect((await as[leader.id]!.get(`/api/me/activities/${activity.id}`)).status).toBe(200);

    // The reads write nothing.
    const before = await groupEvents();
    expect((await getAttemptGroup(teacherClient, classId, activity.id, attemptId)).status).toBe(200);
    expect(await groupEvents()).toEqual(before);

    expect(before.map(({ type }) => type)).toEqual([
      "activity_group.created",
      "activity_group.member_added",
      "activity_group.member_added",
      "activity_group.editing_changed",
      "activity_group.write_refused",
      "activity_group.editing_changed",
      "activity_group.editing_changed",
      "activity_group.editing_changed",
      "activity_group.editing_changed",
      "activity_group.editing_changed",
    ]);
    expect(Object.keys(before[0]!.metadata as object).sort()).toEqual(["activityId", "attemptId", "memberCount"]);
    expect(Object.keys(before[1]!.metadata as object).sort()).toEqual(["activityId", "attemptId", "memberId"]);
    expect(Object.keys(before[3]!.metadata as object).sort()).toEqual(["activityId", "attemptId", "fromUserId", "kind", "reason", "toUserId"]);
    expect(before[4]!.metadata).toEqual({ activityId: activity.id, attemptId, operation: "SAVE", reason: "NOT_EDITOR" });
    expect(before.at(-1)).toMatchObject({ actorType: "SYSTEM", metadata: { kind: "EDITING_RESET", reason: "PAUSED" } });

    expect((await submitAttempt(as[leader.id]!, activity.id, [])).status).toBe(200);

    // The content was stored where it belongs (the scan below is not vacuous).
    const stored = JSON.stringify(await t.prisma.activityAnswer.findMany({ select: { text: true } }));
    expect(stored).toContain(MARKER);
    expect(await t.prisma.activityAnswerSave.count({ where: { attemptId } })).toBe(1);

    const everyEvent = JSON.stringify(await t.prisma.auditEvent.findMany({ select: { type: true, targetId: true, metadata: true } }));
    expect(everyEvent).not.toContain(MARKER);
    expect(logs.text().length).toBeGreaterThan(0);
    expect(logs.text()).not.toContain(MARKER);
  });
});
