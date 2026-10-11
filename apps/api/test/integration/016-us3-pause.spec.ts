import {
  type Answer,
  type Room,
  RoomSchema,
  type StudentActivity,
  StudentActivitySchema,
  type StudentHelpItem,
  StudentHelpItemSchema,
  type StudentPause,
  StudentPauseSchema,
  type TeacherPause,
  TeacherPauseSchema,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { ModelGateway } from "../../src/modules/ai/gateway/model-gateway";
import {
  acceptSubmission,
  type CreateActivityOptions,
  type CreatedActivity,
  createActivity,
  createClassWithStudents,
  saveAnswers,
  startAttempt,
  submitAttempt,
} from "../helpers/activities";
import { type AiTestApp, drain, resetAiDb } from "../helpers/ai";
import { declareExit, getMyPause, getRoom, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock, HOUR, MINUTE } from "../helpers/clock";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { api, testConfig } from "../helpers/test-app";
import { createWorkHelpApp, getHelp, requestHelp, scriptHelp, validGuidance } from "../helpers/work-help";

/**
 * 016/US3 — the student leaves the room and the attempt pauses until the teacher releases the return
 * (016/FR-011–FR-015, FR-017, FR-018, FR-022, research M6, M7). The pause is a row written under the
 * attempt's lock; PAUSED is derived. While it is open, no session of the student receives a statement
 * or an answer, and save, submit, the 015 events and the 015 help are refused with `409
 * ATTEMPT_PAUSED`, each refusal audited. Only the teacher releases it; the deadline keeps running, and
 * the close, the cancellation or the teacher's acceptance end it by derivation. Nothing changes a
 * grade, a submission or the deadline.
 */

const START = "2026-10-01T12:00:00.000Z";
const STATEMENT = "MARCADOR-ENUNCIADO-016 Explique o encapsulamento.";
const ANSWER_TEXT = "MARCADOR-RESPOSTA-ALUNO-016 a classe protege o próprio estado";
type ApiClient = ReturnType<typeof api>;

describe("016/US3 aluno sai da sala e a tentativa pausa até o professor liberar", () => {
  let t: AiTestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: ApiClient;
  /** The student's session that declares the exit. */
  let client: ApiClient;
  /** Another session of the same student: "o celular". */
  let phone: ApiClient;
  let schoolClass: SchoolClass;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  /** A work applied since 016 (`PRESENT_ONLY`): multiple choice and open answer, due in a week, REJECT. */
  const work = (options: CreateActivityOptions = {}): Promise<CreatedActivity> =>
    createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [
        { type: "MULTIPLE_CHOICE", valueCents: 50, statement: STATEMENT, alternatives: ["Protege o estado", "Herança múltipla", "Sobrecarga"], correctIndex: 0 },
        { type: "OPEN_ANSWER", valueCents: 50, statement: STATEMENT, expectedAnswer: "O objeto controla o acesso aos dados." },
      ],
      ...options,
    });
  /** The work, the student marked present and the attempt started. */
  const answering = async (options: CreateActivityOptions = {}): Promise<CreatedActivity> => {
    const created = await work(options);
    expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
    const res = await startAttempt(client, created.activity.id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return created;
  };
  const twoAnswers = (created: CreatedActivity): { questionId: string; answer: Answer; baseRevision: number }[] => [
    { questionId: created.questionIds[0]!, answer: { kind: "ALTERNATIVE", alternativeId: created.alternativeIds[0]![0]! }, baseRevision: 0 },
    { questionId: created.questionIds[1]!, answer: { kind: "TEXT", text: ANSWER_TEXT }, baseRevision: 0 },
  ];
  const exit = async (activityId: string, body: Record<string, unknown> = { reason: "WATER" }, expected = 201): Promise<StudentPause> => {
    const res = await declareExit(client, activityId, body);
    expect(res.status, JSON.stringify(res.body)).toBe(expected);
    return StudentPauseSchema.parse(res.body);
  };
  const release = async (activityId: string, pauseId: string, expected = 200): Promise<TeacherPause> => {
    const res = await releasePause(teacherClient, schoolClass.id, activityId, pauseId);
    expect(res.status, JSON.stringify(res.body)).toBe(expected);
    return TeacherPauseSchema.parse(res.body);
  };
  const detail = async (as: ApiClient, activityId: string): Promise<StudentActivity> => {
    const res = await as.get(`/api/me/activities/${activityId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return StudentActivitySchema.parse(res.body);
  };
  const room = async (activityId: string): Promise<Room> => {
    const res = await getRoom(teacherClient, schoolClass.id, activityId);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return RoomSchema.parse(res.body);
  };
  const ownRow = async (activityId: string) => (await room(activityId)).students.find((row) => row.studentUserId === student.id)!;
  const audits = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const attemptOf = (activityId: string) => t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId, studentUserId: student.id } });
  const codeOf = (res: { status: number; body: { code?: string } }) => ({ status: res.status, code: res.body.code });

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createWorkHelpApp({
      clock,
      config: { rateLimit: { ...testConfig().rateLimit, aiExecutionsPerMinute: 100, workHelpPerHour: 100 } },
    });
    t.get(ModelGateway).timing = { sleep: async () => {}, random: () => 0 };
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
    phone = api(t, { cookie: await loginAs(t, student) });
  });

  describe("016/FR-011 016/FR-012 a saída declarada", () => {
    it("016/US3-1 016/FR-011 a saída tem um motivo da lista fechada, o horário do servidor e é auditada só com ids e enums", async () => {
      const { activity } = await answering();
      clock.advance(10 * MINUTE);
      const pause = await exit(activity.id, { reason: "OTHER", note: "Fui buscar o carregador" });
      expect(pause).toEqual({
        id: expect.any(String),
        initiatedBy: "STUDENT",
        reason: "OTHER",
        note: "Fui buscar o carregador",
        startedAt: clock.now().toISOString(),
        endedAt: null,
      });
      const row = await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: pause.id } });
      expect(row).toMatchObject({ startedById: student.id, releasedAt: null, releasedById: null });
      const [started] = await audits("attempt_pause.started");
      expect(started).toMatchObject({ actorUserId: student.id, targetType: "ACTIVITY_ATTEMPT", targetId: row.attemptId });
      expect(started!.metadata).toEqual({ activityId: activity.id, pauseId: pause.id, initiatedBy: "STUDENT", reason: "OTHER" });
      expect(JSON.stringify(started!.metadata)).not.toContain("carregador");
    });

    it("016/FR-011 cada motivo da lista é aceito; TEACHER, um motivo fora da lista, nota fora de OTHER e campos do servidor → 400", async () => {
      for (const reason of ["BATHROOM", "PHONE"] as const) {
        const { activity } = await answering();
        expect((await exit(activity.id, { reason })).reason).toBe(reason);
      }
      const { activity } = await answering();
      const refused: Record<string, unknown>[] = [
        { reason: "TEACHER" },
        { reason: "LUNCH" },
        { reason: "WATER", note: "água" },
        { reason: "OTHER", note: "x".repeat(201) },
        { reason: "WATER", startedAt: clock.now().toISOString() },
        { reason: "WATER", initiatedBy: "STUDENT" },
        { reason: "WATER", attemptId: activity.id },
      ];
      for (const body of refused) expect((await declareExit(client, activity.id, body)).status, JSON.stringify(body)).toBe(400);
      expect(await t.prisma.attemptPause.count({ where: { activityId: activity.id } })).toBe(0);
    });

    it("016/US3-2 016/FR-012 as respostas salvas antes da saída ficam; ao voltar nenhuma se perdeu", async () => {
      const created = await answering();
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const pause = await exit(activity.id);
      await release(activity.id, pause.id);
      const back = await detail(client, activity.id);
      const byQuestion = <T extends { questionId: string }>(items: T[]) => [...items].sort((a, b) => a.questionId.localeCompare(b.questionId));
      expect(byQuestion(back.attempt!.answers)).toEqual(
        byQuestion(twoAnswers(created).map(({ questionId, answer }) => ({ questionId, answer, revision: 1 }))),
      );
    });

    it("016/US3-8 duas confirmações seguidas (duas abas) → uma única pausa aberta, a segunda devolve a mesma (200) sem novo evento", async () => {
      const { activity } = await answering();
      const first = await exit(activity.id, { reason: "WATER" });
      clock.advance(MINUTE);
      const second = await declareExit(phone, activity.id, { reason: "BATHROOM" });
      expect(second.status).toBe(200);
      expect(second.body).toEqual(first);
      expect(await t.prisma.attemptPause.count({ where: { activityId: activity.id } })).toBe(1);
      expect(await audits("attempt_pause.started")).toHaveLength(1);
    });

    it("016/FR-011 sem tentativa → 409 NOT_STARTED; entregue → 409 ATTEMPT_ALREADY_SUBMITTED; encerrada → 409 ACTIVITY_CLOSED", async () => {
      const created = await work();
      expect((await markPresent(teacherClient, schoolClass.id, created.activity.id, [student.id])).status).toBe(200);
      expect(codeOf(await declareExit(client, created.activity.id))).toEqual({ status: 409, code: "NOT_STARTED" });
      expect((await startAttempt(client, created.activity.id)).status).toBe(200);
      expect((await submitAttempt(client, created.activity.id, twoAnswers(created))).status).toBe(200);
      expect(codeOf(await declareExit(client, created.activity.id))).toEqual({ status: 409, code: "ATTEMPT_ALREADY_SUBMITTED" });

      const closed = await answering();
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${closed.activity.id}/close`, {})).status).toBe(200);
      expect(codeOf(await declareExit(client, closed.activity.id))).toEqual({ status: 409, code: "ACTIVITY_CLOSED" });
    });

    it("016/FR-024 um trabalho ALL_ENROLLED (aplicado antes da 016) não tem pausa: 409 ATTENDANCE_NOT_REQUIRED", async () => {
      const { activity } = await createActivity(t, schoolClass, { publishAt: at(-DAY), deadline: at(7 * DAY) });
      expect((await startAttempt(client, activity.id)).status).toBe(200);
      expect(codeOf(await declareExit(client, activity.id))).toEqual({ status: 409, code: "ATTENDANCE_NOT_REQUIRED" });
      expect((await getMyPause(client, activity.id)).body).toEqual({ pause: null });
    });
  });

  describe("016/FR-013 016/FR-022 com a tentativa pausada", () => {
    it("016/US3-3 016/FR-022 outra sessão do aluno vê só o aviso: sem enunciados, alternativas nem respostas", async () => {
      const created = await answering();
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const pause = await exit(activity.id, { reason: "WATER" });

      for (const session of [phone, client]) {
        const res = await session.get(`/api/me/activities/${activity.id}`);
        expect(res.status).toBe(200);
        const view = StudentActivitySchema.parse(res.body);
        expect(view.pause).toEqual(pause);
        expect(view.questions).toEqual([]);
        expect(view.attempt!.answers).toEqual([]);
        expect(Object.keys(res.body.pause).sort()).toEqual(["endedAt", "id", "initiatedBy", "note", "reason", "startedAt"]);
        const text = JSON.stringify(res.body);
        for (const marker of [STATEMENT, ANSWER_TEXT, "Protege o estado", created.alternativeIds[0]![0]!]) expect(text).not.toContain(marker);
        expect((await getMyPause(session, activity.id)).body).toEqual({ pause });
      }
      // The list and the dashboard never carried a question or an answer; they still show the work.
      expect(JSON.stringify((await phone.get("/api/me/activities")).body)).not.toContain("MARCADOR");
    });

    it("016/US3-3 016/FR-013 salvar e entregar → 409 ATTEMPT_PAUSED em qualquer sessão, auditados como activity_submission.rejected", async () => {
      const created = await answering();
      const { activity } = created;
      await exit(activity.id);
      expect(codeOf(await saveAnswers(phone, activity.id, twoAnswers(created)))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      expect(codeOf(await submitAttempt(phone, activity.id, twoAnswers(created)))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      expect(codeOf(await submitAttempt(client, activity.id))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      const rejected = await audits("activity_submission.rejected");
      expect(rejected.map((event) => event.metadata)).toEqual([
        { operation: "SAVE", code: "ATTEMPT_PAUSED" },
        { operation: "SUBMIT", code: "ATTEMPT_PAUSED" },
        { operation: "SUBMIT", code: "ATTEMPT_PAUSED" },
      ]);
      expect(await t.prisma.activityAnswer.count({ where: { activityId: activity.id } })).toBe(0);
      expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(0);
    });

    it("016/US3-3 016/FR-013 eventos (015) e ajuda (015) → 409 ATTEMPT_PAUSED, auditados como attempt_pause.write_refused", async () => {
      const created = await answering({ executionMode: "CONTROLLED", aiHelpAllowance: 3 });
      const { activity } = created;
      const pause = await exit(activity.id);
      const attempt = await attemptOf(activity.id);
      expect(codeOf(await recordEvents(phone, activity.id, [integrityEvent("SCREEN_LEFT")]))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      const help = await requestHelp(phone, activity.id, { questionId: created.questionIds[1]!, question: "Por onde começo esta questão?" });
      expect(codeOf(help)).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      const refused = await audits("attempt_pause.write_refused");
      expect(refused.map((event) => ({ actor: event.actorUserId, target: event.targetId, metadata: event.metadata }))).toEqual([
        { actor: student.id, target: attempt.id, metadata: { activityId: activity.id, pauseId: pause.id, operation: "EVENTS" } },
        { actor: student.id, target: attempt.id, metadata: { activityId: activity.id, pauseId: pause.id, operation: "HELP" } },
      ]);
      expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(0);
      expect(await t.prisma.workHelpRequest.count({ where: { attemptId: attempt.id } })).toBe(0);
    });

    it("016/US3-3 uma ajuda pedida antes da pausa é entregue durante ela e aparece depois do retorno, sem gastar outra", async () => {
      const created = await answering({ aiHelpAllowance: 3 });
      const { activity } = created;
      const asked = await requestHelp(client, activity.id, { questionId: created.questionIds[1]!, question: "Não entendi o que a questão pede." });
      expect(asked.status, JSON.stringify(asked.body)).toBe(202);
      const item: StudentHelpItem = StudentHelpItemSchema.parse(asked.body);
      const pause = await exit(activity.id);
      scriptHelp(t.provider, item.id, validGuidance());
      await drain(t);
      expect((await t.prisma.workHelpRequest.findUniqueOrThrow({ where: { id: item.id } })).status).toBe("DELIVERED");
      await release(activity.id, pause.id);
      const state = await getHelp(client, activity.id);
      expect(state.body).toMatchObject({ used: 1, pending: false, items: [{ id: item.id, status: "DELIVERED" }] });
    });

    it("016/US3-9 o salvamento que chega antes da pausa é aceito; o que chega depois é recusado sem perder o que estava salvo", async () => {
      const created = await answering();
      const { activity } = created;
      const [first, second] = twoAnswers(created);
      expect((await saveAnswers(client, activity.id, [first!])).body.results[0].outcome).toBe("SAVED");
      await exit(activity.id);
      expect(codeOf(await saveAnswers(phone, activity.id, [second!]))).toEqual({ status: 409, code: "ATTEMPT_PAUSED" });
      const stored = await t.prisma.activityAnswer.findMany({ where: { activityId: activity.id } });
      expect(stored.map((row) => ({ questionId: row.questionId, revision: row.revision }))).toEqual([{ questionId: first!.questionId, revision: 1 }]);
    });
  });

  describe("016/FR-014 o professor libera o retorno", () => {
    it("016/US3-4 016/FR-020 na Chamada o aluno aparece fora da sala, com motivo, horário de saída e tempo decorrido", async () => {
      const { activity } = await answering();
      expect((await ownRow(activity.id)).roomStatus).toBe("ANSWERING");
      const pause = await exit(activity.id, { reason: "BATHROOM" });
      clock.advance(3 * MINUTE);
      expect(await ownRow(activity.id)).toMatchObject({
        roomStatus: "OUT_OF_ROOM",
        openPause: { id: pause.id, initiatedBy: "STUDENT", reason: "BATHROOM", note: null, startedAt: pause.startedAt, endedAt: null, endedBy: null, seconds: 180 },
      });
    });

    it("016/US3-5 016/FR-014 liberar reabre a tentativa: o aluno não vê mais a pausa, recebe questões e respostas e volta a salvar", async () => {
      const created = await answering();
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const pause = await exit(activity.id);
      clock.advance(4 * MINUTE);
      const released = await release(activity.id, pause.id);
      expect(released).toMatchObject({ id: pause.id, endedAt: clock.now().toISOString(), endedBy: "RELEASE", seconds: 240 });
      const row = await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: pause.id } });
      expect(row).toMatchObject({ releasedAt: clock.now(), releasedById: teacher.id });
      const [event] = await audits("attempt_pause.released");
      expect(event).toMatchObject({ actorUserId: teacher.id, targetType: "ACTIVITY_ATTEMPT", targetId: row.attemptId });
      expect(event!.metadata).toEqual({ activityId: activity.id, pauseId: pause.id, seconds: 240 });

      // The next poll (research M8) already shows the return; nothing else to do.
      expect((await getMyPause(phone, activity.id)).body).toEqual({ pause: null });
      const back = await detail(phone, activity.id);
      expect(back.pause).toBeNull();
      expect(back.questions).toHaveLength(2);
      expect(back.attempt!.answers).toHaveLength(2);
      const [first] = twoAnswers(created);
      const again = await saveAnswers(phone, activity.id, [{ ...first!, answer: { kind: "ALTERNATIVE", alternativeId: created.alternativeIds[0]![1]! }, baseRevision: 1 }]);
      expect(again.body.results[0].outcome).toBe("SAVED");
      expect((await ownRow(activity.id)).roomStatus).toBe("ANSWERING");
    });

    it("016/FR-014 só o professor da turma libera: o aluno (sem chamada.registrar) → 403; outro professor → 404", async () => {
      const { activity } = await answering();
      const pause = await exit(activity.id);
      expect((await releasePause(client, schoolClass.id, activity.id, pause.id)).status).toBe(403);
      const other = await createUser(t, { roles: ["TEACHER"] });
      const otherClient = api(t, { cookie: await loginAs(t, other) });
      expect((await releasePause(otherClient, schoolClass.id, activity.id, pause.id)).status).toBe(404);
      expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: pause.id } })).releasedAt).toBeNull();
    });

    it("016/US3-8 dois cliques em Liberar retorno encerram a pausa uma única vez e não tocam a pausa seguinte", async () => {
      const { activity } = await answering();
      const pause = await exit(activity.id);
      clock.advance(MINUTE);
      const first = await release(activity.id, pause.id);
      clock.advance(MINUTE);
      expect(await release(activity.id, pause.id)).toEqual(first);
      const next = await exit(activity.id, { reason: "PHONE" });
      expect(await release(activity.id, pause.id)).toEqual(first);
      expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: next.id } })).releasedAt).toBeNull();
      expect(await audits("attempt_pause.released")).toHaveLength(1);
    });
  });

  describe("016/FR-015 prazo, encerramento e aceitação durante a pausa", () => {
    it("016/US3-7 016/FR-015 o prazo vence durante a pausa: liberar é permitido e vale a regra de atraso da 012 (REJECT → aceitar como entrega)", async () => {
      const created = await answering({ deadline: at(HOUR), latePolicy: "REJECT" });
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const pause = await exit(activity.id);
      clock.advance(2 * HOUR);
      await release(activity.id, pause.id);
      expect(codeOf(await saveAnswers(client, activity.id, twoAnswers(created)))).toEqual({ status: 409, code: "DEADLINE_PASSED" });
      const attempt = await attemptOf(activity.id);
      const accepted = await acceptSubmission(teacherClient, schoolClass.id, activity.id, attempt.id);
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
      const [event] = await audits("activity_submission.accepted_by_teacher");
      expect(event!.metadata).toMatchObject({ reason: "DEADLINE_PASSED", pauseEnded: false });
    });

    it("016/FR-015 prazo vencido sem atraso e a pausa aberta: o professor aceita (012 FR-006b) e a aceitação encerra a pausa", async () => {
      const created = await answering({ deadline: at(HOUR), latePolicy: "REJECT" });
      const { activity } = created;
      expect((await saveAnswers(client, activity.id, twoAnswers(created))).status).toBe(200);
      const pause = await exit(activity.id);
      clock.advance(2 * HOUR);
      const attempt = await attemptOf(activity.id);
      const accepted = await acceptSubmission(teacherClient, schoolClass.id, activity.id, attempt.id);
      expect(accepted.status, JSON.stringify(accepted.body)).toBe(200);
      const [event] = await audits("activity_submission.accepted_by_teacher");
      expect(event!.metadata).toMatchObject({ reason: "DEADLINE_PASSED", pauseEnded: true });
      // Ended by derivation at the acceptance (never written): a release returns it as it is.
      expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: pause.id } })).releasedAt).toBeNull();
      expect(await release(activity.id, pause.id)).toMatchObject({ endedBy: "ACCEPTED", endedAt: clock.now().toISOString(), seconds: 2 * 3600 });
      expect(await audits("attempt_pause.released")).toHaveLength(0);
      expect(await ownRow(activity.id)).toMatchObject({ roomStatus: "SUBMITTED", openPause: null });
      expect((await detail(client, activity.id)).pause).toBeNull();
    });

    it("016/FR-015 encerrar com a pausa aberta termina a pausa por derivação: pausedCount no evento, liberar → 409 ACTIVITY_CLOSED", async () => {
      const { activity } = await answering();
      const pause = await exit(activity.id);
      clock.advance(5 * MINUTE);
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${activity.id}/close`, {})).status).toBe(200);
      const [closed] = await audits("activity.closed");
      expect(closed!.metadata).toMatchObject({ pausedCount: 1 });
      expect(codeOf(await releasePause(teacherClient, schoolClass.id, activity.id, pause.id))).toEqual({ status: 409, code: "ACTIVITY_CLOSED" });
      expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: pause.id } })).releasedAt).toBeNull();
      expect(await ownRow(activity.id)).toMatchObject({ openPause: null });
      expect((await getMyPause(client, activity.id)).body).toEqual({ pause: null });
      const view = await detail(client, activity.id);
      expect(view.pause).toBeNull();
      expect(view.questions).toHaveLength(2);
    });

    it("016/FR-015 cancelar com a pausa aberta: pausedCount em activity.cancelled; sem pausa aberta, 0", async () => {
      const { activity } = await answering();
      await exit(activity.id);
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${activity.id}/cancel`, {})).status).toBe(200);
      const quiet = await answering();
      expect((await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${quiet.activity.id}/cancel`, {})).status).toBe(200);
      expect((await audits("activity.cancelled")).map((event) => (event.metadata as { pausedCount: number }).pausedCount)).toEqual([1, 0]);
    });
  });

  describe("016/FR-017 016/FR-018 modo controlado e nenhuma consequência", () => {
    it("016/US3-6 016/FR-017 num trabalho CONTROLADO a pausa não gera evento de foco, recusa eventos durante ela e os aceita depois do retorno", async () => {
      const { activity } = await answering({ executionMode: "CONTROLLED" });
      const pause = await exit(activity.id);
      const attempt = await attemptOf(activity.id);
      expect(await t.prisma.attemptIntegrityEvent.count({ where: { attemptId: attempt.id } })).toBe(0);
      expect((await recordEvents(client, activity.id, [integrityEvent("FULLSCREEN_EXITED")])).status).toBe(409);
      await release(activity.id, pause.id);
      expect((await recordEvents(client, activity.id, [integrityEvent("FULLSCREEN_ENTERED")])).status).toBe(200);
      expect((await t.prisma.attemptIntegrityEvent.findMany({ where: { attemptId: attempt.id } })).map((row) => row.type)).toEqual(["FULLSCREEN_ENTERED"]);
    });

    it("016/US3-10 016/FR-018 pausa e retorno não mudam nota, entrega, prazo nem situação da tentativa, e não rotulam nada", async () => {
      const created = await answering();
      const { activity } = created;
      const before = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } });
      const pause = await exit(activity.id);
      clock.advance(10 * MINUTE);
      await release(activity.id, pause.id);
      const after = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id } });
      expect({ deadline: after.deadline, status: after.status, version: after.version }).toEqual({
        deadline: before.deadline,
        status: before.status,
        version: before.version,
      });
      expect((await attemptOf(activity.id)).status).toBe("IN_PROGRESS");
      expect(await t.prisma.activitySubmission.count({ where: { activityId: activity.id } })).toBe(0);
      const events = await t.prisma.auditEvent.findMany({ where: { type: { startsWith: "attempt_pause." } } });
      expect(JSON.stringify(events.map((event) => [event.type, event.metadata]))).not.toMatch(/fraud|cola|viola/i);
      // The student submits normally afterwards, in time: not late.
      const submitted = await submitAttempt(client, activity.id, twoAnswers(created));
      expect(submitted.status).toBe(200);
      expect(submitted.body.submission).toMatchObject({ late: false, acceptedByTeacher: false });
    });
  });
});
