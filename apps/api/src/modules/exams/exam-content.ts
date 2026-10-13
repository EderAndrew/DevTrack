import { centsToGrade, type ExamQuestionEdit, type GradeCents } from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";
import { searchKey } from "../../platform/text/search-key";
import { withValues } from "../works/grade/grade-values";
import { workQuestionType } from "../works/types";
import { asWorkQuestionInput } from "./types";

export interface ExamContent {
  examId: string;
  revisionId: string;
  /** The exam's topics, in selection order. */
  topicItemIds: readonly string[];
  totalCents: GradeCents;
  /**
   * In position order; each already checked by the rules. A question with an `id` is an existing
   * one of the exam, cleared beforehand by `clearExamContent`; one without is new.
   */
  questions: readonly ExamQuestionEdit[];
  /** A generated exam's questions: the proposal item each one comes from, by position (US7). */
  generationItemIds?: readonly string[];
}

/**
 * The exam's topics in selection order, then each question in array order (its position) with its
 * value (the 011 rule, 018/FR-003), difficulty, type columns, alternatives, test cases and topics.
 * The only writer of an exam's content: the manual create, the edit (after `clearExamContent`) and
 * the materialization of a generated exam. The deferred triggers check the whole exam at commit.
 */
export async function writeExamContent(tx: Tx, content: ExamContent): Promise<void> {
  const { examId, revisionId } = content;
  await tx.examTopic.createMany({
    data: content.topicItemIds.map((syllabusItemId, position) => ({ examId, syllabusItemId, syllabusRevisionId: revisionId, position })),
  });
  for (const [position, question] of withValues(content.totalCents, content.questions).entries()) {
    const input = asWorkQuestionInput(question);
    const definition = workQuestionType(input.type);
    const data = {
      position,
      statement: question.statement,
      statementSearchKey: searchKey(question.statement),
      explanation: question.explanation ?? null,
      value: centsToGrade(question.valueCents),
      difficulty: question.difficulty ?? null,
      ...definition.columns(input as never),
      alternatives: { create: definition.alternatives(input as never) },
      testCases: { create: definition.testCases(input as never) },
      topics: { create: question.topicIds.map((syllabusItemId) => ({ syllabusItemId })) },
    };
    if (question.id) {
      // Kept: same id, type, grading strategy and generation item; everything else rewritten.
      await tx.examQuestion.update({ where: { id: question.id }, data });
    } else {
      await tx.examQuestion.create({
        data: {
          examId,
          type: question.type,
          gradingStrategy: definition.gradingStrategy,
          generationItemId: content.generationItemIds?.[position] ?? null,
          ...data,
        },
      });
    }
  }
}

/**
 * The first half of an edit: removes the questions left out, the rows the kept ones get again
 * (alternatives, test cases, topics) and the exam's topics — before the header may move to another
 * revision, which the topics' composite key follows.
 */
export async function clearExamContent(tx: Tx, examId: string, keptQuestionIds: readonly string[]): Promise<void> {
  const kept = [...keptQuestionIds];
  await tx.examQuestionTopic.deleteMany({ where: { examId } });
  await tx.examQuestion.deleteMany({ where: { examId, id: { notIn: kept } } });
  await tx.examQuestionAlternative.deleteMany({ where: { questionId: { in: kept } } });
  await tx.examQuestionTestCase.deleteMany({ where: { questionId: { in: kept } } });
  await tx.examTopic.deleteMany({ where: { examId } });
}
