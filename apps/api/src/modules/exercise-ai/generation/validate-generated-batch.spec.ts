import type { GeneratedExercise, GeneratedExerciseBatch } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { validGeneratedBatch } from "../../../../test/fixtures/exercise-generation/valid-batch";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { buildExerciseProposal } from "./build-proposal";
import { type ExerciseGenerationRequestContent, READ_EXERCISE_GENERATION_REQUEST } from "./request-content";
import { ProposalRejected, validateGeneratedBatch } from "./validate-generated-batch";

type Request = ExerciseGenerationRequestContent["request"];

/** 2 open answers, 3 multiple choice (1 trick question) and 2 code exercises in Java, Intermediário. */
const REQUEST: Request = {
  difficulty: "INTERMEDIATE",
  total: 7,
  counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 3, CODE: 2 },
  trickQuestions: 1,
  language: "Java",
};

const valid = (request: Request = REQUEST): GeneratedExerciseBatch => validGeneratedBatch(request);

/** The valid batch with the exercise at `index` replaced by `patch(exercise)`. */
function patched(index: number, patch: (exercise: GeneratedExercise) => unknown): GeneratedExerciseBatch {
  const batch = valid();
  const exercises = [...batch.exercises];
  exercises[index] = patch(exercises[index]!) as GeneratedExercise;
  return { exercises };
}

const MC = 2; // the first multiple-choice exercise, a trick question
const CODE = 5; // the first code exercise

/** The reason `validateGeneratedBatch` refuses `batch` with, or null when it passes. */
function reason(batch: GeneratedExerciseBatch, request: Request = REQUEST): string | null {
  try {
    validateGeneratedBatch(batch, request);
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ProposalRejected);
    return (error as ProposalRejected).reason;
  }
}

const context = (request: Request = REQUEST): ProposalBuildContext => ({
  toolResults: [
    {
      toolKey: READ_EXERCISE_GENERATION_REQUEST,
      output: { topic: { itemText: "Herança e polimorfismo", groupTitle: null, syllabusTitle: "POO", competency: null }, request },
    },
  ],
});

describe("010/FR-029 validação da resposta da IA contra o pedido registrado", () => {
  it("uma resposta que cumpre o pedido passa", () => {
    expect(reason(valid())).toBeNull();
  });

  describe("010/US3-2 quantidade, tipos, distribuição, dificuldade e pegadinhas diferentes do pedido → recusada inteira", () => {
    it("um exercício a mais ou a menos → COUNT_MISMATCH", () => {
      const batch = valid();
      expect(reason({ exercises: batch.exercises.slice(1) })).toBe("COUNT_MISMATCH");
      expect(reason({ exercises: [...batch.exercises, { ...batch.exercises[0]!, statement: "Outro enunciado" }] })).toBe("COUNT_MISMATCH");
    });

    it("um tipo não pedido → TYPE_MISMATCH", () => {
      const request: Request = { ...REQUEST, total: 3, counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 }, trickQuestions: 0, language: null };
      const batch = validGeneratedBatch(request);
      const withCode = valid().exercises[CODE]!;
      expect(reason({ exercises: [batch.exercises[0]!, batch.exercises[1]!, withCode] }, request)).toBe("TYPE_MISMATCH");
    });

    it("mesma quantidade, distribuição por tipo diferente → TYPE_MISMATCH", () => {
      const other = validGeneratedBatch({ ...REQUEST, counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2, CODE: 2 } });
      expect(reason(other)).toBe("TYPE_MISMATCH");
    });

    it("um exercício com outra dificuldade → DIFFICULTY_MISMATCH", () => {
      expect(reason(patched(0, (exercise) => ({ ...exercise, difficulty: "ADVANCED" })))).toBe("DIFFICULTY_MISMATCH");
    });

    it("pegadinhas a mais ou a menos → TRICK_MISMATCH", () => {
      expect(reason(patched(MC, (exercise) => ({ ...exercise, isTrickQuestion: false })))).toBe("TRICK_MISMATCH");
      expect(reason(patched(MC + 1, (exercise) => ({ ...exercise, isTrickQuestion: true })))).toBe("TRICK_MISMATCH");
    });

    it("pegadinha fora de Múltipla escolha não cabe no esquema → recusada pelo build", () => {
      const batch = patched(0, (exercise) => ({ ...exercise, isTrickQuestion: true }));
      expect(() => buildExerciseProposal(batch, context())).toThrow();
    });
  });

  describe("010/US3-3 Múltipla escolha fora das regras ou campo obrigatório ausente → recusada", () => {
    const alternatives = (texts: [string, boolean][]) => (exercise: GeneratedExercise) => ({
      ...exercise,
      alternatives: texts.map(([text, isCorrect]) => ({ text, isCorrect })),
    });

    it("2 ou 6 alternativas → STRUCTURE_INVALID", () => {
      expect(reason(patched(MC, alternatives([["A", true], ["B", false]])))).toBe("STRUCTURE_INVALID");
      expect(reason(patched(MC, alternatives([["A", true], ["B", false], ["C", false], ["D", false], ["E", false], ["F", false]])))).toBe(
        "STRUCTURE_INVALID",
      );
    });

    it("nenhuma ou duas corretas → STRUCTURE_INVALID", () => {
      expect(reason(patched(MC, alternatives([["A", false], ["B", false], ["C", false]])))).toBe("STRUCTURE_INVALID");
      expect(reason(patched(MC, alternatives([["A", true], ["B", true], ["C", false]])))).toBe("STRUCTURE_INVALID");
    });

    it("alternativas repetidas (maiúsculas, acentos e espaços ignorados) → STRUCTURE_INVALID", () => {
      expect(reason(patched(MC, alternatives([["Herança", true], ["  heranca ", false], ["C", false]])))).toBe("STRUCTURE_INVALID");
    });

    it("campo obrigatório só com espaços → STRUCTURE_INVALID; ausente, o esquema recusa no build", () => {
      expect(reason(patched(0, (exercise) => ({ ...exercise, expectedAnswer: "   " })))).toBe("STRUCTURE_INVALID");
      expect(reason(patched(CODE, (exercise) => ({ ...exercise, expectedSolution: " \n " })))).toBe("STRUCTURE_INVALID");
      const missing = patched(CODE, (exercise) => {
        const copy: Partial<Extract<GeneratedExercise, { type: "CODE" }>> = { ...(exercise as Extract<GeneratedExercise, { type: "CODE" }>) };
        delete copy.expectedSolution;
        return copy;
      });
      expect(() => buildExerciseProposal(missing, context())).toThrow();
    });
  });

  it("010/US3-4 exercício de código com linguagem diferente da pedida → LANGUAGE_MISMATCH; a grafia não importa", () => {
    expect(reason(patched(CODE, (exercise) => ({ ...exercise, language: "Python" })))).toBe("LANGUAGE_MISMATCH");
    expect(reason(patched(CODE, (exercise) => ({ ...exercise, language: " java " })))).toBeNull();
  });

  it("010/US3-5 dois enunciados iguais após normalizar maiúsculas, acentos e espaços → DUPLICATE_STATEMENT", () => {
    const batch = valid();
    const first = batch.exercises[0]!.statement;
    const same = `  ${first.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "").replace(" ", "   ")} `;
    expect(reason(patched(1, (exercise) => ({ ...exercise, statement: same })))).toBe("DUPLICATE_STATEMENT");
    // Statements in different types count too.
    expect(reason(patched(CODE, (exercise) => ({ ...exercise, statement: first })))).toBe("DUPLICATE_STATEMENT");
  });

  describe("010/US3-6 010/FR-031 ids, tópico e lote vêm do pedido, nunca da resposta", () => {
    it("o esquema não tem campo para id, tópico ou lote: uma resposta que os traz é recusada e nada dela é usado", () => {
      for (const field of ["id", "syllabusItemId", "topicId", "batchId"]) {
        const batch = patched(0, (exercise) => ({ ...exercise, [field]: "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11" }));
        expect(() => buildExerciseProposal(batch, context())).toThrow();
      }
      expect(() => buildExerciseProposal({ ...valid(), batchId: "x", topic: "y" }, context())).toThrow();
    });

    it("os ids dos itens são atribuídos pelo sistema, pela posição", () => {
      const built = buildExerciseProposal(valid(), context());
      expect(built.itemIds).toEqual(Array.from({ length: 7 }, (_, index) => `exercise:${index}`));
      expect(built.content.exercises).toEqual(valid().exercises);
    });

    it("o build valida contra o pedido que a ferramenta devolveu", () => {
      expect(() => buildExerciseProposal(valid(), context({ ...REQUEST, difficulty: "BASIC" }))).toThrow(
        expect.objectContaining({ reason: "DIFFICULTY_MISMATCH" }),
      );
      expect(() => buildExerciseProposal(valid(), { toolResults: [] })).toThrow(expect.objectContaining({ reason: "MISSING_REQUEST" }));
    });
  });

  it("o motivo é só um código, sem nada da resposta", () => {
    const error = (() => {
      try {
        validateGeneratedBatch(patched(CODE, (exercise) => ({ ...exercise, language: "Python" })), REQUEST);
      } catch (caught) {
        return caught as ProposalRejected;
      }
    })();
    expect(error?.message).toBe("LANGUAGE_MISMATCH");
    expect(error?.message).toMatch(/^[A-Z_]+$/);
  });
});
