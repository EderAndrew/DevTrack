import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { endpoints } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { type CreatedActivity, createActivity, createClassWithStudents, saveAnswers, startAttempt } from "../helpers/activities";
import { declareExit, getRoom, markPresent, pauseStudent, postAttendance, releasePause } from "../helpers/attendance";
import { DAY, FixedClock, HOUR } from "../helpers/clock";
import { API_ROOT } from "../helpers/env";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const START = "2026-10-01T12:00:00.000Z";
const VALIDATION = { statusCode: 400, code: "VALIDATION_ERROR", message: expect.any(String) };

/**
 * 016 contracts/http-api.md: bodies are strict and the fields the server controls are refused (400)
 * on every new route; an attendance batch carries 0–200 ids per list (both empty and 201 → 400); the
 * note of "Outro" has 1–200 characters and only with OTHER; the student never declares `TEACHER`.
 * A refused body writes nothing. 016/FR-024: an Exercício takes no attendance or pause, a pause
 * never moves the deadline, and the feature adds no route beyond its contract.
 */
describe("016 fronteiras da chamada e das pausas", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: ReturnType<typeof api>;
  let studentClient: ReturnType<typeof api>;
  let schoolClass: SchoolClass;
  let work: CreatedActivity;

  const at = (offset: number) => new Date(clock.now().getTime() + offset);
  const pausePath = () => `/api/me/activities/${work.activity.id}/attempt/pause`;
  const nothingWritten = async () => {
    expect(await t.prisma.activityAttendance.count()).toBe(0);
    expect(await t.prisma.attemptPause.count()).toBe(0);
  };
  /** The student is marked present and starts the work, so a pause can be declared. */
  const startWork = async () => {
    expect((await markPresent(teacherClient, schoolClass.id, work.activity.id, [student.id])).status).toBe(200);
    expect((await startAttempt(studentClient, work.activity.id)).status).toBe(200);
  };

  beforeAll(async () => {
    clock = new FixedClock(START);
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, attemptPausesPerHour: 100 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(START);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const made = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = made.schoolClass;
    student = made.students[0]!;
    studentClient = api(t, { cookie: await loginAs(t, student) });
    work = await createActivity(t, schoolClass, {
      releaseMode: "PRESENT_ONLY",
      publishAt: at(-DAY),
      deadline: at(7 * DAY),
      questions: [{ type: "OPEN_ANSWER", valueCents: 100 }],
    });
  });

  it("chamada com 0 ids nas duas listas e com 201 → 400; 1 → 200; 200 passam do tamanho e caem na regra (422)", async () => {
    const ids = (count: number) => Array.from({ length: count }, () => randomUUID());
    for (const batch of [{ mark: [], unmark: [] }, { mark: ids(201) }, { unmark: ids(201) }, { mark: ids(200), unmark: ids(1) }]) {
      const res = await postAttendance(teacherClient, schoolClass.id, work.activity.id, batch);
      // 200 + 1 is within each list's size: the rule refuses the ids that are not in the class.
      if (batch.mark?.length === 200) expect([res.status, res.body.code]).toEqual([422, "STUDENT_NOT_IN_CLASS"]);
      else expect(res.body, JSON.stringify({ mark: batch.mark?.length, unmark: batch.unmark?.length })).toEqual(VALIDATION);
    }
    const largest = await postAttendance(teacherClient, schoolClass.id, work.activity.id, { mark: [...ids(199), student.id] });
    expect([largest.status, largest.body.code]).toEqual([422, "STUDENT_NOT_IN_CLASS"]);
    await nothingWritten();
    const one = await markPresent(teacherClient, schoolClass.id, work.activity.id, [student.id]);
    expect([one.status, one.body.present]).toEqual([200, 1]);
  });

  it("campos do servidor, ids inválidos e o mesmo aluno nas duas listas na chamada → 400, nada gravado", async () => {
    const invalid: Record<string, unknown>[] = [
      { mark: [student.id], unmark: [], markedAt: new Date().toISOString() },
      { mark: [student.id], unmark: [], releaseMode: "ALL_ENROLLED" },
      { mark: [student.id], unmark: [], present: 1 },
      { mark: [student.id], unmark: [student.id] },
      { mark: ["não-é-uuid"], unmark: [] },
      { mark: [student.id] },
      { mark: [{ studentUserId: student.id, markedAt: new Date().toISOString() }], unmark: [] },
    ];
    for (const body of invalid) {
      const res = await teacherClient.post(`/api/classes/${schoolClass.id}/activities/${work.activity.id}/attendance`, body);
      expect([res.status, res.body], JSON.stringify(body)).toEqual([400, VALIDATION]);
    }
    await nothingWritten();
  });

  it("releaseMode no corpo da aplicação → 400 (o servidor decide)", async () => {
    const res = await teacherClient.post(`/api/classes/${schoolClass.id}/activities`, {
      idempotencyKey: randomUUID(),
      source: { type: "ASSIGNMENT", workId: randomUUID() },
      title: "Trabalho",
      instructions: null,
      publishAt: null,
      deadline: at(7 * DAY).toISOString(),
      latePolicy: "REJECT",
      acknowledgeOutOfScope: false,
      releaseMode: "ALL_ENROLLED",
    });
    expect(res.body).toEqual(VALIDATION);
  });

  it("nota de 0 e de 201 caracteres, só espaços, nota sem OUTRO, motivo fora da lista e reason TEACHER do aluno → 400", async () => {
    await startWork();
    const invalid: Record<string, unknown>[] = [
      { reason: "OTHER", note: "" },
      { reason: "OTHER", note: "   " },
      { reason: "OTHER", note: "a".repeat(201) },
      { reason: "WATER", note: "Fui beber água" },
      { reason: "TEACHER" },
      { reason: "LUNCH" },
      { reason: "water" },
      {},
      { reason: "WATER", initiatedBy: "TEACHER" },
      { reason: "WATER", startedAt: new Date().toISOString() },
      { reason: "WATER", endedAt: new Date().toISOString() },
      { reason: "WATER", releasedAt: new Date().toISOString() },
      { reason: "WATER", studentUserId: student.id },
      { reason: "WATER", attemptId: randomUUID() },
      { reason: "WATER", releaseMode: "PRESENT_ONLY" },
    ];
    for (const body of invalid) {
      const res = await studentClient.post(pausePath(), body);
      expect([res.status, res.body], JSON.stringify(body)).toEqual([400, VALIDATION]);
    }
    expect(await t.prisma.attemptPause.count()).toBe(0);
  });

  it("nota de 1 e de 200 caracteres → aceitas, guardadas como o aluno escreveu", async () => {
    await startWork();
    for (const note of ["a", "b".repeat(200)]) {
      const res = await declareExit(studentClient, work.activity.id, { reason: "OTHER", note });
      expect([res.status, res.body.note], `${note.length}`).toEqual([201, note]);
      expect((await releasePause(teacherClient, schoolClass.id, work.activity.id, res.body.id)).status).toBe(200);
    }
    expect((await t.prisma.attemptPause.findMany({ orderBy: { startedAt: "asc" }, select: { note: true } })).map((p) => p.note?.length)).toEqual([1, 200]);
  });

  it("campos do servidor na pausa do professor e na liberação → 400, nada gravado", async () => {
    await startWork();
    const base = `/api/classes/${schoolClass.id}/activities/${work.activity.id}`;
    for (const body of [{ reason: "TEACHER" }, { initiatedBy: "TEACHER" }, { startedAt: new Date().toISOString() }, { note: "Conversa" }, { attemptId: randomUUID() }]) {
      expect((await teacherClient.post(`${base}/students/${student.id}/pause`, body)).body, JSON.stringify(body)).toEqual(VALIDATION);
    }
    expect(await t.prisma.attemptPause.count()).toBe(0);
    const paused = await declareExit(studentClient, work.activity.id);
    for (const body of [{ endedAt: new Date().toISOString() }, { releasedAt: new Date().toISOString() }, { endedBy: "RELEASE" }, { seconds: 0 }]) {
      expect((await teacherClient.post(`${base}/pauses/${paused.body.id}/release`, body)).body, JSON.stringify(body)).toEqual(VALIDATION);
    }
    expect((await t.prisma.attemptPause.findUniqueOrThrow({ where: { id: paused.body.id } })).releasedAt).toBeNull();
  });

  describe("016/FR-024 fora do escopo", () => {
    it("016/FR-024 Exercício sem chamada nem pausa: as rotas respondem 409 ATTENDANCE_NOT_REQUIRED e nada é gravado", async () => {
      const exercise = await createActivity(t, schoolClass, { type: "EXERCISE", publishAt: at(-DAY), questions: [{ type: "OPEN_ANSWER" }] });
      expect(exercise.activity.releaseMode).toBe("ALL_ENROLLED");
      // Every enrolled student sees it and starts it, with no attendance.
      expect((await startAttempt(studentClient, exercise.activity.id)).status).toBe(200);
      const id = exercise.activity.id;
      const refused = [
        await getRoom(teacherClient, schoolClass.id, id),
        await markPresent(teacherClient, schoolClass.id, id, [student.id]),
        await postAttendance(teacherClient, schoolClass.id, id, { unmark: [student.id] }),
        await pauseStudent(teacherClient, schoolClass.id, id, student.id),
        await declareExit(studentClient, id),
      ];
      expect(refused.map((res) => [res.status, res.body.code])).toEqual(Array(5).fill([409, "ATTENDANCE_NOT_REQUIRED"]));
      // A release names a pause, and an exercise has none.
      expect((await releasePause(teacherClient, schoolClass.id, id, randomUUID())).status).toBe(404);
      expect((await studentClient.get(`/api/me/activities/${id}/attempt/pause`)).body).toEqual({ pause: null });
      await nothingWritten();
    });

    it("016/FR-024 o prazo é o mesmo antes, durante e depois de uma pausa (a pausa não estende o prazo)", async () => {
      await startWork();
      const detail = async () => (await studentClient.get(`/api/me/activities/${work.activity.id}`)).body;
      const before = await detail();
      expect(before.deadline).toBe(at(7 * DAY).toISOString());
      const paused = await declareExit(studentClient, work.activity.id);
      clock.advance(2 * HOUR);
      const during = await detail();
      expect((await releasePause(teacherClient, schoolClass.id, work.activity.id, paused.body.id)).body.seconds).toBe(2 * 3600);
      const after = await detail();
      expect([during.deadline, after.deadline]).toEqual([before.deadline, before.deadline]);
      expect((await t.prisma.classActivity.findUniqueOrThrow({ where: { id: work.activity.id } })).deadline!.toISOString()).toBe(before.deadline);
      // The answer saved after the return keeps the same deadline rules (no allowance for the time away).
      expect((await saveAnswers(studentClient, work.activity.id, [{ questionId: work.questionIds[0]!, answer: { kind: "TEXT", text: "Depois" }, baseRevision: 0 }])).status).toBe(200);
    });

    it("016/FR-024 nenhuma rota nova fora do catálogo de contracts/http-api.md", () => {
      const contract = readFileSync(resolve(API_ROOT, "../../specs/016-attendance-gated-release/contracts/http-api.md"), "utf8");
      const documented = [...contract.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm)].map(([, method, path]) => `${method} ${path}`).sort();
      expect(documented).toHaveLength(7);
      const catalogued = Object.values(endpoints)
        .filter((entry) => /\/(attendance|pauses?)(\/|$)/.test(entry.path))
        .map((entry) => `${entry.method} ${entry.path}`)
        .sort();
      expect(catalogued).toEqual(documented);
    });
  });
});
