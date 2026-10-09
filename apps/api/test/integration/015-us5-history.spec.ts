import { type Answer, StudentActivitySchema, StudentHelpStateSchema, StudentIntegritySchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreatedActivity, createActivity, createClassWithStudents, gradeAttempt, releaseResult, startAttempt, submitAttempt } from "../helpers/activities";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { getOwnIntegrity, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, getHelp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

/**
 * 015/US5 — after the submission the student sees their own helps per question and their own
 * screen exits with the times (015/FR-027), read from the same routes as during the attempt. Nothing
 * of the grade, the feedback or the answer key reaches them before the release (012 FR-029/FR-030);
 * a classmate sees none of it and a student of another class gets 404.
 */

const START = "2026-10-01T12:00:00.000Z";
const MARKERS = /MARCADOR-(RESPOSTA|RUBRICA|SOLUCAO|PRIVADO|EXPLICACAO)-012/;
type ApiClient = ReturnType<typeof api>;

describe("015/US5 aluno vê as próprias ajudas e saídas depois da entrega", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ApiClient;
  let student: TestUser;
  let client: ApiClient;
  let classmateClient: ApiClient;
  let outsiderClient: ApiClient;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** A CONTROLLED work with the help on: multiple choice (first right) and an open answer, the answer key marked. */
  const work = (): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, correctIndex: 0, explanation: "MARCADOR-EXPLICACAO-012" },
        { type: "OPEN_ANSWER", valueCents: 50, expectedAnswer: "MARCADOR-RESPOSTA-012", rubric: "MARCADOR-RUBRICA-012" },
      ],
    });
  const choice = (alternativeId: string): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });

  /** One exit of 2 minutes, one help on question 2, then the submission; returns the times of the exit. */
  const delivered = async () => {
    const activity = await work();
    const { id } = activity.activity;
    expect((await startAttempt(client, id)).status).toBe(200);
    const left = clock.now().toISOString();
    expect((await recordEvents(client, id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    clock.advance(2 * MINUTE);
    const returned = clock.now().toISOString();
    expect((await recordEvents(client, id, [integrityEvent("SCREEN_RETURNED")])).status).toBe(200);
    clock.advance(MINUTE);
    const res = await requestHelp(client, id, { questionId: activity.questionIds[1]!, question: "Como começo a explicar?" });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    scriptHelp(t.provider, res.body.id, validGuidance());
    await drain(t);
    clock.advance(MINUTE);
    const submitted = await submitAttempt(client, id, [
      { questionId: activity.questionIds[0]!, answer: choice(activity.alternativeIds[0]![0]!), baseRevision: 0 },
      { questionId: activity.questionIds[1]!, answer: text("Esconder o estado."), baseRevision: 0 },
    ]);
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    const attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: id, studentUserId: student.id } })).id;
    return { activity, attemptId, left, returned };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    client = api(t, { cookie: await loginAs(t, student) });
    classmateClient = api(t, { cookie: await loginAs(t, created.students[1]!) });
    const other = await createClassWithStudents(t, (await createUser(t, { roles: ["TEACHER"] })).id);
    outsiderClient = api(t, { cookie: await loginAs(t, other.students[0]!) });
  });

  it("015/US5-1 015/FR-027 depois da entrega, as próprias perguntas e orientações por questão", async () => {
    const { activity } = await delivered();
    const res = await getHelp(client, activity.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const state = StudentHelpStateSchema.parse(res.body);
    expect([state.allowance, state.used, state.pending]).toEqual([3, 1, false]);
    expect(state.items).toEqual([
      expect.objectContaining({
        questionId: activity.questionIds[1],
        question: "Como começo a explicar?",
        status: "DELIVERED",
        message: validGuidance().message,
      }),
    ]);
    // The detail the history opens is read-only and still carries the help settings.
    const detail = StudentActivitySchema.parse((await client.get(`/api/me/activities/${activity.activity.id}`)).body);
    expect([detail.canAnswer, detail.submission !== null, detail.aiHelp]).toEqual([false, true, { allowance: 3, used: 1 }]);
  });

  it("015/US5-2 015/FR-027 entrega CONTROLADA: quantas saídas da tela, com os horários do servidor", async () => {
    const { activity, left, returned } = await delivered();
    const res = await getOwnIntegrity(client, activity.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const own = StudentIntegritySchema.parse(res.body);
    expect(own.totals).toMatchObject({ screenExits: 1, timeAwaySeconds: 120 });
    expect(own.events.map((event) => [event.type, event.recordedAt])).toEqual([
      ["SCREEN_LEFT", left],
      ["SCREEN_RETURNED", returned],
    ]);
    // The submission ends the recording: the history reads the same facts later.
    clock.advance(DAY);
    expect(StudentIntegritySchema.parse((await getOwnIntegrity(client, activity.activity.id)).body)).toEqual(own);
  });

  it("015/US5-3 015/FR-028 sem liberação: nem nota, feedback ou gabarito na entrega, nas ajudas ou nos registros", async () => {
    const { activity, attemptId } = await delivered();
    const graded = await gradeAttempt(teacherClient, schoolClass.id, activity.activity.id, attemptId, {
      version: 1,
      decisions: [{ questionId: activity.questionIds[1]!, grade: "0.45", feedback: "Faltou a interface pública." }],
      generalFeedback: "Bom trabalho.",
    });
    expect(graded.status, JSON.stringify(graded.body)).toBe(200);
    const id = activity.activity.id;
    const responses = [
      (await client.get(`/api/me/activities/${id}`)).body,
      (await client.get("/api/me/activities?status=COMPLETED")).body,
      (await getHelp(client, id)).body,
      (await getOwnIntegrity(client, id)).body,
    ];
    const serialized = JSON.stringify(responses);
    expect(serialized).not.toMatch(MARKERS);
    expect(serialized).not.toMatch(/"grade"|feedback|Faltou a interface|Bom trabalho|leak|reasonCode|executionId/i);
    expect(StudentActivitySchema.parse(responses[0]).result).toBeNull();

    // Released and complete: the grade arrives, the helps and the records stay the same, the key never.
    expect((await releaseResult(teacherClient, schoolClass.id, id)).status).toBe(200);
    const after = StudentActivitySchema.parse((await client.get(`/api/me/activities/${id}`)).body);
    expect(after.result?.grade).toBe("0.95");
    const later = JSON.stringify([(await getHelp(client, id)).body, (await getOwnIntegrity(client, id)).body]);
    expect(later).toBe(JSON.stringify(responses.slice(2)));
    expect(JSON.stringify(after)).not.toMatch(MARKERS);
  });

  it("015/US5-1 015/FR-027 só as próprias: o colega não vê as ajudas nem as saídas; outra turma → 404", async () => {
    const { activity } = await delivered();
    const id = activity.activity.id;
    const classmate = StudentHelpStateSchema.parse((await getHelp(classmateClient, id)).body);
    expect([classmate.used, classmate.items]).toEqual([0, []]);
    expect((await getOwnIntegrity(classmateClient, id)).status).toBe(404);
    expect((await getHelp(outsiderClient, id)).status).toBe(404);
    expect((await getOwnIntegrity(outsiderClient, id)).status).toBe(404);
    const denied = await t.prisma.auditEvent.findMany({ where: { type: "student_access.denied", targetId: id } });
    expect(denied.length).toBeGreaterThanOrEqual(2);
  });
});
