"use client";

import type { ExamRuleViolation, ExamStatus, UpdateExamRequest } from "@repo/contracts";
import { Archive, ArchiveRestore, CheckCircle2, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Status, type StatusVariant } from "@/components/ui/status";
import { messageForError } from "@/lib/messages/error-messages";
import { examRuleViolations } from "../api/exams";
import { isExamVersionConflict, useExam, useExamActions } from "../hooks/use-exams";
import { approvalBlockers, EXAM_STATUS_LABELS, violationText } from "../schemas/exam-form";
import { questionCardId } from "./exam-form-ids";
import { ExamForm } from "./exam-form";

const STATUS_VARIANTS: Record<ExamStatus, StatusVariant> = { DRAFT: "warning", APPROVED: "success", ARCHIVED: "neutral" };

export const VERSION_CONFLICT_NOTICE = "Esta prova mudou em outra aba. Mostramos a versão atual; revise antes de continuar.";

export interface ExamDetailProps {
  examId: string;
  /** `provas.editar` (UX only; the API authorizes). */
  canEdit: boolean;
  /** `provas.aprovar`. */
  canApprove: boolean;
  /** `provas.arquivar`: "Arquivar" and "Restaurar". */
  canArchive: boolean;
}

/** The questions that block the approval, each a link to its card (018 contracts/web-ui.md, "Aprovar"). */
function Blockers({ violations, id }: { violations: ExamRuleViolation[]; id: string }) {
  return (
    <Alert variant="warning" id={id}>
      <AlertDescription>
        <p className="m-0 mb-2">Para aprovar, complete estas questões:</p>
        <ul className="m-0 pl-5">
          {violations.map((violation) => (
            <li key={`${violation.position}-${violation.field}`}>
              <a href={`#${questionCardId(violation.position)}`}>{violationText(violation)}</a>
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}

/**
 * One exam of the bank (018 contracts/web-ui.md, `/provas/[id]`): its status and origin in words, the
 * same form as the manual one loaded with it ("Salvar alterações" sends the whole exam with its
 * version), "Aprovar" listing the questions that block it (no difficulty, no topic; the server's
 * refusal too), "Arquivar" with a confirmation and "Restaurar". Another tab's change shows a notice
 * and the exam as it now is. An archived exam is read-only.
 */
export function ExamDetail({ examId, canEdit, canApprove, canArchive }: ExamDetailProps) {
  const query = useExam(examId);
  const actions = useExamActions(examId);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refused, setRefused] = useState<ExamRuleViolation[]>([]);

  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p role="status">Carregando a prova…</p>;
  const exam = query.data;
  const archived = exam.status === "ARCHIVED";
  const blockers = approvalBlockers(exam);

  const conflict = async () => {
    await actions.reload();
    setNotice(VERSION_CONFLICT_NOTICE);
  };

  const save = async (body: UpdateExamRequest) => {
    setNotice(null);
    setError(null);
    setRefused([]);
    try {
      await actions.update.mutateAsync(body);
      setNotice("Alterações salvas.");
    } catch (caught) {
      if (!isExamVersionConflict(caught)) throw caught;
      await conflict();
    }
  };

  /** Approve, archive or restore, each with the version read. */
  const run = async (action: (version: number) => Promise<unknown>, done: string) => {
    setNotice(null);
    setError(null);
    setRefused([]);
    try {
      await action(exam.version);
      setNotice(done);
    } catch (caught) {
      if (isExamVersionConflict(caught)) await conflict();
      else {
        setRefused(examRuleViolations(caught));
        setError(messageForError(caught));
      }
    }
  };

  return (
    <>
      {error ? (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      ) : null}
      {refused.length > 0 ? <Blockers violations={refused} id="prova-bloqueios-servidor" /> : null}
      <p role="status" className={notice ? "m-0 mb-4" : "sr-only"}>
        {notice ?? ""}
      </p>

      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Status variant={STATUS_VARIANTS[exam.status]}>{EXAM_STATUS_LABELS[exam.status]}</Status>
          {exam.origin === "AI_GENERATED" ? (
            <Badge variant="info">
              <Sparkles aria-hidden="true" />
              Gerada por IA
            </Badge>
          ) : null}
          {exam.humanEdited ? (
            <Badge variant="neutral">
              <Pencil aria-hidden="true" />
              Editada por você
            </Badge>
          ) : null}
        </div>
        {exam.reviewedBy && exam.reviewedAt ? (
          <p className="m-0 text-text-secondary">
            Aprovada por {exam.reviewedBy.name} em {new Date(exam.reviewedAt).toLocaleDateString("pt-BR")}
          </p>
        ) : null}
        {archived ? (
          <Alert variant="info">
            <AlertDescription>
              Prova arquivada: não pode ser editada nem aprovada.
              {exam.archivedFromStatus ? ` Ao restaurar, volta a ${EXAM_STATUS_LABELS[exam.archivedFromStatus].toLowerCase()}.` : ""}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canApprove && exam.status === "DRAFT" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button">
                  <CheckCircle2 aria-hidden="true" />
                  Aprovar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{blockers.length > 0 ? "A prova ainda não pode ser aprovada" : "Aprovar esta prova?"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {blockers.length > 0
                      ? "Toda questão precisa de gabarito, dificuldade e ao menos um tópico. Complete e salve as questões abaixo."
                      : "Aprova a versão salva: alterações não salvas no formulário ficam de fora. Só provas aprovadas podem ser aplicadas a uma turma."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {blockers.length > 0 ? <Blockers violations={blockers} id="prova-bloqueios" /> : null}
                <AlertDialogFooter>
                  <AlertDialogCancel>{blockers.length > 0 ? "Voltar à prova" : "Cancelar"}</AlertDialogCancel>
                  {blockers.length > 0 ? null : (
                    <AlertDialogAction onClick={() => void run(actions.approve.mutateAsync, "Prova aprovada.")}>Aprovar prova</AlertDialogAction>
                  )}
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          {canArchive && archived ? (
            <Button
              type="button"
              variant="secondary"
              aria-busy={actions.restore.isPending || undefined}
              onClick={() => void run(actions.restore.mutateAsync, "Prova restaurada.")}
            >
              <ArchiveRestore aria-hidden="true" />
              Restaurar
            </Button>
          ) : null}
          {canArchive && !archived ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="danger">
                  <Archive aria-hidden="true" />
                  Arquivar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Arquivar esta prova?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Ela sai da consulta do banco e não pode ser editada nem aprovada. As turmas que já receberam a prova não mudam. Você pode
                    restaurá-la depois, filtrando por arquivadas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction variant="danger" onClick={() => void run(actions.archive.mutateAsync, "Prova arquivada.")}>
                    Arquivar prova
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      {/* Keyed by version: a save, an approval or another tab's change loads the exam again. */}
      <ExamForm key={exam.version} edit={{ exam, onSave: save, readOnly: archived || !canEdit }} />
    </>
  );
}
