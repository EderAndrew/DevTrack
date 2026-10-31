import type { CodeHighlight, StudentHelpItem } from "@repo/contracts";
import { CodeBlock } from "@/components/ui/code/code-block";
import { Spinner } from "@/components/ui/spinner";
import { HELP_EXAMPLE_LABEL, HELP_NONE_USED, HELP_NOT_USED, HELP_PREPARING, HELP_REPLY_LABEL, HELP_UNAVAILABLE, questionLabel, remainingMessage } from "../schemas/work-help";

/**
 * One exchange of the help chat (015 amendment 2026-10-31): the student's question and the reply, which ends with
 * the helps left. That last line is this screen's fixed text, never the model's. Text and example never as HTML.
 */
export function HelpChatMessage({
  item,
  position,
  highlight,
  remaining,
  waitExpired,
}: {
  item: StudentHelpItem;
  position: number | null;
  highlight: CodeHighlight | undefined;
  /** The helps left once this reply arrived. */
  remaining: number;
  waitExpired: boolean;
}) {
  const waiting = item.status === "REQUESTED" && !waitExpired;
  return (
    <li className="flex flex-col gap-2">
      <div className="ml-auto flex max-w-5/6 flex-col gap-1 rounded-lg bg-primary-subtle p-3">
        {position !== null ? <span className="text-body-sm text-text-secondary">{questionLabel(position)}</span> : null}
        <p className="m-0 text-body-sm whitespace-pre-wrap">{item.question}</p>
      </div>
      {waiting ? (
        <Spinner label={HELP_PREPARING} showLabel />
      ) : (
        <div className="flex max-w-5/6 flex-col gap-2 rounded-lg bg-info-surface p-3">
          <span className="text-body-sm font-semibold">{HELP_REPLY_LABEL}</span>
          {item.status === "DELIVERED" || item.status === "OUT_OF_SCOPE" ? (
            <p className="m-0 text-reading whitespace-pre-wrap">{item.message}</p>
          ) : (
            <p className="m-0 text-reading">{HELP_UNAVAILABLE}</p>
          )}
          {item.status === "DELIVERED" && item.example ? <CodeBlock code={item.example.code} highlight={highlight} label={HELP_EXAMPLE_LABEL} /> : null}
          {item.status === "OUT_OF_SCOPE" ? <p className="m-0 text-body-sm">{HELP_NOT_USED}</p> : null}
          {item.status !== "DELIVERED" && item.status !== "OUT_OF_SCOPE" ? <p className="m-0 text-body-sm">{HELP_NONE_USED}</p> : null}
          <p className="m-0 text-body-sm font-semibold">{remainingMessage(remaining)}</p>
        </div>
      )}
    </li>
  );
}
