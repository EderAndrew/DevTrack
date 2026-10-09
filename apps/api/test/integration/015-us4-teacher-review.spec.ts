import { IntegritySummaryListSchema, IntegrityTimelineSchema, TeacherHelpStateSchema, type Answer } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreatedActivity, createActivity, createClassWithStudents, gradeAttempt, saveAnswers, startAttempt, submitAttempt } from "../helpers/activities";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { getIntegritySummary, getTimeline, integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

/**
 * 015/US4 — the teacher sees the screen exits and the helps in the review (015/FR-024–FR-026,
 * research F13): per student the counts and durations derived from the events, one attempt's
 * timeline with its intervals, and each question's requests of help with the orientation and the
 * reason of a blocked or failed one. Facts only: nothing labels the student, changes a grade or is
 * shown to another teacher (404) or to a student (403).
 */

const START = "2026-10-01T12:00:00.000Z";
type ApiClient = ReturnType<typeof api>;

describe("015/US4 professor vê saídas da tela e ajudas na correção", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ApiClient;
  let otherTeacherClient: ApiClient;
  let student: TestUser;
  let client: ApiClient;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const work = (): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, alternatives: ["Encapsulamento protege o estado", "Herança múltipla", "Sobrecarga"], correctIndex: 0 },
        { type: "OPEN_ANSWER", valueCents: 50 },
      ],
    });
  const attemptIdOf = async (activity: CreatedActivity, who = student) =>
    (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.activity.id, studentUserId: who.id } })).id;
  const record = async (activity: CreatedActivity, ...events: ReturnType<typeof integrityEvent>[]) => {
    const res = await recordEvents(client, activity.activity.id, events);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  };
  const help = async (activity: CreatedActivity, question: number, output = validGuidance()) => {
    const res = await requestHelp(client, activity.activity.id, { questionId: activity.questionIds[question]!, question: `Pergunta da questão ${question + 1}` });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    scriptHelp(t.provider, res.body.id, output);
    await drain(t);
    return res.body.id as string;
  };
  const helpPath = (activity: CreatedActivity, attemptId: string) => `/api/classes/${schoolClass.id}/activities/${activity.activity.id}/attempts/${attemptId}/help`;

  /** Two exits of 2 and 3 minutes, a fullscreen exit, a paste blocked on question 2 and two helps (one blocked). */
  const answered = async () => {
    const activity = await work();
    expect((await startAttempt(client, activity.activity.id)).status).toBe(200);
    await record(activity, integrityEvent("SCREEN_LEFT"));
    clock.advance(2 * MINUTE);
    await record(activity, integrityEvent("SCREEN_RETURNED"));
    clock.advance(MINUTE);
    await record(activity, integrityEvent("FULLSCREEN_EXITED"), integrityEvent("SCREEN_LEFT"));
    clock.advance(3 * MINUTE);
    await record(activity, integrityEvent("SCREEN_RETURNED"), integrityEvent("FULLSCREEN_ENTERED"), integrityEvent("PASTE_BLOCKED", { questionId: activity.questionIds[1]! }));
    clock.advance(MINUTE);
    // A second apart, so the review lists them in the order they were asked.
    await help(activity, 1);
    clock.advance(1_000);
    await help(activity, 0, { outcome: "GUIDANCE", message: "A alternativa A é a certa.", example: null });
    clock.advance(1_000);
    await help(activity, 0);
    return { activity, attemptId: await attemptIdOf(activity) };
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
    otherTeacherClient = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    const created = await createClassWithStudents(t, teacher.id, { students: 2 });
    schoolClass = created.schoolClass;
    student = created.students[0]!;
    client = api(t, { cookie: await loginAs(t, student) });
  });

  it("015/US4-1 015/FR-024 resumo por aluno: saídas, tempo fora, tela cheia, bloqueios; ajudas usadas no roster", async () => {
    const { activity, attemptId } = await answered();
    const res = await getIntegritySummary(teacherClient, schoolClass.id, activity.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(IntegritySummaryListSchema.parse(res.body).items).toEqual([
      {
        studentUserId: student.id,
        attemptId,
        screenExits: 2,
        timeAwaySeconds: 300,
        fullscreenExits: 1,
        disconnections: 0,
        offlineSeconds: 0,
        clipboardBlocks: 1,
        typingLimitRejections: 0,
        fullscreenUnavailable: false,
        detectionUnavailable: false,
      },
    ]);
    const detail = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activity.activity.id}`);
    const row = (detail.body.roster as { studentUserId: string; aiHelpUsed: number | null }[]).find((item) => item.studentUserId === student.id);
    expect(row?.aiHelpUsed).toBe(2);
  });

  it("015/US4-1 tela cheia indisponível aparece no resumo", async () => {
    const activity = await work();
    await startAttempt(client, activity.activity.id);
    await record(activity, integrityEvent("FULLSCREEN_UNAVAILABLE"));
    const [item] = IntegritySummaryListSchema.parse((await getIntegritySummary(teacherClient, schoolClass.id, activity.activity.id)).body).items;
    expect(item).toMatchObject({ fullscreenUnavailable: true, screenExits: 0 });
  });

  it("015/US4-2 015/FR-025 linha do tempo com horário do servidor, intervalos derivados e totais", async () => {
    const { activity, attemptId } = await answered();
    const res = await getTimeline(teacherClient, schoolClass.id, activity.activity.id, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const timeline = IntegrityTimelineSchema.parse(res.body);
    expect(timeline.events.map((event) => [event.type, event.questionPosition])).toEqual([
      ["SCREEN_LEFT", null],
      ["SCREEN_RETURNED", null],
      ["FULLSCREEN_EXITED", null],
      ["SCREEN_LEFT", null],
      ["SCREEN_RETURNED", null],
      ["FULLSCREEN_ENTERED", null],
      ["PASTE_BLOCKED", 1],
    ]);
    expect(timeline.events[0]!.recordedAt).toBe(START);
    expect(timeline.intervals.map((interval) => [interval.kind, interval.seconds, interval.open]).sort()).toEqual([
      ["FULLSCREEN", 180, false],
      ["SCREEN", 120, false],
      ["SCREEN", 180, false],
    ]);
    expect(timeline.totals).toMatchObject({ screenExits: 2, timeAwaySeconds: 300, fullscreenExits: 1, clipboardBlocks: 1 });
    expect(JSON.stringify(timeline)).not.toMatch(/fraud|fraude|cola|violation|violação|suspeit/i);
  });

  it("015/US4-3 015/FR-025 ajudas por questão com pergunta, orientação, status e motivo; total usado", async () => {
    const { activity, attemptId } = await answered();
    const res = await teacherClient.get(helpPath(activity, attemptId));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const state = TeacherHelpStateSchema.parse(res.body);
    expect(state).toMatchObject({ allowance: 3, used: 2 });
    expect(state.items.map((item) => [item.questionPosition, item.question, item.status, item.reasonCode, item.message !== null])).toEqual([
      [1, "Pergunta da questão 2", "DELIVERED", null, true],
      [0, "Pergunta da questão 1", "BLOCKED", "MC_ALTERNATIVE_REFERENCED", false],
      [0, "Pergunta da questão 1", "DELIVERED", null, true],
    ]);
    expect(state.items[0]).toMatchObject({ message: validGuidance().message, requestedAt: expect.any(String), resolvedAt: expect.any(String) });
  });

  it("015/US4-4 tentativa ainda não entregue: saídas e ajudas até agora; uma saída sem retorno fica aberta até agora", async () => {
    const activity = await work();
    await startAttempt(client, activity.activity.id);
    await record(activity, integrityEvent("SCREEN_LEFT"));
    await help(activity, 1);
    clock.advance(4 * MINUTE);
    const attemptId = await attemptIdOf(activity);
    const timeline = IntegrityTimelineSchema.parse((await getTimeline(teacherClient, schoolClass.id, activity.activity.id, attemptId)).body);
    expect(timeline.intervals).toEqual([expect.objectContaining({ kind: "SCREEN", seconds: 240, open: true })]);
    expect(TeacherHelpStateSchema.parse((await teacherClient.get(helpPath(activity, attemptId))).body).used).toBe(1);
  });

  it("015/US4-5 outro professor → 404; aluno → 403; tentativa de outra atividade → 404", async () => {
    const { activity, attemptId } = await answered();
    const other = await work();
    const paths = [
      `/api/classes/${schoolClass.id}/activities/${activity.activity.id}/integrity`,
      `/api/classes/${schoolClass.id}/activities/${activity.activity.id}/attempts/${attemptId}/integrity`,
      helpPath(activity, attemptId),
    ];
    for (const path of paths) {
      expect((await otherTeacherClient.get(path)).status, path).toBe(404);
      expect((await client.get(path)).status, path).toBe(403);
    }
    expect((await getTimeline(teacherClient, schoolClass.id, other.activity.id, attemptId)).status).toBe(404);
    expect((await teacherClient.get(helpPath(other, attemptId))).status).toBe(404);
  });

  it("015/US4-6 015/FR-026 saídas e ajudas não mudam nota: a correção segue só a decisão do professor", async () => {
    const { activity, attemptId } = await answered();
    const answer: Answer = { kind: "TEXT", text: "Minha resposta" };
    await saveAnswers(client, activity.activity.id, [{ questionId: activity.questionIds[1]!, answer, baseRevision: 0 }]);
    expect((await submitAttempt(client, activity.activity.id, [])).status).toBe(200);
    const before = await t.prisma.activitySubmission.findFirstOrThrow({ include: { gradings: true } });
    expect(before.gradings.every((grading) => grading.finalGrade === null || grading.nature !== "HUMAN_DECISION")).toBe(true);
    await getIntegritySummary(teacherClient, schoolClass.id, activity.activity.id);
    await getTimeline(teacherClient, schoolClass.id, activity.activity.id, attemptId);
    await teacherClient.get(helpPath(activity, attemptId));
    expect(await t.prisma.activitySubmission.findFirstOrThrow({ include: { gradings: true } })).toEqual(before);
    const review = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activity.activity.id}/attempts/${attemptId}`);
    const graded = await gradeAttempt(teacherClient, schoolClass.id, activity.activity.id, attemptId, {
      version: review.body.submission.version,
      decisions: [{ questionId: activity.questionIds[1]!, grade: "0.50" }],
    });
    expect(graded.status, JSON.stringify(graded.body)).toBe(200);
    expect(graded.body.submission.grade).toBe("0.50");
  });

  it("015/FR-024 só alunos com tentativa e matrícula ativa entram no resumo", async () => {
    const activity = await work();
    expect(IntegritySummaryListSchema.parse((await getIntegritySummary(teacherClient, schoolClass.id, activity.activity.id)).body).items).toEqual([]);
    await startAttempt(client, activity.activity.id);
    await t.prisma.enrollment.updateMany({ where: { studentUserId: student.id }, data: { status: "REMOVED", removedAt: clock.now() } });
    expect(IntegritySummaryListSchema.parse((await getIntegritySummary(teacherClient, schoolClass.id, activity.activity.id)).body).items).toEqual([]);
  });
});
