import type { ScopeCheck } from "@repo/contracts";
import type { Tx } from "../../../platform/database/transaction";
import type { SnapshotQuestion } from "../snapshot/snapshot";
import { checkTaughtScope, type TaughtScope } from "./taught-scope";

/**
 * The class's taught scope from its plan (research P5): the syllabus items linked to its COMPLETED
 * topics; `null` without a plan. Read in the caller's transaction, so the creation decides on the
 * plan as it is at that moment.
 */
export async function loadTaughtScope(tx: Tx, classId: string): Promise<TaughtScope> {
  const plan = await tx.classPlan.findUnique({
    where: { classId },
    select: { topics: { where: { status: "COMPLETED" }, select: { items: { select: { itemId: true } } } } },
  });
  if (!plan) return null;
  return new Set(plan.topics.flatMap((topic) => topic.items.map((item) => item.itemId)));
}

/** The scope check of these questions in this class, with the flagged items' texts (FR-005a). */
export async function scopeCheckOf(tx: Tx, classId: string, questions: readonly SnapshotQuestion[]): Promise<ScopeCheck> {
  const scope = await loadTaughtScope(tx, classId);
  const itemIds = [...new Set(questions.flatMap((question) => question.topicItemIds))];
  const items = await tx.syllabusItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, text: true } });
  return checkTaughtScope(questions, scope, new Map(items.map((item) => [item.id, item.text])));
}
