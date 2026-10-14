import type { ExamQuestionEdit, ExamRuleViolation, WorkWarning } from "@repo/contracts";
import { byPosition, workQuestionType } from "../works/types";
import { asWorkQuestionInput, type ExamQuestionRecord } from "./types";

/**
 * The rules of an exam's questions (018/FR-001, FR-002, FR-004): the 011 structure of each type,
 * through the work bank's pure type registry, and the approval's — every question with its answer
 * key, a difficulty and at least one topic. Each violation names the question's position, so the
 * editor points at it (`422 EXAM_RULES`, `details.violations`).
 */

/** The type's structural rules on inputs the contract already parsed, by position. */
export function examStructureViolations(questions: readonly ExamQuestionEdit[]): ExamRuleViolation[] {
  return questions.flatMap((question, position) => {
    const input = asWorkQuestionInput(question);
    return workQuestionType(input.type)
      .violations(input as never)
      .map((violation) => ({ position, field: violation.field, reason: violation.reason }));
  });
}

/** What approving inputs needs beyond their structure: a difficulty on every question. */
export function inputApprovalViolations(questions: readonly ExamQuestionEdit[]): ExamRuleViolation[] {
  return questions.flatMap((question, position) =>
    question.difficulty ? [] : [{ position, field: "difficulty", reason: "DIFFICULTY_MISSING" }],
  );
}

/** What approving the stored exam needs: each question's key, difficulty and topics (FR-004). */
export function approvalViolations(questions: readonly ExamQuestionRecord[]): ExamRuleViolation[] {
  return byPosition(questions).flatMap((question) => [
    ...(workQuestionType(question.type).answerKeyComplete(question) ? [] : [{ position: question.position, field: "answerKey", reason: "ANSWER_KEY_MISSING" }]),
    ...(question.difficulty ? [] : [{ position: question.position, field: "difficulty", reason: "DIFFICULTY_MISSING" }]),
    ...(question.topicItemIds.length > 0 ? [] : [{ position: question.position, field: "topicIds", reason: "TOPIC_MISSING" }]),
  ]);
}

/** The teacher-view warnings: code questions without test cases, by position (as 011 research W15). */
export function examWarnings(questions: readonly ExamQuestionRecord[]): WorkWarning[] {
  const positions = byPosition(questions)
    .filter((question) => workQuestionType(question.type).lacksTestCases(question))
    .map((question) => question.position);
  return positions.length > 0 ? [{ code: "CODE_QUESTION_WITHOUT_TEST_CASES", positions }] : [];
}
