import type { StudentActivity, StudentActivityPage, TeacherActivity, TeacherActivityList } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WORK_HELPER_KEY } from "../../src/modules/work-help/definitions/work-helper";
import { type AiTestApp, resetAiDb } from "../helpers/ai";
import { applyExercises, applyWork, createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { createExercise } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWorkHelpApp, getHelpAvailability } from "../helpers/work-help";
import { createWork } from "../helpers/works";

/**
 * 015/US1 — the teacher applies a work with the controlled mode and the AI help (015/FR-001–FR-006,
 * research F2, F3): both off by default, only for a work, the help only with exactly 3 and only when
 * the `work-helper` can serve it, changes only before the first student starts, shown by text in the
 * teacher's and the student's views. The suite runs on the fake provider with the `work-helper`
 * ACTIVE; the AI worker is off (interval 0), which still counts as available: requests queue (011).
 */

type ApiClient = ReturnType<typeof api>;

describe("015/US1 professor liga modo controlado e ajuda da IA", () => {
  let t: AiTestApp;
  let teacher: TestUser;
  let client: ApiClient;
  let studentClient: ApiClient;
  let classId: string;
  let workId: string;

  const base = () => `/api/classes/${classId}/activities`;
  const events = (type: string) => t.prisma.auditEvent.findMany({ where: { type }, orderBy: { id: "asc" } });
  const activityCount = () => t.prisma.classActivity.count();
  const patch = (activityId: string, body: object) => client.patch(`${base()}/${activityId}`, body);

  beforeAll(async () => {
    t = await createWorkHelpApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetAiDb(t);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    const work = await createWork(t, teacher.id);
    workId = work.id;
    const { schoolClass, students } = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 1 });
    classId = schoolClass.id;
    studentClient = api(t, { cookie: await loginAs(t, students[0]!) });
  });

  it("015/US1-1 015/FR-001 aplica com modo controlado e 3 ajudas: gravado, auditado e mostrado ao professor e ao aluno", async () => {
    const res = await applyWork(client, classId, workId, { executionMode: "CONTROLLED", aiHelpAllowance: 3 });
    expect(res.status).toBe(201);
    const activity = res.body as TeacherActivity;
    expect(activity).toMatchObject({ type: "ASSIGNMENT", executionMode: "CONTROLLED", aiHelp: { allowance: 3 } });
    expect(activity.roster.map((entry) => entry.aiHelpUsed)).toEqual([0]);
    expect(await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id }, select: { executionMode: true, aiHelpAllowance: true } })).toEqual({
      executionMode: "CONTROLLED",
      aiHelpAllowance: 3,
    });
    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({ executionMode: "CONTROLLED", aiHelpAllowance: 3 });

    const list = (await client.get(base())).body as TeacherActivityList;
    expect(list.items.map((item) => [item.executionMode, item.aiHelp])).toEqual([["CONTROLLED", { allowance: 3 }]]);
    const mine = (await studentClient.get("/api/me/activities")).body as StudentActivityPage;
    expect(mine.items.map((item) => [item.executionMode, item.aiHelp])).toEqual([["CONTROLLED", { allowance: 3 }]]);
    const detail = (await studentClient.get(`/api/me/activities/${activity.id}`)).body as StudentActivity;
    expect([detail.executionMode, detail.aiHelp]).toEqual(["CONTROLLED", { allowance: 3, used: 0 }]);
  });

  it("015/US1-2 015/FR-001 sem mexer nas opções: NORMAL e sem ajuda, como na 012", async () => {
    const res = await applyWork(client, classId, workId);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ executionMode: "NORMAL", aiHelp: { allowance: 0 } });
    const [published] = await events("activity.published");
    expect(published!.metadata).toMatchObject({ executionMode: "NORMAL", aiHelpAllowance: 0 });
    const detail = (await studentClient.get(`/api/me/activities/${(res.body as TeacherActivity).id}`)).body as StudentActivity;
    expect([detail.executionMode, detail.aiHelp]).toEqual(["NORMAL", { allowance: 0, used: 0 }]);
  });

  it("015/FR-001 modo controlado sem ajuda e ajuda sem modo controlado são independentes", async () => {
    const controlled = await applyWork(client, classId, workId, { executionMode: "CONTROLLED" });
    expect(controlled.body).toMatchObject({ executionMode: "CONTROLLED", aiHelp: { allowance: 0 } });
    const helped = await applyWork(client, classId, workId, { aiHelpAllowance: 3 });
    expect(helped.body).toMatchObject({ executionMode: "NORMAL", aiHelp: { allowance: 3 } });
  });

  describe("015/US1-3 015/FR-004 ajuda indisponível", () => {
    it("agente desabilitado: disponibilidade AGENT_DISABLED, aplicar com ajuda → 503 sem criar nada, sem ajuda → 201", async () => {
      await t.prisma.aiAgent.update({ where: { key: WORK_HELPER_KEY }, data: { status: "DISABLED" } });
      expect((await getHelpAvailability(client)).body).toEqual({ available: false, reason: "AGENT_DISABLED" });
      const refused = await applyWork(client, classId, workId, { aiHelpAllowance: 3 });
      expect([refused.status, refused.body.code]).toEqual([503, "AI_HELP_UNAVAILABLE"]);
      expect(await activityCount()).toBe(0);
      expect(await events("activity.published")).toEqual([]);
      expect((await applyWork(client, classId, workId, { executionMode: "CONTROLLED" })).status).toBe(201);
    });

    it("sem modelo utilizável: MODEL_UNAVAILABLE, e ligar a ajuda numa edição → 503 sem mudar nada", async () => {
      const { body } = await applyWork(client, classId, workId);
      await t.prisma.aiModelConfig.updateMany({ data: { status: "DISABLED" } });
      expect((await getHelpAvailability(client)).body).toEqual({ available: false, reason: "MODEL_UNAVAILABLE" });
      const refused = await patch(body.id, { version: 1, aiHelpAllowance: 3 });
      expect([refused.status, refused.body.code]).toEqual([503, "AI_HELP_UNAVAILABLE"]);
      expect((await client.get(`${base()}/${body.id}`)).body).toMatchObject({ version: 1, aiHelp: { allowance: 0 } });
      expect(await events("activity.settings_changed")).toEqual([]);
    });

    it("com o agente ativo e um modelo aprovado: disponível, sem motivo", async () => {
      expect((await getHelpAvailability(client)).body).toEqual({ available: true, reason: null });
    });
  });

  describe("015/US1-4 015/FR-005 editar as opções antes do primeiro início", () => {
    it("aceita e audita activity.settings_changed, com uma nova versão", async () => {
      const { body } = await applyWork(client, classId, workId);
      const res = await patch(body.id, { version: 1, executionMode: "CONTROLLED", aiHelpAllowance: 3 });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ version: 2, executionMode: "CONTROLLED", aiHelp: { allowance: 3 } });
      const [changed] = await events("activity.settings_changed");
      expect(changed).toMatchObject({ actorType: "USER", actorUserId: teacher.id, targetType: "CLASS_ACTIVITY", targetId: body.id });
      expect(changed!.metadata).toEqual({ classId, executionMode: "CONTROLLED", aiHelpAllowance: 3, codeExecution: false });
      // Settings only: `activity.updated` lists the 012 fields and none changed.
      expect(await events("activity.updated")).toEqual([]);

      const back = await patch(body.id, { version: 2, executionMode: "NORMAL" });
      expect(back.body).toMatchObject({ version: 3, executionMode: "NORMAL", aiHelp: { allowance: 3 } });
      expect((await events("activity.settings_changed")).map((event) => event.metadata)).toEqual([
        { classId, executionMode: "CONTROLLED", aiHelpAllowance: 3, codeExecution: false },
        { classId, executionMode: "NORMAL", aiHelpAllowance: 3, codeExecution: false },
      ]);
    });

    it("as mesmas opções: nada muda, sem evento e sem versão nova", async () => {
      const { body } = await applyWork(client, classId, workId, { executionMode: "CONTROLLED" });
      const res = await patch(body.id, { version: 1, executionMode: "CONTROLLED", aiHelpAllowance: 0 });
      expect(res.body).toMatchObject({ version: 1, executionMode: "CONTROLLED" });
      expect(await events("activity.settings_changed")).toEqual([]);
    });

    it("título e opções na mesma edição: um evento de cada, uma versão", async () => {
      const { body } = await applyWork(client, classId, workId);
      const res = await patch(body.id, { version: 1, title: "Novo título", executionMode: "CONTROLLED" });
      expect(res.body).toMatchObject({ version: 2, title: "Novo título", executionMode: "CONTROLLED" });
      expect((await events("activity.updated")).map((event) => event.metadata)).toEqual([{ classId, fields: ["title"] }]);
      expect(await events("activity.settings_changed")).toHaveLength(1);
    });

    it("depois que um aluno iniciou → 409 ACTIVITY_ALREADY_STARTED; o resto da edição continua permitido", async () => {
      const { body } = await applyWork(client, classId, workId);
      const student = await t.prisma.enrollment.findFirstOrThrow({ where: { classId }, select: { studentUserId: true } });
      await createAttemptRow(t, body.id, student.studentUserId);
      for (const change of [{ executionMode: "CONTROLLED" }, { aiHelpAllowance: 3 }]) {
        const refused = await patch(body.id, { version: 1, ...change });
        expect([refused.status, refused.body.code], JSON.stringify(change)).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
        // The same title in the refused edit didn't go in either: the whole PATCH is refused.
        const withTitle = await patch(body.id, { version: 1, title: "Outro", ...change });
        expect(withTitle.status).toBe(409);
      }
      expect((await client.get(`${base()}/${body.id}`)).body).toMatchObject({ version: 1, executionMode: "NORMAL", aiHelp: { allowance: 0 } });
      expect(await events("activity.settings_changed")).toEqual([]);
      // Sending the options as they are is no change; the title still edits.
      const same = await patch(body.id, { version: 1, title: "Outro", executionMode: "NORMAL", aiHelpAllowance: 0 });
      expect(same.body).toMatchObject({ version: 2, title: "Outro" });
    });
  });

  describe("015/US1-5 015/FR-002 só Trabalho tem as opções", () => {
    it("aplicar Exercícios com modo controlado ou ajuda → 400, sem criar nada", async () => {
      const exercise = await createExercise(t, teacher.id, { type: "MULTIPLE_CHOICE" });
      for (const extra of [{ executionMode: "CONTROLLED" }, { aiHelpAllowance: 3 }, { executionMode: "NORMAL" }]) {
        const refused = await applyExercises(client, classId, [exercise.id], extra);
        expect([refused.status, refused.body.code], JSON.stringify(extra)).toEqual([400, "VALIDATION_ERROR"]);
      }
      expect(await activityCount()).toBe(0);
      const applied = await applyExercises(client, classId, [exercise.id]);
      expect(applied.body).toMatchObject({ executionMode: "NORMAL", aiHelp: { allowance: 0 } });
      expect((applied.body as TeacherActivity).roster.map((entry) => entry.aiHelpUsed)).toEqual([null]);
    });

    it("editar um Exercício com modo ou ajuda → 400", async () => {
      const schoolClass = await t.prisma.schoolClass.findUniqueOrThrow({ where: { id: classId } });
      const { activity } = await createActivity(t, schoolClass, { type: "EXERCISE" });
      for (const change of [{ executionMode: "CONTROLLED" }, { aiHelpAllowance: 3 }, { aiHelpAllowance: 0 }]) {
        const refused = await patch(activity.id, { version: 1, ...change });
        expect([refused.status, refused.body.code], JSON.stringify(change)).toEqual([400, "VALIDATION_ERROR"]);
      }
    });
  });

  it("015/US1-6 015/FR-003 outra quantidade de ajudas → 400, na aplicação e na edição", async () => {
    for (const allowance of [1, 2, 4, 10]) {
      const refused = await applyWork(client, classId, workId, { aiHelpAllowance: allowance });
      expect([refused.status, refused.body.code], String(allowance)).toEqual([400, "VALIDATION_ERROR"]);
    }
    expect(await activityCount()).toBe(0);
    const { body } = await applyWork(client, classId, workId);
    expect((await patch(body.id, { version: 1, aiHelpAllowance: 2 })).status).toBe(400);
  });

  it("015/FR-006 o detalhe do professor e o do aluno mostram as opções depois de uma edição", async () => {
    const { body } = await applyWork(client, classId, workId);
    await patch(body.id, { version: 1, executionMode: "CONTROLLED", aiHelpAllowance: 3 });
    expect((await client.get(`${base()}/${body.id}`)).body).toMatchObject({ executionMode: "CONTROLLED", aiHelp: { allowance: 3 } });
    expect((await studentClient.get(`/api/me/activities/${body.id}`)).body).toMatchObject({
      executionMode: "CONTROLLED",
      aiHelp: { allowance: 3, used: 0 },
    });
  });
});

describe("015/US1-3 sem o agente de ajuda registrado (definições de produção, sem provedor)", () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(() => resetDb(t.prisma));

  it("a ajuda aparece indisponível e aplicar com ela → 503", async () => {
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const client = api(t, { cookie: await loginAs(t, teacher) });
    expect((await getHelpAvailability(client)).body).toEqual({ available: false, reason: "AGENT_DISABLED" });
    const work = await createWork(t, teacher.id);
    const { schoolClass } = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId });
    const refused = await applyWork(client, schoolClass.id, work.id, { aiHelpAllowance: 3 });
    expect([refused.status, refused.body.code]).toEqual([503, "AI_HELP_UNAVAILABLE"]);
  });

  it("a disponibilidade é do professor: aluno, ADMIN e MANAGER → 403", async () => {
    for (const role of ["STUDENT", "ADMIN", "MANAGER"] as const) {
      const user = await createUser(t, { roles: [role] });
      expect((await getHelpAvailability(api(t, { cookie: await loginAs(t, user) }))).status, role).toBe(403);
    }
  });
});
