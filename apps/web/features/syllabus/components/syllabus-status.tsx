"use client";

import type { SyllabusProcessingStatus } from "@repo/contracts";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { SYLLABUS_FAILURE_LABELS, SYLLABUS_PROCESSING_STATUS_LABELS } from "@/lib/messages/status-labels";
import { useRetrySyllabus, useSyllabusDocument } from "../hooks/use-syllabus-documents";

/** Processing status as a badge; the text carries the meaning, the color only repeats it. */
export function SyllabusStatusBadge({ status }: { status: SyllabusProcessingStatus }) {
  const variant = status === "FAILED" ? "destructive" : status === "PROCESSED" ? "default" : "secondary";
  return <Badge variant={variant}>{SYLLABUS_PROCESSING_STATUS_LABELS[status]}</Badge>;
}

export interface SyllabusStatusProps {
  documentId: string;
  subjectId: string;
  /** UX only (`ementas.enviar`): "Tentar novamente" after a failure. */
  canRetry: boolean;
  /** "Preencher manualmente" (the manual review of US3), when the page offers it. */
  onFillManually?: () => void;
}

/**
 * Where the processing of a version stands (004/FR-014 – FR-016, research E17). The status sits in
 * an `aria-live="polite"` region and is fetched again every 2 s while the file is waiting or being
 * read; a failure offers "Tentar novamente" and "Preencher manualmente".
 */
export function SyllabusStatus({ documentId, subjectId, canRetry, onFillManually }: SyllabusStatusProps) {
  const query = useSyllabusDocument(documentId);
  const retry = useRetrySyllabus(subjectId);
  const [retryError, setRetryError] = useState("");

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando situação…</span>
        <Skeleton className="h-6 w-32" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div role="alert">
        <p>{messageForError(query.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  const document = query.data;
  const failed = document.processingStatus === "FAILED";
  const noText = document.processingStatus === "PROCESSED" && document.extractionResult === "NO_TEXT";
  const fillManually = onFillManually ? (
    <Button type="button" variant="secondary" onClick={onFillManually}>
      Preencher manualmente
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-3">
      <p aria-live="polite" className="m-0 flex items-center gap-2">
        <span>Situação:</span>
        <SyllabusStatusBadge status={document.processingStatus} />
      </p>
      {failed ? (
        <div className="flex flex-col gap-2">
          <p className="m-0">
            O processamento falhou: {SYLLABUS_FAILURE_LABELS[document.failureCategory ?? "INTERNAL"]}.
          </p>
          {retryError ? (
            <p role="alert" className="m-0 font-semibold text-destructive">
              {retryError}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {canRetry ? (
              <Button
                type="button"
                aria-busy={retry.isPending || undefined}
                onClick={() => {
                  if (retry.isPending) return;
                  setRetryError("");
                  retry.mutate(document.id, { onError: (error) => setRetryError(messageForError(error)) });
                }}
              >
                <RotateCw aria-hidden="true" />
                Tentar novamente
              </Button>
            ) : null}
            {fillManually}
          </div>
        </div>
      ) : null}
      {noText ? (
        <div className="flex flex-col gap-2">
          <p className="m-0">{ERROR_MESSAGES.EXTRACTION_UNAVAILABLE}</p>
          {fillManually ? <div>{fillManually}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
