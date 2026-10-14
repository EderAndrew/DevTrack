import type { GeneratedExam, GeneratedExamQuestion } from "@repo/contracts";
import { describe, expect, it } from "vitest";
import { validGeneratedExam } from "../../../../test/fixtures/exam-generator/valid-exam";
import { buildExamProposal } from "./build-proposal";
import { ProposalRejected } from "./proposal-rejected";
import { type ExamGenerationRequestContent, READ_EXAM_GENERATION_REQUEST } from "./request-content";
import { validateGeneratedExam } from "./validate-generated-exam";

const JAVA = "11111111-1111-4111-8111-111111111111";
const T1 = "aaaaaaaa-0000-4000-8000-000000000001";
const T2 = "aaaaaaaa-0000-4000-8000-000000000002";
const OUTSIDE = "aaaaaaaa-0000-4000-8000-000000000099";

/** 2 open answers, 3 multiple choice (at most 1 trick question) and 2 code questions in Java on 2 topics. */
const CONTENT: ExamGenerationRequestContent = {
  syllabus: { title: "POO", competency: null },
  topics: [
    { id: T1, itemText: "Herança", groupTitle: "POO" },
    { id: T2, itemText: "Polimorfismo", groupTitle: null },
  ],
  request: {
    difficulty: "INTERMEDIATE",
    quantity: 7,
    counts: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 3, CODE: 2 },
    trickCount: 1,
    language: { id: JAVA, name: "Java" },
  },
};

const valid = (): GeneratedExam =>
  validGeneratedExam({ difficulty: "INTERMEDIATE", counts: CONTENT.request.counts, trickCount: 1, languageId: JAVA, topicIds: [T1, T2] });

/** The valid exam with the question at `index` replaced by `patch(question)`. */
function patched(index: number, patch: (question: GeneratedExamQuestion) => unknown, exam: GeneratedExam = valid()): GeneratedExam {
  const questions = [...exam.questions];
  questions[index] = patch(questions[index]!) as GeneratedExamQuestion;
  return { ...exam, questions };
}

const OPEN = 0;
const MC = 2; // the first multiple-choice question, the trick one
const CODE = 5;

/** The reason `validateGeneratedExam` refuses `exam` with, or null when it passes. */
function reason(exam: GeneratedExam, content: ExamGenerationRequestContent = CONTENT): string | null {
  try {
    validateGeneratedExam(exam, content);
    return null;
  } catch (error) {
    if (error instanceof ProposalRejected) return error.reason;
    throw error;
  }
}

describe("018/US7-2 018/FR-005 a saída da IA é conferida com o pedido antes de qualquer escrita (contracts/exam-generator.md)", () => {
  it("uma saída igual ao pedido passa e vira as questões do rascunho, com tópicos, dificuldade e gabarito", () => {
    const questions = validateGeneratedExam(valid(), CONTENT);
    expect(questions).toHaveLength(7);
    expect(questions.every((question) => question.difficulty === "INTERMEDIATE")).toBe(true);
    expect(questions.flatMap((question) => question.topicIds).every((id) => id === T1 || id === T2)).toBe(true);
    const mc = questions[MC]!;
    expect(mc.type === "MULTIPLE_CHOICE" && mc.alternatives.map((alternative) => alternative.isCorrect)).toEqual([false, true, false, false]);
    const code = questions[CODE]!;
    expect(code.type === "CODE" && code.languageId).toBe(JAVA);
  });

  it("quantidade diferente → COUNT_MISMATCH", () => {
    const exam = valid();
    expect(reason({ ...exam, questions: exam.questions.slice(1) })).toBe("COUNT_MISMATCH");
  });

  it("distribuição por tipo diferente → TYPE_MISMATCH", () => {
    expect(reason(patched(OPEN, (question) => ({ ...question, type: "MULTIPLE_CHOICE", alternatives: ["a", "b", "c"], correctIndex: 0, isTrickQuestion: false, expectedAnswer: undefined, rubric: undefined })))).toBe(
      "TYPE_MISMATCH",
    );
  });

  it("pegadinhas acima do pedido → TRICK_MISMATCH; menos pegadinhas que o pedido passa", () => {
    expect(reason(patched(MC + 1, (question) => ({ ...question, isTrickQuestion: true })))).toBe("TRICK_MISMATCH");
    expect(reason(patched(MC, (question) => ({ ...question, isTrickQuestion: false })))).toBeNull();
  });

  it("questão fora dos tópicos escolhidos → TOPIC_OUT_OF_SCOPE", () => {
    expect(reason(patched(OPEN, (question) => ({ ...question, topicIds: [OUTSIDE] })))).toBe("TOPIC_OUT_OF_SCOPE");
    expect(reason(patched(OPEN, (question) => ({ ...question, topicIds: [T1, OUTSIDE] })))).toBe("TOPIC_OUT_OF_SCOPE");
  });

  it("código em outra linguagem que a da ementa → LANGUAGE_MISMATCH", () => {
    expect(reason(patched(CODE, (question) => ({ ...question, languageId: OUTSIDE })))).toBe("LANGUAGE_MISMATCH");
  });

  it("sem gabarito ou com estrutura inválida → STRUCTURE_INVALID", () => {
    expect(reason(patched(OPEN, (question) => ({ ...question, expectedAnswer: "   " })))).toBe("STRUCTURE_INVALID");
    expect(reason(patched(CODE, (question) => ({ ...question, expectedSolution: " " })))).toBe("STRUCTURE_INVALID");
    expect(reason(patched(MC, (question) => ({ ...question, correctIndex: 4 })))).toBe("STRUCTURE_INVALID");
    expect(reason(patched(MC + 1, (question) => ({ ...question, alternatives: ["igual", "igual", "outra"] })))).toBe("STRUCTURE_INVALID");
    expect(reason(patched(OPEN, (question) => ({ ...question, topicIds: [T1, T1] })))).toBe("STRUCTURE_INVALID");
  });

  it("enunciados repetidos (ignorando caixa e acentos) → DUPLICATE_STATEMENT", () => {
    const exam = valid();
    expect(reason(patched(1, (question) => ({ ...question, statement: exam.questions[0]!.statement.toUpperCase() }), exam))).toBe("DUPLICATE_STATEMENT");
  });

  it("build lê o pedido devolvido pela ferramenta; sem a leitura → MISSING_REQUEST; itens por posição", () => {
    const built = buildExamProposal(valid(), { toolResults: [{ toolKey: READ_EXAM_GENERATION_REQUEST, output: CONTENT }] });
    expect(built.itemIds).toEqual(["question:0", "question:1", "question:2", "question:3", "question:4", "question:5", "question:6"]);
    expect(() => buildExamProposal(valid(), { toolResults: [] })).toThrow(ProposalRejected);
    const bad = patched(OPEN, (question) => ({ ...question, topicIds: [OUTSIDE] }));
    expect(() => buildExamProposal(bad, { toolResults: [{ toolKey: READ_EXAM_GENERATION_REQUEST, output: CONTENT }] })).toThrow("TOPIC_OUT_OF_SCOPE");
  });
});
