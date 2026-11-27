import type { Answer, Room, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { applyWork, createClassWithStudents, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { getRoom, markPresent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { createCodeWork, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { startAlone, startGroup } from "../helpers/group-work";
import { getOwnIntegrity, integrityEvent, recordEvents } from "../helpers/integrity";
import { api } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp } from "../helpers/work-help";
import { type ConfirmedSyllabus, createConfirmedSyllabus, createWork, type WorkFixture } from "../helpers/works";

/**
 * 032/US3 — a work is applied for a period (start now or scheduled, end date and time) with no late
 * policy (032/FR-009…FR-011, FR-014, research AP2, AP6): the body refuses `latePolicy` and the server
 * stores `REJECT`; whoever is marked present during the period starts; after the end nobody starts,
 * saves, submits, asks for help or runs code (`DEADLINE_PASSED`, never an automatic submission), and
 * a mark is refused (`ACTIVITY_PERIOD_ENDED`); extending the end reopens saving and submitting. A group
 * and a controlled work follow the same refusal, and the 015 events keep their meaning.
 */

// 19:10 in São Paulo (UTC-3); the period of the scenarios runs 19:10 → 22:00 (170 min).
const START = "2026-11-30T22:10:00.000Z";
const at = (ms: number) => new Date(new Date(START).getTime() + ms);
const iso = (ms: number) => at(ms).toISOString();
const END = 170 * MINUTE;
const SECOND = 1000;
type Client = ReturnType<typeof api>;

const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });

describe("032/US3 trabalho com período no lugar de prazo e política de atraso", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let schoolClass: SchoolClass;
  let students: TestUser[];
  let syllabus: ConfirmedSyllabus;
  let work: WorkFixture;

  const base = () => `/api/classes/${schoolClass.id}/activities`;
  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  /** A work applied through the route, now → 22:00, with no attendance taken unless asked. */
  const applied = async (overrides: Parameters<typeof applyWork>[3] = {}) => {
    const res = await applyWork(client, schoolClass.id, work.id, { acknowledgeOutOfScope: true, attendance: "NONE", deadline: iso(END), ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  /** The work's only question and its first alternative, as the student sees them. */
  const question = async (student: Client, activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const first = res.body.questions[0] as { id: string; alternatives: { id: string }[] };
    return { questionId: first.id, alternativeId: first.alternatives[0]!.id };
  };
  const codeOf = (res: { status: number; body: { code?: string } }) => [res.status, res.body.code];

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    client = api(t, { cookie: await loginAs(t, teacher) });
    syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 3 });
    schoolClass = created.schoolClass;
    students = created.students;
    work = await createWork(t, teacher.id, { syllabus });
  });

  it("032/US3-1 032/FR-009 032/FR-010 o corpo do trabalho é o período, sem política de atraso: com ela → 400; o servidor grava REJECT", async () => {
    const refused = await applyWork(client, schoolClass.id, work.id, { acknowledgeOutOfScope: true, attendance: "NONE", deadline: iso(END), latePolicy: "ACCEPT_MARKED" } as never);
    expect(refused.status).toBe(400);
    expect(await t.prisma.classActivity.count()).toBe(0);

    const activity = await applied();
    expect({ publishAt: activity.publishAt, deadline: activity.deadline, latePolicy: activity.latePolicy }).toEqual({
      publishAt: START,
      deadline: iso(END),
      latePolicy: "REJECT",
    });
    const row = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } });
    expect({ deadline: row.deadline?.toISOString(), latePolicy: row.latePolicy }).toEqual({ deadline: iso(END), latePolicy: "REJECT" });

    // The edit takes the end, never the policy.
    expect((await client.patch(`${base()}/${activity.id}`, { version: activity.version, latePolicy: "ACCEPT_MARKED" })).status).toBe(400);
    expect((await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } })).latePolicy).toBe("REJECT");
  });

  it("032/US3-1 032/FR-002 término igual ou antes do início → 422 INVALID_SCHEDULE (400 com o início no corpo), nada criado", async () => {
    for (const deadline of [START, iso(-MINUTE)]) {
      const res = await applyWork(client, schoolClass.id, work.id, { acknowledgeOutOfScope: true, attendance: "NONE", deadline });
      expect(codeOf(res)).toEqual([422, "INVALID_SCHEDULE"]);
    }
    const scheduled = await applyWork(client, schoolClass.id, work.id, { acknowledgeOutOfScope: true, attendance: "NONE", publishAt: iso(END), deadline: iso(END) });
    // With the start given, the contract's refinement refuses it before the service (contracts/http-api.md).
    expect(codeOf(scheduled)).toEqual([400, "VALIDATION_ERROR"]);
    expect(await t.prisma.classActivity.count()).toBe(0);
  });

  it("032/US3-2 032/FR-013 presença às 21:00 libera o trabalho: o aluno começa e entrega às 21:50", async () => {
    const activity = await applied();
    const student = await studentClient(students[0]!);
    expect((await student.get(`/api/me/activities/${activity.id}`)).status).toBe(404);

    clock.set(iso(110 * MINUTE)); // 21:00
    expect((await markPresent(client, schoolClass.id, activity.id, [students[0]!.id])).status).toBe(200);
    expect((await startAttempt(student, activity.id)).status).toBe(200);
    const { questionId, alternativeId } = await question(student, activity.id);

    clock.set(iso(160 * MINUTE)); // 21:50
    const submitted = await submitAttempt(student, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 0 }]);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const submission = await t.prisma.activitySubmission.findFirstOrThrow({ where: { activityId: activity.id } });
    expect(submission.late).toBe(false);
  });

  it("032/US3-3 032/FR-011 no fim do período ninguém começa, salva, entrega, pede ajuda ou executa código; sem entrega automática", async () => {
    const created = await createCodeWork(t, schoolClass, { releaseMode: "PRESENT_ONLY", publishAt: at(0), deadline: at(END), aiHelpAllowance: 3 });
    const activityId = created.activity.id;
    const [codeQuestionId, choiceQuestionId] = created.questionIds as [string, string];
    expect((await markPresent(client, schoolClass.id, activityId, [students[0]!.id, students[1]!.id])).status).toBe(200);
    const started = await studentClient(students[0]!);
    const late = await studentClient(students[1]!);
    expect((await startAttempt(started, activityId)).status).toBe(200);
    const saved = await saveAnswers(started, activityId, [{ questionId: choiceQuestionId, answer: choice(created.alternativeIds[1]![0]!), baseRevision: 0 }]);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);

    // 22:00 is still inside the period (inclusive): saving again is accepted.
    clock.set(iso(END));
    const again = await saveAnswers(started, activityId, [{ questionId: choiceQuestionId, answer: choice(created.alternativeIds[1]![1]!), baseRevision: 1 }]);
    expect(again.status, JSON.stringify(again.body)).toBe(200);

    clock.set(iso(END + SECOND));
    await seedHeartbeat(t, clock.now());
    const refusal = [409, "DEADLINE_PASSED"];
    expect(codeOf(await startAttempt(late, activityId))).toEqual(refusal);
    expect(codeOf(await saveAnswers(started, activityId, [{ questionId: choiceQuestionId, answer: choice(created.alternativeIds[1]![0]!), baseRevision: 2 }]))).toEqual(refusal);
    expect(codeOf(await submitAttempt(started, activityId))).toEqual(refusal);
    expect(codeOf(await requestHelp(started, activityId, { questionId: codeQuestionId, question: "Por onde começo esta questão?" }))).toEqual(refusal);
    expect(codeOf(await requestRun(started, activityId, codeQuestionId))).toEqual(refusal);

    // Nothing was written by the refusals, and the saved answer never became a submission.
    expect(await t.prisma.activitySubmission.count({ where: { activityId } })).toBe(0);
    expect(await t.prisma.activityAttempt.findMany({ where: { activityId }, select: { status: true } })).toEqual([{ status: "IN_PROGRESS" }]);
    expect(await t.prisma.workHelpRequest.count()).toBe(0);
    expect(await t.prisma.codeRun.count()).toBe(0);
    const answer = await t.prisma.activityAnswer.findFirstOrThrow({ where: { questionId: choiceQuestionId } });
    expect(answer.revision).toBe(2);
  });

  it("032/US3-4 032/FR-014 presença às 22:01 é recusada com 409 ACTIVITY_PERIOD_ENDED e nada é gravado", async () => {
    const activity = await applied();
    clock.set(iso(END));
    expect((await getRoom(client, schoolClass.id, activity.id)).body as Room).toMatchObject({ periodEnded: false });

    clock.set(iso(END + MINUTE)); // 22:01
    expect((await getRoom(client, schoolClass.id, activity.id)).body as Room).toMatchObject({ periodEnded: true });
    const refused = await markPresent(client, schoolClass.id, activity.id, [students[0]!.id]);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({ statusCode: 409, code: "ACTIVITY_PERIOD_ENDED", message: expect.any(String) });
    expect(await t.prisma.activityAttendance.count({ where: { activityId: activity.id } })).toBe(0);
    expect((await (await studentClient(students[0]!)).get(`/api/me/activities/${activity.id}`)).status).toBe(404);
  });

  it("032/US3-5 032/FR-012 estender o término reabre salvar e entregar até o novo fim", async () => {
    const activity = await applied();
    expect((await markPresent(client, schoolClass.id, activity.id, [students[0]!.id])).status).toBe(200);
    const student = await studentClient(students[0]!);
    expect((await startAttempt(student, activity.id)).status).toBe(200);
    const { questionId, alternativeId } = await question(student, activity.id);

    clock.set(iso(END + MINUTE)); // 22:01: the period ended
    expect(codeOf(await saveAnswers(student, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 0 }]))).toEqual([409, "DEADLINE_PASSED"]);

    // The class runs late: the teacher moves the end to 22:30 (a work's end changes freely while ACTIVE).
    const extended = await client.patch(`${base()}/${activity.id}`, { version: activity.version, deadline: iso(END + 30 * MINUTE) });
    expect(extended.status, JSON.stringify(extended.body)).toBe(200);
    expect((extended.body as TeacherActivity).deadline).toBe(iso(END + 30 * MINUTE));
    expect((await getRoom(client, schoolClass.id, activity.id)).body as Room).toMatchObject({ periodEnded: false });

    expect((await saveAnswers(student, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 0 }])).status).toBe(200);
    clock.set(iso(END + 30 * MINUTE)); // 22:30, the new end, inclusive
    const submitted = await submitAttempt(student, activity.id);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect((await t.prisma.activitySubmission.findFirstOrThrow({ where: { activityId: activity.id } })).late).toBe(false);
  });

  it("032/US3-6 032/FR-011 trabalho em grupo e controlado: a mesma recusa para todo o grupo; os eventos do modo controlado seguem sendo fatos", async () => {
    const activity = await applied({ groupSize: 2, executionMode: "CONTROLLED", attendance: "ALL" });
    const leader = await studentClient(students[0]!);
    const member = await studentClient(students[1]!);
    const start = await startGroup(leader, activity.id, [students[1]!.id]);
    expect(start.status, JSON.stringify(start.body)).toBe(200);
    const { questionId, alternativeId } = await question(leader, activity.id);
    expect((await recordEvents(leader, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);

    clock.set(iso(END + SECOND));
    const refusal = [409, "DEADLINE_PASSED"];
    expect(codeOf(await saveAnswers(leader, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 0 }]))).toEqual(refusal);
    expect(codeOf(await submitAttempt(leader, activity.id))).toEqual(refusal);
    expect(codeOf(await saveAnswers(member, activity.id, [{ questionId, answer: choice(alternativeId), baseRevision: 0 }]))).toEqual(refusal);
    expect(codeOf(await submitAttempt(member, activity.id))).toEqual(refusal);
    expect(codeOf(await startAlone(await studentClient(students[2]!), activity.id))).toEqual(refusal);
    expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(0);

    // 015: after the end an event is still a fact of the open attempt, recorded as before; never a refusal or a grade.
    expect((await recordEvents(leader, activity.id, [integrityEvent("SCREEN_RETURNED")])).status).toBe(200);
    const own = await getOwnIntegrity(leader, activity.id);
    expect(own.status, JSON.stringify(own.body)).toBe(200);
    expect(JSON.stringify(own.body)).not.toMatch(/DEADLINE/);
  });
});
