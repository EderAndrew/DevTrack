"use client";

import { type ExamGenerationRequest, WorkQuestionTypeSchema } from "@repo/contracts";
import Link from "next/link";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Status, type StatusVariant } from "@/components/ui/status";
import { messageForError } from "@/lib/messages/error-messages";
import { useExamGenerationRequest } from "../hooks/use-exams";
import { DIFFICULTY_LABELS, formatGrade, QUESTION_TYPE_LABELS } from "../schemas/exam-form";

const STATUS: Record<ExamGenerationRequest["status"], { label: string; variant: StatusVariant }> = {
  PENDING: { label: "Gerando", variant: "info" },
  GENERATED: { label: "Rascunho pronto", variant: "success" },
  FAILED: { label: "Falhou", variant: "danger" },
  CANCELLED: { label: "Cancelado", variant: "neutral" },
};

const distributionText = (request: ExamGenerationRequest) =>
  WorkQuestionTypeSchema.options
    .filter((type) => request.distribution[type] > 0)
    .map((type) => `${QUESTION_TYPE_LABELS[type]} ${request.distribution[type]}`)
    .join(" · ");

/**
 * One "Criar prova com IA" request (018/US7): read again while it is being generated; once GENERATED it
 * opens the DRAFT exam, which only the teacher approves (018/FR-006). A refused or failed generation
 * saved nothing.
 */
export function ExamGenerationRequestDetail({ id }: { id: string }) {
  const query = useExamGenerationRequest(id);
  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p aria-busy="true">Carregando…</p>;
  const request = query.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-0 text-h3">{request.title}</h2>
        <Status variant={STATUS[request.status].variant}>{STATUS[request.status].label}</Status>
      </div>
      <div aria-live="polite">
        {request.status === "PENDING" ? (
          <Notice role="status">
            <p className="m-0">Gerando a prova…</p>
            <p className="m-0">Esta página se atualiza sozinha; a prova chega em rascunho para você revisar.</p>
          </Notice>
        ) : null}
        {request.status === "GENERATED" && request.examId ? (
          <Notice role="status">
            <p className="m-0">O rascunho está pronto. Revise, edite e aprove a prova antes de aplicá-la; a IA nunca aprova nem aplica.</p>
          </Notice>
        ) : null}
        {request.status === "FAILED" || request.status === "CANCELLED" ? (
          <Notice role="status">
            <p className="m-0">
              {request.status === "FAILED" ? "Não foi possível gerar a prova. Nada foi salvo." : "A geração foi cancelada. Nada foi salvo."}
            </p>
          </Notice>
        ) : null}
      </div>
      <dl className="m-0 grid gap-2">
        <div>
          <dt className="font-semibold">Disciplina</dt>
          <dd className="m-0">{request.subject.name}</dd>
        </div>
        <div>
          <dt className="font-semibold">Tópicos</dt>
          <dd className="m-0">{request.topics.map((topic) => topic.itemText).join(", ")}</dd>
        </div>
        <div>
          <dt className="font-semibold">Questões</dt>
          <dd className="m-0">{distributionText(request)}</dd>
        </div>
        <div>
          <dt className="font-semibold">Dificuldade, nota e pegadinhas</dt>
          <dd className="m-0">
            {DIFFICULTY_LABELS[request.difficulty]} · nota {formatGrade(request.totalGrade)} · até {request.trickCount}{" "}
            {request.trickCount === 1 ? "pegadinha" : "pegadinhas"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-2">
        {request.status === "GENERATED" && request.examId ? (
          <Button asChild>
            <Link href={`/provas/${request.examId}`}>Revisar rascunho</Link>
          </Button>
        ) : null}
        {request.status === "FAILED" || request.status === "CANCELLED" ? (
          <>
            <Button asChild>
              <Link href="/provas/gerar">Pedir de novo</Link>
            </Button>
            <Button asChild variant="ghost">
              <Link href="/provas/nova">Criar prova manualmente</Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
