import type { TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { RateLimitService } from "../../src/platform/rate-limit/rate-limit.service";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { applyWork, createClassWithStudents, startAttempt } from "../helpers/activities";
import { declareExit } from "../helpers/attendance";
import { DAY, FixedClock, MINUTE } from "../helpers/clock";
import { createRunWorker, getAttemptCodeRuns, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { LogCapture } from "../helpers/log-capture";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture, workLanguageId } from "../helpers/works";

type Client = ReturnType<typeof api>;

const MARKER = "MARCADOR-CODIGO-021";
const CASE = { input: `${MARKER} entrada\n`, expectedOutput: `${MARKER} esperada\n`, visibility: "PUBLIC" as const };
const PROGRAM = `print('${MARKER} programa')`;
const BROKEN = `print('${MARKER} quebrado'`;

/**
 * 021/SC-009 (contracts/audit-events.md): every flow of a run on a work — the option on apply and its
 * change, an executed run, a compilation error, the minute's limit, a run refused while out of the room,
 * the teacher's summary and the content purge — leaves the program, the case, the output, stderr and the
 * compiler message out of the audit trail and the logs. Each event carries only the contract's keys;
 * the summary writes none.
 */
describe("021/SC-009 nenhum código, entrada, saída ou mensagem de erro de execução num Trabalho na auditoria e nos logs", () => {
  let t: TestApp;
  let clock: FixedClock;
  let logs: LogCapture;
  let teacher: TestUser;
  let student: TestUser;
  let teacherClient: Client;
  let studentClient: Client;
  let classId: string;
  let work: WorkFixture;

  const events = (types: string[]) =>
    t.prisma.auditEvent.findMany({ where: { type: { in: types } }, orderBy: { id: "asc" }, select: { type: true, actorType: true, metadata: true } });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    logs = new LogCapture();
    t = await createTestApp({ clock, logs });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    logs.clear();
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    work = await createWork(t, teacher.id, { questions: [{ type: "CODE", languageId: await workLanguageId(t, "python"), testCases: [CASE] }, {}] });
    const created = await createClassWithStudents(t, teacher.id, { subjectId: work.subjectId, students: 1 });
    classId = created.schoolClass.id;
    student = created.students[0]!;
    studentClient = api(t, { cookie: await loginAs(t, student) });
    await seedHeartbeat(t, clock.now());
  });

  it("021/SC-009 cada fluxo grava só ids, enums, contagens e tempos, e nada da execução chega à auditoria ou aos logs", async () => {
    const applied = await applyWork(teacherClient, classId, work.id, { codeExecution: true });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const activity = applied.body as TeacherActivity;
    const base = `/api/classes/${classId}/activities/${activity.id}`;
    const off = await teacherClient.patch(base, { version: activity.version, codeExecution: false });
    expect(off.status, JSON.stringify(off.body)).toBe(200);
    expect((await teacherClient.patch(base, { version: off.body.version, codeExecution: true })).status).toBe(200);
    const questionId = (await t.prisma.classActivityQuestion.findFirstOrThrow({ where: { activityId: activity.id, type: "CODE" } })).id;

    expect((await startAttempt(studentClient, activity.id)).status).toBe(200);
    const sandbox = new FakeSandbox().scriptCases(fakeCase({ stdout: `${MARKER} saída\n`, stderr: `${MARKER} stderr` }));
    const { worker } = createRunWorker(t, clock, { sandbox });
    expect((await requestRun(studentClient, activity.id, questionId, PROGRAM)).status).toBe(202);
    expect(await worker.runOnce()).toBe(1);
    clock.advance(1000);
    await seedHeartbeat(t, clock.now());
    expect((await requestRun(studentClient, activity.id, questionId, BROKEN)).status).toBe(202);
    sandbox.failCompilation(`SyntaxError: ${MARKER} compilador`);
    expect(await worker.runOnce()).toBe(1);
    clock.advance(1000);

    // The minute's limit used up in one hit: the next new run is refused.
    const limit = t.config.rateLimit.codeRunsPerMinute;
    await t.get(RateLimitService).hit("code-runs", student.id, { limit, windowSec: 60, weight: limit });
    expect((await requestRun(studentClient, activity.id, questionId, PROGRAM)).status).toBe(429);

    // Out of the room: refused with the pause's event.
    expect((await declareExit(studentClient, activity.id, { reason: "WATER" })).status).toBe(201);
    const paused = await requestRun(studentClient, activity.id, questionId, PROGRAM);
    expect([paused.status, paused.body.code]).toEqual([409, "ATTEMPT_PAUSED"]);

    // The teacher's summary writes nothing.
    const attemptId = (await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id } })).id;
    const types = ["activity.published", "activity.settings_changed", "code_run.requested", "code_run.finished", "code_run.rate_limited", "attempt_pause.write_refused"];
    const beforeSummary = await events(types);
    expect((await getAttemptCodeRuns(teacherClient, classId, activity.id, attemptId)).status).toBe(200);
    expect(await events(types)).toEqual(beforeSummary);

    expect(beforeSummary.map(({ type }) => type)).toEqual([
      "activity.published",
      "activity.settings_changed",
      "activity.settings_changed",
      "code_run.requested",
      "code_run.finished",
      "code_run.requested",
      "code_run.finished",
      "code_run.rate_limited",
      "attempt_pause.write_refused",
    ]);
    const [published, turnedOff, turnedOn, requested, executed, , compiled, limited, refused] = beforeSummary;
    expect(published!.metadata).toMatchObject({ codeExecution: true });
    expect([turnedOff!.metadata, turnedOn!.metadata]).toMatchObject([{ codeExecution: false }, { codeExecution: true }]);
    expect(requested).toMatchObject({ actorType: "USER", metadata: { activityId: activity.id, activityType: "ASSIGNMENT", questionId, execution: "python", publicCaseCount: 1 } });
    expect(Object.keys(requested!.metadata as object).sort()).toEqual(["activityId", "activityType", "execution", "publicCaseCount", "questionId", "sourceBytes"]);
    expect(executed).toMatchObject({ actorType: "SYSTEM", metadata: { status: "COMPLETED", outcome: "EXECUTED", publicCaseCount: 1 } });
    expect(compiled!.metadata).toMatchObject({ status: "COMPLETED", outcome: "COMPILATION_ERROR" });
    expect(limited!.metadata).toEqual({ scope: "code-runs" });
    expect(refused!.metadata).toMatchObject({ activityId: activity.id, operation: "CODE_RUN" });

    // The content was stored where it belongs (the scan below is not vacuous).
    const stored = JSON.stringify([
      await t.prisma.codeRun.findMany({ select: { sourceCode: true, compileOutput: true } }),
      await t.prisma.codeRunCase.findMany({ select: { stdout: true, stderr: true } }),
    ]);
    expect(stored).toContain(`${MARKER} programa`);
    expect(stored).toContain(`${MARKER} compilador`);
    expect(stored).toContain(`${MARKER} saída`);

    // The content purge 24 h later: the runs are emptied, nothing of them reaches audit or logs.
    clock.advance(DAY + MINUTE);
    expect((await t.get(MaintenanceService).run({ job: "code-run-content", now: clock.now() })).status).toBe("completed");
    expect(JSON.stringify(await t.prisma.codeRun.findMany({ select: { sourceCode: true } }))).not.toContain(MARKER);

    // SC-009: the scan.
    const everyEvent = JSON.stringify(await t.prisma.auditEvent.findMany({ select: { type: true, targetId: true, metadata: true } }));
    expect(everyEvent).not.toContain(MARKER);
    expect(logs.text().length).toBeGreaterThan(0);
    expect(logs.text()).not.toContain(MARKER);
  });
});
