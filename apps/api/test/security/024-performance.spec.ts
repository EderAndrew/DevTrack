import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PushMessage, PushTicket } from "../../src/platform/push/push-client";
import { createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { holdByHand } from "../helpers/exams";
import { teacherPhone } from "../helpers/exam-alerts";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { integrityEvent, recordEvents } from "../helpers/integrity";
import { examActivity, mobileApi, openMobileSession } from "../helpers/mobile";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";
import { FakePushClient } from "../fixtures/push/fake-push-client";

const CLASSES = 10;
/** 40 students who answer and 3 held ones. */
const ROOM = 43;
const CALLS = 40;
const LIST_P95_MS = 150;
/** The 018 target for the monitor (018-performance.spec.ts). */
const MONITOR_P95_MS = 300;
const DISPATCH_P95_MS = 2000;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/** The fake Expo, with the instant each message was handed to it. */
class TimedPushClient extends FakePushClient {
  readonly sentAt: number[] = [];

  override async send(messages: readonly PushMessage[]): Promise<PushTicket[]> {
    const tickets = await super.send(messages);
    for (let i = 0; i < messages.length; i += 1) this.sentAt.push(performance.now());
    return tickets;
  }
}

/**
 * 024 plan "Performance Goals": `GET /mobile/exams` of a teacher with 10 classes and 10 exams in progress p95 <
 * 150 ms; the room through the bearer within the 018 target (p95 < 300 ms); with the worker running (its timer
 * and the kick after the commit, the real clock), an alert handed to Expo ≤ 2 s after the occurrence's commit in
 * 95% of 40 occurrences (024/SC-001 allows 10 s end to end).
 */
describe("024 desempenho da lista, da sala pelo celular e do envio dos avisos", () => {
  let t: TestApp;
  const push = new TimedPushClient();
  let teacher: TestUser;
  let token: string;
  let roomClassId: string;
  let roomExamId: string;
  let roomStudents: TestUser[];

  const timed = async (call: () => Promise<{ status: number }>) => {
    const start = performance.now();
    const res = await call();
    expect(res.status).toBe(200);
    return performance.now() - start;
  };

  beforeAll(async () => {
    const base = testConfig();
    t = await createTestApp({ push, config: { push: { ...base.push, enabled: true, alertIntervalMs: 1000 } } });
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    token = (await openMobileSession(t, teacher)).token;
    for (let i = 0; i < CLASSES - 1; i += 1) {
      const other = await createClassWithStudents(t, teacher.id, { students: 0 });
      await examActivity(t, other.schoolClass, { title: `Prova ${i}` });
    }
    const room = await createClassWithStudents(t, teacher.id, { students: ROOM });
    roomClassId = room.schoolClass.id;
    roomStudents = room.students;
    roomExamId = (await examActivity(t, room.schoolClass, { title: "Prova da sala" })).activity.id;
    for (const [index, student] of roomStudents.entries()) {
      await t.prisma.activityAttendance.create({ data: { activityId: roomExamId, studentUserId: student.id, classId: roomClassId, markedAt: new Date(), markedById: teacher.id } });
      const { attemptId } = await createAttemptRow(t, roomExamId, student.id);
      // A few held students, as in the 018 room.
      if (index >= ROOM - 3) await holdByHand(t, { id: attemptId, activityId: roomExamId, studentUserId: student.id });
    }
  }, 120_000);
  afterAll(() => t.close());

  it(`GET /mobile/exams com ${CLASSES} turmas e ${CLASSES} provas em andamento p95 < ${LIST_P95_MS} ms`, async () => {
    expect((await mobileApi(t, token).get("/api/mobile/exams")).body.items).toHaveLength(CLASSES);
    for (let i = 0; i < 5; i += 1) await mobileApi(t, token).get("/api/mobile/exams");
    const durations: number[] = [];
    for (let i = 0; i < CALLS; i += 1) durations.push(await timed(() => mobileApi(t, token).get("/api/mobile/exams")));
    expect(p95(durations)).toBeLessThan(LIST_P95_MS);
  });

  it(`a sala de ${ROOM} alunos pelo bearer p95 < ${MONITOR_P95_MS} ms (o alvo da 018)`, async () => {
    const path = `/api/classes/${roomClassId}/activities/${roomExamId}/exam-monitor`;
    for (let i = 0; i < 5; i += 1) await mobileApi(t, token).get(path);
    const durations: number[] = [];
    for (let i = 0; i < CALLS; i += 1) durations.push(await timed(() => mobileApi(t, token).get(path)));
    expect(p95(durations)).toBeLessThan(MONITOR_P95_MS);
  });

  it(`024/SC-001 do commit da ocorrência ao envio, com o worker ativo, ≤ ${DISPATCH_P95_MS} ms em 95% de ${CALLS} ocorrências`, async () => {
    await teacherPhone(t, teacher);
    // One occurrence per answering student, so none is grouped with an earlier one (2 s window).
    const answering = roomStudents.slice(0, CALLS);
    const delays: number[] = [];
    for (const student of answering) {
      const client = api(t, { cookie: await loginAs(t, student) });
      const before = push.sentAt.length;
      const res = await recordEvents(client, roomExamId, [integrityEvent("SCREEN_LEFT")]);
      const committed = performance.now();
      expect([res.status, res.body.exam?.occurrenceCount]).toEqual([200, 1]);
      const deadline = committed + 5000;
      while (push.sentAt.length === before && performance.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
      delays.push(push.sentAt.length > before ? push.sentAt[before]! - committed : Number.POSITIVE_INFINITY);
    }
    expect(p95(delays)).toBeLessThanOrEqual(DISPATCH_P95_MS);
  }, 120_000);
});
