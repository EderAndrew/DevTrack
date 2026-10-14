import { describe, expect, it } from "vitest";
import {
  CreateExamGenerationRequestSchema,
  CreateExamRequestSchema,
  EXAM_MAX_QUESTIONS,
  EXAM_QUESTION_TOPICS_MAX,
  ExamListQuerySchema,
  ExamOriginSchema,
  ExamStatusSchema,
  ExamStudentPreviewSchema,
  ExamVersionSchema,
  GeneratedExamSchema,
  TeacherExamSchema,
  UpdateExamRequestSchema,
  WorkOriginSchema,
  WorkStatusSchema,
} from "../src/index.js";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const accepts = (schema: { safeParse: (value: unknown) => { success: boolean } }, value: unknown) => schema.safeParse(value).success;
const AT = "2026-10-12T13:00:00.000Z";
const TOPIC = uuid(100);
const OTHER_TOPIC = uuid(101);

const openAnswer = (overrides: Record<string, unknown> = {}) => ({
  type: "OPEN_ANSWER",
  statement: "Explique herança.",
  expectedAnswer: "Reuso por extensão.",
  difficulty: "BASIC",
  topicIds: [TOPIC],
  ...overrides,
});
const multipleChoice = (overrides: Record<string, unknown> = {}) => ({
  type: "MULTIPLE_CHOICE",
  statement: "Qual palavra declara herança em Java?",
  alternatives: [
    { text: "extends", isCorrect: true },
    { text: "implements", isCorrect: false },
    { text: "inherits", isCorrect: false },
  ],
  difficulty: "INTERMEDIATE",
  topicIds: [TOPIC],
  ...overrides,
});
const code = (overrides: Record<string, unknown> = {}) => ({
  type: "CODE",
  statement: "Some dois números.",
  expectedSolution: "return a + b;",
  languageId: uuid(50),
  difficulty: "ADVANCED",
  topicIds: [TOPIC, OTHER_TOPIC],
  ...overrides,
});
const exam = (overrides: Record<string, unknown> = {}) => ({
  subjectId: uuid(1),
  syllabusRevisionId: uuid(2),
  title: "Prova 1",
  totalGrade: "10",
  saveAs: "DRAFT",
  topicIds: [TOPIC, OTHER_TOPIC],
  questions: [openAnswer(), multipleChoice(), code()],
  ...overrides,
});
/** An edit body: the exam without the subject and `saveAs`, with the version it was read at. */
const edit = (overrides: Record<string, unknown> = {}) => {
  const { subjectId: _subjectId, saveAs: _saveAs, ...rest } = exam(overrides);
  return { ...rest, version: 1 };
};
const questions = (count: number) => Array.from({ length: count }, () => openAnswer());

describe("018 enums do Banco de Provas", () => {
  it("018/FR-004 rascunho, aprovada e arquivada; origem manual ou gerada por IA, enums próprios do banco", () => {
    expect(ExamStatusSchema.options).toEqual(["DRAFT", "APPROVED", "ARCHIVED"]);
    expect(ExamOriginSchema.options).toEqual(["MANUAL", "AI_GENERATED"]);
    expect(ExamStatusSchema).not.toBe(WorkStatusSchema);
    expect(ExamOriginSchema).not.toBe(WorkOriginSchema);
  });
});

describe("018 prova manual (contracts/http-api.md, \"Banco de Provas\")", () => {
  it("018/FR-001 aceita os três tipos da 011 e de 1 a 20 questões", () => {
    expect(EXAM_MAX_QUESTIONS).toBe(20);
    expect(accepts(CreateExamRequestSchema, exam())).toBe(true);
    for (const count of [1, 20]) expect(accepts(CreateExamRequestSchema, exam({ questions: questions(count) })), String(count)).toBe(true);
    for (const count of [0, 21]) expect(accepts(CreateExamRequestSchema, exam({ questions: questions(count) })), String(count)).toBe(false);
    expect(accepts(UpdateExamRequestSchema, edit({ questions: questions(20) }))).toBe(true);
    expect(accepts(UpdateExamRequestSchema, edit({ questions: questions(21) }))).toBe(false);
  });

  it("018/FR-001 as regras de estrutura da 011 continuam: uma alternativa correta, textos distintos, 3 a 5", () => {
    const alternatives = (texts: string[], correct: number[]) => texts.map((text, i) => ({ text, isCorrect: correct.includes(i) }));
    expect(accepts(CreateExamRequestSchema, exam({ questions: [multipleChoice({ alternatives: alternatives(["a", "b", "c"], [0, 1]) })] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ questions: [multipleChoice({ alternatives: alternatives(["a", "A", "c"], [0]) })] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ questions: [multipleChoice({ alternatives: alternatives(["a", "b"], [0]) })] }))).toBe(false);
  });

  it("018/FR-002 cada questão tem de 1 a 3 tópicos distintos, todos entre os tópicos da prova", () => {
    expect(EXAM_QUESTION_TOPICS_MAX).toBe(3);
    const topics = [uuid(100), uuid(101), uuid(102), uuid(103)];
    const body = (questionTopics: string[]) => exam({ topicIds: topics, questions: [openAnswer({ topicIds: questionTopics })] });
    expect(accepts(CreateExamRequestSchema, body(topics.slice(0, 1)))).toBe(true);
    expect(accepts(CreateExamRequestSchema, body(topics.slice(0, 3)))).toBe(true);
    expect(accepts(CreateExamRequestSchema, body([]))).toBe(false);
    expect(accepts(CreateExamRequestSchema, body(topics))).toBe(false);
    expect(accepts(CreateExamRequestSchema, body([TOPIC, TOPIC]))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ questions: [openAnswer({ topicIds: undefined })] }))).toBe(false);
    // A question's topics ⊆ the exam's topics.
    expect(accepts(CreateExamRequestSchema, exam({ topicIds: [TOPIC], questions: [openAnswer({ topicIds: [OTHER_TOPIC] })] }))).toBe(false);
  });

  it("018/FR-002 a prova tem de 1 a 20 tópicos distintos e sempre uma revisão da ementa", () => {
    const topics = (count: number) => Array.from({ length: count }, (_, i) => uuid(200 + i));
    expect(accepts(CreateExamRequestSchema, exam({ topicIds: [] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ topicIds: [...topics(19), TOPIC], questions: [openAnswer()] }))).toBe(true);
    expect(accepts(CreateExamRequestSchema, exam({ topicIds: [...topics(20), TOPIC], questions: [openAnswer()] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ topicIds: [TOPIC, TOPIC], questions: [openAnswer()] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ syllabusRevisionId: undefined }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ syllabusRevisionId: null }))).toBe(false);
  });

  it("018/FR-004 a dificuldade da questão é Básico, Intermediário ou Avançado; o rascunho pode deixá-la para a aprovação", () => {
    expect(accepts(CreateExamRequestSchema, exam({ questions: [openAnswer({ difficulty: undefined })] }))).toBe(true);
    expect(accepts(CreateExamRequestSchema, exam({ questions: [openAnswer({ difficulty: null })] }))).toBe(true);
    expect(accepts(CreateExamRequestSchema, exam({ questions: [openAnswer({ difficulty: "EXPERT" })] }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ saveAs: "APPROVED" }))).toBe(true);
    expect(accepts(CreateExamRequestSchema, exam({ saveAs: "ARCHIVED" }))).toBe(false);
  });

  it("018/FR-003 nota total de 0,01 a 100 com até duas casas, e ao menos 0,01 por questão", () => {
    for (const totalGrade of ["0.01", "100", "7.5"]) {
      expect(accepts(CreateExamRequestSchema, exam({ totalGrade, questions: [openAnswer()] })), totalGrade).toBe(true);
    }
    for (const totalGrade of ["0", "100.01", "1.234", "1,5", 10]) {
      expect(accepts(CreateExamRequestSchema, exam({ totalGrade })), String(totalGrade)).toBe(false);
    }
    expect(accepts(CreateExamRequestSchema, exam({ totalGrade: "0.19", questions: questions(20) }))).toBe(false);
    expect(accepts(CreateExamRequestSchema, exam({ totalGrade: "0.20", questions: questions(20) }))).toBe(true);
  });

  it("018/FR-003 campos do servidor no corpo são recusados (valor, origem, situação, revisão humana, professor)", () => {
    for (const field of ["value", "origin", "status", "reviewedAt", "teacherId", "position", "gradingStrategy"]) {
      expect(accepts(CreateExamRequestSchema, exam({ questions: [openAnswer({ [field]: "x" })] })), `questão.${field}`).toBe(false);
    }
    for (const field of ["origin", "status", "teacherId", "humanReviewed", "version", "questionCount"]) {
      expect(accepts(CreateExamRequestSchema, exam({ [field]: "x" })), field).toBe(false);
    }
  });

  it("018/FR-004 a edição leva a versão lida; aprovar, arquivar e restaurar levam só a versão", () => {
    expect(accepts(UpdateExamRequestSchema, edit())).toBe(true);
    expect(accepts(UpdateExamRequestSchema, { ...edit(), version: 0 })).toBe(false);
    expect(accepts(UpdateExamRequestSchema, { ...edit(), subjectId: uuid(1) })).toBe(false);
    expect(accepts(UpdateExamRequestSchema, edit({ questions: [openAnswer({ id: uuid(7) }), openAnswer({ id: uuid(7) })] }))).toBe(false);
    expect(accepts(ExamVersionSchema, { version: 1 })).toBe(true);
    expect(accepts(ExamVersionSchema, { version: 1, status: "APPROVED" })).toBe(false);
  });

  it("018 a listagem filtra por situação, disciplina e busca, com página de até 50", () => {
    expect(ExamListQuerySchema.parse({ status: "ARCHIVED", subjectId: uuid(1), q: "herança", limit: "20" })).toMatchObject({ limit: 20 });
    expect(accepts(ExamListQuerySchema, { limit: "51" })).toBe(false);
    expect(accepts(ExamListQuerySchema, { limit: "0" })).toBe(false);
    expect(accepts(ExamListQuerySchema, { origin: "MANUAL" })).toBe(false);
  });
});

describe("018 visões da prova (contracts/http-api.md)", () => {
  const question = {
    id: uuid(10),
    position: 0,
    type: "OPEN_ANSWER",
    gradingStrategy: "AI_REVIEW",
    value: "10.00",
    statement: "Explique herança.",
    explanation: null,
    expectedAnswer: "Reuso por extensão.",
    rubric: null,
    isTrickQuestion: false,
    difficulty: "BASIC",
    topicIds: [TOPIC],
  };
  const teacherExam = {
    id: uuid(3),
    subject: { id: uuid(1), name: "POO" },
    syllabusRevisionId: uuid(2),
    topics: [{ syllabusItemId: TOPIC, itemText: "Herança", groupTitle: null }],
    title: "Prova 1",
    description: null,
    totalGrade: "10.00",
    questionCount: 1,
    origin: "MANUAL",
    status: "DRAFT",
    archivedFromStatus: null,
    version: 1,
    humanReviewed: false,
    humanEdited: false,
    reviewedBy: null,
    reviewedAt: null,
    generationRequestId: null,
    warnings: [],
    questions: [question],
    createdAt: AT,
    updatedAt: AT,
  };

  it("018/FR-002 o professor vê o gabarito, a dificuldade e os tópicos de cada questão", () => {
    expect(accepts(TeacherExamSchema, teacherExam)).toBe(true);
    expect(accepts(TeacherExamSchema, { ...teacherExam, questions: [{ ...question, difficulty: null }] })).toBe(true);
    expect(accepts(TeacherExamSchema, { ...teacherExam, questions: [{ ...question, topicItemIds: [TOPIC] }] })).toBe(false);
    expect(accepts(TeacherExamSchema, { ...teacherExam, syllabusRevisionId: null })).toBe(false);
    expect(accepts(TeacherExamSchema, { ...teacherExam, questionCount: 21 })).toBe(false);
  });

  it("018/FR-029 \"Ver como aluno\" é uma lista fechada: sem gabarito, explicação, dificuldade ou origem", () => {
    const preview = {
      id: uuid(3),
      title: "Prova 1",
      description: null,
      totalGrade: "10.00",
      questions: [{ id: uuid(10), position: 0, type: "OPEN_ANSWER", value: "10.00", statement: "Explique herança." }],
    };
    expect(accepts(ExamStudentPreviewSchema, preview)).toBe(true);
    for (const field of ["expectedAnswer", "explanation", "difficulty", "rubric", "isTrickQuestion", "topicIds"]) {
      expect(accepts(ExamStudentPreviewSchema, { ...preview, questions: [{ ...preview.questions[0], [field]: "x" }] }), field).toBe(false);
    }
    expect(accepts(ExamStudentPreviewSchema, { ...preview, origin: "MANUAL" })).toBe(false);
  });
});

describe("018 \"Criar prova com IA\" (contracts/http-api.md, contracts/exam-generator.md)", () => {
  const request = (overrides: Record<string, unknown> = {}) => ({
    subjectId: uuid(1),
    syllabusRevisionId: uuid(2),
    title: "Prova gerada",
    topicIds: [TOPIC],
    difficulty: "INTERMEDIATE",
    totalGrade: "10",
    quantity: 4,
    distribution: { OPEN_ANSWER: 2, MULTIPLE_CHOICE: 2, CODE: 0 },
    trickCount: 1,
    idempotencyKey: uuid(99),
    ...overrides,
  });

  it("018/FR-005 de 1 a 20 questões, distribuição que soma a quantidade, pegadinhas até as de múltipla escolha", () => {
    expect(accepts(CreateExamGenerationRequestSchema, request())).toBe(true);
    expect(accepts(CreateExamGenerationRequestSchema, request({ quantity: 20, distribution: { OPEN_ANSWER: 10, MULTIPLE_CHOICE: 5, CODE: 5 } }))).toBe(true);
    expect(accepts(CreateExamGenerationRequestSchema, request({ quantity: 21, distribution: { OPEN_ANSWER: 11, MULTIPLE_CHOICE: 5, CODE: 5 } }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ quantity: 0, distribution: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 0, CODE: 0 }, trickCount: 0 }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ quantity: 5 }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ trickCount: 3 }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ trickCount: 4, quantity: 4, distribution: { OPEN_ANSWER: 0, MULTIPLE_CHOICE: 4, CODE: 0 } }))).toBe(false);
  });

  it("018/FR-005 de 1 a 10 tópicos distintos, e não mais que 3 por questão pedida", () => {
    const topics = (count: number) => Array.from({ length: count }, (_, i) => uuid(300 + i));
    expect(accepts(CreateExamGenerationRequestSchema, request({ topicIds: topics(10) }))).toBe(true);
    expect(accepts(CreateExamGenerationRequestSchema, request({ topicIds: [] }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ topicIds: topics(11) }))).toBe(false);
    expect(accepts(CreateExamGenerationRequestSchema, request({ topicIds: [TOPIC, TOPIC] }))).toBe(false);
    expect(
      accepts(CreateExamGenerationRequestSchema, request({ topicIds: topics(4), quantity: 1, distribution: { OPEN_ANSWER: 1, MULTIPLE_CHOICE: 0, CODE: 0 }, trickCount: 0 })),
    ).toBe(false);
  });

  it("018/FR-005 o pedido nunca escolhe modelo, provedor, nível ou tarefa", () => {
    for (const field of ["model", "provider", "tier", "family", "taskKey", "modelConfigKey", "instructions"]) {
      expect(accepts(CreateExamGenerationRequestSchema, request({ [field]: "x" })), field).toBe(false);
    }
  });

  it("018/FR-005 a saída do gerador: questões com gabarito, dificuldade e 1 a 3 tópicos, sem valor nem situação", () => {
    const generated = {
      title: "Prova gerada",
      questions: [
        { type: "OPEN_ANSWER", statement: "Explique.", explanation: null, difficulty: "BASIC", topicIds: [TOPIC], expectedAnswer: "Isto.", rubric: null },
        {
          type: "MULTIPLE_CHOICE",
          statement: "Qual?",
          explanation: "Porque.",
          difficulty: "INTERMEDIATE",
          topicIds: [TOPIC],
          alternatives: ["a", "b", "c"],
          correctIndex: 0,
          isTrickQuestion: false,
        },
        {
          type: "CODE",
          statement: "Some.",
          explanation: null,
          difficulty: "ADVANCED",
          topicIds: [TOPIC],
          languageId: uuid(50),
          instructions: null,
          starterCode: null,
          expectedSolution: "a + b",
          testCases: [{ input: "1 2", expectedOutput: "3", visibility: "PRIVATE" }],
        },
      ],
    };
    expect(accepts(GeneratedExamSchema, generated)).toBe(true);
    const [first] = generated.questions;
    expect(accepts(GeneratedExamSchema, { ...generated, questions: [{ ...first, topicIds: [] }] })).toBe(false);
    expect(accepts(GeneratedExamSchema, { ...generated, questions: [{ ...first, difficulty: undefined }] })).toBe(false);
    expect(accepts(GeneratedExamSchema, { ...generated, questions: [{ ...first, expectedAnswer: undefined }] })).toBe(false);
    expect(accepts(GeneratedExamSchema, { ...generated, questions: [{ ...first, value: "1.00" }] })).toBe(false);
    expect(accepts(GeneratedExamSchema, { ...generated, status: "APPROVED" })).toBe(false);
    expect(accepts(GeneratedExamSchema, { ...generated, questions: Array.from({ length: 21 }, () => first) })).toBe(false);
  });
});
