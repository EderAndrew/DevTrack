import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EXERCISE_RECORD_SELECT, toExerciseRecord } from "../../src/modules/exercises/exercise-query";
import { toStudentView } from "../../src/modules/exercises/views/student-view";
import { createActivity, createAttemptRow, createClassWithStudents } from "../helpers/activities";
import { createExercise, languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork } from "../helpers/works";

/**
 * 014/FR-002, 014/FR-003 (research L3, L8): each catalog language carries the grammar key of its
 * code colors as data (`programming_languages.highlight`), and every language object a screen
 * receives — catalog lists, exercise, work and activity views of the teacher and of the student —
 * carries it. The key is presentation data: no client may send it.
 */

/** data-model.md: frameworks take the grammar of the language they're written in. */
const SEED: Record<string, string> = {
  angular: "typescript",
  c: "cpp",
  cpp: "cpp",
  go: "go",
  "html-css": "html",
  java: "java",
  javascript: "javascript",
  nest: "typescript",
  node: "javascript",
  php: "php",
  python: "python",
  rust: "rust",
  typescript: "typescript",
};

describe("014/FR-002 014/FR-003 a gramática de cada linguagem é dado do catálogo e chega a toda visão", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
  });

  /** Runs `body` with the `go` entry's grammar set to NULL, then puts it back (the catalog survives `resetDb`). */
  async function withoutGrammar(key: string, body: () => Promise<void>) {
    await t.prisma.programmingLanguage.update({ where: { key }, data: { highlight: null } });
    try {
      await body();
    } finally {
      await t.prisma.programmingLanguage.update({ where: { key }, data: { highlight: SEED[key] } });
    }
  }

  it("014/FR-002 depois da migração as 13 linguagens têm a gramática de data-model.md", async () => {
    const rows = await t.prisma.programmingLanguage.findMany({ select: { key: true, highlight: true } });
    expect(Object.fromEntries(rows.map((row) => [row.key, row.highlight]))).toEqual(SEED);
  });

  it("014/FR-002 o CHECK recusa uma chave com maiúscula ou espaço", async () => {
    for (const bad of ["Java", "java script", "1java", ""]) {
      await expect(
        t.prisma.$executeRaw`UPDATE programming_languages SET highlight = ${bad} WHERE key = 'java'`,
      ).rejects.toThrow();
    }
    expect((await t.prisma.programmingLanguage.findUniqueOrThrow({ where: { key: "java" } })).highlight).toBe("java");
  });

  it("014/FR-003 GET /programming-languages e GET /works/programming-languages trazem highlight", async () => {
    for (const path of ["/api/programming-languages", "/api/works/programming-languages"]) {
      const res = await client.get(path);
      expect(res.status).toBe(200);
      for (const item of res.body as { key: string; highlight: string | null }[]) {
        expect(item.highlight).toBe(SEED[item.key]);
      }
    }
  });

  it("014/FR-003 exercício de Código: visão do professor e do aluno trazem language.highlight", async () => {
    const exercise = await createExercise(t, teacher.id, { type: "CODE", languageId: await languageId(t, "python") });

    const res = await client.get(`/api/exercises/${exercise.id}`);
    expect(res.status).toBe(200);
    expect(res.body.language).toEqual({ id: exercise.languageId, name: "Python", highlight: "python" });

    const record = toExerciseRecord(
      await t.prisma.exercise.findUniqueOrThrow({ where: { id: exercise.id }, select: EXERCISE_RECORD_SELECT }),
    );
    expect(toStudentView(record).language).toEqual({ name: "Python", highlight: "python" });
  });

  it("014/FR-003 questão de Código de trabalho: professor e \"Ver como aluno\" trazem language.highlight", async () => {
    const work = await createWork(t, teacher.id, {
      questions: [{ type: "CODE", languageId: await languageId(t, "node") }],
    });

    const teacherView = await client.get(`/api/works/${work.id}`);
    expect(teacherView.status).toBe(200);
    expect(teacherView.body.questions[0].language).toMatchObject({ name: "Node", highlight: "javascript" });

    const preview = await client.get(`/api/works/${work.id}/student-preview`);
    expect(preview.status).toBe(200);
    expect(preview.body.questions[0].language).toEqual({ name: "Node", highlight: "javascript" });
  });

  it("014/FR-003 questão de Código de atividade: detalhe do professor, tentativa e visão do aluno", async () => {
    const { schoolClass, students } = await createClassWithStudents(t, teacher.id);
    const { activity } = await createActivity(t, schoolClass, { questions: [{ type: "CODE" }] });
    const { attemptId } = await createAttemptRow(t, activity.id, students[0]!.id);

    const detail = await client.get(`/api/classes/${schoolClass.id}/activities/${activity.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.questions[0].language).toMatchObject({ name: "Java", highlight: "java" });

    // The teacher's attempt carries answers and results only; its screen reads each question's
    // language from the activity detail above.
    const attempt = await client.get(`/api/classes/${schoolClass.id}/activities/${activity.id}/attempts/${attemptId}`);
    expect(attempt.status).toBe(200);
    expect(attempt.body).not.toHaveProperty("questions");

    const student = api(t, { cookie: await loginAs(t, students[0]!) });
    const mine = await student.get(`/api/me/activities/${activity.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.questions[0].language).toEqual({ name: "Java", highlight: "java" });
  });

  it("014/FR-002 uma linguagem com highlight NULL aparece com null", async () => {
    await withoutGrammar("go", async () => {
      const exercise = await createExercise(t, teacher.id, { type: "CODE", languageId: await languageId(t, "go") });
      expect((await client.get(`/api/exercises/${exercise.id}`)).body.language).toMatchObject({ name: "Go", highlight: null });
      const list = (await client.get("/api/programming-languages")).body as { key: string; highlight: string | null }[];
      expect(list.find((item) => item.key === "go")).toMatchObject({ highlight: null });
    });
  });

  it("014/FR-003 highlight no corpo de criação de exercício → 400", async () => {
    const body = {
      type: "CODE",
      statement: "Implemente a classe Cachorro.",
      explanation: "Porque sim.",
      difficulty: "BASIC",
      cognitiveObjective: "UNDERSTAND",
      instructions: "Cachorro estende Animal.",
      expectedSolution: "class Cachorro extends Animal {}",
      languageId: await languageId(t, "java"),
      status: "DRAFT",
    };
    const refused = await client.post("/api/exercises", { ...body, highlight: "java" });
    expect(refused.status).toBe(400);
    const refusedSet = await client.post("/api/exercises/sets", {
      status: "DRAFT",
      exercises: [1, 2, 3].map(() => ({ ...body, status: undefined, highlight: "java", statement: randomUUID() })),
    });
    expect(refusedSet.status).toBe(400);
    expect(await t.prisma.exercise.count()).toBe(0);

    const accepted = await client.post("/api/exercises", body);
    expect(accepted.status).toBe(201);
    expect(accepted.body.language.highlight).toBe("java");
  });
});
