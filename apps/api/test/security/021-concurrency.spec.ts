import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { SchoolClass } from "../../src/generated/prisma/client";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createCodeWork, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp, testConfig } from "../helpers/test-app";

const ROUNDS = 10;
type Client = ReturnType<typeof api>;

/**
 * 021/FR-002 under concurrency (research Y1, Y5): the teacher turning "Permitir executar o código" on
 * while the first student starts either wins (the attempt starts with the option on) or is refused with
 * 409 ACTIVITY_ALREADY_STARTED — never the column changing once an attempt exists (the activity's lock
 * in the service, the `class_activities_code_execution_fixed` trigger underneath); and simultaneous
 * runs of one student on a work leave one pending run, as on an exercise (019/FR-009).
 */
describe("021 concorrência da opção de executar e das execuções num trabalho", () => {
  let t: TestApp;
  let clock: FixedClock;
  let teacher: TestUser;
  let teacherClient: Client;
  let client: Client;
  let schoolClass: SchoolClass;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock, config: { rateLimit: { ...testConfig().rateLimit, activityTeacherWritesPerHour: 1000 } } });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const created = await createClassWithStudents(t, teacher.id, { students: 1 });
    schoolClass = created.schoolClass;
    client = api(t, { cookie: await loginAs(t, created.students[0]!) });
  });

  it("021/FR-002 ligar a opção × primeiro início: ou a mudança vence antes da tentativa, ou 409 e a coluna igual", async () => {
    for (let round = 0; round < ROUNDS; round += 1) {
      const { activity } = await createCodeWork(t, schoolClass, { codeExecutionAllowed: false });
      const [patched, started] = await Promise.all([
        teacherClient.patch(`/api/classes/${schoolClass.id}/activities/${activity.id}`, { version: activity.version, codeExecution: true }),
        startAttempt(client, activity.id),
      ]);
      expect(started.status).toBe(200);
      const stored = await t.prisma.classActivity.findUniqueOrThrow({ where: { id: activity.id }, select: { codeExecutionAllowed: true } });
      if (patched.status === 200) {
        expect(stored.codeExecutionAllowed).toBe(true);
      } else {
        expect([patched.status, patched.body.code]).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
        expect(stored.codeExecutionAllowed).toBe(false);
      }
      // Whatever won, the column can't change any more: the attempt exists.
      const late = await teacherClient.patch(`/api/classes/${schoolClass.id}/activities/${activity.id}`, {
        version: patched.status === 200 ? activity.version + 1 : activity.version,
        codeExecution: !stored.codeExecutionAllowed,
      });
      expect([late.status, late.body.code]).toEqual([409, "ACTIVITY_ALREADY_STARTED"]);
    }
    expect(await t.prisma.auditEvent.count({ where: { type: "activity.settings_changed" } })).toBeLessThanOrEqual(ROUNDS);
  });

  it("021/FR-010 10 execuções simultâneas do mesmo aluno num trabalho → uma só pendente", async () => {
    const { activity, questionIds } = await createCodeWork(t, schoolClass);
    await seedHeartbeat(t, clock.now());
    expect((await startAttempt(client, activity.id)).status).toBe(200);
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) => requestRun(client, activity.id, questionIds[0]!, `print(${index})`)));
    expect(responses.map((res) => res.status).sort()).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 200, 202]);
    expect(new Set(responses.map((res) => res.body.id)).size).toBe(1);
    expect(await t.prisma.codeRun.count()).toBe(1);
  });
});
