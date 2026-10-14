import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CodeRunFailureReason, CodeRunStatus, CodeRunVerdict } from "../../src/generated/prisma/client";
import { createActivity, createAttemptRow, createClassWithStudents, type CreatedActivity } from "../helpers/activities";
import { createExercise } from "../helpers/exercises";
import { createUser, type TestUser } from "../helpers/factories";
import { createTestApp, resetDb, type TestApp } from "../helpers/test-app";

const MINUTE = 60_000;

/**
 * 019 data-model.md (research B5, B8, B9, B12, B16): the database refuses, by itself, what the Code
 * Runner forbids — rows written by Prisma or SQL, without the API, the worker or the contracts in the
 * way (constitution V).
 */
describe("019/FR-001 019/FR-009 019/FR-017 019/FR-019 019/FR-020 regras do Code Runner garantidas pelo PostgreSQL", () => {
  let t: TestApp;
  let teacherId: string;
  let student: TestUser;
  let other: TestUser;
  let schoolClass: { id: string; teacherId: string };
  /** EXERCISE: [CODE with 2 PUBLIC (positions 0, 2) and 1 PRIVATE (position 1), MULTIPLE_CHOICE]. */
  let exercise: CreatedActivity;
  /** ASSIGNMENT with one CODE question and a PUBLIC case. */
  let assignment: CreatedActivity;
  /** The snapshot's test cases of `exercise`'s CODE question, by position. */
  let cases: { id: string; position: number; visibility: string }[];

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacherId = (await createUser(t, { roles: ["TEACHER"] })).id;
    const created = await createClassWithStudents(t, teacherId, { students: 2 });
    schoolClass = created.schoolClass;
    [student, other] = created.students as [TestUser, TestUser];
    exercise = await createActivity(t, schoolClass, {
      type: "EXERCISE",
      questions: [
        {
          type: "CODE",
          testCases: [
            { input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" },
            { input: "2\n", expectedOutput: "4\n", visibility: "PRIVATE" },
            { input: "3\n", expectedOutput: "6\n", visibility: "PUBLIC" },
          ],
        },
        { type: "MULTIPLE_CHOICE" },
      ],
    });
    assignment = await createActivity(t, schoolClass, {
      questions: [{ type: "CODE", testCases: [{ input: "", expectedOutput: "x", visibility: "PUBLIC" }] }],
    });
    cases = await t.prisma.classActivityTestCase.findMany({
      where: { questionId: exercise.questionIds[0]! },
      orderBy: { position: "asc" },
      select: { id: true, position: true, visibility: true },
    });
  });

  const attempt = (activity: CreatedActivity = exercise, who = student) =>
    createAttemptRow(t, activity.activity.id, who.id).then((row) => row.attemptId);

  /** A QUEUED run of `attemptId` on the exercise's CODE question; the fields override the defaults. */
  const run = (attemptId: string, fields: Record<string, unknown> = {}, activity = exercise, who = student) => {
    const createdAt = new Date();
    return t.prisma.codeRun.create({
      data: {
        activityId: activity.activity.id,
        questionId: activity.questionIds[0]!,
        attemptId,
        studentUserId: who.id,
        execution: "python",
        sourceCode: "print(int(input()) * 2)",
        publicCaseCount: 2,
        createdAt,
        deadlineAt: new Date(createdAt.getTime() + MINUTE),
        ...fields,
      },
    });
  };

  const claim = (id: string) =>
    t.prisma.codeRun.update({
      where: { id },
      data: { status: "RUNNING", claimedAt: new Date(), leaseUntil: new Date(Date.now() + 90_000), claimedBy: "worker-1", claimToken: randomUUID() },
    });
  const fail = (id: string, failureReason: CodeRunFailureReason) =>
    t.prisma.codeRun.update({ where: { id }, data: { status: "FAILED", failureReason, finishedAt: new Date() } });

  /** RUNNING → COMPLETED/EXECUTED with one case per PUBLIC case, in one transaction (as the worker writes it). */
  const complete = (id: string, verdicts: CodeRunVerdict[] = ["PASSED", "WRONG_OUTPUT"]) =>
    t.prisma.$transaction(async (tx) => {
      await tx.codeRun.update({
        where: { id },
        data: { status: "COMPLETED", outcome: "EXECUTED", passedCount: verdicts.filter((verdict) => verdict === "PASSED").length, finishedAt: new Date() },
      });
      const publicCases = cases.filter((testCase) => testCase.visibility === "PUBLIC");
      for (const [position, verdict] of verdicts.entries()) {
        await tx.codeRunCase.create({
          data: { runId: id, testCaseId: publicCases[position]!.id, position, verdict, stdout: "2\n", stderr: "", exitCode: 0, durationMs: 120 },
        });
      }
    });

  describe("catálogo de linguagens (research B5)", () => {
    it("019/FR-020 execution: seed java, python e javascript; as demais sem execução; só as três chaves", async () => {
      const languages = await t.prisma.programmingLanguage.findMany({ select: { key: true, execution: true }, orderBy: { key: "asc" } });
      expect(languages.filter((language) => language.execution !== null)).toEqual([
        { key: "java", execution: "java" },
        { key: "javascript", execution: "javascript" },
        { key: "python", execution: "python" },
      ]);
      expect(languages).toHaveLength(13);
      await expect(t.prisma.programmingLanguage.update({ where: { key: "c" }, data: { execution: "c" } })).rejects.toThrow(/execution_chk/);
      await expect(t.prisma.programmingLanguage.update({ where: { key: "typescript" }, data: { execution: "Python" } })).rejects.toThrow(/execution_chk/);
    });
  });

  describe("casos de teste do banco de exercícios (research B16)", () => {
    const writeCases = (exerciseId: string, list: { position: number; input?: string; expectedOutput?: string; visibility?: "PUBLIC" | "PRIVATE" }[]) =>
      t.prisma.$transaction(async (tx) => {
        for (const testCase of list) {
          await tx.exerciseTestCase.create({
            data: {
              exerciseId,
              position: testCase.position,
              input: testCase.input ?? "",
              expectedOutput: testCase.expectedOutput ?? "ok",
              visibility: testCase.visibility ?? "PUBLIC",
            },
          });
        }
      });
    const positions = (count: number) => Array.from({ length: count }, (_, position) => ({ position }));

    it("019/FR-001 só exercício de Código tem casos, de 0 a 20, com posições 0…n−1", async () => {
      const code = await createExercise(t, teacherId, { type: "CODE" });
      await expect(writeCases(code.id, positions(20))).resolves.toBeUndefined();
      await expect(writeCases(code.id, [{ position: 20 }])).rejects.toThrow(/more than 20 test cases/);

      const gap = await createExercise(t, teacherId, { type: "CODE" });
      await expect(writeCases(gap.id, [{ position: 0 }, { position: 2 }])).rejects.toThrow(/positions/);
      await expect(writeCases(gap.id, [{ position: 1 }])).rejects.toThrow(/positions/);
      await expect(writeCases(gap.id, [{ position: 0 }, { position: 0 }])).rejects.toThrow(/Unique constraint|unique|positions/i);

      for (const type of ["OPEN_ANSWER", "MULTIPLE_CHOICE"] as const) {
        const notCode = await createExercise(t, teacherId, { type });
        await expect(writeCases(notCode.id, [{ position: 0 }]), type).rejects.toThrow(/cannot have test cases/);
      }
    });

    it("019/FR-001 entrada vazia aceita; saída esperada de 1 a 10 000 caracteres; entrada até 10 000", async () => {
      const code = await createExercise(t, teacherId, { type: "CODE" });
      await expect(writeCases(code.id, [{ position: 0, input: "", expectedOutput: "" }])).rejects.toThrow(/text_chk/);
      await expect(writeCases(code.id, [{ position: 0, input: "x".repeat(10_001) }])).rejects.toThrow(/text_chk/);
      await expect(writeCases(code.id, [{ position: 0, expectedOutput: "y".repeat(10_001) }])).rejects.toThrow(/text_chk/);
      await expect(
        writeCases(code.id, [{ position: 0, input: "x".repeat(10_000), expectedOutput: "y".repeat(10_000), visibility: "PRIVATE" }, { position: 1, input: "" }]),
      ).resolves.toBeUndefined();
    });

    it("019/FR-003 a lista é trocada inteira na mesma transação; reordenar passa; exercício arquivado não muda os casos", async () => {
      const code = await createExercise(t, teacherId, { type: "CODE" });
      await writeCases(code.id, positions(3));
      await t.prisma.$transaction(async (tx) => {
        await tx.exerciseTestCase.deleteMany({ where: { exerciseId: code.id } });
        await tx.exerciseTestCase.create({ data: { exerciseId: code.id, position: 0, input: "", expectedOutput: "novo", visibility: "PRIVATE" } });
      });
      expect(await t.prisma.exerciseTestCase.count({ where: { exerciseId: code.id } })).toBe(1);

      await writeCases(code.id, [{ position: 1 }]);
      await t.prisma.$transaction(async (tx) => {
        const [first, second] = await tx.exerciseTestCase.findMany({ where: { exerciseId: code.id }, orderBy: { position: "asc" } });
        await tx.exerciseTestCase.update({ where: { id: first!.id }, data: { position: 1 } });
        await tx.exerciseTestCase.update({ where: { id: second!.id }, data: { position: 0 } });
      });

      await t.prisma.exercise.update({ where: { id: code.id }, data: { status: "ARCHIVED", archivedFromStatus: "APPROVED" } });
      await expect(writeCases(code.id, [{ position: 2 }])).rejects.toThrow(/archived exercise/);
      await expect(t.prisma.exerciseTestCase.deleteMany({ where: { exerciseId: code.id } })).rejects.toThrow(/archived exercise/);
      await expect(t.prisma.exerciseTestCase.updateMany({ where: { exerciseId: code.id }, data: { expectedOutput: "outro" } })).rejects.toThrow(
        /archived exercise/,
      );
    });

    it("019/FR-003 excluir um rascunho leva os casos junto", async () => {
      const draft = await createExercise(t, teacherId, { type: "CODE", status: "DRAFT" });
      await writeCases(draft.id, positions(2));
      await t.prisma.exercise.delete({ where: { id: draft.id } });
      expect(await t.prisma.exerciseTestCase.count({ where: { exerciseId: draft.id } })).toBe(0);
    });
  });

  describe("execuções (research B8, B9)", () => {
    it("019/FR-009 um pendente por aluno, em qualquer questão; outro aluno tem o seu; um final libera", async () => {
      const mine = await attempt();
      const first = await run(mine);
      await expect(run(mine)).rejects.toThrow(/Unique constraint|unique/i);
      await claim(first.id);
      await expect(run(mine)).rejects.toThrow(/Unique constraint|unique/i);
      await expect(run(await attempt(exercise, other), {}, exercise, other)).resolves.toBeTruthy();
      await fail(first.id, "INTERRUPTED");
      await expect(run(mine)).resolves.toBeTruthy();
    });

    it("019/FR-005 a questão é de Código de um exercício, da mesma atividade; a tentativa é daquele aluno e daquela atividade", async () => {
      const mine = await attempt();
      await expect(run(mine, { questionId: exercise.questionIds[1]! })).rejects.toThrow(/not a CODE question of an exercise/);
      await expect(run(mine, { questionId: assignment.questionIds[0]! })).rejects.toThrow(/foreign key|Foreign key/i);
      await expect(run(await attempt(assignment), {}, assignment)).rejects.toThrow(/not a CODE question of an exercise/);
      await expect(run(mine, {}, exercise, other)).rejects.toThrow(/foreign key|Foreign key/i);
      const otherExercise = await createActivity(t, schoolClass, { type: "EXERCISE", questions: [{ type: "CODE" }] });
      await expect(run(mine, { activityId: otherExercise.activity.id, questionId: otherExercise.questionIds[0]! })).rejects.toThrow(
        /foreign key|Foreign key/i,
      );
    });

    it("019/FR-017 nasce QUEUED, sem reivindicação, resultado nem fim; perfil só das três chaves; prazo depois da criação", async () => {
      const mine = await attempt();
      const invalid: [Record<string, unknown>, RegExp][] = [
        [{ status: "RUNNING" }, /starts QUEUED/],
        [{ status: "COMPLETED", outcome: "EXECUTED", passedCount: 1, finishedAt: new Date() }, /starts QUEUED/],
        [{ claimedBy: "worker-1" }, /claim_chk/],
        [{ finishedAt: new Date() }, /finished_chk/],
        [{ execution: "c" }, /execution_chk/],
        [{ deadlineAt: new Date(Date.now() - MINUTE) }, /deadline_chk/],
        [{ publicCaseCount: 0 }, /counts_chk/],
        [{ publicCaseCount: 21 }, /counts_chk/],
        [{ sourceCode: "x".repeat(65_537) }, /size_chk/],
        [{ sourceCode: "ç".repeat(32_769) }, /size_chk/],
        [{ sourceCode: null }, /purge_chk/],
      ];
      for (const [fields, error] of invalid) {
        await expect(run(mine, fields), JSON.stringify(fields).slice(0, 80)).rejects.toThrow(error);
      }
      await expect(run(mine, { sourceCode: "" })).resolves.toBeTruthy();
    });

    it("019/FR-017 transições só as do diagrama; um final não volta", async () => {
      const mine = await attempt();
      const transitions: [CodeRunStatus[], boolean][] = [
        [["RUNNING"], true],
        [["FAILED"], true],
        [["RUNNING", "COMPLETED"], true],
        [["RUNNING", "FAILED"], true],
        [["COMPLETED"], false],
        [["RUNNING", "QUEUED"], false],
        [["FAILED", "RUNNING"], false],
        [["RUNNING", "FAILED", "COMPLETED"], false],
        [["RUNNING", "COMPLETED", "FAILED"], false],
      ];
      for (const [path, allowed] of transitions) {
        const row = await run(mine);
        let error: unknown = null;
        try {
          for (const status of path) {
            if (status === "RUNNING") await claim(row.id);
            else if (status === "FAILED") await fail(row.id, "SANDBOX_ERROR");
            else if (status === "COMPLETED")
              await t.prisma.codeRun.update({
                where: { id: row.id },
                data: { status: "COMPLETED", outcome: "COMPILATION_ERROR", compileOutput: "erro", passedCount: 0, finishedAt: new Date() },
              });
            else await t.prisma.codeRun.update({ where: { id: row.id }, data: { status } });
          }
        } catch (caught) {
          error = caught;
        }
        expect(error === null, `${path.join(" → ")}: ${String(error)}`).toBe(allowed);
        // Free the student's pending slot for the next path.
        const current = await t.prisma.codeRun.findUniqueOrThrow({ where: { id: row.id } });
        if (current.status === "QUEUED") await fail(row.id, "EXPIRED");
        if (current.status === "RUNNING") await fail(row.id, "INTERRUPTED");
      }
    });

    it("019/FR-017 os campos seguem o status: motivo sse FAILED, resultado e acertos sse COMPLETED, fim sse final", async () => {
      const mine = await attempt();
      const queued = await run(mine);
      await expect(t.prisma.codeRun.update({ where: { id: queued.id }, data: { status: "FAILED", finishedAt: new Date() } })).rejects.toThrow(/failure_chk/);
      await expect(t.prisma.codeRun.update({ where: { id: queued.id }, data: { status: "FAILED", failureReason: "EXPIRED" } })).rejects.toThrow(/finished_chk/);
      await expect(
        t.prisma.codeRun.update({ where: { id: queued.id }, data: { status: "FAILED", failureReason: "EXPIRED", finishedAt: new Date(), passedCount: 0 } }),
      ).rejects.toThrow(/outcome_chk/);
      await claim(queued.id);
      const completed = (data: Record<string, unknown>) =>
        t.prisma.codeRun.update({ where: { id: queued.id }, data: { status: "COMPLETED", finishedAt: new Date(), ...data } });
      await expect(completed({ outcome: "EXECUTED" })).rejects.toThrow(/outcome_chk/);
      await expect(completed({ passedCount: 1 })).rejects.toThrow(/outcome_chk/);
      await expect(completed({ outcome: "EXECUTED", passedCount: 3 })).rejects.toThrow(/counts_chk/);
      await expect(completed({ outcome: "EXECUTED", passedCount: 1, failureReason: "SANDBOX_ERROR" })).rejects.toThrow(/failure_chk/);
      await expect(completed({ outcome: "EXECUTED", passedCount: 0, compileOutput: "x" })).rejects.toThrow(/compile_output_chk/);
      await expect(completed({ outcome: "COMPILATION_ERROR", passedCount: 0, compileOutput: "x".repeat(16_385) })).rejects.toThrow(/size_chk/);
      await expect(completed({ outcome: "COMPILATION_ERROR", passedCount: 0, compileOutput: "Main.java:1: error" })).resolves.toBeTruthy();
    });

    it("019/FR-017 enquanto pendente, aluno, atividade, questão, tentativa, perfil, código, criação e prazo não mudam", async () => {
      const mine = await attempt();
      const queued = await run(mine);
      const changes: Record<string, unknown>[] = [
        { sourceCode: "outro" },
        { execution: "java" },
        { publicCaseCount: 1 },
        { createdAt: new Date(Date.now() - MINUTE) },
        { deadlineAt: new Date(Date.now() + 10 * MINUTE) },
      ];
      for (const data of changes) {
        await expect(t.prisma.codeRun.update({ where: { id: queued.id }, data }), Object.keys(data)[0]).rejects.toThrow(/immutable/);
      }
    });

    it("019/FR-019 uma execução final só aceita a purga do conteúdo; nunca é apagada", async () => {
      const mine = await attempt();
      const row = await run(mine);
      await claim(row.id);
      await complete(row.id);
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { passedCount: 2 } })).rejects.toThrow(/only accepts the content purge/);
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { sourceCode: "outro" } })).rejects.toThrow(/only accepts the content purge/);
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { sourceCode: null } })).rejects.toThrow(/purge_chk/);
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { contentPurgedAt: new Date() } })).rejects.toThrow(/purge_chk/);
      await expect(
        t.prisma.codeRun.update({ where: { id: row.id }, data: { sourceCode: null, contentPurgedAt: new Date(), passedCount: 0 } }),
      ).rejects.toThrow(/only accepts the content purge/);
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { sourceCode: null, contentPurgedAt: new Date() } })).resolves.toBeTruthy();
      await expect(t.prisma.codeRun.update({ where: { id: row.id }, data: { contentPurgedAt: new Date(Date.now() + MINUTE) } })).rejects.toThrow(
        /only accepts the content purge/,
      );
      await expect(t.prisma.codeRun.delete({ where: { id: row.id } })).rejects.toThrow(/cannot be deleted/);

      // A pending run is never purged: the content goes only once the run is final.
      const pending = await run(mine);
      await expect(t.prisma.codeRun.update({ where: { id: pending.id }, data: { sourceCode: null, contentPurgedAt: new Date() } })).rejects.toThrow(
        /purge_chk/,
      );
    });
  });

  describe("casos de uma execução", () => {
    it("019/FR-004 019/FR-007 só casos PUBLIC da questão da execução, na posição entre os públicos, um por caso público", async () => {
      const mine = await attempt();
      const row = await run(mine);
      await claim(row.id);
      await expect(complete(row.id)).resolves.toBeUndefined();
      const stored = await t.prisma.codeRunCase.findMany({ where: { runId: row.id }, orderBy: { position: "asc" } });
      expect(stored.map((testCase) => [testCase.position, testCase.testCaseId])).toEqual([
        [0, cases[0]!.id],
        [1, cases[2]!.id],
      ]);

      const writeOne = async (testCaseId: string, position: number, publicCaseCount = 1) => {
        const pending = await run(mine, { publicCaseCount });
        await claim(pending.id);
        return t.prisma.$transaction(async (tx) => {
          await tx.codeRun.update({
            where: { id: pending.id },
            data: { status: "COMPLETED", outcome: "EXECUTED", passedCount: 1, finishedAt: new Date() },
          });
          await tx.codeRunCase.create({ data: { runId: pending.id, testCaseId, position, verdict: "PASSED", stdout: "", stderr: "", durationMs: 1 } });
        }).finally(async () => {
          const current = await t.prisma.codeRun.findUniqueOrThrow({ where: { id: pending.id } });
          if (current.status === "RUNNING") await fail(pending.id, "INTERRUPTED");
        });
      };
      await expect(writeOne(cases[1]!.id, 0)).rejects.toThrow(/not a PUBLIC case of the run/);
      const otherCase = await t.prisma.classActivityTestCase.findFirstOrThrow({ where: { questionId: assignment.questionIds[0]! } });
      await expect(writeOne(otherCase.id, 0)).rejects.toThrow(/not a PUBLIC case of the run/);
      await expect(writeOne(cases[2]!.id, 0)).rejects.toThrow(/position/);
      // One case written for two public cases: refused at commit.
      await expect(writeOne(cases[0]!.id, 0, 2)).rejects.toThrow(/cases for/);
    });

    it("019/FR-007 casos só numa execução COMPLETED/EXECUTED; imutáveis exceto a purga da saída", async () => {
      const mine = await attempt();
      const queued = await run(mine);
      await expect(
        t.prisma.codeRunCase.create({ data: { runId: queued.id, testCaseId: cases[0]!.id, position: 0, verdict: "PASSED", stdout: "", stderr: "", durationMs: 1 } }),
      ).rejects.toThrow(/COMPLETED EXECUTED run/);
      await claim(queued.id);
      await complete(queued.id);
      const [first] = await t.prisma.codeRunCase.findMany({ where: { runId: queued.id }, orderBy: { position: "asc" } });
      for (const data of [{ verdict: "WRONG_OUTPUT" as const }, { durationMs: 5 }, { stdout: "outra" }, { position: 1 }]) {
        await expect(t.prisma.codeRunCase.update({ where: { id: first!.id }, data }), Object.keys(data)[0]).rejects.toThrow(/immutable/);
      }
      await expect(t.prisma.codeRunCase.update({ where: { id: first!.id }, data: { stdout: null, stderr: null } })).resolves.toBeTruthy();
      await expect(t.prisma.codeRunCase.delete({ where: { id: first!.id } })).rejects.toThrow(/immutable/);
      await expect(
        t.prisma.codeRunCase.create({ data: { runId: queued.id, testCaseId: cases[2]!.id, position: 1, verdict: "PASSED", stdout: "", stderr: "", durationMs: 1 } }),
      ).rejects.toThrow(/Unique constraint|unique|cases for/i);
    });

    it("019/FR-014 tamanhos: saída ≤ 64 KB, erro ≤ 16 KB, duração ≥ 0", async () => {
      const mine = await attempt();
      for (const [data, ok] of [
        [{ stdout: "x".repeat(65_537) }, false],
        [{ stderr: "x".repeat(16_385) }, false],
        [{ durationMs: -1 }, false],
        [{ stdout: "x".repeat(65_536), stderr: "y".repeat(16_384) }, true],
      ] as const) {
        const row = await run(mine, { publicCaseCount: 1 });
        await claim(row.id);
        const write = t.prisma.$transaction(async (tx) => {
          await tx.codeRun.update({ where: { id: row.id }, data: { status: "COMPLETED", outcome: "EXECUTED", passedCount: 0, finishedAt: new Date() } });
          await tx.codeRunCase.create({
            data: { runId: row.id, testCaseId: cases[0]!.id, position: 0, verdict: "OUTPUT_LIMIT", stdout: "", stderr: "", durationMs: 1, ...data },
          });
        });
        if (ok) await expect(write).resolves.toBeUndefined();
        else {
          await expect(write, JSON.stringify(Object.keys(data))).rejects.toThrow(/size_chk/);
          await fail(row.id, "INTERRUPTED");
        }
      }
    });
  });

  describe("batimentos dos workers (research B10)", () => {
    it("019/FR-016 um registro por worker, com perfis em lista e limites em objeto", async () => {
      const heartbeat = (workerId: string, fields: Record<string, unknown> = {}) =>
        t.prisma.codeRunnerHeartbeat.create({
          data: {
            workerId,
            startedAt: new Date(),
            lastSeenAt: new Date(),
            executions: [{ key: "python", version: "Python 3.13" }],
            limits: { timeMs: 2000, compileMs: 10_000, memoryMb: 256, outputBytes: 65_536 },
            ...fields,
          },
        });
      await heartbeat("host-1:42:1");
      await expect(heartbeat("host-1:42:1")).rejects.toThrow(/Unique constraint|unique/i);
      await expect(heartbeat("host-2:7:1", { executions: { key: "python" } })).rejects.toThrow(/heartbeats_json_chk/);
      await expect(heartbeat("host-3:7:1", { limits: [] })).rejects.toThrow(/heartbeats_json_chk/);
      await expect(heartbeat("host-4:7:1", { executions: [] })).resolves.toBeTruthy();
    });
  });
});
