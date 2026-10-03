import type { Answer, ClassRanking, RankingRow, StudentActivity, StudentDashboard, TeacherActivity } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyExercises, completeAttempt, retryAttempt, startAttempt } from "../helpers/activities";
import { FixedClock } from "../helpers/clock";
import { createExercise } from "../helpers/exercises";
import { createClass, createEnrollment, createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 013/US4 — the student sees the ranking of each class (013/FR-018–FR-021, FR-023, research K11–K13):
 * every ACTIVE enrollment, points desc, ties share the position (1, 2, 2, 4) in alphabetical order,
 * students without points with 0; the dashboard shows the first five of each ACTIVE class and the
 * ranking page every row, the viewer's own row marked. Points are the sum of the scoring results of
 * the class's non-cancelled EXERCISE activities, derived on every read; a row carries only position,
 * name, points and `isViewer`.
 */

const START = "2026-10-01T12:00:00.000Z";
type Client = ReturnType<typeof api>;
type Item = { questionId: string; answer: Answer; baseRevision: number };

/** The seven students of the class and the questions each answers right (positions 0=15, 1=30, 2=60). */
const CAST = [
  { name: "Ana Lima", correct: [0, 1, 2] }, // 105
  { name: "Carla Dias", correct: [2] }, // 60
  { name: "Bruno Alves", correct: [2] }, // 60
  { name: "Davi Rocha", correct: [0, 1] }, // 45
  { name: "Elisa Melo", correct: [1] }, // 30
  { name: "Fábio Nunes", correct: [] }, // 0, concluded in blank
  { name: "Gabi Souza", correct: null }, // 0, never started
] as const;

describe("013/US4 aluno vê o ranking da turma", () => {
  let t: TestApp;
  let teacher: TestUser;
  let teacherClient: Client;
  let classId: string;
  let students: TestUser[];
  let clients: Client[];
  /** Multiple choice: Básico (15), Intermediário (30), Avançado (60), in this order. */
  let exerciseIds: string[];

  const ranking = (client: Client, id = classId) => client.get(`/api/me/classes/${id}/ranking`);
  const dashboard = async (client: Client) => (await client.get("/api/me/dashboard")).body as StudentDashboard;
  const rows = async (client: Client, id = classId) => {
    const res = await ranking(client, id);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return (res.body as ClassRanking).rows;
  };
  const table = (list: RankingRow[]) => list.map((row) => [row.position, row.name, row.points]);

  const apply = async (ids: string[], id = classId): Promise<TeacherActivity> => {
    const res = await applyExercises(teacherClient, id, ids, { acknowledgeOutOfScope: true });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return res.body as TeacherActivity;
  };

  /** The correct alternative (or a text) for the `correct` positions; the others in blank. */
  const answersFor = (view: StudentActivity, correct: readonly number[]): Item[] =>
    view.questions
      .filter((q) => correct.includes(q.position))
      .map((q): Item => ({
        questionId: q.id,
        answer: q.type === "MULTIPLE_CHOICE" ? { kind: "ALTERNATIVE", alternativeId: q.alternatives[0]!.id } : { kind: "TEXT", text: "Resposta" },
        baseRevision: 0,
      }));

  /** Starts and concludes attempt `number` of the client; answers the attempt's row id. */
  const conclude = async (client: Client, activityId: string, correct: readonly number[], number = 1) => {
    const started = number === 1 ? await startAttempt(client, activityId) : await retryAttempt(client, activityId, number - 1);
    expect(started.status, JSON.stringify(started.body)).toBe(200);
    const res = await completeAttempt(client, activityId, number, answersFor(started.body as StudentActivity, correct));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  };

  const enroll = async (name: string, id = classId) => {
    const student = await createUser(t, { roles: ["STUDENT"], name });
    await createEnrollment(t, id, student.id);
    return { student, client: api(t, { cookie: await loginAs(t, student) }) };
  };

  /** Applies the three exercises and has each member of `CAST` play its part. */
  const playCast = async () => {
    const activity = await apply(exerciseIds);
    for (const [index, member] of CAST.entries()) {
      if (member.correct !== null) await conclude(clients[index]!, activity.id, member.correct);
    }
    return activity;
  };

  beforeAll(async () => {
    t = await createTestApp({ clock: new FixedClock(START) });
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    teacherClient = api(t, { cookie: await loginAs(t, teacher) });
    classId = (await createClass(t, teacher.id, { name: "POO 2026" })).id;
    students = [];
    clients = [];
    for (const member of CAST) {
      const { student, client } = await enroll(member.name);
      students.push(student);
      clients.push(client);
    }
    exerciseIds = [
      (await createExercise(t, teacher.id, { difficulty: "BASIC" })).id,
      (await createExercise(t, teacher.id, { difficulty: "INTERMEDIATE" })).id,
      (await createExercise(t, teacher.id, { difficulty: "ADVANCED" })).id,
    ];
  });

  it("013/US4-1 013/FR-021 o painel mostra do 1º ao 5º lugar, com nome e pontos, do maior para o menor", async () => {
    await playCast();
    const board = await dashboard(clients[6]!);
    expect(board.rankings).toHaveLength(1);
    expect(board.rankings[0]!.class).toEqual({ id: classId, name: "POO 2026" });
    expect(table(board.rankings[0]!.top)).toEqual([
      [1, "Ana Lima", 105],
      [2, "Bruno Alves", 60],
      [2, "Carla Dias", 60],
      [4, "Davi Rocha", 45],
      [5, "Elisa Melo", 30],
    ]);
    expect(board.rankings[0]!.top.every((row) => !row.isViewer)).toBe(true);
  });

  it("013/US4-2 013/FR-019 empate divide a posição, a seguinte pula e, dentro do empate, a ordem é alfabética", async () => {
    await playCast();
    const list = await rows(clients[0]!);
    expect(list.slice(1, 4).map((row) => [row.position, row.name])).toEqual([
      [2, "Bruno Alves"],
      [2, "Carla Dias"],
      [4, "Davi Rocha"],
    ]);
  });

  it("013/US4-3 aluno sem pontos aparece com 0, na posição dividida por quem tem 0 (inclusive quem nunca começou)", async () => {
    await playCast();
    expect(table((await rows(clients[0]!)).slice(5))).toEqual([
      [6, "Fábio Nunes", 0],
      [6, "Gabi Souza", 0],
    ]);
  });

  it("013/US4-4 013/FR-019 \"Ranking\" mostra todas as posições, com a linha de quem vê marcada", async () => {
    await playCast();
    const res = await ranking(clients[3]!);
    expect(res.status).toBe(200);
    const body = res.body as ClassRanking;
    expect(body.class).toEqual({ id: classId, name: "POO 2026" });
    expect(table(body.rows)).toEqual([
      [1, "Ana Lima", 105],
      [2, "Bruno Alves", 60],
      [2, "Carla Dias", 60],
      [4, "Davi Rocha", 45],
      [5, "Elisa Melo", 30],
      [6, "Fábio Nunes", 0],
      [6, "Gabi Souza", 0],
    ]);
    expect(body.rows.filter((row) => row.isViewer).map((row) => row.name)).toEqual(["Davi Rocha"]);
  });

  it("013/US4-5 aluno em duas turmas: um ranking por turma, cada um só com os alunos e os pontos daquela turma", async () => {
    await playCast();
    const other = await createClass(t, teacher.id, { name: "Banco de Dados 2026" });
    await createEnrollment(t, other.id, students[5]!.id);
    const { client: zeca } = await enroll("Zeca Prado", other.id);
    // The same bank exercises in the other class score again there: once per student and class (FR-010a).
    const activity = await apply([exerciseIds[2]!], other.id);
    await conclude(clients[5]!, activity.id, [0]);
    await conclude(zeca, activity.id, []);

    const board = await dashboard(clients[5]!);
    expect(board.rankings.map((entry) => entry.class.name).sort()).toEqual(["Banco de Dados 2026", "POO 2026"]);
    const poo = board.rankings.find((entry) => entry.class.id === classId)!;
    const db = board.rankings.find((entry) => entry.class.id === other.id)!;
    expect(poo.top.map((row) => row.name)).not.toContain("Zeca Prado");
    expect(poo.top.find((row) => row.name === "Fábio Nunes")).toBeUndefined(); // 6th: outside the top 5
    expect(db.top).toEqual([
      { position: 1, name: "Fábio Nunes", points: 60, isViewer: true },
      { position: 2, name: "Zeca Prado", points: 0, isViewer: false },
    ]);
    expect((await rows(clients[5]!)).find((row) => row.isViewer)).toEqual({ position: 6, name: "Fábio Nunes", points: 0, isViewer: true });
  });

  it("013/US4-6 aluno removido não aparece; aluno de outra turma recebe 404", async () => {
    await playCast();
    await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: students[0]!.id }, data: { status: "REMOVED", removedAt: new Date() } });
    const list = await rows(clients[1]!);
    expect(list.map((row) => row.name)).not.toContain("Ana Lima");
    expect(list[0]).toMatchObject({ position: 1, name: "Bruno Alves", points: 60 });
    // The removed student lost access to this class's ranking and to its dashboard block.
    expect((await ranking(clients[0]!)).status).toBe(404);
    expect((await dashboard(clients[0]!)).rankings).toEqual([]);

    const other = await createClass(t, teacher.id, { name: "Outra turma" });
    const { client: outsider } = await enroll("Olga Fora", other.id);
    const res = await ranking(outsider);
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ statusCode: 404, code: "NOT_FOUND" });
    // Unknown and foreign classes answer the same 404.
    expect((await ranking(outsider, "00000000-0000-4000-8000-000000000000")).body).toEqual(res.body);
  });

  it("013/US4-7 013/FR-020 a resposta tem só posição, nome e pontos (e a marca de quem vê): nenhum e-mail, id, resposta ou nota", async () => {
    await playCast();
    const res = await ranking(clients[1]!);
    for (const row of (res.body as ClassRanking).rows) expect(Object.keys(row).sort()).toEqual(["isViewer", "name", "points", "position"]);
    const raw = JSON.stringify(res.body);
    for (const student of students) {
      expect(raw).not.toContain(student.id);
      expect(raw).not.toContain(student.email);
    }
    for (const exerciseId of exerciseIds) expect(raw).not.toContain(exerciseId);
    for (const word of ["answer", "grade", "activity", "attempt", "enrollment", "email", "userId"]) expect(raw.toLowerCase()).not.toContain(word.toLowerCase());
    const board = JSON.stringify((await dashboard(clients[1]!)).rankings);
    for (const student of students) expect(board).not.toContain(student.id);
  });

  it("013/FR-018 só a primeira conclusão pontua, o mesmo exercício pontua uma vez na turma e a atividade cancelada deixa de contar", async () => {
    const first = await apply([exerciseIds[0]!, exerciseIds[2]!]);
    await conclude(clients[0]!, first.id, [0]); // the Básico right (15), the Avançado in blank
    await conclude(clients[0]!, first.id, [0, 1], 2); // practice: no points
    expect((await rows(clients[0]!))[0]).toMatchObject({ name: "Ana Lima", points: 15 });

    // The same bank exercises applied again to the class: only the ones never concluded count (FR-010a).
    const again = await apply(exerciseIds);
    await conclude(clients[0]!, again.id, [0, 1, 2]); // Básico and Avançado already scored; the Intermediário scores 30
    expect((await rows(clients[0]!))[0]).toMatchObject({ name: "Ana Lima", points: 45 });

    const other = await apply([(await createExercise(t, teacher.id, { difficulty: "ADVANCED" })).id]);
    await conclude(clients[1]!, other.id, [0]); // Carla: 60
    expect(table((await rows(clients[0]!)).slice(0, 2))).toEqual([
      [1, "Carla Dias", 60],
      [2, "Ana Lima", 45],
    ]);
    expect((await teacherClient.post(`/api/classes/${classId}/activities/${other.id}/cancel`, {})).status).toBe(200);
    const after = await rows(clients[0]!);
    expect(after[0]).toMatchObject({ position: 1, name: "Ana Lima", points: 45 });
    expect(after.find((row) => row.name === "Carla Dias")).toMatchObject({ position: 2, points: 0 });
  });

  it("013/FR-023 013/SC-005 a conclusão e a marcação do professor aparecem no ranking na consulta seguinte", async () => {
    const open = await createExercise(t, teacher.id, { type: "OPEN_ANSWER", difficulty: "INTERMEDIATE", expectedAnswer: "Encapsular" });
    const activity = await apply([open.id]);
    expect((await rows(clients[2]!)).every((row) => row.points === 0)).toBe(true);

    await conclude(clients[2]!, activity.id, [0]);
    expect((await rows(clients[2]!)).find((row) => row.isViewer)).toMatchObject({ position: 1, points: 0 }); // awaiting the mark

    const attempt = await t.prisma.activityAttempt.findFirstOrThrow({ where: { activityId: activity.id, studentUserId: students[2]!.id } });
    const marked = await teacherClient.put(`/api/classes/${classId}/activities/${activity.id}/attempts/${attempt.id}/marks`, {
      marks: [{ questionId: activity.questions[0]!.id, result: "CORRECT" }],
    });
    expect(marked.status, JSON.stringify(marked.body)).toBe(200);
    expect((await rows(clients[0]!))[0]).toEqual({ position: 1, name: "Bruno Alves", points: 30, isViewer: false });
    expect((await dashboard(clients[2]!)).rankings[0]!.top[0]).toEqual({ position: 1, name: "Bruno Alves", points: 30, isViewer: true });

    await teacherClient.put(`/api/classes/${classId}/activities/${activity.id}/attempts/${attempt.id}/marks`, {
      marks: [{ questionId: activity.questions[0]!.id, result: "WRONG" }],
    });
    expect((await rows(clients[0]!)).every((row) => row.points === 0)).toBe(true);
  });

  it("013/FR-019 removido e readmitido: os pontos anteriores voltam a contar", async () => {
    const activity = await apply(exerciseIds);
    await conclude(clients[4]!, activity.id, [1]);
    await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: students[4]!.id }, data: { status: "REMOVED", removedAt: new Date() } });
    expect((await rows(clients[0]!)).map((row) => row.name)).not.toContain("Elisa Melo");
    await t.prisma.enrollment.updateMany({ where: { classId, studentUserId: students[4]!.id }, data: { status: "ACTIVE", removedAt: null } });
    expect((await rows(clients[0]!))[0]).toEqual({ position: 1, name: "Elisa Melo", points: 30, isViewer: false });
  });

  it("013/FR-021 sem ranking.turma.visualizar: o painel traz rankings vazio e a tela responde 403", async () => {
    await playCast();
    const grant = await t.prisma.rolePermission.findFirstOrThrow({
      where: { role: { key: "STUDENT" }, permission: { key: "ranking.turma.visualizar" } },
    });
    await t.prisma.rolePermission.delete({ where: { roleId_permissionId: { roleId: grant.roleId, permissionId: grant.permissionId } } });
    try {
      expect((await dashboard(clients[0]!)).rankings).toEqual([]);
      expect((await ranking(clients[0]!)).status).toBe(403);
    } finally {
      await t.prisma.rolePermission.create({ data: { roleId: grant.roleId, permissionId: grant.permissionId } });
    }
  });

  describe("casos de borda", () => {
    it("turma com um só aluno: ele está em 1º", async () => {
      const solo = await createClass(t, teacher.id, { name: "Turma solo" });
      const { client } = await enroll("Única Pessoa", solo.id);
      expect(await rows(client, solo.id)).toEqual([{ position: 1, name: "Única Pessoa", points: 0, isViewer: true }]);
    });

    it("todos com 0 ponto: todos em 1º, no painel e na tela", async () => {
      const list = await rows(clients[0]!);
      expect(list).toHaveLength(7);
      expect(list.every((row) => row.position === 1 && row.points === 0)).toBe(true);
      expect(list.map((row) => row.name)).toEqual(CAST.map((member) => member.name).sort((a, b) => a.localeCompare(b, "pt-BR")));
      expect((await dashboard(clients[0]!)).rankings[0]!.top).toHaveLength(5);
    });

    it("turma INACTIVE ou ARCHIVED: o ranking continua visível na tela (só consulta) e sai do painel", async () => {
      await playCast();
      for (const status of ["INACTIVE", "ARCHIVED"] as const) {
        await t.prisma.schoolClass.update({ where: { id: classId }, data: { status } });
        expect((await rows(clients[0]!))[0]).toMatchObject({ position: 1, name: "Ana Lima", points: 105, isViewer: true });
        expect((await dashboard(clients[0]!)).rankings).toEqual([]);
      }
    });
  });
});
