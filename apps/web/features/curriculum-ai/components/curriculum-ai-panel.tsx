"use client";

import type { AiExecutionStatus as AiExecutionStatusValue, AiExecutionView } from "@repo/contracts";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { AiErrorState, AiExecutionStatus, AiProcessingIndicator } from "@/components/shared/ai";
import { Notice } from "@/components/shared/notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  apiErrorCode,
  CURRICULUM_AI_AVAILABILITY_MESSAGES,
  CURRICULUM_AI_NOTHING_FOUND,
  CURRICULUM_AI_RATE_LIMITED,
  messageForError,
} from "@/lib/messages/error-messages";
import { useCurriculumAiStatus } from "../hooks/use-curriculum-ai-status";
import { useCancelCurriculumAnalysis, useRequestCurriculumAnalysis } from "../hooks/use-request-curriculum-analysis";

/** What the teacher reads at each stage of the analysis (007/FR-018, contracts/web-ui.md). */
export const CURRICULUM_AI_STAGE_TEXT: Record<AiExecutionStatusValue, string> = {
  QUEUED: "A análise está aguardando processamento.",
  RUNNING: "Analisando a ementa...",
  WAITING_TOOL: "Analisando a ementa...",
  VALIDATING_OUTPUT: "Validando as informações encontradas...",
  COMPLETED: "Proposta pronta para revisão.",
  FAILED: "Não foi possível analisar a ementa.",
  TIMED_OUT: "A análise excedeu o tempo permitido.",
  CANCELLED: "A análise foi cancelada.",
};

/** The analysis ended without a proposal: the teacher can try again or fill in by hand (007/US2-3). */
const ENDED_WITHOUT_PROPOSAL: readonly AiExecutionStatusValue[] = ["FAILED", "TIMED_OUT", "CANCELLED"];

/** Reasons the document's own status block already explains, with its own "Preencher manualmente". */
const DOCUMENT_REASONS = new Set(["DOCUMENT_NOT_READY", "DOCUMENT_WITHOUT_TEXT"]);

export interface CurriculumAiPanelProps {
  subjectId: string;
  documentId: string;
  /** The 004 manual fill, offered next to the AI while the page allows it (007/US2-1). */
  onFillManually?: () => void;
}

/**
 * "Preencher com IA" on a syllabus document (007/US1, contracts/web-ui.md): asks for an analysis,
 * follows it stage by stage and points to the proposal once it is ready. The page renders it only
 * with `ementas.revisar` and `ia.execucoes.visualizar` (UX only; the API decides). Nothing here
 * changes the syllabus: the proposal is reviewed and applied on its own page.
 */
export function CurriculumAiPanel({ subjectId, documentId, onFillManually }: CurriculumAiPanelProps) {
  const titleId = useId();
  const reasonId = useId();
  const status = useCurriculumAiStatus(documentId);
  const request = useRequestCurriculumAnalysis(documentId);

  const requestError = request.isError
    ? apiErrorCode(request.error) === "RATE_LIMITED"
      ? CURRICULUM_AI_RATE_LIMITED
      : messageForError(request.error)
    : "";

  let body;
  if (status.isPending) {
    body = (
      <div aria-busy="true">
        <span className="sr-only">Carregando…</span>
        <Skeleton className="h-10 w-48" />
      </div>
    );
  } else if (status.isError) {
    body = <p role="alert">{messageForError(status.error)}</p>;
  } else if (status.data.activeExecution) {
    body = <ActiveAnalysis documentId={documentId} execution={status.data.activeExecution} />;
  } else if (status.data.pendingProposalId) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="m-0">{CURRICULUM_AI_STAGE_TEXT.COMPLETED}</p>
        <Button asChild>
          <Link href={`/disciplinas/${subjectId}/ementa/${documentId}/proposta/${status.data.pendingProposalId}`}>Revisar proposta</Link>
        </Button>
      </div>
    );
  } else {
    const { availability, lastExecution, lastOutcome } = status.data;
    const reason = availability === "AVAILABLE" ? null : CURRICULUM_AI_AVAILABILITY_MESSAGES[availability];
    const failed = lastExecution && ENDED_WITHOUT_PROPOSAL.includes(lastExecution.status) ? lastExecution : null;
    const nothingFound = lastOutcome === "NOTHING_FOUND";
    const actions = (label: string) => (
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={reason !== null || request.isPending}
          aria-describedby={reason ? reasonId : undefined}
          onClick={() => {
            if (!request.isPending) request.mutate({});
          }}
        >
          {label}
        </Button>
        {onFillManually && !DOCUMENT_REASONS.has(availability) ? (
          <Button type="button" variant="secondary" onClick={onFillManually}>
            Preencher manualmente
          </Button>
        ) : null}
      </div>
    );
    body = (
      <div className="flex flex-col items-start gap-2">
        {failed ? (
          <>
            <p className="m-0 font-semibold">{CURRICULUM_AI_STAGE_TEXT[failed.status]}</p>
            <AiErrorState code={failed.errorCode ?? "AI_PROVIDER_ERROR"} className="mb-0" />
            {actions("Tentar novamente")}
          </>
        ) : nothingFound ? (
          <>
            <Notice className="mb-0">{CURRICULUM_AI_NOTHING_FOUND}</Notice>
            {actions("Tentar novamente")}
          </>
        ) : (
          <>
            <p className="m-0">A IA irá analisar o documento e sugerir o preenchimento. Revise as informações antes de aplicá-las.</p>
            <p className="m-0 text-body-sm text-text-secondary">O conteúdo do documento será enviado a um provedor de IA externo.</p>
            {actions("Preencher com IA")}
          </>
        )}
        {reason ? (
          <p id={reasonId} className="m-0 text-body-sm text-text-secondary">
            {reason}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section aria-labelledby={titleId} className="rounded-md border p-4">
      <h2 id={titleId} className="mt-0 flex items-center gap-2">
        <Sparkles aria-hidden="true" className="size-5 text-primary" />
        Preencher com IA
      </h2>
      {body}
      {requestError ? (
        <p role="alert" className="mb-0 font-semibold text-danger-text">
          {requestError}
        </p>
      ) : null}
    </section>
  );
}

/** The stage in words, and "Cancelar análise" behind a confirmation (007/FR-019). */
function ActiveAnalysis({ documentId, execution }: { documentId: string; execution: AiExecutionView }) {
  const cancel = useCancelCurriculumAnalysis(documentId);
  return (
    <div className="flex flex-col items-start gap-2">
      <AiExecutionStatus status={execution.status} cancelRequested={execution.cancelRequested} />
      <AiProcessingIndicator label={CURRICULUM_AI_STAGE_TEXT[execution.status]} />
      {execution.cancelRequested ? null : (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="secondary" disabled={cancel.isPending}>
              Cancelar análise
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar a análise?</AlertDialogTitle>
              <AlertDialogDescription>A análise será interrompida e nada será alterado na ementa.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar análise</AlertDialogCancel>
              <AlertDialogAction variant="danger" onClick={() => cancel.mutate(execution.id)}>
                Cancelar análise
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {cancel.isError ? (
        <p role="alert" className="m-0 font-semibold text-danger-text">
          {messageForError(cancel.error)}
        </p>
      ) : null}
    </div>
  );
}
