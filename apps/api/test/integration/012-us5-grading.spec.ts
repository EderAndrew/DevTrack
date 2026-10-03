import type { Answer, TeacherActivity, TeacherAttempt } from "@repo/contracts";
import { TeacherActivitySchema, TeacherAttemptSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import {
  acceptSubmission,
  createActivity,
  type CreateActivityOptions,
  type CreatedActivity,
  createAttemptRow,
  getAttempt,
  gradeAttempt,
  releaseResult,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 012/US5 — the teacher receives, grades and releases: each student's situation with the counts,
 * an attempt opened next to the answer key, multiple choice already graded by the 011 rule, the
 * teacher's grade per pending question (0…value in hundredths) with feedback, the grade recomputed
 * and the release of the whole activity; a saved attempt of a student who can no longer submit is
 * accepted as a late submission (FR-006b). Another teacher's ids → 404.
 */

const START = "2026-10-01T12:00:00.000Z";

describe("012/US5 professor recebe, corrige e libera o resultado", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** Multiple choice 0,30 (correct: first) + 0,20 (correct: second), open answer 0,30 and code 0,20. */
  const activityOf = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 30, correctIndex: 0 },
        { type: "MULTIPLE_CHOICE", valueCents: 20, correctIndex: 1 },
        { type: "OPEN_ANSWER", valueCents: 30 },
        { type: "CODE", valueCents: 20, starterCode: "class Main {}" },
      ],
      ...options,
    });
  const text = (value: string): Answer => ({ kind: "TEXT", text: value });
  const choice = (alternativeId: string | null): Answer => ({ kind: "ALTERNATIVE", alternativeId });
  const code = (source: string): Answer => ({ kind: "CODE", source });
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });

  const enrolledStudent = async (name: string) => {
    const student = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, schoolClass.id, student.id);
    return { student, client: api(t, { cookie: await loginAs(t, student) }) };
  };
  /** A student who starts, answers every question (MC1 right, MC2 wrong) and submits on time. */
  const submittedBy = async (name: string, created: CreatedActivity) => {
    const { student, client } = await enrolledStudent(name);
    const { activity, questionIds, alternativeIds } = created;
    expect((await startAttempt(client, activity.id)).status).toBe(200);
    const res = await submitAttempt(client, activity.id, [
      { questionId: questionIds[0]!, answer: choice(alternativeIds[0]![0]!), baseRevision: 0 },
      { questionId: questionIds[1]!, answer: choice(alternativeIds[1]![0]!), baseRevision: 0 },
      { questionId: questionIds[2]!, answer: text("Encapsulamento protege o estado."), baseRevision: 0 },
      { questionId: questionIds[3]!, answer: code("class Main { int x; }"), baseRevision: 0 },
    ]);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });
    return { student, client, attemptId: attempt.id };
  };
  const detail = async (activityId: string): Promise<TeacherActivity> => {
    const res = await teacherClient.get(`/api/classes/${schoolClass.id}/activities/${activityId}`);
    expect(res.status).toBe(200);
    return TeacherActivitySchema.parse(res.body);
  };
  const attemptView = async (activityId: string, attemptId: string): Promise<TeacherAttempt> => {
    const res = await getAttempt(teacherClient, schoolClass.id, activityId, attemptId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return TeacherAttemptSchema.parse(res.body);
  };
  const gradingOf = (view: TeacherAttempt, questionId: string) => view.submission!.gradings.find((grading) => grading.questionId === questionId)!;

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    schoolClass = await createClass(t, teacher.id, { name: "POO 2026.2" });
  });

  describe("012/FR-006 situação de cada aluno", () => {
    it("Não iniciou, Em andamento, Entregou, Entregou com atraso e aluno removido com tentativa; depois do prazo, Não entregou", async () => {
      const created = await activityOf({ deadline: at(DAY) });
      const { activity } = created;
      const { student: ana } = await enrolledStudent("Ana Não Iniciou");
      const { student: bruno } = await enrolledStudent("Bruno Em Andamento");
      const { student: carla } = await submittedBy("Carla Entregou", created);
      const { student: davi } = await enrolledStudent("Davi Atrasado");
      const { student: eva } = await enrolledStudent("Eva Removida");
      await createAttemptRow(t, activity.id, bruno.id, { startedAt: at(-HOUR) });
      await createAttemptRow(t, activity.id, davi.id, { submission: { submittedAt: at(-MINUTE), late: true, acceptedById: teacher.id, gradePartial: true } });
      await createAttemptRow(t, activity.id, eva.id, { startedAt: at(-HOUR) });
      await t.prisma.enrollment.updateMany({
        where: { classId: schoolClass.id, studentUserId: eva.id },
        data: { status: "REMOVED", removedAt: at(-MINUTE), removedById: teacher.id },
      });
      const { student: fabio } = await enrolledStudent("Fábio Removido Sem Tentativa");
      await t.prisma.enrollment.updateMany({
        where: { classId: schoolClass.id, studentUserId: fabio.id },
        data: { status: "REMOVED", removedAt: at(-MINUTE), removedById: teacher.id },
      });

      const before = await detail(activity.id);
      expect(before.roster.map((entry) => [entry.name, entry.enrollment, entry.status])).toEqual([
        ["Ana Não Iniciou", "ACTIVE", "NOT_STARTED"],
        ["Bruno Em Andamento", "ACTIVE", "IN_PROGRESS"],
        ["Carla Entregou", "ACTIVE", "SUBMITTED"],
        ["Davi Atrasado", "ACTIVE", "SUBMITTED_LATE"],
        ["Eva Removida", "REMOVED", "IN_PROGRESS"],
      ]);
      expect(before.roster.find((entry) => entry.studentUserId === carla.id)).toMatchObject({ grade: "0.30", gradePartial: true });
      expect(before.roster.find((entry) => entry.studentUserId === ana.id)).toMatchObject({ attemptId: null, submittedAt: null, grade: null });
      expect(before.counts).toEqual({ enrolled: 4, inProgress: 2, submitted: 1, submittedLate: 1, missed: 0, pendingGrading: 2 });

      clock.advance(DAY + MINUTE);
      const after = await detail(activity.id);
      expect(after.roster.map((entry) => entry.status)).toEqual(["MISSED", "MISSED", "SUBMITTED", "SUBMITTED_LATE", "MISSED"]);
      expect(after.counts).toMatchObject({ inProgress: 0, missed: 3 });
      const listed = (await teacherClient.get(`/api/classes/${schoolClass.id}/activities`)).body.items[0];
      expect(listed.counts).toEqual(after.counts);
    });
  });

  describe("012/FR-006 abrir a tentativa", () => {
    it("012/US5-1 entregue: respostas, MC corrigidas pela regra EXACT_MATCH sem IA, aberta e código pendentes, nota parcial", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const { student, attemptId } = await submittedBy("Carla", created);

      const view = await attemptView(activity.id, attemptId);
      expect(view.student).toEqual({ userId: student.id, name: "Carla" });
      expect(view.status).toBe("SUBMITTED");
      expect(view.answers.map((answer) => answer.questionId)).toEqual(questionIds);
      expect(view.answers[2]!.answer).toEqual(text("Encapsulamento protege o estado."));
      expect(view.submission).toMatchObject({ late: false, acceptedByTeacher: false, blankCount: 0, grade: "0.30", gradePartial: true, generalFeedback: null, version: 1 });
      expect(view.submission!.gradings.map((grading) => [grading.questionId, grading.status, grading.nature, grading.finalGrade, grading.pendingReason])).toEqual([
        [questionIds[0], "GRADED", "RULE_RESULT", "0.30", null],
        [questionIds[1], "GRADED", "RULE_RESULT", "0.00", null],
        [questionIds[2], "PENDING_TEACHER", null, null, "AI_REVIEW_UNAVAILABLE"],
        [questionIds[3], "PENDING_TEACHER", null, null, "NO_TEST_CASES"],
      ]);
    });

    it("012/US5-2 não entregue: somente leitura, sem entrega, com as respostas salvas", async () => {
      const { activity, questionIds } = await activityOf();
      const { student, client } = await enrolledStudent("Bruno");
      await startAttempt(client, activity.id);
      await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("Rascunho"), baseRevision: 0 }]);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });

      const view = await attemptView(activity.id, attempt.id);
      expect(view.status).toBe("IN_PROGRESS");
      expect(view.submission).toBeNull();
      expect(view.answers).toEqual([{ questionId: questionIds[2], answer: text("Rascunho"), savedAt: at(0).toISOString() }]);
      expect(view.lastSavedAt).toBe(at(0).toISOString());
    });

    it("tentativa de outra atividade da turma → 404", async () => {
      const created = await activityOf();
      const other = await activityOf();
      const { attemptId } = await submittedBy("Carla", created);
      expect((await getAttempt(teacherClient, schoolClass.id, other.activity.id, attemptId)).status).toBe(404);
    });
  });

  describe("012/FR-006 correção do professor", () => {
    it("012/US5-2 nota dentro do valor → DECIDED, nota recalculada, feedbacks e activity_submission.graded", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const { attemptId } = await submittedBy("Carla", created);
      clock.advance(HOUR);

      const res = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, {
        version: 1,
        decisions: [{ questionId: questionIds[2]!, grade: "0.25", feedback: "Faltou citar a interface pública." }],
        generalFeedback: "Bom trabalho.",
      });
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const partial = TeacherAttemptSchema.parse(res.body);
      expect(gradingOf(partial, questionIds[2]!)).toEqual({
        questionId: questionIds[2],
        status: "DECIDED",
        nature: "HUMAN_DECISION",
        finalGrade: "0.25",
        teacherGrade: "0.25",
        pendingReason: null,
        feedback: "Faltou citar a interface pública.",
      });
      expect(partial.submission).toMatchObject({ grade: "0.55", gradePartial: true, generalFeedback: "Bom trabalho.", version: 2 });

      const done = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, {
        version: 2,
        decisions: [{ questionId: questionIds[3]!, grade: "0.20" }],
      });
      expect(done.status).toBe(200);
      expect(done.body.submission).toMatchObject({ grade: "0.75", gradePartial: false, generalFeedback: "Bom trabalho.", version: 3 });
      expect(gradingOf(done.body, questionIds[2]!).feedback).toBe("Faltou citar a interface pública.");

      const stored = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId } });
      expect(stored.gradedAt).toEqual(at(0));
      const graded = await events("activity_submission.graded");
      expect(graded.map((event) => event.metadata)).toEqual([
        { activityId: activity.id, decidedCount: 1, overriddenRuleCount: 0, gradeCents: 55, partial: true, afterRelease: false, generalFeedbackChanged: true },
        { activityId: activity.id, decidedCount: 1, overriddenRuleCount: 0, gradeCents: 75, partial: false, afterRelease: false, generalFeedbackChanged: false },
      ]);
      expect(graded[0]).toMatchObject({ actorUserId: teacher.id, targetType: "ACTIVITY_SUBMISSION", targetId: stored.id });
      expect((await detail(activity.id)).counts.pendingGrading).toBe(0);
    });

    it("sobrescrever um RULE_RESULT: a revisão do professor prevalece", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const { attemptId } = await submittedBy("Carla", created);
      const res = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, {
        version: 1,
        decisions: [{ questionId: questionIds[1]!, grade: "0.10", feedback: "Raciocínio parcialmente certo." }],
      });
      expect(res.status).toBe(200);
      expect(gradingOf(res.body, questionIds[1]!)).toMatchObject({ status: "DECIDED", nature: "HUMAN_DECISION", finalGrade: "0.10" });
      expect(res.body.submission.grade).toBe("0.40");
      expect((await events("activity_submission.graded"))[0]!.metadata).toMatchObject({ decidedCount: 1, overriddenRuleCount: 1 });
    });

    it("012/US5-3 nota fora de 0…valor → 422 GRADE_OUT_OF_RANGE; três casas → 400; nada muda", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const { attemptId } = await submittedBy("Carla", created);
      const grade = (questionId: string, value: string) =>
        gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, { version: 1, decisions: [{ questionId, grade: value }] });

      expect((await grade(questionIds[2]!, "0.31")).body.code).toBe("GRADE_OUT_OF_RANGE");
      expect((await grade(questionIds[2]!, "0.31")).status).toBe(422);
      expect((await grade(questionIds[2]!, "0.255")).status).toBe(400);
      expect((await grade(questionIds[2]!, "-0.01")).status).toBe(400);
      expect((await grade(questionIds[2]!, "0.00")).status).toBe(200);
      const stored = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId } });
      expect(stored.version).toBe(2);
      expect(await events("activity_submission.graded")).toHaveLength(1);
    });

    it("questão de outra atividade → 422 UNKNOWN_QUESTION; versão antiga → 409 SUBMISSION_VERSION_CONFLICT; não entregue → 409 NOT_SUBMITTED", async () => {
      const created = await activityOf();
      const other = await activityOf();
      const { activity, questionIds } = created;
      const { attemptId } = await submittedBy("Carla", created);

      const unknown = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, {
        version: 1,
        decisions: [{ questionId: other.questionIds[2]!, grade: "0.10" }],
      });
      expect([unknown.status, unknown.body.code]).toEqual([422, "UNKNOWN_QUESTION"]);

      expect((await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, { version: 1, decisions: [{ questionId: questionIds[2]!, grade: "0.10" }] })).status).toBe(200);
      const stale = await gradeAttempt(teacherClient, schoolClass.id, activity.id, attemptId, { version: 1, decisions: [{ questionId: questionIds[2]!, grade: "0.20" }] });
      expect([stale.status, stale.body.code]).toEqual([409, "SUBMISSION_VERSION_CONFLICT"]);

      const { student } = await enrolledStudent("Bruno");
      const { attemptId: openAttempt } = await createAttemptRow(t, activity.id, student.id);
      const notSubmitted = await gradeAttempt(teacherClient, schoolClass.id, activity.id, openAttempt, { version: 1, decisions: [] });
      expect([notSubmitted.status, notSubmitted.body.code]).toEqual([409, "NOT_SUBMITTED"]);
      expect(await events("activity_submission.graded")).toHaveLength(1);
    });
  });

  describe("012/FR-006 liberação do resultado", () => {
    it("012/US5-4 liberar: corrigida por completo vira CORRIGIDO com nota e feedback; parcial continua ENTREGUE; repetir é no-op", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const carla = await submittedBy("Carla", created);
      const davi = await submittedBy("Davi", created);
      await gradeAttempt(teacherClient, schoolClass.id, activity.id, carla.attemptId, {
        version: 1,
        decisions: [
          { questionId: questionIds[2]!, grade: "0.30", feedback: "Perfeito." },
          { questionId: questionIds[3]!, grade: "0.15" },
        ],
        generalFeedback: "Muito bem.",
      });
      const studentView = async (client: ReturnType<typeof api>) => (await client.get(`/api/me/activities/${activity.id}`)).body;

      expect(await studentView(carla.client)).toMatchObject({ status: "SUBMITTED", result: null });
      clock.advance(HOUR);
      const released = await releaseResult(teacherClient, schoolClass.id, activity.id);
      expect(released.status, JSON.stringify(released.body)).toBe(200);
      expect(TeacherActivitySchema.parse(released.body).resultReleasedAt).toBe(at(0).toISOString());
      const [event, ...more] = await events("activity_result.released");
      expect(more).toEqual([]);
      expect(event).toMatchObject({
        actorUserId: teacher.id,
        targetType: "CLASS_ACTIVITY",
        targetId: activity.id,
        metadata: { classId: schoolClass.id, submittedCount: 2, completeCount: 1 },
      });

      const carlaView = await studentView(carla.client);
      expect(carlaView.status).toBe("GRADED");
      expect(carlaView.result).toMatchObject({ grade: "0.75", generalFeedback: "Muito bem." });
      expect(carlaView.result.questions.find((question: { questionId: string }) => question.questionId === questionIds[2])).toEqual({
        questionId: questionIds[2],
        grade: "0.30",
        feedback: "Perfeito.",
      });
      expect(await studentView(davi.client)).toMatchObject({ status: "SUBMITTED", result: null });

      const again = await releaseResult(teacherClient, schoolClass.id, activity.id);
      expect(again.status).toBe(200);
      expect(again.body.resultReleasedAt).toBe(at(0).toISOString());
      expect(await events("activity_result.released")).toHaveLength(1);
    });

    it("012/FR-006 ajuste depois de liberado vale na hora para o aluno, com afterRelease: true", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const carla = await submittedBy("Carla", created);
      await gradeAttempt(teacherClient, schoolClass.id, activity.id, carla.attemptId, {
        version: 1,
        decisions: [
          { questionId: questionIds[2]!, grade: "0.30" },
          { questionId: questionIds[3]!, grade: "0.20" },
        ],
      });
      await releaseResult(teacherClient, schoolClass.id, activity.id);
      const adjusted = await gradeAttempt(teacherClient, schoolClass.id, activity.id, carla.attemptId, {
        version: 2,
        decisions: [{ questionId: questionIds[3]!, grade: "0.05", feedback: "Revisado: o método não compila." }],
      });
      expect(adjusted.status).toBe(200);
      const view = (await carla.client.get(`/api/me/activities/${activity.id}`)).body;
      expect(view.result.grade).toBe("0.65");
      expect(view.result.questions.find((question: { questionId: string }) => question.questionId === questionIds[3])).toMatchObject({
        grade: "0.05",
        feedback: "Revisado: o método não compila.",
      });
      expect((await events("activity_submission.graded")).at(-1)!.metadata).toMatchObject({ afterRelease: true, gradeCents: 65 });
    });

    it("atividade cancelada → 409 INVALID_STATE_TRANSITION", async () => {
      const { activity } = await activityOf({ status: "CANCELLED" });
      const res = await releaseResult(teacherClient, schoolClass.id, activity.id);
      expect([res.status, res.body.code]).toEqual([409, "INVALID_STATE_TRANSITION"]);
      expect(await events("activity_result.released")).toEqual([]);
    });
  });

  describe("012/FR-006b aceitar a tentativa como entrega", () => {
    it("012/US5-6 perdeu o prazo sob REJECT com respostas salvas: entrega atrasada, aceita pelo professor, MC corrigidas; o aluno vê ENTREGUE; repetir não cria outra", async () => {
      const deadline = new Date("2026-10-01T23:59:00.000Z");
      const { activity, questionIds, alternativeIds } = await activityOf({ deadline, latePolicy: "REJECT" });
      const { student, client } = await enrolledStudent("Bruno");
      clock.set("2026-10-01T23:50:00.000Z");
      await startAttempt(client, activity.id);
      clock.set("2026-10-01T23:58:00.000Z");
      await saveAnswers(client, activity.id, [
        { questionId: questionIds[0]!, answer: choice(alternativeIds[0]![0]!), baseRevision: 0 },
        { questionId: questionIds[2]!, answer: text("Resposta salva às 23:58"), baseRevision: 0 },
      ]);
      clock.set("2026-10-02T08:00:00.000Z");
      expect((await submitAttempt(client, activity.id)).body.code).toBe("DEADLINE_PASSED");
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });

      const res = await acceptSubmission(teacherClient, schoolClass.id, activity.id, attempt.id);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const view = TeacherAttemptSchema.parse(res.body);
      expect(view.status).toBe("SUBMITTED");
      expect(view.submission).toMatchObject({ submittedAt: at(0).toISOString(), late: true, acceptedByTeacher: true, blankCount: 2, grade: "0.30", gradePartial: true });
      expect(gradingOf(view, questionIds[0]!)).toMatchObject({ status: "GRADED", nature: "RULE_RESULT", finalGrade: "0.30" });
      expect(gradingOf(view, questionIds[2]!)).toMatchObject({ status: "PENDING_TEACHER" });
      expect(view.answers.find((answer) => answer.questionId === questionIds[2])!.answer).toEqual(text("Resposta salva às 23:58"));

      const stored = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId: attempt.id } });
      expect(stored.acceptedById).toBe(teacher.id);
      const [accepted, ...more] = await events("activity_submission.accepted_by_teacher");
      expect(more).toEqual([]);
      expect(accepted).toMatchObject({
        actorUserId: teacher.id,
        targetType: "ACTIVITY_SUBMISSION",
        targetId: stored.id,
        metadata: { activityId: activity.id, attemptId: attempt.id, reason: "DEADLINE_PASSED", blankCount: 2, questionCount: 4, pendingTeacherCount: 2 },
      });
      expect(await events("activity_submission.created")).toEqual([]);

      const studentView = (await client.get(`/api/me/activities/${activity.id}`)).body;
      expect(studentView).toMatchObject({ status: "SUBMITTED", late: true, submission: { late: true, acceptedByTeacher: true, blankCount: 2 }, result: null });
      expect((await detail(activity.id)).roster[0]).toMatchObject({ status: "SUBMITTED_LATE", attemptId: attempt.id });

      const again = await acceptSubmission(teacherClient, schoolClass.id, activity.id, attempt.id);
      expect(again.status).toBe(200);
      expect(again.body.submission.id).toBe(view.submission!.id);
      expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(1);
      expect(await events("activity_submission.accepted_by_teacher")).toHaveLength(1);
    });

    it("em andamento quando a atividade foi encerrada → entrega aceita com reason ACTIVITY_CLOSED", async () => {
      const { activity, questionIds } = await activityOf({ latePolicy: "ACCEPT_MARKED" });
      const { student, client } = await enrolledStudent("Bruno");
      await startAttempt(client, activity.id);
      await saveAnswers(client, activity.id, [{ questionId: questionIds[2]!, answer: text("Quase lá"), baseRevision: 0 }]);
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${activity.id}/close`, {})).status).toBe(200);
      const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: student.id } });

      const res = await acceptSubmission(teacherClient, schoolClass.id, activity.id, attempt.id);
      expect(res.status).toBe(200);
      expect(res.body.submission).toMatchObject({ late: true, acceptedByTeacher: true });
      expect((await events("activity_submission.accepted_by_teacher"))[0]!.metadata).toMatchObject({ reason: "ACTIVITY_CLOSED" });
    });

    it("aluno que ainda pode entregar → 409 STUDENT_CAN_STILL_SUBMIT; tentativa sem resposta salva → 409 NOT_STARTED", async () => {
      const onTime = await activityOf();
      const lateAccepted = await activityOf({ deadline: at(HOUR), latePolicy: "ACCEPT_MARKED" });
      const { student, client } = await enrolledStudent("Bruno");
      await startAttempt(client, onTime.activity.id);
      await saveAnswers(client, onTime.activity.id, [{ questionId: onTime.questionIds[2]!, answer: text("Em andamento"), baseRevision: 0 }]);
      await startAttempt(client, lateAccepted.activity.id);
      await saveAnswers(client, lateAccepted.activity.id, [{ questionId: lateAccepted.questionIds[2]!, answer: text("Em andamento"), baseRevision: 0 }]);
      clock.advance(2 * HOUR);
      const attemptOf = async (activityId: string) =>
        (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } })).id;

      for (const activityId of [onTime.activity.id, lateAccepted.activity.id]) {
        const res = await acceptSubmission(teacherClient, schoolClass.id, activityId, await attemptOf(activityId));
        expect([res.status, res.body.code]).toEqual([409, "STUDENT_CAN_STILL_SUBMIT"]);
      }

      const closed = await activityOf({ status: "CLOSED" });
      const { attemptId } = await createAttemptRow(t, closed.activity.id, student.id);
      const empty = await acceptSubmission(teacherClient, schoolClass.id, closed.activity.id, attemptId);
      expect([empty.status, empty.body.code]).toEqual([409, "NOT_STARTED"]);
      expect(await t.prisma.activitySubmission.count()).toBe(0);
      expect(await events("activity_submission.accepted_by_teacher")).toEqual([]);
    });
  });

  describe("012/US5-5 contexto", () => {
    it("professor de outra turma → 404 em todas as rotas; aluno não tem a permissão → 403", async () => {
      const created = await activityOf();
      const { activity, questionIds } = created;
      const { client: studentClient, attemptId } = await submittedBy("Carla", created);
      const otherTeacher = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, otherTeacher) });
      const otherClass = await createClass(t, otherTeacher.id);
      const grades = { version: 1, decisions: [{ questionId: questionIds[2]!, grade: "0.10" }] };

      for (const client of [otherClient]) {
        for (const classId of [schoolClass.id, otherClass.id]) {
          expect((await getAttempt(client, classId, activity.id, attemptId)).status).toBe(404);
          expect((await gradeAttempt(client, classId, activity.id, attemptId, grades)).status).toBe(404);
          expect((await acceptSubmission(client, classId, activity.id, attemptId)).status).toBe(404);
          expect((await releaseResult(client, classId, activity.id)).status).toBe(404);
        }
      }
      expect((await getAttempt(studentClient, schoolClass.id, activity.id, attemptId)).status).toBe(403);
      expect((await gradeAttempt(studentClient, schoolClass.id, activity.id, attemptId, grades)).status).toBe(403);
      expect((await releaseResult(studentClient, schoolClass.id, activity.id)).status).toBe(403);
      const stored = await t.prisma.activitySubmission.findFirstOrThrow({ where: { attemptId } });
      expect([stored.version, stored.gradePartial]).toEqual([1, true]);
      expect((await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } })).resultReleasedAt).toBeNull();
    });
  });
});
