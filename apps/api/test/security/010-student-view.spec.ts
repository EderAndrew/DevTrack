import { ExerciseStudentViewSchema, type ExerciseType } from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EXERCISE_RECORD_SELECT, toExerciseRecord } from "../../src/modules/exercises/exercise-query";
import type { ExerciseRecord } from "../../src/modules/exercises/types";
import { toStudentView } from "../../src/modules/exercises/views/student-view";
import { toTeacherView } from "../../src/modules/exercises/views/teacher-view";
import { createConfirmedTopic, createExercise, createGenerationBatch } from "../helpers/exercises";
import { createUser, loginAs, type TestUser } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 010/US6, 010/FR-036, 010/FR-037, 010/SC-006: the student view is built on the server from a
 * closed list of fields, so no answer, correct mark, solution or explanation ever leaves it.
 * Exercises carry markers in every sensitive field; the scans look for them in what would go
 * over the wire.
 */

const ANSWER = "MARCADOR-RESPOSTA-010";
const SOLUTION = "MARCADOR-SOLUCAO-010";
const EXPLANATION = "MARCADOR-EXPLICACAO-010";
const CORRECT = "MARCADOR-CORRETA-010";
const MARKERS = [ANSWER, SOLUTION, EXPLANATION, CORRECT];

/** Keys that are answers or correction data, never in a student view. */
const FORBIDDEN_KEYS = ["isCorrect", "expectedAnswer", "expectedSolution", "explanation", "isTrickQuestion", "origin"];

describe("010/US6 010/SC-006 a visão do aluno nunca contém a resposta", () => {
  let t: TestApp;
  let teacher: TestUser;
  let ids: Record<ExerciseType, string>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());

  beforeEach(async () => {
    await resetDb(t.prisma);
    teacher = await createUser(t, { roles: ["TEACHER"] });
    const common = { explanation: EXPLANATION, isTrickQuestion: true } as const;
    const openAnswer = await createExercise(t, teacher.id, { type: "OPEN_ANSWER", expectedAnswer: ANSWER, explanation: EXPLANATION });
    const multipleChoice = await createExercise(t, teacher.id, {
      type: "MULTIPLE_CHOICE",
      ...common,
      alternatives: [
        { text: "Distrator A", isCorrect: false },
        { text: CORRECT, isCorrect: true },
        { text: "Distrator B", isCorrect: false },
      ],
    });
    const code = await createExercise(t, teacher.id, {
      type: "CODE",
      explanation: EXPLANATION,
      instructions: "Implemente a classe Cachorro.",
      starterCode: "class Cachorro {}",
      expectedSolution: SOLUTION,
    });
    ids = { OPEN_ANSWER: openAnswer.id, MULTIPLE_CHOICE: multipleChoice.id, CODE: code.id };
  });

  /** The record the query layer builds, from the database. */
  const record = async (id: string): Promise<ExerciseRecord> =>
    toExerciseRecord(await t.prisma.exercise.findUniqueOrThrow({ where: { id }, select: EXERCISE_RECORD_SELECT }));

  function expectNothingSensitive(view: object) {
    const serialized = JSON.stringify(view);
    for (const marker of MARKERS.filter((marker) => marker !== CORRECT)) expect(serialized).not.toContain(marker);
    for (const key of FORBIDDEN_KEYS) expect(serialized).not.toContain(`"${key}"`);
  }

  it.each(["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"] as const)("%s: a visão passa no contrato estrito e não carrega nenhuma resposta", async (type) => {
    const view = toStudentView(await record(ids[type]));
    expect(ExerciseStudentViewSchema.parse(view)).toEqual(view);
    expectNothingSensitive(view);
    // The teacher view of the same row has them (the scan is not vacuous).
    expect(JSON.stringify(toTeacherView(await record(ids[type])))).toContain(EXPLANATION);
  });

  it("010/US6-1 pergunta e resposta: só o enunciado, sem resposta esperada nem explicação", async () => {
    const view = toStudentView(await record(ids.OPEN_ANSWER));
    expect(Object.keys(view).sort()).toEqual(["difficulty", "id", "statement", "type"]);
    expect(JSON.stringify(view)).not.toContain(ANSWER);
  });

  it("010/US6-2 múltipla escolha: o texto das alternativas na ordem, sem a correta, marcação por alternativa, explicação ou pegadinha", async () => {
    const view = toStudentView(await record(ids.MULTIPLE_CHOICE));
    expect(view.alternatives?.map((alternative) => alternative.text)).toEqual(["Distrator A", CORRECT, "Distrator B"]);
    for (const alternative of view.alternatives ?? []) expect(Object.keys(alternative).sort()).toEqual(["id", "text"]);
    expectNothingSensitive(view);
  });

  it("010/US6-3 código: enunciado, instruções, código inicial e linguagem, sem a solução nem a explicação", async () => {
    const view = toStudentView(await record(ids.CODE));
    expect(view).toMatchObject({ instructions: "Implemente a classe Cachorro.", starterCode: "class Cachorro {}", language: { name: "Java" } });
    expect(Object.keys(view.language ?? {})).toEqual(["name"]);
    expect(JSON.stringify(view)).not.toContain(SOLUTION);
  });

  it("010/US6-3 um exercício gerado por IA e revisado também não revela origem nem revisão", async () => {
    const topic = await createConfirmedTopic(t, teacher.id);
    const batch = await createGenerationBatch(t, teacher.id, topic);
    const generated = await createExercise(t, teacher.id, {
      type: "OPEN_ANSWER",
      origin: "AI_GENERATED",
      generationBatchId: batch.id,
      syllabusItemId: topic.itemId,
      expectedAnswer: ANSWER,
      explanation: EXPLANATION,
    });
    const view = toStudentView(await record(generated.id));
    expectNothingSensitive(view);
    for (const key of ["humanReviewed", "reviewedBy", "batchId", "topic", "version", "status"]) expect(view).not.toHaveProperty(key);
  });

  it("010/US6-5 010/FR-036 um campo novo no exercício (ou numa alternativa) não chega ao aluno sem decisão explícita", async () => {
    for (const type of ["OPEN_ANSWER", "MULTIPLE_CHOICE", "CODE"] as const) {
      const base = await record(ids[type]);
      const extended = {
        ...base,
        gradingRubric: ANSWER,
        alternatives: base.alternatives.map((alternative) => ({ ...alternative, feedback: EXPLANATION })),
      } as ExerciseRecord;
      const view = toStudentView(extended);
      expect(view).toEqual(toStudentView(base));
      expect(ExerciseStudentViewSchema.parse(view)).toEqual(view);
    }
  });

  describe("010/US6-4 nenhuma rota responde a resposta a quem não é o dono do banco", () => {
    const outsiders = ["STUDENT", "MANAGER", "ADMIN", "outro TEACHER"] as const;

    it.each(outsiders)("%s: as rotas de exercícios recusam e não devolvem marcador algum", async (who) => {
      const user = await createUser(t, { roles: [who === "outro TEACHER" ? "TEACHER" : who] });
      const client = api(t, { cookie: await loginAs(t, user) });
      const responses = [
        ...(await Promise.all(Object.values(ids).map((id) => client.get(`/api/exercises/${id}`)))),
        await client.post("/api/exercises/sets", { status: "APPROVED", exercises: [] }),
        await client.post("/api/exercises", {}),
        await client.get("/api/programming-languages"),
      ];
      for (const res of responses.slice(0, 3)) expect(res.status).toBe(who === "outro TEACHER" ? 404 : 403);
      for (const res of responses) {
        const body = JSON.stringify(res.body);
        for (const marker of MARKERS) expect(body).not.toContain(marker);
      }
    });

    it("o dono vê as respostas (a varredura acima não é vazia)", async () => {
      const client = api(t, { cookie: await loginAs(t, teacher) });
      const res = await client.get(`/api/exercises/${ids.CODE}`);
      expect(res.status).toBe(200);
      expect(res.body.expectedSolution).toBe(SOLUTION);
    });
  });
});
