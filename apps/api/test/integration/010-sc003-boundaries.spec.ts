import { randomUUID } from "node:crypto";
import {
  ExerciseBatchRequestSchema,
  type GeneratedExerciseBatch,
} from "@repo/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ProposalRejected,
  validateGeneratedBatch,
} from "../../src/modules/exercise-ai/generation/validate-generated-batch";
import { validGeneratedBatch } from "../fixtures/exercise-generation/valid-batch";
import { createUser, loginAs } from "../helpers/factories";
import { api, createTestApp, resetDb, type TestApp } from "../helpers/test-app";

/**
 * 010/SC-003: every boundary of the rules — 2/3/10/11 exercises, 2/3/5/6 alternatives, 0/1/2
 * correct ones, 0/3/4 trick questions and trick questions above the multiple-choice count — has the
 * expected result on each path: manual creation, edition and the AI's answer (plus the batch
 * request, where the counts and the trick questions are chosen).
 */

const common = {
  explanation: "Explicação.",
  difficulty: "BASIC",
  cognitiveObjective: "UNDERSTAND",
} as const;
const openAnswer = (n: number) => ({
  type: "OPEN_ANSWER" as const,
  statement: `Pergunta ${n}`,
  ...common,
  expectedAnswer: "Resposta",
});
const alternatives = (count: number, correct: number) =>
  Array.from({ length: count }, (_, i) => ({
    text: `Alternativa ${i + 1}`,
    isCorrect: i < correct,
  }));
const multipleChoice = (list: { text: string; isCorrect: boolean }[]) => ({
  type: "MULTIPLE_CHOICE" as const,
  statement: "Qual palavra-chave declara herança em Java?",
  ...common,
  alternatives: list,
  isTrickQuestion: false,
});

/** [label, alternatives, accepted] — the alternative and correct-answer boundaries. */
const STRUCTURE: [string, { text: string; isCorrect: boolean }[], boolean][] = [
  ["2 alternativas", alternatives(2, 1), false],
  ["3 alternativas", alternatives(3, 1), true],
  ["5 alternativas", alternatives(5, 1), true],
  ["6 alternativas", alternatives(6, 1), false],
  ["0 corretas", alternatives(4, 0), false],
  ["1 correta", alternatives(4, 1), true],
  ["2 corretas", alternatives(4, 2), false],
];

describe("010/SC-003 casos de fronteira das regras em todos os caminhos", () => {
  let t: TestApp;
  let client: ReturnType<typeof api>;

  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(() => t.close());
  beforeEach(async () => {
    await resetDb(t.prisma);
    client = api(t, {
      cookie: await loginAs(t, await createUser(t, { roles: ["TEACHER"] })),
    });
  });

  describe("criação manual", () => {
    it.each([
      [2, 400],
      [3, 201],
      [10, 201],
      [11, 400],
    ])("conjunto de %i exercícios → %i", async (size, status) => {
      const res = await client.post("/api/exercises/sets", {
        exercises: Array.from({ length: size }, (_, i) => openAnswer(i + 1)),
        status: "APPROVED",
      });
      expect(res.status).toBe(status);
      expect(await t.prisma.exercise.count()).toBe(status === 201 ? size : 0);
    });

    it.each(STRUCTURE)(
      "Múltipla escolha com %s → aceita: %s",
      async (_, list, accepted) => {
        const res = await client.post("/api/exercises", {
          ...multipleChoice(list),
          status: "APPROVED",
        });
        expect(res.status).toBe(accepted ? 201 : 400);
        expect(await t.prisma.exerciseAlternative.count()).toBe(
          accepted ? list.length : 0,
        );
      },
    );
  });

  describe("edição", () => {
    it.each(STRUCTURE)(
      "Múltipla escolha editada para %s → aceita: %s",
      async (_, list, accepted) => {
        const created = await client.post("/api/exercises", {
          ...multipleChoice(alternatives(4, 1)),
          status: "APPROVED",
        });
        expect(created.status).toBe(201);
        const res = await client.put(`/api/exercises/${created.body.id}`, {
          ...multipleChoice(list),
          version: created.body.version,
        });
        expect(res.status).toBe(accepted ? 200 : 400);
        const stored = await t.prisma.exerciseAlternative.findMany({
          where: { exerciseId: created.body.id },
          orderBy: { position: "asc" },
        });
        expect(
          stored.map(({ text, isCorrect }) => ({ text, isCorrect })),
        ).toEqual(accepted ? list : alternatives(4, 1));
      },
    );
  });

  describe("pedido de lote à IA", () => {
    const request = (
      total: number,
      types: ("OPEN_ANSWER" | "MULTIPLE_CHOICE")[],
      trickQuestions: number,
    ) =>
      ExerciseBatchRequestSchema.safeParse({
        syllabusRevisionId: randomUUID(),
        syllabusItemId: randomUUID(),
        difficulty: "BASIC",
        total,
        types,
        distribution: { mode: "AUTO" },
        trickQuestions,
        idempotencyKey: randomUUID(),
      }).success;

    it.each([
      [2, false],
      [3, true],
      [10, true],
      [11, false],
    ])("%i exercícios → aceito: %s", (total, accepted) => {
      expect(request(total, ["OPEN_ANSWER"], 0)).toBe(accepted);
    });

    it.each([
      [0, true],
      [3, true],
      [4, false],
    ])(
      "%i pegadinhas em 10 de Múltipla escolha → aceito: %s",
      (tricks, accepted) => {
        expect(request(10, ["MULTIPLE_CHOICE"], tricks)).toBe(accepted);
      },
    );

    it("pegadinhas acima da quantidade de Múltipla escolha → recusado", () => {
      // 5 over two types: 3 open answers and 2 multiple choice.
      expect(request(5, ["OPEN_ANSWER", "MULTIPLE_CHOICE"], 2)).toBe(true);
      expect(request(5, ["OPEN_ANSWER", "MULTIPLE_CHOICE"], 3)).toBe(false);
    });
  });

  describe("resposta da IA", () => {
    const target = (
      total: number,
      multipleChoiceCount: number,
      trickQuestions: number,
    ) => ({
      difficulty: "BASIC" as const,
      total,
      counts: {
        OPEN_ANSWER: total - multipleChoiceCount,
        MULTIPLE_CHOICE: multipleChoiceCount,
        CODE: 0,
      },
      trickQuestions,
      language: null,
    });
    const verdict = (
      batch: GeneratedExerciseBatch,
      request: ReturnType<typeof target>,
    ) => {
      try {
        validateGeneratedBatch(batch, request);
        return "aceita";
      } catch (error) {
        if (error instanceof ProposalRejected) return error.reason;
        throw error;
      }
    };

    it.each([
      [2, 3, "COUNT_MISMATCH"],
      [3, 3, "aceita"],
      [10, 10, "aceita"],
      [11, 10, "COUNT_MISMATCH"],
    ])("%i exercícios num pedido de %i → %s", (given, asked, expected) => {
      const batch = validGeneratedBatch({
        difficulty: "BASIC",
        counts: { OPEN_ANSWER: given, MULTIPLE_CHOICE: 0, CODE: 0 },
        trickQuestions: 0,
        language: null,
      });
      expect(verdict(batch, target(asked, 0, 0))).toBe(expected);
    });

    it.each(STRUCTURE)(
      "Múltipla escolha com %s → aceita: %s",
      (_, list, accepted) => {
        const batch = validGeneratedBatch({
          difficulty: "BASIC",
          counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 1, CODE: 0 },
          trickQuestions: 0,
          language: null,
        });
        const choice = batch.exercises[2]!;
        if (choice.type === "MULTIPLE_CHOICE") choice.alternatives = list;
        expect(verdict(batch, target(3, 1, 0))).toBe(
          accepted ? "aceita" : "STRUCTURE_INVALID",
        );
      },
    );

    it.each([
      [0, 0, "aceita"],
      [3, 3, "aceita"],
      [4, 3, "TRICK_MISMATCH"],
      [2, 3, "TRICK_MISMATCH"],
    ])(
      "%i pegadinhas numa resposta que devia ter %i → %s",
      (given, asked, expected) => {
        const batch = validGeneratedBatch({
          difficulty: "BASIC",
          counts: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 4, CODE: 0 },
          trickQuestions: given,
          language: null,
        });
        expect(verdict(batch, target(4, 4, asked))).toBe(expected);
      },
    );
  });
});
