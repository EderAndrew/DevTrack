import { centsToGrade, type TeacherQuestion } from "@repo/contracts";
import type { ActivityQuestionRow } from "./rows";

/** The full snapshot question, with the answer key: teacher routes only (research P15). */
export function toTeacherQuestion(row: ActivityQuestionRow): TeacherQuestion {
  return {
    id: row.id,
    position: row.position,
    type: row.type,
    gradingStrategy: row.gradingStrategy,
    value: centsToGrade(row.valueCents),
    statement: row.statement,
    instructions: row.instructions,
    starterCode: row.starterCode,
    language: row.language,
    expectedAnswer: row.expectedAnswer,
    rubric: row.rubric,
    expectedSolution: row.expectedSolution,
    explanation: row.explanation,
    isTrickQuestion: row.isTrickQuestion,
    alternatives: [...row.alternatives].sort((a, b) => a.position - b.position),
    testCases: [...row.testCases].sort((a, b) => a.position - b.position),
    topics: row.topics,
  };
}
