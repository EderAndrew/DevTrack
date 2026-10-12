import { describe, expect, it } from "vitest";
import { type CoverageQuestion, examCoverage } from "./coverage";

const topics = [
  { syllabusItemId: "heranca", title: "Herança" },
  { syllabusItemId: "polimorfismo", title: "Polimorfismo" },
  { syllabusItemId: "interfaces", title: "Interfaces" },
];
const questions: CoverageQuestion[] = [
  { valueCents: 334, difficulty: "BASIC", topicIds: ["heranca"] },
  { valueCents: 333, difficulty: "BASIC", topicIds: ["heranca", "polimorfismo"] },
  { valueCents: 333, difficulty: "ADVANCED", topicIds: ["polimorfismo"] },
];

describe("018/FR-008 cobertura da prova antes de aplicar (research T15)", () => {
  it("questões e pontos por tópico, na ordem da prova; um tópico sem questão aparece com zero", () => {
    expect(examCoverage(questions, topics, new Set(["heranca", "polimorfismo", "interfaces"])).byTopic).toEqual([
      { syllabusItemId: "heranca", title: "Herança", questions: 2, points: "6.67", outOfScope: false },
      { syllabusItemId: "polimorfismo", title: "Polimorfismo", questions: 2, points: "6.66", outOfScope: false },
      { syllabusItemId: "interfaces", title: "Interfaces", questions: 0, points: "0.00", outOfScope: false },
    ]);
  });

  it("questões e pontos por dificuldade, as três sempre presentes, somando exatamente a nota", () => {
    expect(examCoverage(questions, topics, null).byDifficulty).toEqual([
      { difficulty: "BASIC", questions: 2, points: "6.67" },
      { difficulty: "INTERMEDIATE", questions: 0, points: "0.00" },
      { difficulty: "ADVANCED", questions: 1, points: "3.33" },
    ]);
  });

  it("tópicos fora do escopo ensinado são sinalizados; sem planejamento, todos", () => {
    expect(examCoverage(questions, topics, new Set(["heranca"])).byTopic.map((topic) => topic.outOfScope)).toEqual([false, true, true]);
    expect(examCoverage(questions, topics, null).byTopic.every((topic) => topic.outOfScope)).toBe(true);
  });
});
