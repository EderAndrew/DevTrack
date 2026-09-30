import { WorkStudentViewSchema } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { WorkRecord } from "../../src/modules/works/types";
import { toWorkStudentView } from "../../src/modules/works/views/student-view";
import {
  toWorkRecord,
  WORK_RECORD_SELECT,
} from "../../src/modules/works/work-query";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";
import { createWork, type WorkFixture } from "../helpers/works";

/**
 * 011/US6, 011/FR-033–FR-035, 011/SC-007: the student view of a work is built on the server from
 * a closed list of fields, so no expected answer, rubric, correct alternative, expected solution,
 * private test case, explanation or grading data ever leaves it. The work carries markers in every
 * sensitive field; the scans look for them in what goes over the wire ("Ver como aluno").
 */

const ANSWER = "MARCADOR-RESPOSTA-011";
const RUBRIC = "MARCADOR-RUBRICA-011";
const SOLUTION = "MARCADOR-SOLUCAO-011";
const PRIVATE = "MARCADOR-PRIVADO-011";
const EXPLANATION = "MARCADOR-EXPLICACAO-011";
const MARKERS = [ANSWER, RUBRIC, SOLUTION, PRIVATE, EXPLANATION];

/** Keys that are answers, correction or review data, never in a student view. */
const FORBIDDEN_KEYS = [
  "isCorrect",
  "expectedAnswer",
  "rubric",
  "expectedSolution",
  "explanation",
  "isTrickQuestion",
  "origin",
  "gradingStrategy",
  "humanReviewed",
];

describe("011/US6 011/SC-007 a visão do aluno de um trabalho nunca contém o gabarito", () => {
  let t: TestApp;
  let teacher: TestUser;
  let client: ReturnType<typeof api>;
  let work: WorkFixture;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    client = api(t, { cookie: await loginAs(t, teacher) });
    work = await createWork(t, teacher.id, {
      title: "Trabalho com gabarito",
      description: "Leia com atenção.",
      totalGrade: "0.50",
      questions: [
        {
          type: "OPEN_ANSWER",
          statement: "O que é herança?",
          expectedAnswer: ANSWER,
          rubric: RUBRIC,
          explanation: EXPLANATION,
        },
        {
          type: "MULTIPLE_CHOICE",
          statement: "Qual palavra-chave declara herança em Java?",
          explanation: EXPLANATION,
          isTrickQuestion: true,
          alternatives: [
            { text: "implements", isCorrect: false },
            { text: "extends", isCorrect: true },
            { text: "inherits", isCorrect: false },
          ],
        },
        {
          type: "CODE",
          statement: "Implemente a classe Cachorro.",
          explanation: EXPLANATION,
          instructions: "Cachorro deve estender Animal.",
          starterCode: "class Cachorro {}",
          expectedSolution: SOLUTION,
          testCases: [
            { input: "falar()", expectedOutput: "au", visibility: "PUBLIC" },
            { input: PRIVATE, expectedOutput: PRIVATE, visibility: "PRIVATE" },
            {
              input: "latir(2)",
              expectedOutput: "au au",
              visibility: "PUBLIC",
            },
          ],
        },
      ],
    });
  });

  const preview = () => client.get(`/api/works/${work.id}/student-preview`);

  /** The record the query layer builds, from the database. */
  const record = async (): Promise<WorkRecord> =>
    toWorkRecord(
      await t.prisma.work.findUniqueOrThrow({
        where: { id: work.id },
        select: WORK_RECORD_SELECT,
      }),
    );

  function expectNothingSensitive(body: unknown) {
    const serialized = JSON.stringify(body);
    for (const marker of MARKERS) expect(serialized).not.toContain(marker);
    for (const key of FORBIDDEN_KEYS)
      expect(serialized).not.toContain(`"${key}"`);
  }

  it("011/SC-007 a prévia passa no contrato estrito e o JSON não carrega marcador nem chave de gabarito", async () => {
    const res = await preview();
    expect(res.status).toBe(200);
    expect(WorkStudentViewSchema.parse(res.body)).toEqual(res.body);
    expectNothingSensitive(res.body);
    expect(res.body).toEqual({
      id: work.id,
      title: "Trabalho com gabarito",
      description: "Leia com atenção.",
      totalGrade: "0.50",
      questions: expect.any(Array),
    });
    // The teacher's view of the same work has every marker (the scan is not vacuous).
    const teacherView = JSON.stringify(
      (await client.get(`/api/works/${work.id}`)).body,
    );
    for (const marker of MARKERS) expect(teacherView).toContain(marker);
  });

  it("011/US6-1 pergunta e resposta: enunciado e valor, sem resposta esperada, rubrica nem explicação", async () => {
    const question = (await preview()).body.questions[0];
    expect(question).toEqual({
      id: work.questions[0]!.id,
      position: 0,
      type: "OPEN_ANSWER",
      value: "0.17",
      statement: "O que é herança?",
    });
  });

  it("011/US6-2 múltipla escolha: o texto das alternativas na ordem, sem a correta, marcação, explicação nem pegadinha", async () => {
    const question = (await preview()).body.questions[1];
    expect(Object.keys(question).sort()).toEqual([
      "alternatives",
      "id",
      "position",
      "statement",
      "type",
      "value",
    ]);
    expect(question.value).toBe("0.17");
    expect(question.alternatives.map((a: { text: string }) => a.text)).toEqual([
      "implements",
      "extends",
      "inherits",
    ]);
    for (const alternative of question.alternatives)
      expect(Object.keys(alternative).sort()).toEqual(["id", "text"]);
    expectNothingSensitive(question);
  });

  it("011/US6-3 código: enunciado, instruções, código inicial, linguagem, valor e só os casos públicos", async () => {
    const question = (await preview()).body.questions[2];
    expect(question).toEqual({
      id: work.questions[2]!.id,
      position: 2,
      type: "CODE",
      value: "0.16",
      statement: "Implemente a classe Cachorro.",
      instructions: "Cachorro deve estender Animal.",
      starterCode: "class Cachorro {}",
      language: { name: "Java" },
      publicTestCases: [
        { input: "falar()", expectedOutput: "au" },
        { input: "latir(2)", expectedOutput: "au au" },
      ],
    });
  });

  it("011/US6-5 011/FR-035 um campo novo no trabalho, na questão, na alternativa ou no caso de teste não chega ao aluno sem decisão explícita", async () => {
    const base = await record();
    const extended = {
      ...base,
      teacherNotes: ANSWER,
      questions: base.questions.map((question) => ({
        ...question,
        gradingRubric: RUBRIC,
        alternatives: question.alternatives.map((alternative) => ({
          ...alternative,
          feedback: EXPLANATION,
        })),
        testCases: question.testCases.map((testCase) => ({
          ...testCase,
          hiddenHint: PRIVATE,
        })),
      })),
    } as WorkRecord;
    const view = toWorkStudentView(extended);
    expect(view).toEqual(toWorkStudentView(base));
    expect(WorkStudentViewSchema.parse(view)).toEqual(view);
    expectNothingSensitive(view);
  });

  it("011/US6-5 as questões saem na ordem de posição, mesmo que o registro venha fora de ordem", async () => {
    const base = await record();
    const view = toWorkStudentView({
      ...base,
      questions: [...base.questions].reverse().map((question) => ({
        ...question,
        alternatives: [...question.alternatives].reverse(),
        testCases: [...question.testCases].reverse(),
      })),
    });
    expect(view).toEqual(toWorkStudentView(base));
  });

  it("011/FR-034 a prévia de um trabalho de outro professor é 404, e um id inválido é 400", async () => {
    const other = await createUser(t, { roles: ["TEACHER"] });
    const res = await api(t, { cookie: await loginAs(t, other) }).get(
      `/api/works/${work.id}/student-preview`,
    );
    expect(res.status).toBe(404);
    expectNothingSensitive(res.body);
    expect(
      (await client.get("/api/works/nao-e-uuid/student-preview")).status,
    ).toBe(400);
  });

  describe("011/US6-4 011/FR-034 nenhuma rota do professor responde o gabarito a quem não é dono do banco", () => {
    it.each(["STUDENT", "ADMIN", "MANAGER"] as const)(
      "%s: as rotas com o id do trabalho recusam com 403 e sem marcador",
      async (role) => {
        const user = await createUser(t, { roles: [role] });
        const outsider = api(t, { cookie: await loginAs(t, user) });
        const responses = [
          await outsider.get(`/api/works/${work.id}`),
          await outsider.get(`/api/works/${work.id}/student-preview`),
          await outsider.post("/api/works", {}),
        ];
        for (const res of responses) {
          expect(res.status).toBe(403);
          const body = JSON.stringify(res.body);
          for (const marker of MARKERS) expect(body).not.toContain(marker);
        }
      },
    );

    it("sem sessão, 401 e nenhum marcador", async () => {
      for (const path of [
        `/api/works/${work.id}`,
        `/api/works/${work.id}/student-preview`,
      ]) {
        const res = await api(t).get(path);
        expect(res.status).toBe(401);
        expectNothingSensitive(res.body);
      }
    });
  });
});
