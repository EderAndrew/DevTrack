"use client";

import type { FeedbackStatus } from "@repo/contracts";
import { useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { isStatusConflict } from "../api/feedback-api";
import { useAdminFeedback, useChangeFeedbackStatus } from "../hooks/use-admin-feedbacks";
import { NO_HISTORY, NO_ORIGIN, STATUS_ACTIONS, STATUS_CONFLICT, STATUS_LABELS, statusChanged } from "../schemas/admin-feedback";
import { FeedbackCategoryBadge, FeedbackStatusBadge } from "./feedback-badges";

/**
 * One feedback for the ADMIN (020 US2, contracts/web-ui.md): the whole message as text (HTML and URLs
 * are not interpreted), the student's name and e-mail, the origin page, the time, "Mudar situação"
 * with only the transitions allowed from the current status (`canChange`), and the history oldest
 * first. A `409` means another ADMIN changed it first: the page refetches and says so.
 */
export function AdminFeedbackDetail({ id, canChange }: { id: string; canChange: boolean }) {
  const feedback = useAdminFeedback(id);
  const change = useChangeFeedbackStatus(id);
  const { toast } = useToast();
  const [conflict, setConflict] = useState(false);

  if (feedback.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando feedback…</span>
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (feedback.isError) {
    return (
      <div role="alert">
        <p>{messageForError(feedback.error)}</p>
      </div>
    );
  }

  const { data } = feedback;
  const moveTo = (to: Exclude<FeedbackStatus, "RECEIVED">) => {
    setConflict(false);
    change.mutate(
      { status: to },
      {
        onSuccess: (updated) => toast({ variant: "success", title: statusChanged(updated.status) }),
        onError: (error) => {
          if (!isStatusConflict(error)) return;
          setConflict(true);
          void feedback.refetch();
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <FeedbackCategoryBadge category={data.category} />
        <FeedbackStatusBadge status={data.status} />
      </div>

      <section aria-labelledby="feedback-mensagem">
        <h2 id="feedback-mensagem">Mensagem</h2>
        <p className="m-0 whitespace-pre-wrap break-words">{data.message}</p>
      </section>

      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt>Aluno</dt>
        <dd className="m-0">
          {data.student.name} · {data.student.email}
        </dd>
        <dt>Tela</dt>
        <dd className="m-0">{data.originPath ? <code className="break-all">{data.originPath}</code> : NO_ORIGIN}</dd>
        <dt>Enviado em</dt>
        <dd className="m-0">{formatDateTime(data.createdAt)}</dd>
      </dl>

      {canChange ? (
        <section aria-labelledby="feedback-mudar">
          <h2 id="feedback-mudar">Mudar situação</h2>
          <div className="flex flex-wrap gap-2">
            {STATUS_ACTIONS[data.status].map((action) => (
              <Button key={action.to} type="button" variant="secondary" disabled={change.isPending} onClick={() => moveTo(action.to)}>
                {action.label}
              </Button>
            ))}
          </div>
          {conflict ? (
            <Alert variant="warning" role="alert" className="mt-2">
              <AlertTitle>{STATUS_CONFLICT}</AlertTitle>
            </Alert>
          ) : change.isError ? (
            <Alert variant="danger" role="alert" className="mt-2">
              <AlertTitle>{messageForError(change.error)}</AlertTitle>
            </Alert>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="feedback-historico">
        <h2 id="feedback-historico">Histórico</h2>
        {data.history.length === 0 ? (
          <p className="m-0">{NO_HISTORY}</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-1 p-0">
            {data.history.map((entry) => (
              <li key={`${entry.changedAt}-${entry.toStatus}`}>
                {STATUS_LABELS[entry.fromStatus]} → {STATUS_LABELS[entry.toStatus]} · {entry.changedBy.name} · {formatDateTime(entry.changedAt)}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
