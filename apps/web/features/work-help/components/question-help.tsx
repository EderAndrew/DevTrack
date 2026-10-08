"use client";

import type { CodeHighlight } from "@repo/contracts";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { messageForError } from "@/lib/messages/error-messages";
import { useRequestHelp, useWorkHelp } from "../hooks/use-work-help";
import { ASK_HELP, HELP_EXHAUSTED, itemsOf } from "../schemas/work-help";
import { HelpCounter } from "./help-counter";
import { HelpDialog } from "./help-dialog";
import { HelpGuidance } from "./help-guidance";

/**
 * The AI help of one question (015 US3, contracts/web-ui.md "Pedir ajuda"): the counter of the work's
 * helps, "Pedir ajuda" while the student may still answer, and every request about this question with
 * its orientation, out-of-scope reply or unavailable message. Whether a help is used, pending or
 * refused comes from the API; the screen only shows it. A pending request is announced politely.
 */
export function QuestionHelp({
  activityId,
  questionId,
  highlight,
  canAsk,
  notice,
}: {
  activityId: string;
  questionId: string;
  highlight: CodeHighlight | undefined;
  /** The attempt is open: "Pedir ajuda" shows; otherwise only the orientations received. */
  canAsk: boolean;
  /** The controlled mode's message about the help field (a blocked paste). */
  notice?: ReactNode;
}) {
  const help = useWorkHelp(activityId, true);
  const request = useRequestHelp(activityId);
  const [open, setOpen] = useState(false);
  const state = help.data;
  if (!state || state.allowance === 0) return null;
  const items = itemsOf(state.items, questionId);
  if (!canAsk && items.length === 0) return null;
  const exhausted = state.used >= state.allowance;
  const counterId = `ajudas-${questionId}`;

  const send = (question: string) => {
    request.mutate(
      { questionId, question, idempotencyKey: crypto.randomUUID() },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <section aria-label="Ajuda da IA" className="flex flex-col gap-3">
      {canAsk ? (
        <div className="flex flex-wrap items-center gap-3">
          <HelpDialog
            trigger={
              <Button type="button" variant="outline" disabled={exhausted} aria-describedby={counterId} onClick={() => request.reset()}>
                {ASK_HELP}
              </Button>
            }
            open={open}
            onOpenChange={setOpen}
            questionId={questionId}
            pending={request.isPending}
            error={request.isError ? messageForError(request.error) : null}
            notice={notice}
            onSend={send}
          />
          <HelpCounter id={counterId} allowance={state.allowance} used={state.used} />
          {exhausted ? <p className="m-0 text-body-sm">{HELP_EXHAUSTED}</p> : null}
        </div>
      ) : null}
      <div aria-live="polite" className="flex flex-col gap-3">
        {items.map((item) => (
          <HelpGuidance key={item.id} item={item} highlight={highlight} waitExpired={help.waitExpired} />
        ))}
      </div>
    </section>
  );
}
