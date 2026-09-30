import { centsToGrade, type GradeCents } from "@repo/contracts";
import type { Tx } from "../../platform/database/transaction";
import { withValues } from "./grade/grade-values";
import { workQuestionContentRows } from "./rules/work-rules";
import type { AnyWorkQuestionInput } from "./types";

export interface WorkContent {
  workId: string;
  /** Null when the work has no topic. */
  revisionId: string | null;
  /** The work's topics, in selection order. */
  topicItemIds: readonly string[];
  totalCents: GradeCents;
  /** In position order; each already checked by the type's rules. */
  questions: readonly AnyWorkQuestionInput[];
  /** A generated work's questions (011 research W10): the proposal item each one comes from, by position. */
  generationItemIds?: readonly string[];
}

/**
 * The work's topics in selection order, then each question in array order (its position) with
 * its value (research W4), type columns, alternatives, test cases and topics. Shared by the manual
 * create and the materialization of a generated work; the deferred triggers check the whole
 * aggregate (counts, positions, the sum of the values) at commit.
 */
export async function writeWorkContent(tx: Tx, content: WorkContent): Promise<void> {
  const { workId, revisionId, topicItemIds } = content;
  if (revisionId !== null && topicItemIds.length > 0) {
    await tx.workTopic.createMany({
      data: topicItemIds.map((syllabusItemId, position) => ({ workId, syllabusItemId, syllabusRevisionId: revisionId, position })),
    });
  }
  for (const [position, question] of withValues(content.totalCents, content.questions).entries()) {
    const rows = workQuestionContentRows(question);
    await tx.workQuestion.create({
      data: {
        workId,
        position,
        type: question.type,
        gradingStrategy: rows.gradingStrategy,
        statement: rows.statement,
        statementSearchKey: rows.statementSearchKey,
        explanation: rows.explanation,
        value: centsToGrade(question.valueCents),
        ...rows.columns,
        generationItemId: content.generationItemIds?.[position] ?? null,
        alternatives: { create: rows.alternatives },
        testCases: { create: rows.testCases },
        topics: { create: (question.topicItemIds ?? []).map((syllabusItemId) => ({ syllabusItemId })) },
      },
    });
  }
}
