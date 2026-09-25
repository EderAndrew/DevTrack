"use client";

import type { AiExecutionStatus as ExecutionStatus, AiProposalStatus as ProposalStatus } from "@repo/contracts";
import { useState } from "react";
import {
  AiErrorState,
  AiExecutionStatus,
  AiProcessingIndicator,
  AiProposalReview,
  AiProposalStatus,
  type AiProposalReviewItem,
} from "@/components/shared/ai";
import { Sample, Showcase } from "./sample";

const EXECUTION: [string, ExecutionStatus][] = [
  ["Na fila", "QUEUED"],
  ["Processando", "RUNNING"],
  ["Concluída", "COMPLETED"],
  ["Falhou", "FAILED"],
  ["Cancelada", "CANCELLED"],
  ["Tempo esgotado", "TIMED_OUT"],
];

export const AI_EXECUTION_VARIANTS = EXECUTION.map(([name]) => name);

export function AiExecutionStatusShowcase() {
  return (
    <Showcase id="ai-execution-status">
      {EXECUTION.map(([name, status]) => (
        <Sample key={status} name={name}>
          <AiExecutionStatus status={status} />
        </Sample>
      ))}
      <Sample name="cancelando">
        <AiExecutionStatus status="RUNNING" cancelRequested />
      </Sample>
    </Showcase>
  );
}

const PROPOSAL: [string, ProposalStatus][] = [
  ["Pronta para revisão", "READY_FOR_REVIEW"],
  ["Aprovada", "APPROVED"],
  ["Aprovada em parte", "PARTIALLY_APPROVED"],
  ["Rejeitada", "REJECTED"],
  ["Expirada", "EXPIRED"],
];

export const AI_PROPOSAL_VARIANTS = PROPOSAL.map(([name]) => name);

export function AiProposalStatusShowcase() {
  return (
    <Showcase id="ai-proposal-status">
      {PROPOSAL.map(([name, status]) => (
        <Sample key={status} name={name}>
          <AiProposalStatus status={status} />
        </Sample>
      ))}
    </Showcase>
  );
}

export function AiProcessingIndicatorShowcase() {
  return (
    <Showcase id="ai-processing-indicator">
      <Sample name="padrão">
        <AiProcessingIndicator />
      </Sample>
      <Sample name="texto próprio">
        <AiProcessingIndicator label="Lendo a ementa…" />
      </Sample>
    </Showcase>
  );
}

export function AiErrorStateShowcase() {
  return (
    <Showcase id="ai-error-state">
      <Sample name="sem nova tentativa" className="block">
        <AiErrorState code="AI_OUTPUT_VALIDATION_FAILED" />
      </Sample>
      <Sample name="com Tentar de novo" className="block">
        <AiErrorState code="AI_TIMEOUT" onRetry={() => undefined} />
      </Sample>
    </Showcase>
  );
}

const ITEMS: AiProposalReviewItem[] = [
  { id: "t1", label: "Introdução à orientação a objetos", description: "Classes, objetos e mensagens." },
  { id: "t2", label: "Herança e polimorfismo" },
  { id: "t3", label: "Interfaces e classes abstratas" },
];

const DECIDED: Record<"APPROVE" | "APPROVE_PARTIALLY" | "REJECT", ProposalStatus> = {
  APPROVE: "APPROVED",
  APPROVE_PARTIALLY: "PARTIALLY_APPROVED",
  REJECT: "REJECTED",
};

/** Fixed sample data; deciding only changes the sample's own status. */
function ReviewSample() {
  const [status, setStatus] = useState<ProposalStatus>("READY_FOR_REVIEW");
  return <AiProposalReview items={ITEMS} status={status} onDecide={(decision) => setStatus(DECIDED[decision])} />;
}

export function AiProposalReviewShowcase() {
  return (
    <Showcase id="ai-proposal-review">
      <Sample name="em revisão" className="block">
        <ReviewSample />
      </Sample>
      <Sample name="enviando" className="block">
        <AiProposalReview items={ITEMS} status="READY_FOR_REVIEW" onDecide={() => undefined} pending />
      </Sample>
      <Sample name="decidida" className="block">
        <AiProposalReview items={ITEMS} status="PARTIALLY_APPROVED" onDecide={() => undefined} />
      </Sample>
    </Showcase>
  );
}
