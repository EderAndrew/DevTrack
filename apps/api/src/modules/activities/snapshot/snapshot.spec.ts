import { describe, expect, it } from "vitest";
import { type ExerciseSource, snapshotFromExercises } from "./from-exercises";
import { snapshotFromWork, type WorkSource } from "./from-work";
import { topicPositions } from "./snapshot";

const exercise = (id: string, type: ExerciseSource["type"], overrides: Partial<ExerciseSource> = {}): ExerciseSource => ({
  id,
  type,
  difficulty: "BASIC",
  statement: `Enunciado ${id}`,
  instructions: type === "CODE" ? "Implemente" : null,
  starterCode: type === "CODE" ? "class A {}" : null,
  languageId: type === "CODE" ? "lang-java" : null,
  expectedAnswer: type === "OPEN_ANSWER" ? "Reuso" : null,
  expectedSolution: type === "CODE" ? "class A { }" : null,
  explanation: "Porque sim",
  isTrickQuestion: false,
  syllabusItemId: `item-${id}`,
  alternatives:
    type === "MULTIPLE_CHOICE"
      ? [
          { position: 2, text: "C", isCorrect: false },
          { position: 0, text: "A", isCorrect: true },
          { position: 1, text: "B", isCorrect: false },
        ]
      : [],
  ...overrides,
});

describe("013/FR-002 snapshot dos exercícios (012 research P2, P6; 013 research K2)", () => {
  it("013/FR-002 cada exercício vale os pontos do seu nível, na ordem escolhida pelo professor, sem valor nem nota", () => {
    const snapshot = snapshotFromExercises([
      exercise("e3", "OPEN_ANSWER", { difficulty: "ADVANCED" }),
      exercise("e1", "MULTIPLE_CHOICE", { difficulty: "BASIC" }),
      exercise("e2", "CODE", { difficulty: "INTERMEDIATE" }),
    ]);
    expect(snapshot.totalCents).toBeNull();
    expect(snapshot.questions.map((q) => [q.position, q.sourceExerciseId, q.difficulty, q.points, q.valueCents])).toEqual([
      [0, "e3", "ADVANCED", 60, null],
      [1, "e1", "BASIC", 15, null],
      [2, "e2", "INTERMEDIATE", 30, null],
    ]);
  });

  it("013/FR-002 os pontos vêm do nível copiado: mudar o exercício depois não muda o snapshot", () => {
    const source = exercise("a", "OPEN_ANSWER", { difficulty: "INTERMEDIATE" });
    const snapshot = snapshotFromExercises([source]);
    source.difficulty = "ADVANCED";
    expect(snapshot.questions[0]).toMatchObject({ difficulty: "INTERMEDIATE", points: 30 });
  });

  it("cada tipo leva a estratégia do tipo e só os campos dele; código sem casos de teste", () => {
    const [open, choice, code] = snapshotFromExercises([exercise("a", "OPEN_ANSWER"), exercise("b", "MULTIPLE_CHOICE"), exercise("c", "CODE")]).questions;
    expect(open).toMatchObject({ gradingStrategy: "AI_REVIEW", expectedAnswer: "Reuso", rubric: null, instructions: null, languageId: null, alternatives: [] });
    expect(choice).toMatchObject({ gradingStrategy: "EXACT_MATCH", expectedAnswer: null, alternatives: [
      { position: 0, text: "A", isCorrect: true },
      { position: 1, text: "B", isCorrect: false },
      { position: 2, text: "C", isCorrect: false },
    ] });
    expect(code).toMatchObject({ gradingStrategy: "TEST_CASES", testCases: [], expectedSolution: "class A { }", languageId: "lang-java", starterCode: "class A {}" });
  });

  it("o tópico do exercício vira o tópico da questão", () => {
    const snapshot = snapshotFromExercises([exercise("a", "OPEN_ANSWER"), exercise("b", "OPEN_ANSWER", { syllabusItemId: null })]);
    expect(snapshot.questions.map((q) => q.topicItemIds)).toEqual([["item-a"], []]);
  });
});

describe("012/FR-002 snapshot do trabalho", () => {
  const work: WorkSource = {
    totalCents: 50,
    questions: [
      {
        position: 1,
        type: "CODE",
        gradingStrategy: "TEST_CASES",
        valueCents: 25,
        statement: "Implemente",
        instructions: null,
        starterCode: null,
        languageId: "lang-java",
        expectedAnswer: null,
        rubric: null,
        expectedSolution: "class B {}",
        explanation: null,
        isTrickQuestion: false,
        alternatives: [],
        testCases: [
          { position: 1, input: "2", expectedOutput: "4", visibility: "PRIVATE" },
          { position: 0, input: "1", expectedOutput: "2", visibility: "PUBLIC" },
        ],
        topicItemIds: ["t1", "t2"],
      },
      {
        position: 0,
        type: "OPEN_ANSWER",
        gradingStrategy: "AI_REVIEW",
        valueCents: 25,
        statement: "Explique",
        instructions: null,
        starterCode: null,
        languageId: null,
        expectedAnswer: "Herança",
        rubric: "Cita superclasse",
        expectedSolution: null,
        explanation: "Explicação",
        isTrickQuestion: false,
        alternatives: [],
        testCases: [],
        topicItemIds: ["t1"],
      },
    ],
  };

  it("copia valores, estratégias, gabarito, casos de teste e tópicos, com posições contíguas", () => {
    const snapshot = snapshotFromWork(work);
    expect(snapshot.totalCents).toBe(50);
    expect(snapshot.questions.map((q) => [q.position, q.type, q.valueCents, q.rubric])).toEqual([
      [0, "OPEN_ANSWER", 25, "Cita superclasse"],
      [1, "CODE", 25, null],
    ]);
    expect(snapshot.questions.every((q) => q.difficulty === null && q.points === null)).toBe(true);
    expect(snapshot.questions[1]!.testCases).toEqual([
      { position: 0, input: "1", expectedOutput: "2", visibility: "PUBLIC" },
      { position: 1, input: "2", expectedOutput: "4", visibility: "PRIVATE" },
    ]);
    expect(snapshot.questions.every((q) => q.sourceExerciseId === null)).toBe(true);
  });

  it("a cópia é independente do trabalho de origem", () => {
    const source = structuredClone(work);
    const snapshot = snapshotFromWork(source);
    source.questions[0]!.topicItemIds.push("t9");
    expect(snapshot.questions[1]!.topicItemIds).toEqual(["t1", "t2"]);
  });

  it("tópicos do snapshot com as posições das questões que os avaliam", () => {
    expect([...topicPositions(snapshotFromWork(work).questions)]).toEqual([
      ["t1", [0, 1]],
      ["t2", [1]],
    ]);
  });
});
