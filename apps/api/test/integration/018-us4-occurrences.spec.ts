import type { ClientIntegrityEventType, IntegrityEventInput, RecordIntegrityEventsResult, StudentActivity, TeacherActivity, TeacherExam } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createClassWithStudents, saveAnswers, submitAttempt } from "../helpers/activities";
import { pauseStudent } from "../helpers/attendance";
import { FixedClock, MINUTE } from "../helpers/clock";
import { applyExam, approvedExam, startExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

/**
 * 018/US4 — occurrences, warnings and the hold on the 4th (018/FR-015…FR-020, research T6, T8): the
 * server counts the countable events of an exam attempt with its own clock, groups the signals of one
 * action (2 s), opens the hold on the 4th occurrence in the batch's transaction and refuses every
 * write from then on. Events on hold are kept as facts without counting; paused, after the end or
 * after the submission they are refused and nothing is stored. The warning dialog and the
 * inactivity timer are the web's (`features/exam-attempt`, `components/ui/assessment`).
 */

const START = "2026-10-01T12:00:00.000Z";
const SECOND = 1000;
type Client = ReturnType<typeof api>;

describe("018/US4 ocorrências, avisos e encerramento na 4ª", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let client: Client;
  let classId: string;
  let students: TestUser[];
  let exam: TeacherExam;

  const studentClient = async (student: TestUser) => api(t, { cookie: await loginAs(t, student) });
  const auditOf = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const detail = async (student: Client, activityId: string) => {
    const res = await student.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as StudentActivity;
  };
  const applied = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const res = await applyExam(client, classId, exam.id, { acknowledgeOutOfScope: true, ...overrides });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };
  /** The first student, started on a new exam of `durationMinutes` (default 60). */
  const started = async (overrides: Parameters<typeof applyExam>[3] = {}) => {
    const activity = await applied(overrides);
    const student = await studentClient(students[0]!);
    expect((await startExam(student, activity.id)).status).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[0]!.id } });
    return { activity, student, attempt };
  };
  /** Sends one batch and expects it accepted. */
  const send = async (student: Client, activityId: string, events: IntegrityEventInput[]) => {
    const res = await recordEvents(student, activityId, events);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body as RecordIntegrityEventsResult;
  };
  /** One countable event, then the clock moves past the grouping window. */
  const occur = async (student: Client, activityId: string, type: ClientIntegrityEventType = "SCREEN_LEFT") => {
    const body = await send(student, activityId, [integrityEvent(type, type === "INACTIVITY" ? { idleSeconds: 45 } : {})]);
    clock.advance(5 * SECOND);
    return body;
  };
  const occurrences = (attemptId: string) => t.prisma.examOccurrence.findMany({ where: { attemptId }, orderBy: { ordinal: "asc" } });
  const multipleChoice = (activity: TeacherActivity) => {
    const question = activity.questions.find((item) => item.type === "MULTIPLE_CHOICE")!;
    return { questionId: question.id, answer: { kind: "ALTERNATIVE" as const, alternativeId: question.alternatives[0]!.id } };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"], name: "Ana Professora" });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    students = created.students;
    exam = await approvedExam(t, client, syllabus);
  });

  it("018/US4-1 trocar de aba registra a ocorrência com o tipo e o horário do servidor; a resposta já traz o aviso 1 de 3", async () => {
    const { activity, student, attempt } = await started();
    clock.advance(2 * MINUTE);
    const left = integrityEvent("SCREEN_LEFT", { clientOccurredAt: "2020-01-01T00:00:00.000Z" });
    const body = await send(student, activity.id, [left]);
    expect(body.recorded).toEqual([{ eventId: left.eventId, recordedAt: clock.now().toISOString() }]);
    expect(body.exam).toEqual({ occurrenceCount: 1, held: false });

    const [occurrence] = await occurrences(attempt.id);
    expect(occurrence).toMatchObject({ ordinal: 1, kind: "SCREEN_LEFT", recordedAt: clock.now() });
    // The browser's time of a live event is not stored: the server's clock is the only official time.
    const stored = await t.prisma.attemptIntegrityEvent.findFirstOrThrow({ where: { id: occurrence!.firstEventId } });
    expect([stored.recordedAt, stored.clientOccurredAt]).toEqual([clock.now(), null]);

    // The return is a fact, never an occurrence; the student's view counts 1 of 3.
    clock.advance(10 * SECOND);
    expect((await send(student, activity.id, [integrityEvent("SCREEN_RETURNED")])).exam).toEqual({ occurrenceCount: 1, held: false });
    expect((await detail(student, activity.id)).exam!.occurrences).toEqual({ count: 1, warningsAllowed: 3 });
  });

  it("018/US4-2 tentar colar registra a ocorrência de área de transferência e o aviso seguinte", async () => {
    const { activity, student, attempt } = await started();
    await occur(student, activity.id, "FULLSCREEN_EXITED");
    const { questionId } = multipleChoice(activity);
    const body = await send(student, activity.id, [integrityEvent("PASTE_BLOCKED", { questionId })]);
    expect(body.exam).toEqual({ occurrenceCount: 2, held: false });
    expect((await occurrences(attempt.id)).map((row) => row.kind)).toEqual(["FULLSCREEN_EXITED", "CLIPBOARD"]);
  });

  it("018/US4-3 a inatividade além do limite é uma ocorrência com idleSeconds; um período sem interação conta uma vez", async () => {
    const { activity, student, attempt } = await started({ inactivityLimitSeconds: 30 });
    clock.advance(31 * SECOND);
    const idle = integrityEvent("INACTIVITY", { idleSeconds: 30 });
    expect((await send(student, activity.id, [idle])).exam).toEqual({ occurrenceCount: 1, held: false });
    const stored = await t.prisma.attemptIntegrityEvent.findFirstOrThrow({ where: { attemptId: attempt.id, clientEventId: idle.eventId } });
    expect([stored.type, stored.idleSeconds]).toEqual(["INACTIVITY", 30]);
    expect((await occurrences(attempt.id)).map((row) => row.kind)).toEqual(["INACTIVITY"]);

    // The browser sends one event per idle period; a resend of the same event counts nothing.
    expect((await send(student, activity.id, [idle])).exam).toEqual({ occurrenceCount: 1, held: false });
    // `idleSeconds` only with INACTIVITY, and within 30–60.
    for (const event of [integrityEvent("INACTIVITY"), integrityEvent("INACTIVITY", { idleSeconds: 29 }), integrityEvent("SCREEN_LEFT", { idleSeconds: 30 })]) {
      expect((await recordEvents(student, activity.id, [event])).status, JSON.stringify(event)).toBe(400);
    }
  });

  it("018/US4-4 018/FR-016 sinais de uma mesma ação em até 2 s contam uma vez; depois da janela contam de novo", async () => {
    const { activity, student, attempt } = await started();
    // alt+tab: blur and fullscreen exit in one batch.
    let body = await send(student, activity.id, [integrityEvent("SCREEN_LEFT"), integrityEvent("FULLSCREEN_EXITED")]);
    expect(body.exam).toEqual({ occurrenceCount: 1, held: false });
    // The same action's second signal in another batch, 1,5 s later by the server's clock.
    clock.advance(1500);
    body = await send(student, activity.id, [integrityEvent("FULLSCREEN_EXITED")]);
    expect(body.exam).toEqual({ occurrenceCount: 1, held: false });
    clock.advance(2 * SECOND);
    body = await send(student, activity.id, [integrityEvent("COPY_BLOCKED")]);
    expect(body.exam).toEqual({ occurrenceCount: 2, held: false });
    expect((await occurrences(attempt.id)).map((row) => [row.ordinal, row.kind])).toEqual([
      [1, "SCREEN_LEFT"],
      [2, "CLIPBOARD"],
    ]);
    // Every signal is still a fact.
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(4);
  });

  it("018/US4-5 018/FR-018 a 4ª ocorrência encerra a tentativa na hora: retenção aberta, questões escondidas e toda escrita recusada", async () => {
    const { activity, student, attempt } = await started();
    const save = multipleChoice(activity);
    expect((await saveAnswers(student, activity.id, [{ ...save, baseRevision: 0 }])).status).toBe(200);
    const kinds: ClientIntegrityEventType[] = ["SCREEN_LEFT", "FULLSCREEN_EXITED", "CUT_BLOCKED"];
    for (const [index, type] of kinds.entries()) {
      expect((await occur(student, activity.id, type)).exam).toEqual({ occurrenceCount: index + 1, held: false });
    }
    expect(await t.prisma.examAttemptHold.count()).toBe(0);

    const fourth = await occur(student, activity.id, "INACTIVITY");
    expect(fourth.exam).toEqual({ occurrenceCount: 4, held: true });
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: attempt.id } });
    expect(hold).toMatchObject({ occurrenceOrdinal: 4, resolution: null });

    // Nothing about grade or cancellation is written when the hold opens (018/FR-019).
    const after = await t.prisma.activityAttempt.findUniqueOrThrow({ where: { id: attempt.id }, include: { submission: true, answers: true } });
    expect([after.status, after.submission, after.answers.length]).toEqual(["IN_PROGRESS", null, 1]);

    // Any device: no question, no answer, the hold shown; every write refused with the hold's code.
    const otherDevice = await studentClient(students[0]!);
    const view = await detail(otherDevice, activity.id);
    expect(view.questions).toEqual([]);
    expect(view.attempt!.answers).toEqual([]);
    expect(view.exam).toMatchObject({ occurrences: { count: 4, warningsAllowed: 3 }, hold: { openedAt: hold.openedAt.toISOString() }, endReason: null });
    const refusedSave = await saveAnswers(otherDevice, activity.id, [{ ...save, baseRevision: 1 }]);
    expect([refusedSave.status, refusedSave.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
    const refusedSubmit = await submitAttempt(student, activity.id, []);
    expect([refusedSubmit.status, refusedSubmit.body.code]).toEqual([409, "EXAM_ATTEMPT_ON_HOLD"]);
    expect(refusedSubmit.body.message).toBe("Prova encerrada por excesso de avisos; o cancelamento com nota zero será confirmado pelo professor");
    expect((await auditOf("activity_submission.rejected")).map((event) => event.metadata)).toEqual([
      { operation: "SAVE", code: "EXAM_ATTEMPT_ON_HOLD" },
      { operation: "SUBMIT", code: "EXAM_ATTEMPT_ON_HOLD" },
    ]);

    // The teacher sees the student awaiting the decision, with the count.
    const teacherView = (await client.get(`/api/classes/${classId}/activities/${activity.id}`)).body as TeacherActivity;
    expect(teacherView.roster.find((row) => row.studentUserId === students[0]!.id)).toMatchObject({ status: "AWAITING_DECISION", occurrenceCount: 4 });
    expect(teacherView.roster.find((row) => row.studentUserId === students[1]!.id)).toMatchObject({ status: "NOT_STARTED", occurrenceCount: 0 });

    // The time running out never settles an attempt on hold: it waits for the teacher.
    clock.advance(2 * 60 * MINUTE);
    expect((await detail(student, activity.id)).exam).toMatchObject({ hold: { openedAt: hold.openedAt.toISOString() }, endReason: null });
  });

  it("018/FR-017 cada tipo contável abre uma ocorrência; retornos, conexão e avisos do navegador não contam", async () => {
    const { activity, student, attempt } = await started();
    const ignored: ClientIntegrityEventType[] = [
      "SCREEN_RETURNED",
      "FULLSCREEN_ENTERED",
      "PAGE_LEAVE_ATTEMPTED",
      "CONNECTION_LOST",
      "CONNECTION_RESTORED",
      "FULLSCREEN_UNAVAILABLE",
      "DETECTION_UNAVAILABLE",
    ];
    for (const type of ignored) {
      expect((await send(student, activity.id, [integrityEvent(type)])).exam, type).toEqual({ occurrenceCount: 0, held: false });
      clock.advance(5 * SECOND);
    }
    const counted: ClientIntegrityEventType[] = ["SCREEN_LEFT", "PASTE_BLOCKED", "DROP_BLOCKED"];
    for (const type of counted) await occur(student, activity.id, type);
    expect((await occurrences(attempt.id)).map((row) => row.kind)).toEqual(["SCREEN_LEFT", "CLIPBOARD", "CLIPBOARD"]);
  });

  it("018/US4-6 ocorrências simultâneas contam uma vez cada e o encerramento acontece exatamente uma vez", async () => {
    const { activity, student, attempt } = await started();
    await occur(student, activity.id);
    await occur(student, activity.id);
    // Two tabs: the 3rd and the 4th arrive together (and one of them is resent).
    clock.advance(5 * SECOND);
    const tabA = integrityEvent("SCREEN_LEFT");
    const otherTab = await studentClient(students[0]!);
    const [a, b, resend] = await Promise.all([
      recordEvents(student, activity.id, [tabA]),
      recordEvents(otherTab, activity.id, [integrityEvent("PASTE_BLOCKED")]),
      recordEvents(otherTab, activity.id, [tabA]),
    ]);
    expect([a.status, b.status, resend.status]).toEqual([200, 200, 200]);
    // Same server instant: they group into one occurrence (the window), counted once whatever the order.
    expect((await occurrences(attempt.id)).map((row) => row.ordinal)).toEqual([1, 2, 3]);
    clock.advance(5 * SECOND);
    const fourth = await Promise.all([recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")]), recordEvents(otherTab, activity.id, [integrityEvent("CUT_BLOCKED")])]);
    expect(fourth.map((res) => res.status)).toEqual([200, 200]);
    expect(await t.prisma.examAttemptHold.count({ where: { attemptId: attempt.id } })).toBe(1);
    expect(await auditOf("exam_attempt.held")).toHaveLength(1);
  });

  it("018/US4-7 o lote guardado sem conexão é contado na chegada com o horário do servidor e recusado se chegar após o fim", async () => {
    const { activity, student, attempt } = await started({ durationMinutes: 10 });
    clock.advance(3 * MINUTE);
    // Offline: two exits 30 s apart by the browser's clock, sent together on reconnection.
    const buffered = [
      integrityEvent("SCREEN_LEFT", { buffered: true, clientOccurredAt: new Date(clock.now().getTime() - 60 * SECOND).toISOString() }),
      integrityEvent("FULLSCREEN_EXITED", { buffered: true, clientOccurredAt: new Date(clock.now().getTime() - 59 * SECOND).toISOString() }),
      integrityEvent("SCREEN_LEFT", { buffered: true, clientOccurredAt: new Date(clock.now().getTime() - 30 * SECOND).toISOString() }),
    ];
    expect((await send(student, activity.id, buffered)).exam).toEqual({ occurrenceCount: 2, held: false });
    const rows = await occurrences(attempt.id);
    // Counted on arrival: the official time is the server's; the browser's is kept only on the event.
    expect(rows.map((row) => row.recordedAt.getTime())).toEqual([clock.now().getTime(), clock.now().getTime()]);
    const firstEvent = await t.prisma.attemptIntegrityEvent.findFirstOrThrow({ where: { id: rows[0]!.firstEventId } });
    expect(firstEvent.clientOccurredAt!.toISOString()).toBe(buffered[0]!.clientOccurredAt);

    // After the end (start + 10 min), the buffered batch is refused whole and nothing is stored.
    clock.set(new Date(new Date(START).getTime() + 10 * MINUTE).toISOString());
    const late = await recordEvents(student, activity.id, [
      integrityEvent("SCREEN_LEFT", { buffered: true, clientOccurredAt: new Date(clock.now().getTime() - 5 * SECOND).toISOString() }),
    ]);
    expect([late.status, late.body.code]).toEqual([409, "EXAM_TIME_OVER"]);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(3);
    expect(await occurrences(attempt.id)).toHaveLength(2);
    expect((await auditOf("exam_attempt.write_refused")).map((event) => [event.actorUserId, event.metadata])).toEqual([
      [students[0]!.id, { activityId: activity.id, operation: "EVENTS", code: "EXAM_TIME_OVER" }],
    ]);
  });

  it("018/FR-020 com a retenção aberta os eventos são guardados como fato sem contar; pausada ou após a entrega são recusados sem gravar", async () => {
    // On hold: stored, not counted, 200.
    const { activity, student, attempt } = await started();
    for (let i = 0; i < 4; i += 1) await occur(student, activity.id);
    const onHold = integrityEvent("SCREEN_LEFT");
    expect((await send(student, activity.id, [onHold])).exam).toEqual({ occurrenceCount: 4, held: true });
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id, clientEventId: onHold.eventId } })).toBe(1);
    expect(await occurrences(attempt.id)).toHaveLength(4);
    expect(await t.prisma.examAttemptHold.count()).toBe(1);

    // Paused by the teacher (016): refused with ATTEMPT_PAUSED, nothing stored.
    const second = await studentClient(students[1]!);
    expect((await startExam(second, activity.id)).status).toBe(200);
    const secondAttempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[1]!.id } });
    const pause = await pauseStudent(client, classId, activity.id, students[1]!.id);
    expect(pause.status, JSON.stringify(pause.body)).toBe(201);
    const paused = await recordEvents(second, activity.id, [integrityEvent("SCREEN_LEFT")]);
    expect([paused.status, paused.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: secondAttempt.id } })).toBe(0);
  });

  it("018/FR-019 018/FR-020 depois da entrega o evento é recusado com 409 e nada é gravado nem contado", async () => {
    const { activity, student, attempt } = await started();
    await occur(student, activity.id);
    expect((await submitAttempt(student, activity.id, [])).status).toBe(200);
    const after = await recordEvents(student, activity.id, [integrityEvent("SCREEN_LEFT")]);
    expect([after.status, after.body.code]).toEqual([409, "ATTEMPT_ALREADY_SUBMITTED"]);
    expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(1);
    expect(await occurrences(attempt.id)).toHaveLength(1);
  });

  it("018/US4-8 nenhum aviso, código ou mensagem de encerramento usa “fraude”, “cola” ou “violação”", async () => {
    const { activity, student } = await started();
    for (let i = 0; i < 4; i += 1) await occur(student, activity.id);
    const refused = await submitAttempt(student, activity.id, []);
    const texts = [JSON.stringify(refused.body), JSON.stringify(await detail(student, activity.id))];
    const audit = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "exam_attempt." } } });
    texts.push(JSON.stringify(audit.map((event) => [event.type, event.metadata])));
    for (const text of texts) expect(text).not.toMatch(/fraude|\bcola\b|viola[cç][aã]o/i);
  });

  it("018/US4-5 a auditoria da retenção: exam_attempt.held uma vez, pelo SYSTEM, com ids e o ordinal", async () => {
    const { activity, student, attempt } = await started();
    for (let i = 0; i < 5; i += 1) await occur(student, activity.id);
    const held = await auditOf("exam_attempt.held");
    expect(held).toHaveLength(1);
    const hold = await t.prisma.examAttemptHold.findFirstOrThrow({ where: { attemptId: attempt.id } });
    expect(held[0]).toMatchObject({
      actorType: "SYSTEM",
      actorUserId: null,
      targetType: "ACTIVITY_ATTEMPT",
      targetId: attempt.id,
      metadata: { activityId: activity.id, holdId: hold.id, occurrenceOrdinal: 4 },
    });
  });
});
