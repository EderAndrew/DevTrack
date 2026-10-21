import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import { CODE_RUN_PURGE_BATCH_SIZE, CodeRunContentJob } from "../../src/modules/code-runs/content-retention.job";
import { MaintenanceService } from "../../src/platform/maintenance/maintenance.service";
import { PrismaService } from "../../src/platform/database/prisma.service";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock, HOUR } from "../helpers/clock";
import { createCodeExercise, createRunWorker, doubles, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const SECOND = 1_000;

/**
 * 019/FR-019, SC-006 (research B12): the maintenance job `code-run-content` empties the content of
 * final runs (source, compiler message, each case's stdout and stderr) once they finished
 * `CODE_RUN_CONTENT_RETENTION_HOURS − MAINTENANCE_INTERVAL_SECONDS` ago (23 h with an hourly
 * maintenance), so nothing outlives 24 h between two runs of the job. The rows stay with their
 * status, verdicts, counts and times; a pending run is never touched, and after the purge the
 * triggers refuse any other change.
 */
describe("019/SC-006 retenção do conteúdo das execuções (job code-run-content)", () => {
  let t: TestApp;
  let clock: FixedClock;
  let clients: Client[];
  let activityId: string;
  let questionId: string;
  let finishedAt: Date;

  const purge = (now: Date) => t.get(MaintenanceService).run({ job: "code-run-content", now });
  const runs = () =>
    t.prisma.codeRun.findMany({
      orderBy: { createdAt: "asc" },
      include: { cases: { orderBy: { position: "asc" } } },
    });

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    // The production default: maintenance every hour (the suites' .env.test turns the timer off).
    t = await createTestApp({ clock, config: { maintenanceIntervalSeconds: 3600 } });
  });
  afterAll(() => t.close());

  /** Student 0: an EXECUTED run with both public cases; student 1: a compilation error; student 2: a pending run. */
  beforeEach(async () => {
    await resetDb(t.prisma);
    clock.set(new Date());
    const teacher = await createUser(t, { roles: ["TEACHER"] });
    const created = await createClassWithStudents(t, teacher.id, { students: 3 });
    clients = await Promise.all(created.students.map(async (student) => api(t, { cookie: await loginAs(t, student) })));
    const activity = await createCodeExercise(t, created.schoolClass);
    activityId = activity.activity.id;
    questionId = activity.questionIds[0]!;
    await seedHeartbeat(t, clock.now());
    for (const client of clients) expect((await startAttempt(client, activityId)).status).toBe(200);

    expect((await requestRun(clients[0]!, activityId, questionId)).status).toBe(202);
    expect(await createRunWorker(t, clock, { sandbox: new FakeSandbox().scriptCases(doubles) }).worker.runOnce()).toBe(1);
    clock.advance(SECOND);
    expect((await requestRun(clients[1]!, activityId, questionId, "print(\n")).status).toBe(202);
    const broken = new FakeSandbox().failCompilation("SyntaxError: '(' was never closed");
    expect(await createRunWorker(t, clock, { sandbox: broken }).worker.runOnce()).toBe(1);
    finishedAt = clock.now();
    clock.advance(SECOND);
    expect((await requestRun(clients[2]!, activityId, questionId)).status).toBe(202);
  });

  it("019/FR-019 com a manutenção de hora em hora: 23 h − 1 s não apaga; 23 h + 1 s esvazia só as finais", async () => {
    expect(await purge(new Date(finishedAt.getTime() + 23 * HOUR - SECOND))).toEqual({
      status: "completed",
      results: [{ job: "code-run-content", removed: 0 }],
    });
    expect((await runs()).every((run) => run.contentPurgedAt === null)).toBe(true);

    const now = new Date(finishedAt.getTime() + 23 * HOUR + SECOND);
    expect(await purge(now)).toEqual({ status: "completed", results: [{ job: "code-run-content", removed: 2 }] });

    const [executed, compiled, pending] = await runs();
    // The rows stay, without content, with what they were.
    expect(executed).toMatchObject({
      status: "COMPLETED",
      outcome: "EXECUTED",
      passedCount: 2,
      publicCaseCount: 2,
      sourceCode: null,
      compileOutput: null,
      contentPurgedAt: now,
    });
    expect(executed!.cases.map((c) => [c.position, c.verdict, c.stdout, c.stderr, c.exitCode])).toEqual([
      [0, "PASSED", null, null, 0],
      [1, "PASSED", null, null, 0],
    ]);
    expect(compiled).toMatchObject({ status: "COMPLETED", outcome: "COMPILATION_ERROR", passedCount: 0, sourceCode: null, compileOutput: null, contentPurgedAt: now });
    // A pending run keeps its code.
    expect(pending).toMatchObject({ status: "QUEUED", contentPurgedAt: null });
    expect(pending!.sourceCode).not.toBeNull();

    // Zero run content older than 24 h after the job (SC-006).
    const old = await t.prisma.codeRun.count({
      where: { finishedAt: { lt: new Date(now.getTime() - 24 * HOUR) }, OR: [{ sourceCode: { not: null } }, { compileOutput: { not: null } }] },
    });
    expect(old).toBe(0);
    expect(await t.prisma.codeRunCase.count({ where: { OR: [{ stdout: { not: null } }, { stderr: { not: null } }] } })).toBe(0);

    // Running it again changes nothing.
    expect(await purge(new Date(now.getTime() + HOUR))).toMatchObject({ results: [{ job: "code-run-content", removed: 0 }] });
  });

  it("019/FR-019 sem a manutenção periódica (intervalo 0): o corte é 24 h", async () => {
    const job = new CodeRunContentJob(
      { ...t.config, maintenanceIntervalSeconds: 0 },
      t.get(PrismaService),
      t.get(MaintenanceService),
    );
    expect(await job.run({ now: new Date(finishedAt.getTime() + 24 * HOUR - SECOND), batchSize: 1_000 })).toBe(0);
    expect(await job.run({ now: new Date(finishedAt.getTime() + 24 * HOUR + SECOND), batchSize: 1_000 })).toBe(2);
  });

  it("019/FR-019 o aluno lê a execução esvaziada: sem código nem saídas, contentPurged", async () => {
    await purge(new Date(finishedAt.getTime() + 23 * HOUR + SECOND));
    const latest = await clients[0]!.get(`/api/me/activities/${activityId}/questions/${questionId}/code-runs/latest`);
    expect(latest.status).toBe(200);
    expect(latest.body.run).toMatchObject({ status: "COMPLETED", sourceCode: null, compileOutput: null, contentPurged: true, passedCount: 2 });
    for (const c of latest.body.run.cases) expect([c.stdout, c.stderr]).toEqual([null, null]);
  });

  it("019/FR-019 depois do apagamento o gatilho recusa qualquer outra mudança", async () => {
    await purge(new Date(finishedAt.getTime() + 23 * HOUR + SECOND));
    const [executed] = await runs();
    const id = executed!.id;
    const refused = [
      t.prisma.$executeRaw`UPDATE code_runs SET source_code = 'print(1)' WHERE id = ${id}::uuid`,
      t.prisma.$executeRaw`UPDATE code_runs SET content_purged_at = content_purged_at + interval '1 second' WHERE id = ${id}::uuid`,
      t.prisma.$executeRaw`UPDATE code_runs SET passed_count = 0 WHERE id = ${id}::uuid`,
      t.prisma.$executeRaw`UPDATE code_runs SET status = 'FAILED', failure_reason = 'INTERRUPTED' WHERE id = ${id}::uuid`,
      t.prisma.$executeRaw`UPDATE code_run_cases SET stdout = '2' WHERE run_id = ${id}::uuid`,
      t.prisma.$executeRaw`UPDATE code_run_cases SET verdict = 'WRONG_OUTPUT' WHERE run_id = ${id}::uuid`,
      t.prisma.$executeRaw`DELETE FROM code_run_cases WHERE run_id = ${id}::uuid`,
    ];
    for (const write of refused) await expect(write).rejects.toThrow();
    const after = (await runs())[0]!;
    expect(after).toEqual(executed);
  });

  it("019/FR-019 esvazia em lotes de 500, cada lote numa transação", async () => {
    const [source] = await runs();
    // 501 more final runs (inserted QUEUED, then FAILED/EXPIRED, as the triggers require).
    // The id comes from the database; a DO block takes no parameters.
    await t.prisma.$executeRawUnsafe(`
      DO $$
      DECLARE
        src code_runs%ROWTYPE;
        new_id uuid;
      BEGIN
        SELECT * INTO src FROM code_runs WHERE id = '${source!.id}';
        FOR i IN 1..501 LOOP
          new_id := gen_random_uuid();
          INSERT INTO code_runs (id, activity_id, question_id, attempt_id, student_user_id, execution, source_code,
                                 public_case_count, created_at, deadline_at)
          VALUES (new_id, src.activity_id, src.question_id, src.attempt_id, src.student_user_id, src.execution,
                  'print(1)', src.public_case_count, src.created_at, src.deadline_at);
          UPDATE code_runs SET status = 'FAILED', failure_reason = 'EXPIRED', finished_at = src.finished_at WHERE id = new_id;
        END LOOP;
      END $$`);
    expect(await t.prisma.codeRun.count({ where: { status: { in: ["COMPLETED", "FAILED"] } } })).toBe(503);

    const prisma = t.get(PrismaService);
    const transactions = vi.spyOn(prisma, "runInTransaction");
    try {
      expect(await t.get(CodeRunContentJob).run({ now: new Date(finishedAt.getTime() + 23 * HOUR + SECOND), batchSize: 1_000 })).toBe(503);
      // 500 + 3, the last batch smaller than the limit.
      expect(transactions).toHaveBeenCalledTimes(Math.ceil(503 / CODE_RUN_PURGE_BATCH_SIZE));
    } finally {
      transactions.mockRestore();
    }
    expect(await t.prisma.codeRun.count({ where: { contentPurgedAt: null, status: { in: ["COMPLETED", "FAILED"] } } })).toBe(0);
    expect(t.get(MaintenanceService).registeredJobs()).toEqual([
      "unverified-accounts",
      "access-records",
      "audit-events",
      "rate-limit-counters",
      "ai-records",
      "code-run-content",
      "mail-records",
    ]);
  });
});
