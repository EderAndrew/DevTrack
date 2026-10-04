import type { Answer, ClassRanking, StudentActivity, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, completeAttempt, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 013/US5 — the teacher sees the full ranking of each of their classes (013/FR-022): the same rows
 * the students see, with no row marked as the viewer's; another teacher's class, or one that doesn't
 * exist, answers the same 404 (ClassContextPolicy).
 */

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;

/** The students and the questions each answers right (positions 0=15, 1=30, 2=60). */
const CAST = [
  { name: "Ana Lima", correct: [0, 1, 2] }, // 105
  { name: "Carla Dias", correct: [2] }, // 60
  { name: "Bruno Alves", correct: [2] }, // 60
  { name: "Davi Rocha", correct: [0, 1] }, // 45
  { name: "Elisa Melo", correct: [1] }, // 30
  { name: "Fábio Nunes", correct: [] }, // 0, concluded in blank
  { name: "Gabi Souza", correct: null }, // 0, never started
] as const;

describe("013/US5 professor vê o ranking da turma", () => {
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let clients: Client[];

  const teacherRanking = (client: Client, id = classId) => client.get(`/api/classes/${id}/ranking`);

  const answersFor = (view: StudentActivity, correct: readonly number[]) =>
    view.questions
      .filter((q) => correct.includes(q.position))
      .map((q) => ({
        questionId: q.id,
        answer: (q.type === "MULTIPLE_CHOICE" ? { kind: "ALTERNATIVE", alternativeId: q.alternatives[0]!.id } : { kind: "TEXT", text: "Resposta" }) as Answer,
        baseRevision: 0,
      }));

  beforeAll(async () => {
    t = await createTestApp({ clock: new FixedClock(START) });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    classId = (await createClass(t, teacher.id, { name: "POO 2026" })).id;
    clients = [];
    for (const member of CAST) {
      const student = await createUser(t, { roles: ["STUDENT"], name: member.name });
      await createEnrollment(t, classId, student.id);
      clients.push(api(t, { cookie: await loginAs(t, student) }));
    }
    const exerciseIds = [
      (await createExercise(t, teacher.id, { difficulty: "BASIC" })).id,
      (await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE" })).id,
      (await createExercise(t, teacher.id, { difficulty: "ADVANCED" })).id,
    ];
    const applied = await applyExercises(teacherClient, classId, exerciseIds, { acknowledgeOutOfScope: true });
    expect(applied.status, JSON.stringify(applied.body)).toBe(201);
    const activity = applied.body as TeacherActivity;
    for (const [index, member] of CAST.entries()) {
      if (member.correct === null) continue;
      const started = await startAttempt(clients[index]!, activity.id);
      expect(started.status, JSON.stringify(started.body)).toBe(200);
      const done = await completeAttempt(clients[index]!, activity.id, 1, answersFor(started.body as StudentActivity, member.correct));
      expect(done.status, JSON.stringify(done.body)).toBe(200);
    }
  });

  it("013/US5-1 013/FR-022 o professor vê todas as posições da turma, iguais às que os alunos veem", async () => {
    const res = await teacherRanking(teacherClient);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const body = res.body as ClassRanking;
    expect(body.class).toEqual({ id: classId, name: "POO 2026" });
    expect(body.rows).toEqual([
      { position: 1, name: "Ana Lima", points: 105, isViewer: false },
      { position: 2, name: "Bruno Alves", points: 60, isViewer: false },
      { position: 2, name: "Carla Dias", points: 60, isViewer: false },
      { position: 4, name: "Davi Rocha", points: 45, isViewer: false },
      { position: 5, name: "Elisa Melo", points: 30, isViewer: false },
      { position: 6, name: "Fábio Nunes", points: 0, isViewer: false },
      { position: 6, name: "Gabi Souza", points: 0, isViewer: false },
    ]);

    // The student's view differs only in the viewer's own mark.
    const student = (await clients[3]!.get(`/api/me/classes/${classId}/ranking`)).body as ClassRanking;
    expect(student.rows.map((row) => ({ ...row, isViewer: false }))).toEqual(body.rows);
    for (const row of body.rows) expect(Object.keys(row).sort()).toEqual(["isViewer", "name", "points", "position"]);
  });

  it("013/US5-2 turma de outro professor ou inexistente: 404 igual", async () => {
    const other = await createUser(t, { roles: ["TEACHER"] });
    const otherClient = api(t, { cookie: await loginAs(t, other) });
    const res = await teacherRanking(otherClient);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    expect((await teacherRanking(teacherClient, "00000000-0000-4000-8000-000000000000")).body).toEqual(res.body);
  });

  it("013/FR-022 o aluno não usa a rota do professor (403) e a turma INACTIVE ou ARCHIVED continua consultável", async () => {
    expect((await teacherRanking(clients[0]!)).status).toBe(403);
    for (const status of ["INACTIVE", "ARCHIVED"] as const) {
      await t.prisma.schoolClass.update({ where: { id: classId }, data: { status } });
      const res = await teacherRanking(teacherClient);
      expect(res.status).toBe(200);
      expect((res.body as ClassRanking).rows[0]).toEqual({ position: 1, name: "Ana Lima", points: 105, isViewer: false });
    }
  });
});
