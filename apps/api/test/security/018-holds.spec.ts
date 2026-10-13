import type { StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { applyExam, approvedExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { requestHelp } from "../helpers/work-help";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/FR-018 — an attempt on hold ("Encerrada por avisos") takes no write from any session (research
 * T8): the save and the submit answer `409 EXAM_ATTEMPT_ON_HOLD` under the attempt's lock, the AI help
 * stays off, the statement and the answers leave no device, and the database refuses the writes even
 * past the API (the 016 defense triggers extended to holds). Events are the one exception: facts kept
 * without counting (FR-020).
 */

const START = "2026-10-01T12:00:00.000Z";
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/FR-018 escrita recusada com a prova encerrada por avisos", () => {
  let t: TestApp;
  let clock: FixedClock;
  let student: TestUser;
  let activity: TeacherActivity;
  let attemptId: string;
  let sessions: [Client, Client];

  const answer = (baseRevision: number) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return [{ questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives[1]!.id }, baseRevision }];
  };
  const snapshot = async () => ({
    answers: await t.prisma.activityAnswer.findMany({ where: { attemptId }, select: { questionId: true, alternativeId: true, revision: true } }),
    submissions: await t.prisma.activitySubmission.count({ where: { attemptId } }),
    helps: await t.prisma.workHelpRequest.count({ where: { attemptId } }),
    occurrences: await t.prisma.examOccurrence.count({ where: { attemptId } }),
    attempt: (await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: attemptId } })).status,
  });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 1 });
    student = created.students[0]!;
    const exam = await approvedExam(t, client, syllabus);
    const res = await applyExam(client, created.schoolClass.id, exam.id, { acknowledgeOutOfScope: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    activity = res.body as TeacherActivity;
    // Two devices of the same student, both logged in before the hold.
    sessions = [api(t, { cookie: await loginAs(t, student) }), api(t, { cookie: await loginAs(t, student) })];
    expect((await startExam(sessions[0], activity.id)).status).toBe(200);
    expect((await saveAnswers(sessions[1], activity.id, answer(0))).status).toBe(200);
    attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } })).id;
    for (let i = 0; i < 4; i += 1) {
      clock.advance(5 * SECOND);
      expect((await recordEvents(sessions[i % 2]!, activity.id, [integrityEvent("SCREEN_LEFT")])).status).toBe(200);
    }
    expect(await t.prisma.examAttemptHold.count({ where: { attemptId, resolution: null } })).toBe(1);
  });

  it("018/FR-018 salvar e entregar são recusados em toda sessão com EXAM_ATTEMPT_ON_HOLD e nada muda", async () => {
    const before = await snapshot();
    for (const session of sessions) {
      const saved = await saveAnswers(session, activity.id, answer(1));
      expect([saved.status, saved.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
      const submitted = await submitAttempt(session, activity.id, answer(1));
      expect([submitted.status, submitted.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
      const empty = await submitAttempt(session, activity.id, []);
      expect([empty.status, empty.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("018/FR-018 a ajuda da IA continua desligada e nada é gravado", async () => {
    const before = await snapshot();
    for (const session of sessions) {
      const help = await requestHelp(session, activity.id, { questionId: activity.questions[0]!.id, question: "Como começo?" });
      expect(help.status).toBe(409);
    }
    expect(await snapshot()).toEqual(before);
  });

  it("018/FR-018 nenhum dispositivo recebe enunciado nem resposta; um novo início não reabre a tentativa", async () => {
    for (const session of sessions) {
      const view = (await session.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
      expect(view.questions).toEqual([]);
      expect(view.attempt!.answers).toEqual([]);
      expect(view.exam!.hold).not.toBeNull();
      const again = await startExam(session, activity.id);
      expect(again.status).toBe(200);
      expect((again.body as StudentActivity).questions).toEqual([]);
    }
    const marker = activity.questions[0]!.statement;
    const own = await sessions[0].get(`/api/me/activities/${activity.id}/attempt/integrity`);
    expect(own.status).toBe(200);
    expect(JSON.stringify(own.body)).not.toContain(marker);
  });

  it("018/FR-020 eventos na retenção são guardados como fato, sem ocorrência nova", async () => {
    const before = await snapshot();
    clock.advance(10 * SECOND);
    const res = await recordEvents(sessions[1], activity.id, [integrityEvent("PASTE_BLOCKED", { questionId: activity.questions[0]!.id }), integrityEvent("SCREEN_LEFT")]);
    expect([res.status, res.body.exam]).toEqual([200, { occurrenceCount: 4, held: true }]);
    expect(await snapshot()).toEqual(before);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId } })).toBe(6);
  });

  it("018/FR-018 o banco recusa a escrita mesmo fora da API (gatilhos de defesa)", async () => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    await expect(
      t.prisma.activityAnswer.update({
        where: { attemptId_questionId: { attemptId, questionId: question.id } },
        data: { alternativeId: question.alternatives[2]!.id, revision: { increment: 1 } },
      }),
    ).rejects.toThrow();
    const ids = { attemptId, activityId: activity.id, studentUserId: student.id };
    const event = await t.prisma.attemptIntegrityEvent.findFirstOrThrow({ where: { attemptId }, orderBy: { recordedAt: "desc" } });
    await expect(t.prisma.examOccurrence.create({ data: { ...ids, ordinal: 5, kind: "SCREEN_LEFT", firstEventId: event.id, recordedAt: clock.now() } })).rejects.toThrow();
    await expect(t.prisma.examAttemptHold.create({ data: { ...ids, occurrenceOrdinal: 4, openedAt: clock.now() } })).rejects.toThrow();
  });
});
