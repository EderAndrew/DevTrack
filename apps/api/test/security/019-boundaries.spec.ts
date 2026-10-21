import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CODE_RUN_MAX_SOURCE_BYTES, endpoints, type StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeCase, FakeSandbox } from "../../src/code-runner/sandbox/fake-sandbox";
import type { CodeRunWorker } from "../../src/code-runner/worker";
import { createClassWithStudents, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { API_ROOT } from "../helpers/env";
import { codeRunsPath, createCodeExercise, createRunWorker, getLatestRun, requestRun, seedHeartbeat } from "../helpers/code-runs";
import { languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

type Client = ReturnType<typeof api>;

const VALIDATION = { statusCode: 400, code: "VALIDATION_ERROR" };
/** HTML in every text the student's program and the Code Runner produce. */
const HTML = `<script>alert("019")</script><img src=x onerror="alert(1)"><b>negrito</b> &amp; &lt;`;

/**
 * 019 contracts/http-api.md: the run's body takes only `sourceCode`, up to 65 536 bytes of UTF-8
 * (multibyte counted in bytes) → `413 SOURCE_TOO_LARGE`; an exercise has 0–20 test cases with input and
 * expected output of up to 10 000 characters (more → 400) on create, edit and sets. 019/FR-021: what the
 * program printed, its stderr and the compiler message reach the student as JSON strings, never as HTML.
 * No route beyond the contract.
 */
describe("019 fronteiras do Code Runner", () => {
  let t: TestApp;
  let clock: FixedClock;

  beforeAll(async () => {
    clock = new FixedClock(new Date());
    t = await createTestApp({ clock });
  });
  afterAll(() => t.close());

  describe("a execução", () => {
    let student: TestUser;
    let client: Client;
    let activityId: string;
    let questionId: string;
    let sandbox: FakeSandbox;
    let worker: CodeRunWorker;

    const runs = () => t.prisma.codeRun.count({ where: { studentUserId: student.id } });
    /** A new run with `sourceCode`, then the worker finishes it so the next one is new too. */
    const accepted = async (sourceCode: string) => {
      const res = await requestRun(client, activityId, questionId, sourceCode);
      expect(res.status, JSON.stringify(res.body).slice(0, 200)).toBe(202);
      expect(await worker.runOnce()).toBe(1);
      return (await t.prisma.codeRun.findUniqueOrThrow({ where: { id: res.body.id } })).sourceCode;
    };
    const tooLarge = async (sourceCode: string) => {
      const before = await runs();
      const res = await requestRun(client, activityId, questionId, sourceCode);
      expect(res.status).toBe(413);
      expect(res.body).toEqual({ statusCode: 413, code: "SOURCE_TOO_LARGE", message: expect.any(String) });
      expect(await runs()).toBe(before);
    };

    beforeEach(async () => {
      await resetDb(t.prisma);
      clock.set(new Date());
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      const created = await createClassWithStudents(t, teacher.id, { students: 1 });
      student = created.students[0]!;
      client = api(t, { cookie: await loginAs(t, student) });
      const activity = await createCodeExercise(t, created.schoolClass);
      activityId = activity.activity.id;
      questionId = activity.questionIds[0]!;
      await seedHeartbeat(t, clock.now());
      expect((await startAttempt(client, activityId)).status).toBe(200);
      sandbox = new FakeSandbox();
      ({ worker } = createRunWorker(t, clock, { sandbox }) as { worker: CodeRunWorker });
    });

    it("019/FR-006 código com 65 536 bytes é aceito; 65 537 → 413 SOURCE_TOO_LARGE, sem execução criada", async () => {
      expect(CODE_RUN_MAX_SOURCE_BYTES).toBe(65_536);
      const ascii = "a".repeat(65_536);
      expect(await accepted(ascii)).toBe(ascii);
      await tooLarge("a".repeat(65_537));
      expect(await accepted("")).toBe("");
    });

    it("019/FR-006 caracteres multibyte contam em bytes de UTF-8 (2, 3 e 4 bytes)", async () => {
      // "é" = 2 bytes, "€" = 3 bytes, "😀" = 4 bytes (two UTF-16 units).
      const two = "é".repeat(32_768);
      expect(await accepted(two)).toBe(two);
      await tooLarge(`${two}a`);
      const three = `${"€".repeat(21_845)}a`;
      expect(await accepted(three)).toBe(three);
      await tooLarge(`${three}a`);
      const four = "😀".repeat(16_384);
      expect(await accepted(four)).toBe(four);
      await tooLarge(`${four}a`);
      // Within the limit in UTF-16 units, over it in bytes.
      expect("é".repeat(32_769).length).toBeLessThan(65_536);
      await tooLarge("é".repeat(32_769));
    });

    it("019/FR-005 o corpo é estrito: só sourceCode; o servidor decide atividade, questão, tentativa, linguagem e casos", async () => {
      const path = codeRunsPath(activityId, questionId);
      const bodies: object[] = [
        {},
        { sourceCode: 42 },
        { sourceCode: null },
        { sourceCode: "print(1)", execution: "java" },
        { sourceCode: "print(1)", languageId: "x" },
        { sourceCode: "print(1)", activityId },
        { sourceCode: "print(1)", questionId },
        { sourceCode: "print(1)", attemptId: activityId },
        { sourceCode: "print(1)", status: "COMPLETED" },
        { sourceCode: "print(1)", testCases: [{ input: "1", expectedOutput: "2" }] },
        { sourceCode: "print(1)", stdin: "1" },
        { sourceCode: "print(1)", limits: { timeMs: 60_000 } },
      ];
      for (const body of bodies) {
        const res = await client.post(path, body);
        expect(res.status, JSON.stringify(body)).toBe(400);
        expect(res.body, JSON.stringify(body)).toMatchObject(VALIDATION);
      }
      expect(await runs()).toBe(0);
    });

    it("019/FR-021 saída, stderr e mensagem do compilador com HTML voltam como texto em JSON, iguais ao que o programa escreveu", async () => {
      sandbox.scriptCases(fakeCase({ stdout: HTML, stderr: HTML, exitCode: 1 }));
      const executed = await requestRun(client, activityId, questionId, HTML);
      expect(executed.status).toBe(202);
      expect(executed.headers["content-type"]).toMatch(/^application\/json/);
      expect(await worker.runOnce()).toBe(1);
      const latest = await getLatestRun(client, activityId, questionId);
      expect(latest.headers["content-type"]).toMatch(/^application\/json/);
      expect(latest.body.run.sourceCode).toBe(HTML);
      for (const c of latest.body.run.cases) expect([c.stdout, c.stderr]).toEqual([HTML, HTML]);

      sandbox.failCompilation(HTML);
      clock.advance(1000); // the latest run is the newest by the server clock
      expect((await requestRun(client, activityId, questionId, "print(")).status).toBe(202);
      expect(await worker.runOnce()).toBe(1);
      const compiled = await getLatestRun(client, activityId, questionId);
      expect(compiled.headers["content-type"]).toMatch(/^application\/json/);
      expect(compiled.body.run).toMatchObject({ outcome: "COMPILATION_ERROR", compileOutput: HTML });
      // Nothing escaped or stripped on the way: the text is the program's, byte for byte.
      expect(JSON.stringify(compiled.body)).not.toContain("&lt;script");
    });
  });

  describe("os casos de teste do exercício", () => {
    let client: Client;
    let teacherId: string;
    let python: string;

    const code = (testCases: object[]) => ({
      type: "CODE",
      statement: "Leia um inteiro e imprima o dobro.",
      explanation: "Dobra o número lido.",
      difficulty: "BASIC",
      cognitiveObjective: "APPLY",
      instructions: "Leia da entrada padrão e escreva na saída padrão.",
      expectedSolution: "print(int(input()) * 2)",
      languageId: python,
      testCases,
    });
    const caseOf = (input: string, expectedOutput: string, visibility = "PUBLIC") => ({ input, expectedOutput, visibility });
    const many = (count: number) => Array.from({ length: count }, (_, n) => caseOf(`${n}\n`, `${n * 2}\n`, n % 2 ? "PRIVATE" : "PUBLIC"));

    beforeEach(async () => {
      await resetDb(t.prisma);
      const teacher = await createUser(t, { roles: ["TEACHER"] });
      teacherId = teacher.id;
      client = api(t, { cookie: await loginAs(t, teacher) });
      python = await languageId(t, "python");
    });

    it("019/FR-001 20 casos são aceitos e 21 recusados (400) no cadastro, na edição e no conjunto", async () => {
      const created = await client.post("/api/exercises", { ...code(many(20)), status: "DRAFT" });
      expect(created.status).toBe(201);
      expect(created.body.testCases).toHaveLength(20);
      const before = await t.prisma.exerciseTestCase.count();

      expect((await client.post("/api/exercises", { ...code(many(21)), status: "DRAFT" })).status).toBe(400);
      const edit = await client.put(`/api/exercises/${created.body.id}`, { ...code(many(21)), version: created.body.version });
      expect(edit.status).toBe(400);
      const sets = await client.post("/api/exercises/sets", { exercises: [code(many(1)), code(many(21))], status: "DRAFT" });
      expect(sets.status).toBe(400);
      expect(await t.prisma.exerciseTestCase.count()).toBe(before);
      expect(await t.prisma.exercise.count()).toBe(1);
    });

    it("019/FR-001 entrada e saída esperada com 10 000 caracteres são aceitas; 10 001 → 400", async () => {
      const limit = caseOf("1".repeat(10_000), "2".repeat(10_000));
      const created = await client.post("/api/exercises", { ...code([limit]), status: "DRAFT" });
      expect(created.status).toBe(201);
      expect(created.body.testCases[0]).toMatchObject({ input: limit.input, expectedOutput: limit.expectedOutput });
      // Multibyte: characters, not bytes, as the 011 work bank.
      expect((await client.post("/api/exercises", { ...code([caseOf("é".repeat(10_000), "ü".repeat(10_000))]), status: "DRAFT" })).status).toBe(201);

      for (const over of [caseOf("1".repeat(10_001), "2"), caseOf("1", "2".repeat(10_001))]) {
        expect((await client.post("/api/exercises", { ...code([over]), status: "DRAFT" })).status).toBe(400);
        expect((await client.put(`/api/exercises/${created.body.id}`, { ...code([over]), version: created.body.version })).status).toBe(400);
      }
      expect(await t.prisma.exercise.count()).toBe(2);
    });

    it("019/FR-001 o caso não aceita campos do servidor (posição, id, questão)", async () => {
      for (const extra of [{ position: 0 }, { id: python }, { questionId: python }, { exerciseId: python }]) {
        const res = await client.post("/api/exercises", { ...code([{ ...caseOf("1\n", "2\n"), ...extra }]), status: "DRAFT" });
        expect(res.status, JSON.stringify(extra)).toBe(400);
      }
      expect(await t.prisma.exercise.count()).toBe(0);
    });

    it("019/FR-021 a API guarda e devolve o HTML dos casos como texto, sem interpretar nem escapar", async () => {
      const created = await client.post("/api/exercises", { ...code([caseOf(HTML, HTML)]), status: "APPROVED" });
      expect(created.status).toBe(201);
      expect(created.headers["content-type"]).toMatch(/^application\/json/);
      expect(created.body.testCases[0]).toMatchObject({ input: HTML, expectedOutput: HTML });

      // And the student sees the public case exactly as typed.
      const { schoolClass, students } = await createClassWithStudents(t, teacherId, { students: 1 });
      const activity = await createCodeExercise(t, schoolClass, { testCases: [{ input: HTML, expectedOutput: HTML, visibility: "PUBLIC" }] });
      const student = api(t, { cookie: await loginAs(t, students[0]!) });
      const res = await student.get(`/api/me/activities/${activity.activity.id}`);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^application\/json/);
      const question = (res.body as StudentActivity).questions[0]!;
      expect(JSON.stringify(question)).toContain(JSON.stringify(HTML).slice(1, -1));
    });
  });

  it("019 nenhuma rota fora do catálogo de contracts/http-api.md", () => {
    const contract = readFileSync(resolve(API_ROOT, "../../specs/019-exercise-code-runner/contracts/http-api.md"), "utf8");
    const documented = [...contract.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE) ([^`]+)` \|/gm)].map(([, method, path]) => `${method} ${path}`).sort();
    expect(documented).toHaveLength(3);
    const catalogued = Object.values(endpoints)
      .filter((entry) => /code-runs?/.test(entry.path) || /code-runner/.test(entry.path))
      .map((entry) => `${entry.method} ${entry.path}`)
      .sort();
    expect(catalogued).toEqual(documented);
  });
});
