import { randomUUID } from "node:crypto";
import type { TeacherActivity, TeacherActivityList, WorkSummary } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, applyWork, createActivity, createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { DOUBLE_CASES, seedHeartbeat } from "../helpers/code-runs";
import { applyExam } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";
import { createWork, type WorkFixture, workLanguageId } from "../helpers/works";

/**
 * 021/US2 — the teacher decides whether a work allows running code (021/FR-001–FR-004, research Y1–Y3):
 * "Permitir executar o código" off by default, accepted only on a work whose snapshot has a CODE
 * question with a PUBLIC case in a language with execution (`422 CODE_EXECUTION_NOT_ELIGIBLE`), one of
 * the 015 options (fixed once a student starts, `activity.settings_changed`), only for a work (EXERCISE
 * and EXAM bodies → 400), and still offered while the Code Runner is down, with the availability route.
 */

type Client = ReturnType<typeof api>;

describe("021/US2 professor decide se o Trabalho permite executar", () => {
  let clock: FixedClock;
  let t: TestApp;
  let off: TestApp;
  let teacher: TestUser;
  let client: Client;
  let studentClient: Client;
  let classId: string;
  let subjectId: string;
  let schoolClass: { id: string; teacherId: string };
  let eligible: WorkFixture;

  const base = () => `/api/classes/${classId}/activities`;
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const patch = (activityId: string, body: object) => client.patch(`${base()}/${activityId}`, body);
  const summaryOf = async (workId: string) => ((await client.get("/api/works")).body.items as WorkSummary[]).find((item) => item.id === workId)!;
  const codeWork = async (language: string, testCases: { input: string; expectedOutput: string; visibility: "PUBLIC" | "PRIVATE" }[]) =>
    createWork(t, teacher.id, { subjectId, questions: [{ type: "CODE", languageId: await workLanguageId(t, language), testCases }, {}] });
  const applied = async (workId: string, overrides: Parameters<typeof applyWork>[3] = {}) => {
    const res = await applyWork(client, classId, workId, overrides);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
    off = await createTestApp({ clock, config: { codeRunner: { ...testConfig().codeRunner, enabled: false } } });
  });
  afterAll(async () => {
    await off.close();
    await t.close();
  });

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    eligible = await createWork(t, teacher.id, {
      questions: [{ type: "CODE", languageId: await workLanguageId(t, "python"), testCases: DOUBLE_CASES }, {}],
    });
    subjectId = eligible.subjectId;
    const created = await createClassWithStudents(t, teacher.id, { subjectId, students: 1 });
    schoolClass = created.schoolClass;
    classId = created.schoolClass.id;
    studentClient = api(t, { cookie: await loginAs(t, created.students[0]!) });
  });

  it("021/US2-1 trabalho elegível: sem o campo fica desligada, com true fica ligada na lista e no detalhe", async () => {
    expect((await summaryOf(eligible.id)).runnableCodeQuestionCount).toBe(1);

    const without = await applied(eligible.id);
    expect(without.codeExecution).toBe(false);
    const allowed = await applied(eligible.id, { codeExecution: true });
    expect(allowed.codeExecution).toBe(true);
    expect(await t.prisma.classActivity.findUniqueOrThrow({ where: { id: allowed.id }, select: { codeExecutionAllowed: true } })).toEqual({
      codeExecutionAllowed: true,
    });

    const list = (await client.get(base())).body as TeacherActivityList;
    expect(Object.fromEntries(list.items.map((item) => [item.id, item.codeExecution]))).toEqual({ [without.id]: false, [allowed.id]: true });
    expect(((await client.get(`${base()}/${allowed.id}`)).body as TeacherActivity).codeExecution).toBe(true);
  });

  describe("021/US2-2 trabalho sem questão de Código elegível", () => {
    it("sem Código, Código só com casos privados ou em C++: contagem 0 e true → 422 sem gravar nada", async () => {
      const works = {
        noCode: await createWork(t, teacher.id, { subjectId }),
        privateOnly: await codeWork("python", [{ input: "1\n", expectedOutput: "2\n", visibility: "PRIVATE" }]),
        cpp: await codeWork("cpp", [{ input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" }]),
      };
      for (const [name, work] of Object.entries(works)) {
        expect((await summaryOf(work.id)).runnableCodeQuestionCount, name).toBe(0);
        const res = await applyWork(client, classId, work.id, { codeExecution: true });
        expect([res.status, res.body.code], name).toEqual([422, "CODE_EXECUTION_NOT_ELIGIBLE"]);
      }
      expect(await t.prisma.classActivity.count()).toBe(0);
      expect(await events("activity.published")).toEqual([]);
      // Off, the same works apply as before.
      expect((await applied(works.cpp.id)).codeExecution).toBe(false);
    });
  });

  it("021/US2-3 activity.published registra codeExecution", async () => {
    await applied(eligible.id, { codeExecution: true });
    await applied(eligible.id);
    expect((await events("activity.published")).map((event) => (event.metadata as { codeExecution: boolean }).codeExecution)).toEqual([true, false]);
  });

  describe("021/US2-4 mudar a opção", () => {
    it("antes do primeiro início: aceita e audita activity.settings_changed com codeExecution", async () => {
      const activity = await applied(eligible.id);
      const on = await patch(activity.id, { version: 1, codeExecution: true });
      expect(on.status, JSON.stringify(on.body)).toBe(200);
      expect(on.body).toMatchObject({ version: 2, codeExecution: true });
      const back = await patch(activity.id, { version: 2, codeExecution: false });
      expect(back.body).toMatchObject({ version: 3, codeExecution: false });
      expect((await events("activity.settings_changed")).map((event) => event.metadata)).toEqual([
        { classId, executionMode: "NORMAL", aiHelpAllowance: 0, codeExecution: true },
        { classId, executionMode: "NORMAL", aiHelpAllowance: 0, codeExecution: false },
      ]);
      // The same value: nothing changes, no event and no new version.
      expect((await patch(activity.id, { version: 3, codeExecution: false })).body).toMatchObject({ version: 3 });
      expect(await events("activity.settings_changed")).toHaveLength(2);
    });

    it("depois do primeiro início → 409 ACTIVITY_ALREADY_STARTED e a coluna igual", async () => {
      const activity = await applied(eligible.id);
      expect((await startAttempt(studentClient, activity.id)).status).toBe(200);
      const res = await patch(activity.id, { version: 1, codeExecution: true });
      expect([res.status, res.body.code]).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
      expect(((await client.get(`${base()}/${activity.id}`)).body as TeacherActivity).codeExecution).toBe(false);
      expect(await events("activity.settings_changed")).toEqual([]);
    });

    it("true num snapshot não elegível → 422 sem mudar nada", async () => {
      const activity = await applied((await createWork(t, teacher.id, { subjectId })).id);
      const res = await patch(activity.id, { version: 1, codeExecution: true });
      expect([res.status, res.body.code]).toEqual([422, "CODE_EXECUTION_NOT_ELIGIBLE"]);
      expect((await client.get(`${base()}/${activity.id}`)).body).toMatchObject({ version: 1, codeExecution: false });
      expect(await events("activity.settings_changed")).toEqual([]);
    });
  });

  describe("021/US2-5 a opção existe só para Trabalho", () => {
    it("corpo de Exercícios ou de Prova com codeExecution → 400", async () => {
      for (const codeExecution of [true, false]) {
        expect((await applyExercises(client, classId, [randomUUID()], { codeExecution })).status).toBe(400);
        expect((await applyExam(client, classId, randomUUID(), { codeExecution, attendance: "NONE" })).status).toBe(400);
      }
      expect(await t.prisma.classActivity.count()).toBe(0);
    });

    it("PATCH de uma atividade de Exercícios com codeExecution → 400", async () => {
      const { activity } = await createActivity(t, schoolClass, { type: "EXERCISE" });
      const res = await patch(activity.id, { version: activity.version, codeExecution: false });
      expect(res.status).toBe(400);
    });
  });

  describe("021/US2-6 Code Runner fora do ar na aplicação", () => {
    it("sem heartbeat ou com CODE_RUNNER_ENABLED=false: disponibilidade false e a aplicação com true aceita", async () => {
      expect((await client.get("/api/code-runner/availability")).body).toEqual({ available: false });
      expect((await applied(eligible.id, { codeExecution: true })).codeExecution).toBe(true);

      await seedHeartbeat(t, clock.now());
      const offClient = api(off, { cookie: await loginAs(off, teacher) });
      expect((await offClient.get("/api/code-runner/availability")).body).toEqual({ available: false });
      expect((await applyWork(offClient, classId, eligible.id, { codeExecution: true })).status).toBe(201);
    });

    it("com heartbeat: disponibilidade true", async () => {
      await seedHeartbeat(t, clock.now());
      const res = await client.get("/api/code-runner/availability");
      expect([res.status, res.body]).toEqual([200, { available: true }]);
    });
  });

  it("021/FR-003 atividade de Trabalho gravada sem a coluna fica desligada e pode ser ligada antes do início", async () => {
    // Written without the column, as every work applied before 021.
    const { activity } = await createActivity(t, schoolClass, {
      type: "ASSIGNMENT",
      questions: [{ type: "CODE", languageKey: "python", testCases: DOUBLE_CASES }],
    });
    expect(((await client.get(`${base()}/${activity.id}`)).body as TeacherActivity).codeExecution).toBe(false);
    const res = await patch(activity.id, { version: activity.version, codeExecution: true });
    expect([res.status, res.body.codeExecution]).toEqual([200, true]);
  });
});
