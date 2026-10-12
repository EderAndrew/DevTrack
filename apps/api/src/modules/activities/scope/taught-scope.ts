import type { ScopeCheck } from "@repo/contracts";
import { type SnapshotQuestion, topicPositions } from "../snapshot/snapshot";

/**
 * The class's taught scope (constitution XXIII, research P5): the syllabus items linked to the
 * COMPLETED topics of its plan. `null` when the class has no plan.
 */
export type TaughtScope = ReadonlySet<string> | null;

/**
 * The topics of the snapshot outside the taught scope, with the positions of the questions that
 * assess them — flagged for the teacher to confirm, never removed (FR-005a). Without a plan nothing
 * is known to be taught, so every topic is flagged. Questions without a topic flag nothing.
 */
export function checkTaughtScope(
  questions: readonly SnapshotQuestion[],
  scope: TaughtScope,
  itemTitles: ReadonlyMap<string, string>,
): ScopeCheck {
  const outOfScope = [...topicPositions(questions)]
    .filter(([itemId]) => scope === null || !scope.has(itemId))
    .map(([syllabusItemId, questionPositions]) => ({
      syllabusItemId,
      title: itemTitles.get(syllabusItemId) ?? "",
      questionPositions,
    }));
  // The coverage per topic and difficulty is an EXAM's (018 research T15).
  return { hasPlan: scope !== null, outOfScope, coverage: null };
}
