import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  AttemptPauses,
  IntegrityTimeline,
  StudentActivity,
  TeacherActivity,
  TeacherAttempt,
  TeacherAttemptGroup,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyWork, saveAnswers, submitAttempt } from "../helpers/activities";
import { declareExit, getAttemptPauses, releasePause } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { addMembers, getAttemptGroup, handEditing, returnEditing, startAlone, startGroup, takeBackEditing } from "../helpers/group-work";
import { getTimeline, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 023/US6 — the teacher sees the group, the editing handoffs and who saved (023/FR-020, FR-021, SC-005):
 * the roster and the attempt carry the participants, the counters count each participant of a submitted
 * attempt, `GET …/attempts/:attemptId/group` lists members, events and saves per question (an allowlist,
 * not audited), and the 015 timeline and the 016 pauses name the student of each fact. Facts only: no
 * grading code reads them (US6-5).
 */

type Client = ReturnType<typeof api>;

describe("023/US6 professor vê o grupo, as passagens e quem salvou", () => {
  let clock: FixedClock;
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let work: WorkFixture;
  /** Ana leads Bruno and Carla; Davi works alone; Eva starts nothing. */
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
  const ok = <T>(res: { status: number; body: unknown }, status = 200): T => {
    expect(res.status, JSON.stringify(res.body)).toBe(status);
    return res.body as T;
  };
  /** A group work led by Ana with Bruno (Carla added later) and Davi alone. */
  const scenario = async (overrides: Record<string, unknown> = {}) => {
    const activity = ok<TeacherActivity>(await applyWork(teacherClient, classId, work.id, { groupSize: 3, ...overrides }), 201);
    const started = ok<StudentActivity>(await startGroup(as[ana.id]!, activity.id, [bruno.id]));
    clock.advance(MINUTE);
    ok(await addMembers(as[ana.id]!, activity.id, [carla.id]));
    ok(await startAlone(as[davi.id]!, activity.id));
    const groupAttempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: ana.id }, select: { id: true } });
    const aloneAttempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: davi.id }, select: { id: true } });
    return { activity, questions: started.questions, groupId: groupAttempt.id, aloneId: aloneAttempt.id };
  };
  const teacherActivity = async (activityId: string) => ok<TeacherActivity>(await teacherClient.get(`/api/classes/${classId}/activities/${activityId}`));

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
    work = await createWork(t, teacher.id, { questions: [{ type: "OPEN_ANSWER" }, { type: "OPEN_ANSWER" }] });
    classId = (await createClass(t, teacher.id, { subjectId: work.subjectId })).id;
    ana = await student("Ana Souza");
    bruno = await student("Bruno Lima");
    carla = await student("Carla Dias");
    davi = await student("Davi Rocha");
    eva = await student("Eva Nunes");
  });

  it("023/US6-1 a lista de entregas traz por tentativa os participantes (o grupo, líder primeiro, e quem fez sozinho)", async () => {
    const { activity, groupId, aloneId } = await scenario();
    const { roster } = await teacherActivity(activity.id);
    const row = (user: TestUser) => roster.find((entry) => entry.studentUserId === user.id)!;
    const group = [
      { id: ana.id, name: "Ana Souza", isLeader: true },
      { id: bruno.id, name: "Bruno Lima", isLeader: false },
      { id: carla.id, name: "Carla Dias", isLeader: false },
    ];
    // Every member's row points to the group attempt with the same participants, so the web shows one line.
    for (const user of [ana, bruno, carla]) expect(row(user)).toMatchObject({ attemptId: groupId, group: true, participants: group });
    expect(row(davi)).toMatchObject({ attemptId: aloneId, group: false, participants: [{ id: davi.id, name: "Davi Rocha", isLeader: true }] });
    expect(row(eva)).toMatchObject({ attemptId: null, group: false, participants: [] });

    const attempt = ok<TeacherAttempt>(await teacherClient.get(`/api/classes/${classId}/activities/${activity.id}/attempts/${groupId}`));
    expect(attempt).toMatchObject({ group: true, participants: group, student: { userId: ana.id } });
    const alone = ok<TeacherAttempt>(await teacherClient.get(`/api/classes/${classId}/activities/${activity.id}/attempts/${aloneId}`));
    expect(alone).toMatchObject({ group: false, participants: [{ id: davi.id, isLeader: true }] });
  });

  it("023/FR-020 os contadores do professor contam por aluno: um grupo de 3 que entregou soma 3 entregues", async () => {
    const { activity } = await scenario();
    ok(await submitAttempt(as[ana.id]!, activity.id));
    const { counts, roster } = await teacherActivity(activity.id);
    expect(counts).toMatchObject({ enrolled: 5, submitted: 3, inProgress: 1 });
    expect(roster.filter((entry) => entry.status === "SUBMITTED").map((entry) => entry.studentUserId).sort()).toEqual([ana.id, bruno.id, carla.id].sort());
  });

  it("023/US6-2 023/US6-3 023/SC-005 o grupo da tentativa: líder, integrantes com joinedAt/addedById, passagens em ordem e salvamentos por questão", async () => {
    const { activity, questions, groupId } = await scenario();
    const [first, second] = questions.map((question) => question.id) as [string, string];
    const startedAt = clock.now();
    ok(await saveAnswers(as[ana.id]!, activity.id, [{ questionId: first, answer: { kind: "TEXT", text: "a" }, baseRevision: 0 }]));
    clock.advance(MINUTE);
    ok(await handEditing(as[ana.id]!, activity.id, bruno.id));
    clock.advance(MINUTE);
    ok(await saveAnswers(as[bruno.id]!, activity.id, [{ questionId: first, answer: { kind: "TEXT", text: "ab" }, baseRevision: 1 }]));
    clock.advance(MINUTE);
    ok(await saveAnswers(as[bruno.id]!, activity.id, [{ questionId: second, answer: { kind: "TEXT", text: "x" }, baseRevision: 0 }]));
    clock.advance(MINUTE);
    ok(await returnEditing(as[bruno.id]!, activity.id));
    clock.advance(MINUTE);
    ok(await handEditing(as[ana.id]!, activity.id, carla.id));
    clock.advance(MINUTE);
    ok(await takeBackEditing(as[ana.id]!, activity.id));

    const facts = ok<TeacherAttemptGroup>(await getAttemptGroup(teacherClient, classId, activity.id, groupId));
    expect(facts.leaderId).toBe(ana.id);
    expect(facts.members.map(({ id, name, addedById }) => ({ id, name, addedById }))).toEqual([
      { id: ana.id, name: "Ana Souza", addedById: null },
      { id: bruno.id, name: "Bruno Lima", addedById: ana.id },
      { id: carla.id, name: "Carla Dias", addedById: ana.id },
    ]);
    expect(new Date(facts.members[2]!.joinedAt).getTime()).toBeGreaterThan(new Date(facts.members[1]!.joinedAt).getTime());
    expect(facts.events.map(({ kind, actorId, fromId, toId, reason }) => ({ kind, actorId, fromId, toId, reason }))).toEqual([
      { kind: "EDITING_HANDED", actorId: ana.id, fromId: ana.id, toId: bruno.id, reason: null },
      { kind: "EDITING_RETURNED", actorId: bruno.id, fromId: bruno.id, toId: ana.id, reason: null },
      { kind: "EDITING_HANDED", actorId: ana.id, fromId: ana.id, toId: carla.id, reason: null },
      { kind: "EDITING_TAKEN_BACK", actorId: ana.id, fromId: carla.id, toId: ana.id, reason: null },
    ]);
    const times = facts.events.map((event) => new Date(event.occurredAt).getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // By question position, then revision: who saved, which revision and when (the last one is the group's answer).
    expect(facts.saves).toEqual([
      {
        questionId: first,
        entries: [
          { studentId: ana.id, revision: 1, savedAt: startedAt.toISOString() },
          { studentId: bruno.id, revision: 2, savedAt: new Date(startedAt.getTime() + 2 * MINUTE).toISOString() },
        ],
      },
      { questionId: second, entries: [{ studentId: bruno.id, revision: 1, savedAt: new Date(startedAt.getTime() + 3 * MINUTE).toISOString() }] },
    ]);

    // A read: no audit event (contracts/audit-events.md).
    const before = await t.prisma.auditEvent.count();
    ok(await getAttemptGroup(teacherClient, classId, activity.id, groupId));
    expect(await t.prisma.auditEvent.count()).toBe(before);
  });

  it("023/US6-4 a linha do tempo da 015 e as pausas da 016 trazem o aluno de cada fato", async () => {
    const { activity, groupId } = await scenario({ executionMode: "CONTROLLED" });
    ok(await recordEvents(as[ana.id]!, activity.id, [integrityEvent("SCREEN_LEFT")]), 200);
    clock.advance(MINUTE);
    ok(await recordEvents(as[bruno.id]!, activity.id, [integrityEvent("SCREEN_LEFT")]), 200);
    clock.advance(MINUTE);
    ok(await recordEvents(as[ana.id]!, activity.id, [integrityEvent("SCREEN_RETURNED")]), 200);

    const timeline = ok<IntegrityTimeline>(await getTimeline(teacherClient, classId, activity.id, groupId));
    expect(timeline.events.map((event) => [event.type, event.studentUserId])).toEqual([
      ["SCREEN_LEFT", ana.id],
      ["SCREEN_LEFT", bruno.id],
      ["SCREEN_RETURNED", ana.id],
    ]);
    // Each student's exit ends at their own return: Ana's closes, Bruno's stays open (never closed by Ana's return).
    const interval = (user: TestUser) => timeline.intervals.find((item) => item.studentUserId === user.id)!;
    expect(interval(ana)).toMatchObject({ kind: "SCREEN", open: false });
    expect(interval(bruno)).toMatchObject({ kind: "SCREEN", open: true });
    expect(timeline.totals.screenExits).toBe(2);

    const exit = ok<{ id: string }>(await declareExit(as[carla.id]!, activity.id), 201);
    clock.advance(MINUTE);
    ok(await releasePause(teacherClient, classId, activity.id, exit.id));
    const pauses = ok<AttemptPauses>(await getAttemptPauses(teacherClient, classId, activity.id, groupId));
    expect(pauses.items.map((pause) => pause.studentUserId)).toEqual([carla.id]);
  });

  it("023/US6-5 nenhuma rota de nota lê os registros de edição; um grupo tem uma só nota", () => {
    const root = join(__dirname, "../../src/modules");
    const grading = ["works/grading", "activities/grading", "activities/submission", "activities/results"];
    const files = grading.flatMap(function walk(dir: string): string[] {
      const full = join(root, dir);
      return readdirSync(full).flatMap((name) => (statSync(join(full, name)).isDirectory() ? walk(join(dir, name)) : [join(full, name)]));
    });
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/activityAnswerSave|activity_answer_saves|attemptGroupEvent|attempt_group_events/);
    }
  });

  it("023/US6-2 a rota do grupo: tentativa individual → 404; professor B → 404; outros papéis → 403", async () => {
    const { activity, groupId, aloneId } = await scenario();
    expect((await getAttemptGroup(teacherClient, classId, activity.id, aloneId)).status).toBe(404);
    // Another activity's attempt id under this activity.
    const other = ok<TeacherActivity>(await applyWork(teacherClient, classId, work.id, { groupSize: 2 }), 201);
    expect((await getAttemptGroup(teacherClient, classId, other.id, groupId)).status).toBe(404);

    const teacherB = await createUser(t, { roles: ["TEACHER"] });
    const clientB = api(t, { cookie: await loginAs(t, teacherB) });
    expect((await getAttemptGroup(clientB, classId, activity.id, groupId)).status).toBe(404);
    expect((await getAttemptGroup(as[ana.id]!, classId, activity.id, groupId)).status).toBe(403);
    const manager = await createUser(t, { roles: ["MANAGER"] });
    expect((await getAttemptGroup(api(t, { cookie: await loginAs(t, manager) }), classId, activity.id, groupId)).status).toBe(403);
  });
});
