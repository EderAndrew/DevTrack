import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createActivity, type CreatedActivity, startAttempt } from "../helpers/activities";
import { declareExit, getRoom, markPresent, releasePause } from "../helpers/attendance";
import { DAY, FixedClock } from "../helpers/clock";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";
import { createWork } from "../helpers/works";

const START = "2026-10-01T12:00:00.000Z";
const ROOM = 60;
const ROOM_P95_MS = 300;
const BATCH_MS = 500;
const PAUSE_P95_MS = 200;
const CALLS = 40;
const CLASSES = 10;
const ACTIVITIES_PER_CLASS = 50;
/** The 012 limit of the student's dashboard and list (012-performance.spec.ts): no regression. */
const LIST_MS = 1000;

const p95 = (durations: number[]) => [...durations].sort((a, b) => a - b)[Math.ceil(durations.length * 0.95) - 1]!;

/**
 * 016 plan "Performance Goals": the room of 60 students p95 < 300 ms; an attendance batch of 60
 * < 500 ms; a declared exit and its release p95 < 200 ms each; the student's dashboard and list,
 * now filtered by the attendance (indexed `EXISTS`), within the 1 s of 012 for 10 classes × 50
 * works that take attendance. Each read is warmed once, then measured end to end through HTTP.
 */
describe("016 desempenho da chamada, das pausas e da lista do aluno", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let roomClass: SchoolClass;
  let roomWork: CreatedActivity;
  let roomStudents: TestUser[];
  let listStudent: TestUser;
  let listClient: ReturnType<typeof api>;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const timed = async <T extends { status: number }>(call: () => Promise<T>) => {
    const start = performance.now();
    const res = await call();
    return { res, ms: performance.now() - start };
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, attemptPausesPerHour: 10_000 } } });
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });

    roomClass = await createClass(t, teacher.id, { name: "Turma de 60" });
    roomWork = await createActivity(t, roomClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: Array.from({ length: 10 }, () => ({ type: "OPEN_ANSWER" as const, valueCents: 10 })),
    });
    roomStudents = [];
    for (let i = 0; i < ROOM; i++) {
      const student = await createUser(t, { roles: ["STUDENT"], name: `Aluno ${String(i).padStart(2, "0")}` });
      await createEnrollment(t, roomClass.id, student.id);
      roomStudents.push(student);
    }

    // The student's list: 10 classes × 50 works that take attendance, marked present in two thirds.
    listStudent = await createUser(t, { roles: ["STUDENT"] });
    const classes: SchoolClass[] = [];
    for (let i = 0; i < CLASSES; i++) {
      const schoolClass = await createClass(t, teacher.id, { name: `Turma ${i + 1}` });
      await createEnrollment(t, schoolClass.id, listStudent.id);
      classes.push(schoolClass);
    }
    const work = await createWork(t, teacher.id);
    await t.prisma.runInTransaction(async (tx) => {
      const activities = classes.flatMap((schoolClass, c) =>
        Array.from({ length: ACTIVITIES_PER_CLASS }, (_, i) => ({
          id: crypto.randomUUID(),
          classId: schoolClass.id,
          teacherId: teacher.id,
          type: "ASSIGNMENT" as const,
          sourceWorkId: work.id,
          sourceSubjectId: work.subjectId,
          title: `Trabalho ${c + 1}.${i + 1}`,
          instructions: "Leia com atenção.",
          totalGrade: "1.00",
          questionCount: 1,
          publishAt: at(-20 * DAY),
          deadline: at((i - 10) * DAY),
          latePolicy: "ACCEPT_MARKED" as const,
          releaseMode: "PRESENT_ONLY" as const,
          idempotencyKey: crypto.randomUUID(),
        })),
      );
      await tx.classActivity.createMany({ data: activities });
      await tx.classActivityQuestion.createMany({
        data: activities.map((activity) => ({
          id: crypto.randomUUID(),
          activityId: activity.id,
          position: 0,
          type: "OPEN_ANSWER" as const,
          gradingStrategy: "AI_REVIEW" as const,
          value: "1.00",
          statement: "Enunciado",
          expectedAnswer: "Resposta",
        })),
      });
      await tx.activityAttendance.createMany({
        data: activities
          .filter((_, i) => i % 3 !== 0)
          .map((activity) => ({ activityId: activity.id, studentUserId: listStudent.id, classId: activity.classId, markedAt: at(-20 * DAY), markedById: teacher.id })),
      });
    });
    listClient = api(t, { cookie: await loginAs(t, listStudent) });
  }, 300_000);
  afterAll(() => t.close());

  it("chamada de 60 alunos num lote < 500 ms; sala de 60 alunos p95 < 300 ms", async () => {
    const ids = roomStudents.map((student) => student.id);
    // 59 in one batch (the first is marked by the warm-up), then the room read 40 times.
    expect((await markPresent(teacherClient, roomClass.id, roomWork.activity.id, [ids[0]!])).status).toBe(200);
    const batch = await timed(() => markPresent(teacherClient, roomClass.id, roomWork.activity.id, ids.slice(1)));
    expect([batch.res.status, batch.res.body.present]).toEqual([200, ROOM]);
    expect(batch.ms).toBeLessThan(BATCH_MS);

    // Half of the room answering, a few out of the room: every situation is derived on the read.
    for (const [index, student] of roomStudents.entries()) {
      if (index % 2 === 0) continue;
      const client = api(t, { cookie: await loginAs(t, student) });
      expect((await startAttempt(client, roomWork.activity.id)).status).toBe(200);
      if (index % 10 === 1) expect((await declareExit(client, roomWork.activity.id)).status).toBe(201);
    }
    expect((await getRoom(teacherClient, roomClass.id, roomWork.activity.id)).status).toBe(200);
    const durations: number[] = [];
    for (let call = 0; call < CALLS; call++) {
      const { res, ms } = await timed(() => getRoom(teacherClient, roomClass.id, roomWork.activity.id));
      expect(res.status).toBe(200);
      durations.push(ms);
    }
    const room = (await getRoom(teacherClient, roomClass.id, roomWork.activity.id)).body;
    expect(room.students).toHaveLength(ROOM);
    expect(room.students.filter((student: { roomStatus: string }) => student.roomStatus === "OUT_OF_ROOM")).toHaveLength(6);
    expect(p95(durations)).toBeLessThan(ROOM_P95_MS);
  });

  it("declarar saída e liberar retorno: p95 < 200 ms cada em 40 ciclos", async () => {
    const student = roomStudents[0]!;
    const client = api(t, { cookie: await loginAs(t, student) });
    expect((await startAttempt(client, roomWork.activity.id)).status).toBe(200);
    const exits: number[] = [];
    const releases: number[] = [];
    for (let cycle = 0; cycle < CALLS; cycle++) {
      const exit = await timed(() => declareExit(client, roomWork.activity.id));
      expect(exit.res.status).toBe(201);
      const release = await timed(() => releasePause(teacherClient, roomClass.id, roomWork.activity.id, exit.res.body.id));
      expect(release.res.status).toBe(200);
      exits.push(exit.ms);
      releases.push(release.ms);
    }
    expect(p95(exits)).toBeLessThan(PAUSE_P95_MS);
    expect(p95(releases)).toBeLessThan(PAUSE_P95_MS);
  });

  it.each([
    ["painel", () => listClient.get("/api/me/dashboard")],
    ["lista", () => listClient.get("/api/me/activities")],
    ["lista filtrada (pendentes)", () => listClient.get("/api/me/activities?status=PENDING&pageSize=50")],
  ] as const)("%s do aluno ≤ 1 s com 10 turmas × 50 trabalhos com chamada (sem regressão em relação à 012)", async (_name, call) => {
    expect((await call()).status).toBe(200);
    let worst = 0;
    for (let i = 0; i < 3; i += 1) {
      const { res, ms } = await timed(call);
      expect(res.status).toBe(200);
      worst = Math.max(worst, ms);
    }
    expect(worst).toBeLessThanOrEqual(LIST_MS);
  });

  it("a lista do aluno só traz os trabalhos em que ele foi marcado presente", async () => {
    const res = await listClient.get("/api/me/activities?pageSize=50");
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
    // Two of every three works (index % 3 !== 0 over the 500).
    const total = CLASSES * ACTIVITIES_PER_CLASS;
    expect(await t.prisma.activityAttendance.count({ where: { studentUserId: listStudent.id } })).toBe(total - Math.ceil(total / 3));
    const ids = (res.body.items as { id: string }[]).map((item) => item.id);
    const marked = await t.prisma.activityAttendance.count({ where: { studentUserId: listStudent.id, activityId: { in: ids } } });
    expect(marked).toBe(ids.length);
  });
});
