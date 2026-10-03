import type { Answer, ExerciseResult, WorkQuestionType } from "@repo/contracts";
import { NO_AUTOMATION_PORTS } from "../grading/grade-submission";
import { gradeQuestion } from "../../works/grading/registry";
import { isBlankAnswer } from "../status/answers";

/** What the results read of a snapshot question (the answer key stays on the server). */
export interface ResultQuestion {
  id: string;
  type: WorkQuestionType;
  starterCode: string | null;
  /** MULTIPLE_CHOICE: the correct alternative. */
  correctAlternativeId: string | null;
}

export interface QuestionResult {
  result: ExerciseResult;
  /** RULE_RESULT for a result decided at the conclusion; null while it waits or isn't scored. */
  nature: "RULE_RESULT" | null;
}

/**
 * The result of one exercise at a conclusion (013/FR-009, contracts/student-status.md, research K6):
 * a blank (012 FR-023 rule) is WRONG whatever the type; a multiple choice is CORRECT or WRONG by the
 * 011 `EXACT_MATCH` strategy, used only to compare the alternatives (a one-hundredth "value": no grade
 * comes out of it); an answered open answer or code waits for the teacher on the scoring row and is
 * UNSCORED ("Compare com o gabarito") on any other.
 */
export async function resultFor(question: ResultQuestion, answer: Answer | null, options: { scoring: boolean }): Promise<QuestionResult> {
  if (answer === null || isBlankAnswer(question, answer)) return { result: "WRONG", nature: "RULE_RESULT" };
  if (question.type === "MULTIPLE_CHOICE") {
    const grading = await gradeQuestion(
      { id: question.id, strategy: "EXACT_MATCH", valueCents: 1, correctAlternativeId: question.correctAlternativeId ?? "" },
      answer,
      NO_AUTOMATION_PORTS,
    );
    return { result: grading.finalCents === 1 ? "CORRECT" : "WRONG", nature: "RULE_RESULT" };
  }
  return options.scoring ? { result: "PENDING_TEACHER", nature: null } : { result: "UNSCORED", nature: null };
}

/** All or nothing (013/FR-010): the question's points only for a CORRECT scoring row (the CHECK of the table). */
export const pointsFor = (result: ExerciseResult, scoring: boolean, questionPoints: number): number =>
  scoring && result === "CORRECT" ? questionPoints : 0;
