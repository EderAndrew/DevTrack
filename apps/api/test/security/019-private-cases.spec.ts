import type { StudentActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, completeAttempt, createClassWithStudents, getExerciseAttempt, retryAttempt, startAttempt } from "../helpers/activities";
import { languageId } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createConfirmedSyllabus } from "../helpers/works";

type Client = ReturnType<typeof api>;

/** The private cases' input and expected output carry it; no student response may. */
const PRIVATE_MARKER = "MARCADOR-PRIVADO-019";
/** Anything that tells a student a private case exists, or how many there are. */
const PRIVATE_SIGNS = /"visibility"|PRIVATE|privateCase|testCaseCount|publicTestCaseCount|"testCases"/;

/**
 * 019/FR-004 019/SC-002 (research B16, B17): a CODE exercise of the bank with 2 PUBLIC and 2 PRIVATE
 * cases, applied through the teacher's routes. Every student response — dashboard, lists, the
 * activity, the attempt before and after the conclusion, a retry — carries the PUBLIC cases only,
 * with no key, value or count of the private ones. The bank's cases are the owner's alone.
 */
describe("019/FR-004 019/SC-002 casos privados nunca chegam ao aluno", () => {
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let student: Client;
  let classmate: Client;
  let classId: string;
  let exerciseId: string;
  let activityId: string;
  let questionId: string;

  const reads = async (who: Client) => [
    await who.get("/api/me/dashboard"),
    await who.get("/api/me/activities"),
    await who.get("/api/me/activities?status=COMPLETED"),
    await who.get(`/api/me/activities/${activityId}`),
    await who.get(`/api/me/classes/${classId}/ranking`),
  ];

  const scan = (situation: string, responses: { status: number; body: unknown }[]) => {
    for (const res of responses) {
      expect(res.status, situation).toBeLessThan(300);
      const body = JSON.stringify(res.body);
      expect(body, situation).not.toContain(PRIVATE_MARKER);
      expect(body, situation).not.toMatch(PRIVATE_SIGNS);
    }
  };

  /** The CODE question of the activity as the student sees it: exactly the 2 PUBLIC cases, in order. */
  const expectPublicOnly = (situation: string, view: StudentActivity) => {
    const question = view.questions.find((item) => item.id === questionId);
    expect(question?.publicTestCases, situation).toEqual([
      { input: "1\n", expectedOutput: "2\n" },
      { input: "3\n", expectedOutput: "6\n" },
    ]);
  };

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    const syllabus = await createConfirmedSyllabus(t, teacher.id);
    const created = await createClassWithStudents(t, teacher.id, { subjectId: syllabus.subject.id, students: 2 });
    classId = created.schoolClass.id;
    student = api(t, { cookie: await loginAs(t, created.students[0]!) });
    classmate = api(t, { cookie: await loginAs(t, created.students[1]!) });

    const exercise = await teacherClient.post("/api/exercises", {
      type: "CODE",
      statement: "Leia um inteiro e imprima o dobro.",
      explanation: "Dobra.",
      difficulty: "BASIC",
      cognitiveObjective: "APPLY",
      instructions: "Use a entrada padrão.",
      expectedSolution: "print(int(input()) * 2)",
      languageId: await languageId(t, "python"),
      status: "APPROVED",
      testCases: [
        { input: "1\n", expectedOutput: "2\n", visibility: "PUBLIC" },
        { input: `${PRIVATE_MARKER} entrada`, expectedOutput: `${PRIVATE_MARKER} saída`, visibility: "PRIVATE" },
        { input: "3\n", expectedOutput: "6\n", visibility: "PUBLIC" },
        { input: `${PRIVATE_MARKER} 2`, expectedOutput: `${PRIVATE_MARKER} 4`, visibility: "PRIVATE" },
      ],
    });
    expect(exercise.status).toBe(201);
    exerciseId = exercise.body.id;
    const applied = await applyExercises(teacherClient, classId, [exerciseId], { acknowledgeOutOfScope: true });
    expect(applied.status).toBe(201);
    activityId = applied.body.id;
    questionId = (await t.prisma.classActivityQuestion.findFirstOrThrow({ where: { activityId }, select: { id: true } })).id;
  });

  it("019/FR-004 019/SC-002 antes de iniciar e com a tentativa em andamento: só os públicos, sem sinal dos privados", async () => {
    scan("pendente", await reads(student));
    expectPublicOnly("pendente", (await student.get(`/api/me/activities/${activityId}`)).body);

    const started = await startAttempt(student, activityId);
    expect(started.status).toBeLessThan(300);
    scan("em andamento", [started, ...(await reads(student))]);
    expectPublicOnly("em andamento", started.body);
  });

  it("019/FR-004 019/SC-002 depois de concluir, na tentativa concluída e ao refazer: o gabarito (013) sem nenhum caso privado", async () => {
    await startAttempt(student, activityId);
    const done = await completeAttempt(student, activityId, 1, [
      { questionId, answer: { kind: "CODE", source: "print(int(input()) * 2)" }, baseRevision: 0 },
    ]);
    expect(done.status).toBeLessThan(300);
    const concluded = await getExerciseAttempt(student, activityId, 1);
    // The concluded attempt shows the expected solution (013 K10), never a private case.
    expect(JSON.stringify(concluded.body)).toContain("print(int(input()) * 2)");
    scan("concluída", [done, concluded, ...(await reads(student))]);
    expectPublicOnly("concluída", (await student.get(`/api/me/activities/${activityId}`)).body);

    const retried = await retryAttempt(student, activityId, 1);
    scan("refazendo", [retried, ...(await reads(student))]);

    // A classmate who hasn't concluded sees the public cases only, too.
    scan("colega", await reads(classmate));
  });

  it("019/FR-003 os casos do banco são só do dono: outro professor recebe 404 e nada muda", async () => {
    const other = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    const read = await other.get(`/api/exercises/${exerciseId}`);
    expect(read.status).toBe(404);
    expect(JSON.stringify(read.body)).not.toContain(PRIVATE_MARKER);
    const list = await other.get("/api/exercises");
    expect(JSON.stringify(list.body)).not.toContain(PRIVATE_MARKER);
    const write = await other.put(`/api/exercises/${exerciseId}`, {
      type: "CODE",
      statement: "x",
      explanation: "x",
      difficulty: "BASIC",
      cognitiveObjective: "APPLY",
      instructions: "x",
      expectedSolution: "x",
      languageId: await languageId(t, "python"),
      testCases: [],
      version: 1,
    });
    expect(write.status).toBe(404);
    expect(await t.prisma.exerciseTestCase.count({ where: { exerciseId } })).toBe(4);
    // A student has no access to the bank at all.
    expect((await student.get(`/api/exercises/${exerciseId}`)).status).toBe(403);
  });
});
