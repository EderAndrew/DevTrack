"use client";

import type { StudentPause } from "@repo/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatLongDateTime } from "@/lib/messages/dates";
import { useMyPause } from "../hooks/use-my-pause";
import { exitedAtLabel, PAUSE_REASON_LABELS, PAUSED_TEXT, PAUSED_TITLE, RESUME, RETURN_RELEASED } from "../schemas/attendance";

export interface PausedNoticeProps {
  activityId: string;
  /** The open pause the activity came with; the server sent no question nor answer (FR-013). */
  pause: StudentPause;
  deadline: string | null;
  /** "Retomar": reads the activity again (and, CONTROLLED, asks for fullscreen in the same click). */
  onResume: () => void;
  /** CONTROLLED: "Retomar em modo controlado" (research M10). */
  resumeLabel?: string;
}

/**
 * The paused attempt (016 US3-3, US3-5, contracts/web-ui.md): a full page in place of the questions,
 * announced as a polite `status`, with the reason, the time of the exit and the deadline as a
 * reminder. It polls the own pause every 5 s while visible; once the teacher released the return it
 * says so, stops polling and offers "Retomar". Nothing here decides the pause: the server does.
 */
export function PausedNotice({ activityId, pause, deadline, onResume, resumeLabel = RESUME }: PausedNoticeProps) {
  const poll = useMyPause(activityId, true, "notice");
  // Only what this notice read itself: an earlier pause's release never counts for this one.
  const released = poll.isFetchedAfterMount && poll.data?.pause === null;

  return (
    <section aria-labelledby="atividade-pausada" className="flex flex-col items-start gap-4">
      <div role="status" className="flex flex-col gap-3">
        <h2 id="atividade-pausada" className="m-0 text-h3">
          {PAUSED_TITLE}
        </h2>
        <p className="m-0 text-body">{PAUSED_TEXT}</p>
        <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
          <li>
            Motivo: {PAUSE_REASON_LABELS[pause.reason]}
            {pause.note ? <span className="whitespace-pre-wrap"> — {pause.note}</span> : null}
          </li>
          <li>{exitedAtLabel(pause.startedAt)}</li>
          {deadline ? <li>Prazo: {formatLongDateTime(deadline)}</li> : null}
        </ul>
        {released ? (
          <Alert variant="success" role={undefined}>
            <AlertTitle>{RETURN_RELEASED}</AlertTitle>
            <AlertDescription>Suas respostas salvas estão guardadas.</AlertDescription>
          </Alert>
        ) : null}
      </div>
      {released ? (
        <Button type="button" onClick={onResume}>
          {resumeLabel}
        </Button>
      ) : null}
    </section>
  );
}
