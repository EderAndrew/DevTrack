"use client";

import type { QuestionExecution } from "@repo/contracts";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { isPendingRun, retryAfterSecondsOf, useCodeRun } from "../hooks/use-code-run";
import {
  COMPARISON_RULE,
  COMPARISON_TITLE,
  CONVENTIONS,
  limitsText,
  NO_PUBLIC_CASES,
  OTHER_QUESTION,
  QUEUED,
  rateLimitedText,
  RUN_HINT,
  RUN_LABEL,
  RUNNER_UNAVAILABLE,
  RUNNING,
  RUNNING_LABEL,
} from "../schemas/code-run";
import { CodeRunResult } from "./code-run-result";

/**
 * "Executar" of an EXERCISE CODE question (019 US1, contracts/web-ui.md), below the editor: runs the
 * code in the editor against the question's public cases and shows the result per case. It never
 * saves, concludes or changes the answer (autosave goes on as in 012). Whether it can run comes from
 * `execution` (the API's view); a pending run is said in a `role="status"` region and the button
 * waits for it; a run of another question is never shown here.
 */
export function CodeRunPanel({
  activityId,
  questionId,
  execution,
  sourceCode,
  publicTestCases,
}: {
  activityId: string;
  questionId: string;
  execution: QuestionExecution | null;
  /** The code in the editor now: what "Executar" sends. */
  sourceCode: string;
  publicTestCases: readonly { input: string; expectedOutput: string }[];
}) {
  const available = execution?.status === "AVAILABLE";
  const runs = useCodeRun(activityId, questionId, available);
  if (!execution || execution.status === "NOT_SUPPORTED") return null;
  if (execution.status === "NO_PUBLIC_CASES") return <p className="m-0 text-body-sm text-text-secondary">{NO_PUBLIC_CASES}</p>;
  if (execution.status === "UNAVAILABLE") return <p className="m-0 text-body-sm text-text-secondary">{RUNNER_UNAVAILABLE}</p>;

  const hintId = `executar-${questionId}`;
  const retryAfter = retryAfterSecondsOf(runs.error);
  const statusText = runs.otherQuestion
    ? OTHER_QUESTION
    : isPendingRun(runs.run)
      ? runs.run?.status === "QUEUED"
        ? QUEUED
        : RUNNING
      : runs.error
        ? apiErrorCode(runs.error) === "RATE_LIMITED"
          ? rateLimitedText(retryAfter)
          : messageForError(runs.error)
        : "";

  return (
    <section aria-label="Executar o código" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          disabled={runs.pending}
          aria-busy={runs.pending || undefined}
          aria-describedby={hintId}
          onClick={() => {
            runs.reset();
            runs.execute(sourceCode);
          }}
        >
          <Play aria-hidden="true" />
          {runs.pending ? RUNNING_LABEL : RUN_LABEL}
        </Button>
        <p id={hintId} className="m-0 text-body-sm">
          {RUN_HINT}
        </p>
      </div>
      <p className="m-0 text-body-sm text-text-secondary">
        {execution.convention ? CONVENTIONS[execution.convention] : null} {execution.languageVersion ? `Versão: ${execution.languageVersion}.` : null}{" "}
        {execution.limits ? limitsText(execution.limits) : null}
      </p>
      <Collapsible>
        <CollapsibleTrigger className="text-body-sm underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
          {COMPARISON_TITLE}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <p className="m-0 mt-2 text-body-sm">{COMPARISON_RULE}</p>
        </CollapsibleContent>
      </Collapsible>
      <p role="status" className="m-0 text-body-sm">
        {statusText}
      </p>
      <div aria-live="polite">
        {runs.run && !isPendingRun(runs.run) ? (
          <CodeRunResult run={runs.run} publicTestCases={publicTestCases} sourceCode={sourceCode} />
        ) : null}
      </div>
    </section>
  );
}
