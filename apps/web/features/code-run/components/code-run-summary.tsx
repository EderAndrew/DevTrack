"use client";

import type { AttemptParticipant } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatLongDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useAttemptCodeRuns } from "../hooks/use-attempt-code-runs";
import { runSummary, VERDICT_LABELS } from "../schemas/code-run";
import {
  LAST_CASES_LABEL,
  LAST_COMPILATION_ERROR,
  LAST_FAILED,
  NO_RUNS,
  ranBy,
  RUN_PENDING,
  RUN_SUMMARY_NOTE,
  RUN_SUMMARY_TITLE,
  runCountText,
  runSummaryRegionLabel,
} from "../schemas/code-run-summary";
import { VERDICT_ICONS, VERDICT_VARIANTS } from "./code-run-result";

/**
 * "Execuções do aluno" under a CODE question of the review (021 contracts/web-ui.md): how many runs,
 * one in progress, and the last finished one in words — the public cases that passed and each verdict
 * with an icon, a compilation error or a run that could not happen — with the server's time. Facts
 * for the teacher, never a grade; no code, input or output exists in the answer to show. In a group
 * attempt (023/FR-021) the last run names the member who ran it.
 */
export function CodeRunSummary({
  classId,
  activityId,
  attemptId,
  questionId,
  position,
  participants = null,
}: {
  classId: string;
  activityId: string;
  attemptId: string;
  questionId: string;
  /** The question's 0-based position, naming the region. */
  position: number;
  /** A group attempt's participants (023); null for an individual attempt. */
  participants?: readonly AttemptParticipant[] | null;
}) {
  const query = useAttemptCodeRuns(classId, activityId, attemptId);
  const item = query.data?.questions.find(
    (question) => question.questionId === questionId,
  );
  const last = item?.lastFinished ?? null;
  return (
    <section
      aria-label={runSummaryRegionLabel(position)}
      className="flex flex-col gap-2"
    >
      <h4 className="m-0 text-body font-semibold">{RUN_SUMMARY_TITLE}</h4>
      {query.error ? (
        <p role="alert" className="m-0">
          {messageForError(query.error)}
        </p>
      ) : !query.data ? (
        <div aria-busy="true">
          <span className="sr-only">Carregando as execuções…</span>
          <Skeleton className="h-12 w-full" />
        </div>
      ) : !item || item.runCount === 0 ? (
        <p className="m-0">{NO_RUNS}</p>
      ) : (
        <>
          <p className="m-0">{runCountText(item.runCount)}</p>
          {last?.status === "FAILED" ? (
            <p className="m-0">{LAST_FAILED}</p>
          ) : null}
          {last?.outcome === "COMPILATION_ERROR" ? (
            <p className="m-0">{LAST_COMPILATION_ERROR}</p>
          ) : null}
          {last?.outcome === "EXECUTED" ? (
            <>
              <p className="m-0">
                Última execução:{" "}
                {runSummary(last.passedCount ?? 0, last.publicCaseCount)}
              </p>
              <ol
                aria-label={LAST_CASES_LABEL}
                className="m-0 flex list-none flex-col gap-1 p-0"
              >
                {last.cases.map((runCase) => {
                  const Icon = VERDICT_ICONS[runCase.verdict];
                  return (
                    <li
                      key={runCase.position}
                      className="flex items-center gap-2"
                    >
                      Caso {runCase.position + 1}:{" "}
                      <Badge variant={VERDICT_VARIANTS[runCase.verdict]}>
                        <Icon aria-hidden="true" />
                        {VERDICT_LABELS[runCase.verdict]}
                      </Badge>
                    </li>
                  );
                })}
              </ol>
            </>
          ) : null}
          {last ? (
            <p className="m-0 text-body-sm text-text-secondary">
              {formatLongDateTime(last.finishedAt)}
              {participants
                ? ` · ${ranBy(participants.find((person) => person.id === last.studentUserId)?.name ?? "Aluno")}`
                : null}
            </p>
          ) : null}
          {item.pending ? <p className="m-0">{RUN_PENDING}</p> : null}
        </>
      )}
      <p className="m-0 text-body-sm text-text-secondary">{RUN_SUMMARY_NOTE}</p>
    </section>
  );
}
