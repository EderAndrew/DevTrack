import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createExam, examBody } from "../helpers/exams";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { type ConfirmedSyllabus, createConfirmedSyllabus } from "../helpers/works";

const NOT_FOUND = { statusCode: 404, code: "NOT_FOUND", message: expect.any(String) };

/** Markers of each part of the answer key; none may reach a student view. */
const KEY = {
  expected: "MARCADOR-RESPOSTA-018",
  rubric: "MARCADOR-RUBRICA-018",
  solution: "MARCADOR-SOLUCAO-018",
  explanation: "MARCADOR-EXPLICACAO-018",
  privateCase: "MARCADOR-PRIVADO-018",
};

/**
 * 018/US1 isolation of the Banco de Provas (contracts/permissions.md): another teacher's exam is a
 * 404 on every bank route, ADMIN and MANAGER get 403, and "Ver como aluno" copies an allowlist — no
 * answer key, explanation, rubric, private test case, difficulty or topic (018/FR-029).
 */
describe("018/FR-001 018/FR-029 isolamento do Banco de Provas", () => {
  let t: TestApp;
  let owner: TestUser;
  let syllabus: ConfirmedSyllabus;
  let examId: string;
  let ownerClient: ReturnType<typeof api>;
  let otherClient: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    owner = await createUser(t, { roles: ["TEACHER"] });
    ownerClient = api(t, { cookie: await loginAs(t, owner) });
    otherClient = api(t, { cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })) });
    syllabus = await createConfirmedSyllabus(t, owner.id);
    const exam = await createExam(t, owner.id, {
      syllabus,
      totalGrade: "3.00",
      questions: [
        { type: "OPEN_ANSWER", expectedAnswer: KEY.expected, rubric: KEY.rubric, explanation: KEY.explanation },
        { type: "MULTIPLE_CHOICE", explanation: KEY.explanation, isTrickQuestion: true },
        {
          type: "CODE",
          expectedSolution: KEY.solution,
          explanation: KEY.explanation,
          testCases: [
            { input: "1", expectedOutput: "publico", visibility: "PUBLIC" },
            { input: "2", expectedOutput: KEY.privateCase, visibility: "PRIVATE" },
          ],
        },
      ],
    });
    examId = exam.id;
  });

  const routes = (id: string) => [
    ["GET", `/api/exams/${id}`],
    ["GET", `/api/exams/${id}/student-preview`],
    ["PUT", `/api/exams/${id}`],
    ["POST", `/api/exams/${id}/approve`],
    ["POST", `/api/exams/${id}/archive`],
    ["POST", `/api/exams/${id}/restore`],
  ] as const;

  const call = async (client: ReturnType<typeof api>, method: string, path: string) => {
    if (method === "GET") return client.get(path);
    if (method === "PUT") {
      const body = await examBody(t, syllabus);
      const { subjectId: _subjectId, saveAs: _saveAs, ...rest } = body;
      return client.put(path, { ...rest, version: 1 });
    }
    return client.post(path, { version: 1 });
  };

  it("018/FR-001 prova de outro professor → 404 em toda rota do banco, sem nada mudar", async () => {
    const before = await t.prisma.exam.findUniqueOrThrow({ where: { id: examId } });
    for (const [method, path] of routes(examId)) {
      const response = await call(otherClient, method, path);
      expect(response.status, `${method} ${path}`).toBe(404);
      expect(response.body, `${method} ${path}`).toEqual(NOT_FOUND);
    }
    // An unknown id answers exactly the same.
    for (const [method, path] of routes(randomUUID())) expect((await call(ownerClient, method, path)).status, `${method} ${path}`).toBe(404);
    expect(await t.prisma.exam.findUniqueOrThrow({ where: { id: examId } })).toEqual(before);
    expect(await t.prisma.auditEvent.count({ where: { type: { startsWith: "exam" } } })).toBe(0);
  });

  it("018/FR-001 ADMIN e MANAGER não têm permissão de prova: 403 em toda rota do banco", async () => {
    for (const role of ["ADMIN", "MANAGER"] as const) {
      const client = api(t, { cookie: await loginAs(t, await createUser(t, { roles: [role] })) });
      expect((await client.get("/api/exams")).status, role).toBe(403);
      expect((await client.post("/api/exams", await examBody(t, syllabus))).status, role).toBe(403);
      for (const [method, path] of routes(examId)) expect((await call(client, method, path)).status, `${role} ${method} ${path}`).toBe(403);
    }
  });

  it("018/FR-029 \"Ver como aluno\" é uma lista fechada: nenhum gabarito, explicação, rubrica, caso privado, dificuldade ou tópico", async () => {
    const preview = await ownerClient.get(`/api/exams/${examId}/student-preview`);
    expect(preview.status).toBe(200);
    const serialized = JSON.stringify(preview.body);
    for (const marker of Object.values(KEY)) expect(serialized, marker).not.toContain(marker);
    for (const key of ["isCorrect", "expectedAnswer", "rubric", "expectedSolution", "explanation", "isTrickQuestion", "difficulty", "topicIds", "gradingStrategy", "origin"]) {
      expect(serialized, key).not.toContain(`"${key}"`);
    }
    expect(preview.body.questions[2].publicTestCases).toEqual([{ input: "1", expectedOutput: "publico" }]);
    // The teacher view has them all.
    const teacherView = JSON.stringify((await ownerClient.get(`/api/exams/${examId}`)).body);
    for (const marker of Object.values(KEY)) expect(teacherView, marker).toContain(marker);
  });
});
