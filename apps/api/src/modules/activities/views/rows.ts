import type { GradeCents, TestCaseVisibility, WorkGradingStrategy, WorkQuestionType } from "@repo/contracts";

/** A snapshot question as the views read it (loaded by the services, grades in hundredths). */
export interface ActivityQuestionRow {
  id: string;
  position: number;
  type: WorkQuestionType;
  gradingStrategy: WorkGradingStrategy;
  valueCents: GradeCents;
  statement: string;
  instructions: string | null;
  starterCode: string | null;
  language: { id: string; name: string } | null;
  expectedAnswer: string | null;
  rubric: string | null;
  expectedSolution: string | null;
  explanation: string | null;
  isTrickQuestion: boolean;
  alternatives: { id: string; position: number; text: string; isCorrect: boolean }[];
  testCases: { position: number; input: string; expectedOutput: string; visibility: TestCaseVisibility }[];
  topics: { syllabusItemId: string; title: string }[];
}
