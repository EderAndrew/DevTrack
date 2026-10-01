import type { GeneratedWork, GeneratedWorkQuestion } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { validGeneratedWork } from "../../../../test/fixtures/work-generation/valid-work";
import type { ProposalBuildContext } from "../../ai/definitions/types";
import { buildWorkProposal } from "./build-proposal";
import { ProposalRejected } from "./proposal-rejected";
import {
  READ_WORK_GENERATION_REQUEST,
  type WorkGenerationRequestContent,
} from "./request-content";
import { validateGeneratedWork } from "./validate-generated-work";

type Request = WorkGenerationRequestContent["request"];
type Code = Extract<GeneratedWorkQuestion, { type: "CODE" }>;

/** 2 open answers, 3 multiple choice (1 trick question) and 2 code questions in Java, Intermediário. */
const REQUEST: Request = {
  difficulty: "INTERMEDIATE",
  total: 7,
  counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 3, CODE: 2 },
  trickQuestions: 1,
  language: "Java",
};

/** Three selected topics: T1, T2, T3. */
const TOPICS: WorkGenerationRequestContent["topics"] = [
  { ref: "T1", itemText: "Herança", groupTitle: "POO" },
  { ref: "T2", itemText: "Polimorfismo", groupTitle: "POO" },
  { ref: "T3", itemText: "Classes abstratas", groupTitle: null },
];

const shape = (request: Request, topicCount = TOPICS.length) => ({
  ...request,
  topicCount,
});
const valid = (request: Request = REQUEST): GeneratedWork =>
  validGeneratedWork(shape(request));

/** The valid work with the question at `index` replaced by `patch(question)`. */
function patched(
  index: number,
  patch: (question: GeneratedWorkQuestion) => unknown,
  work: GeneratedWork = valid(),
): GeneratedWork {
  const questions = [...work.questions];
  questions[index] = patch(questions[index]!) as GeneratedWorkQuestion;
  return { questions };
}
const refs = (topicRefs: string[]) => (question: GeneratedWorkQuestion) => ({
  ...question,
  topicRefs,
});

const OPEN = 0; // the first open answer
const MC = 2; // the first multiple-choice question, a trick question
const CODE = 5; // the first code question

/** The reason `validateGeneratedWork` refuses `work` with, or null when it passes. */
function reason(
  work: GeneratedWork,
  request: Request = REQUEST,
  topics = TOPICS,
): string | null {
  try {
    validateGeneratedWork(work, { request, topics });
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(ProposalRejected);
    return (error as ProposalRejected).reason;
  }
}

const context = (
  request: Request = REQUEST,
  topics = TOPICS,
): ProposalBuildContext => ({
  toolResults: [
    {
      toolKey: READ_WORK_GENERATION_REQUEST,
      output: {
        syllabus: {
          title: "POO",
          competency: null,
          language: request.language,
        },
        topics,
        request,
      },
    },
  ],
});

describe("011/FR-027 validação da resposta da IA contra o pedido registrado", () => {
  it("uma resposta que cumpre o pedido passa", () => {
    expect(reason(valid())).toBeNull();
  });

  describe("011/US4-2 quantidade, distribuição por tipo, dificuldade, pegadinhas ou linguagem diferentes do pedido → recusada inteira", () => {
    it("uma questão a mais ou a menos → COUNT_MISMATCH", () => {
      const work = valid();
      expect(reason({ questions: work.questions.slice(1) })).toBe(
        "COUNT_MISMATCH",
      );
      expect(
        reason({
          questions: [
            ...work.questions,
            { ...work.questions[OPEN]!, statement: "Outro enunciado" },
          ],
        }),
      ).toBe("COUNT_MISMATCH");
    });

    it("um tipo não pedido → TYPE_MISMATCH", () => {
      const request: Request = {
        ...REQUEST,
        total: 3,
        counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 0, CODE: 0 },
        trickQuestions: 0,
        language: null,
      };
      const work = valid(request);
      const code = valid().questions[CODE]!;
      expect(
        reason(
          {
            questions: [
              work.questions[0]!,
              work.questions[1]!,
              { ...code, topicRefs: ["T3"] },
            ],
          },
          request,
        ),
      ).toBe("TYPE_MISMATCH");
    });

    it("mesma quantidade, distribuição por tipo diferente → TYPE_MISMATCH", () => {
      const other = valid({
        ...REQUEST,
        counts: { OPEN_ANSWER: 3, MULTIPLE_CHOICE: 2, CODE: 2 },
      });
      expect(reason(other)).toBe("TYPE_MISMATCH");
    });

    it("uma questão com outra dificuldade → DIFFICULTY_MISMATCH", () => {
      expect(
        reason(
          patched(OPEN, (question) => ({
            ...question,
            difficulty: "ADVANCED",
          })),
        ),
      ).toBe("DIFFICULTY_MISMATCH");
    });

    it("pegadinhas a mais ou a menos → TRICK_MISMATCH", () => {
      expect(
        reason(
          patched(MC, (question) => ({ ...question, isTrickQuestion: false })),
        ),
      ).toBe("TRICK_MISMATCH");
      expect(
        reason(
          patched(MC + 1, (question) => ({
            ...question,
            isTrickQuestion: true,
          })),
        ),
      ).toBe("TRICK_MISMATCH");
    });

    it("pegadinha fora de Múltipla escolha não cabe no esquema estrito → recusada pelo build", () => {
      expect(() =>
        buildWorkProposal(
          patched(OPEN, (question) => ({ ...question, isTrickQuestion: true })),
          context(),
        ),
      ).toThrow();
      expect(() =>
        buildWorkProposal(
          patched(CODE, (question) => ({ ...question, isTrickQuestion: true })),
          context(),
        ),
      ).toThrow();
    });

    it("questão de código com linguagem diferente da pedida → LANGUAGE_MISMATCH; a grafia não importa", () => {
      expect(
        reason(
          patched(CODE, (question) => ({
            ...(question as Code),
            language: "Python",
          })),
        ),
      ).toBe("LANGUAGE_MISMATCH");
      expect(
        reason(
          patched(CODE, (question) => ({
            ...(question as Code),
            language: " java ",
          })),
        ),
      ).toBeNull();
    });
  });

  describe("011/US4-3 questão sem gabarito, Múltipla escolha fora das regras ou código sem caso de teste → recusada", () => {
    const alternatives =
      (texts: [string, boolean][]) => (question: GeneratedWorkQuestion) => ({
        ...question,
        alternatives: texts.map(([text, isCorrect]) => ({ text, isCorrect })),
      });

    it("resposta esperada ou solução esperada só com espaços → STRUCTURE_INVALID; ausente, o esquema recusa no build", () => {
      expect(
        reason(
          patched(OPEN, (question) => ({ ...question, expectedAnswer: "   " })),
        ),
      ).toBe("STRUCTURE_INVALID");
      expect(
        reason(
          patched(CODE, (question) => ({
            ...(question as Code),
            expectedSolution: " \n ",
          })),
        ),
      ).toBe("STRUCTURE_INVALID");
      const missing = patched(CODE, (question) => {
        const copy: Partial<Code> = { ...(question as Code) };
        delete copy.expectedSolution;
        return copy;
      });
      expect(() => buildWorkProposal(missing, context())).toThrow();
    });

    it("nenhuma alternativa correta (sem gabarito) ou duas corretas → STRUCTURE_INVALID", () => {
      expect(
        reason(
          patched(
            MC,
            alternatives([
              ["A", false],
              ["B", false],
              ["C", false],
            ]),
          ),
        ),
      ).toBe("STRUCTURE_INVALID");
      expect(
        reason(
          patched(
            MC,
            alternatives([
              ["A", true],
              ["B", true],
              ["C", false],
            ]),
          ),
        ),
      ).toBe("STRUCTURE_INVALID");
    });

    it("2 ou 6 alternativas → STRUCTURE_INVALID", () => {
      expect(
        reason(
          patched(
            MC,
            alternatives([
              ["A", true],
              ["B", false],
            ]),
          ),
        ),
      ).toBe("STRUCTURE_INVALID");
      expect(
        reason(
          patched(
            MC,
            alternatives([
              ["A", true],
              ["B", false],
              ["C", false],
              ["D", false],
              ["E", false],
              ["F", false],
            ]),
          ),
        ),
      ).toBe("STRUCTURE_INVALID");
    });

    it("alternativas repetidas (maiúsculas, acentos e espaços ignorados) → STRUCTURE_INVALID", () => {
      expect(
        reason(
          patched(
            MC,
            alternatives([
              ["Herança", true],
              ["  heranca ", false],
              ["C", false],
            ]),
          ),
        ),
      ).toBe("STRUCTURE_INVALID");
    });

    it("questão de código sem caso de teste → TEST_CASES_MISSING", () => {
      expect(
        reason(
          patched(CODE, (question) => ({
            ...(question as Code),
            testCases: [],
          })),
        ),
      ).toBe("TEST_CASES_MISSING");
    });
  });

  describe("011/US4-4 a IA não escolhe tópicos: cada questão cita de 1 a 3 tópicos da seleção e todos são cobertos", () => {
    it("ref fora da seleção → TOPIC_OUT_OF_SCOPE", () => {
      expect(reason(patched(OPEN, refs(["T4"])))).toBe("TOPIC_OUT_OF_SCOPE");
      expect(reason(patched(OPEN, refs(["T1", "Herança"])))).toBe(
        "TOPIC_OUT_OF_SCOPE",
      );
    });

    it("questão sem nenhum tópico → TOPIC_OUT_OF_SCOPE", () => {
      expect(reason(patched(3, refs([])))).toBe("TOPIC_OUT_OF_SCOPE");
    });

    it("questão com 4 tópicos ou com o mesmo tópico repetido → STRUCTURE_INVALID", () => {
      const topics = [
        ...TOPICS,
        { ref: "T4", itemText: "Interfaces", groupTitle: null },
      ];
      const work = validGeneratedWork(shape(REQUEST, topics.length));
      expect(
        reason(
          patched(OPEN, refs(["T1", "T2", "T3", "T4"]), work),
          REQUEST,
          topics,
        ),
      ).toBe("STRUCTURE_INVALID");
      expect(reason(patched(3, refs(["T1", "T1"])))).toBe("STRUCTURE_INVALID");
    });

    it("tópico selecionado sem nenhuma questão → TOPIC_NOT_COVERED", () => {
      // T3 is cited by the questions at indexes 2 and 5 only.
      expect(
        reason(patched(CODE, refs(["T1"]), patched(MC, refs(["T2"])))),
      ).toBe("TOPIC_NOT_COVERED");
    });
  });

  it("011/US4-6 dois enunciados iguais após normalizar maiúsculas, acentos e espaços → DUPLICATE_STATEMENT", () => {
    const first = valid().questions[OPEN]!.statement;
    const same = `  ${first.toUpperCase().normalize("NFD").replace(/\p{M}/gu, "").replace(" ", "   ")} `;
    expect(
      reason(patched(1, (question) => ({ ...question, statement: same }))),
    ).toBe("DUPLICATE_STATEMENT");
    // Statements of different types count too.
    expect(
      reason(patched(CODE, (question) => ({ ...question, statement: first }))),
    ).toBe("DUPLICATE_STATEMENT");
  });

  describe("011/FR-028 título, nota, valores, tópicos, ids e situação vêm do pedido, nunca da resposta", () => {
    it("o esquema estrito não tem campo para eles: uma resposta que os traz é recusada e nada dela é usado", () => {
      for (const field of [
        "id",
        "value",
        "valueCents",
        "topicItemIds",
        "syllabusItemId",
        "status",
        "position",
      ]) {
        const work = patched(OPEN, (question) => ({
          ...question,
          [field]: "3f0e7c7e-8a38-4c55-9d0b-2a4f5c0f6b11",
        }));
        expect(() => buildWorkProposal(work, context())).toThrow();
      }
      for (const field of [
        "title",
        "description",
        "totalGrade",
        "topics",
        "status",
        "workId",
      ]) {
        expect(() =>
          buildWorkProposal({ ...valid(), [field]: "x" }, context()),
        ).toThrow();
      }
    });

    it("os ids dos itens são atribuídos pelo sistema, pela posição", () => {
      const built = buildWorkProposal(valid(), context());
      expect(built.itemIds).toEqual(
        Array.from({ length: 7 }, (_, index) => `question:${index}`),
      );
      expect(built.content.questions).toEqual(valid().questions);
    });

    it("o build valida contra o pedido e os tópicos que a ferramenta devolveu", () => {
      expect(() =>
        buildWorkProposal(
          valid(),
          context({ ...REQUEST, difficulty: "BASIC" }),
        ),
      ).toThrow(expect.objectContaining({ reason: "DIFFICULTY_MISMATCH" }));
      expect(() =>
        buildWorkProposal(valid(), context(REQUEST, TOPICS.slice(0, 2))),
      ).toThrow(expect.objectContaining({ reason: "TOPIC_OUT_OF_SCOPE" }));
      expect(() => buildWorkProposal(valid(), { toolResults: [] })).toThrow(
        expect.objectContaining({ reason: "MISSING_REQUEST" }),
      );
    });
  });

  it("o motivo é só um código, sem nada da resposta", () => {
    const error = (() => {
      try {
        validateGeneratedWork(
          patched(CODE, (question) => ({
            ...(question as Code),
            language: "Python",
          })),
          { request: REQUEST, topics: TOPICS },
        );
      } catch (caught) {
        return caught as ProposalRejected;
      }
    })();
    expect(error?.message).toBe("LANGUAGE_MISMATCH");
    expect(error?.message).toMatch(/^[A-Z_]+$/);
  });
});
