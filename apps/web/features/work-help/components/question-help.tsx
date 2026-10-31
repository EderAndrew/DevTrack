"use client";

import type { CodeHighlight } from "@repo/contracts";
import { useWorkHelp } from "../hooks/use-work-help";
import { itemsOf } from "../schemas/work-help";
import { HelpGuidance } from "./help-guidance";

/**
 * The AI help a submitted attempt received on one question (015/FR-022): every request with its orientation,
 * out-of-scope reply or unavailable message, under the question. While the attempt is open the help is `HelpChat`.
 */
export function QuestionHelp({
  activityId,
  questionId,
  highlight,
}: {
  activityId: string;
  questionId: string;
  highlight: CodeHighlight | undefined;
}) {
  const help = useWorkHelp(activityId, true);
  const state = help.data;
  if (!state || state.allowance === 0) return null;
  const items = itemsOf(state.items, questionId);
  if (items.length === 0) return null;
  return (
    <section aria-label="Ajuda da IA" className="flex flex-col gap-3">
      {items.map((item) => (
        <HelpGuidance key={item.id} item={item} highlight={highlight} waitExpired={help.waitExpired} />
      ))}
    </section>
  );
}
