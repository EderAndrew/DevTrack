"use client";

import type { WorkStatus, WorkTeacherView } from "@repo/contracts";
import { CheckCircle2, Eye, EyeOff, Pencil, Sparkles } from "lucide-react";
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
import {
  isWorkVersionConflict,
  useWork,
  useWorkActions,
} from "../hooks/use-works";
import { WORK_STATUS_LABELS } from "../schemas/work-form";
import { StudentPreview } from "./student-preview";
import { WorkForm } from "./work-form";

const STATUS_VARIANTS: Record<WorkStatus, StatusVariant> = {
  DRAFT: "warning",
  APPROVED: "success",
  ARCHIVED: "neutral",
};

export const VERSION_CONFLICT_NOTICE =
  "Este trabalho mudou em outra aba. Mostramos a versão atual; revise antes de continuar.";

export interface WorkDetailProps {
  workId: string;
  /** `trabalhos.editar` (UX only; the API authorizes). */
  canEdit: boolean;
  /** `trabalhos.aprovar`. */
  canApprove: boolean;
}

/** "Gerado por IA" and "Editado por você": words and an icon, never color alone. */
function WorkBadges({ work }: { work: WorkTeacherView }) {
  if (work.origin !== "AI_GENERATED" && !work.humanEdited) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {work.origin === "AI_GENERATED" ? (
        <Badge variant="info">
          <Sparkles aria-hidden="true" />
          Gerado por IA
        </Badge>
      ) : null}
      {work.humanEdited ? (
        <Badge variant="neutral">
          <Pencil aria-hidden="true" />
          Editado por você
        </Badge>
      ) : null}
    </div>
  );
}

/** The confirmation's text for the warnings the server computed (research W15). */
function warningText(work: WorkTeacherView): string | null {
  const positions = work.warnings.flatMap((warning) =>
    warning.code === "CODE_QUESTION_WITHOUT_TEST_CASES"
      ? warning.positions.map((position) => position + 1)
      : [],
  );
  if (positions.length === 0) return null;
  return positions.length === 1
    ? `A questão ${positions[0]} é de código sem casos de teste: ela não poderá ser corrigida automaticamente.`
    : `As questões ${positions.join(", ")} são de código sem casos de teste: elas não poderão ser corrigidas automaticamente.`;
}

/**
 * One work of the bank (011 contracts/web-ui.md, `/trabalhos/[id]`, US5): its status and origin in
 * words, the same form as the manual one loaded with it ("Salvar alterações" sends the whole work
 * with its version), "Aprovar" with a confirmation that lists the warnings, and "Ver como aluno".
 * Another tab's change shows a notice and the work as it now is. An archived work is read-only.
 */
export function WorkDetail({ workId, canEdit, canApprove }: WorkDetailProps) {
  const query = useWork(workId);
  const actions = useWorkActions(workId);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p role="status">Carregando o trabalho…</p>;
  const work = query.data;
  const archived = work.status === "ARCHIVED";

  const conflict = async () => {
    await actions.reload();
    setNotice(VERSION_CONFLICT_NOTICE);
  };

  const save = async (
    body: Parameters<typeof actions.update.mutateAsync>[0],
  ) => {
    setNotice(null);
    setError(null);
    try {
      await actions.update.mutateAsync(body);
      setNotice("Alterações salvas.");
    } catch (caught) {
      if (!isWorkVersionConflict(caught)) throw caught;
      await conflict();
    }
  };

  const approve = async () => {
    setNotice(null);
    setError(null);
    try {
      await actions.approve.mutateAsync(work.version);
      setNotice("Trabalho aprovado.");
    } catch (caught) {
      if (isWorkVersionConflict(caught)) await conflict();
      else setError(messageForError(caught));
    }
  };
  const warnings = warningText(work);

  return (
    <>
      {error ? (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      ) : null}
      <p role="status" className={notice ? "m-0 mb-4" : "sr-only"}>
        {notice ?? ""}
      </p>

      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Status variant={STATUS_VARIANTS[work.status]}>
            {WORK_STATUS_LABELS[work.status]}
          </Status>
          <WorkBadges work={work} />
        </div>
        {work.reviewedBy && work.reviewedAt ? (
          <p className="m-0 text-text-secondary">
            Revisado por {work.reviewedBy.name} em{" "}
            {new Date(work.reviewedAt).toLocaleDateString("pt-BR")}
          </p>
        ) : null}
        {archived ? (
          <Alert variant="info">
            <AlertDescription>
              Trabalho arquivado: não pode ser editado nem aprovado.
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {canApprove && work.status === "DRAFT" ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button">
                  <CheckCircle2 aria-hidden="true" />
                  Aprovar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Aprovar este trabalho?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Aprova a versão salva: alterações não salvas no formulário
                    ficam de fora. Só trabalhos aprovados ficam disponíveis para
                    uso.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {warnings ? (
                  <Alert variant="warning">
                    <AlertDescription>{warnings}</AlertDescription>
                  </Alert>
                ) : null}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void approve()}>
                    Aprovar trabalho
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            aria-expanded={preview}
            aria-controls="visao-aluno"
            onClick={() => setPreview((shown) => !shown)}
          >
            {preview ? (
              <EyeOff aria-hidden="true" />
            ) : (
              <Eye aria-hidden="true" />
            )}
            {preview ? "Ocultar visão do aluno" : "Ver como aluno"}
          </Button>
        </div>
      </div>

      <div id="visao-aluno" hidden={!preview} className="mb-6">
        {preview ? <StudentPreview workId={work.id} /> : null}
      </div>

      {/* Keyed by version: a save, an approval or another tab's change loads the work again. */}
      <WorkForm
        key={work.version}
        edit={{ work, onSave: save, readOnly: archived || !canEdit }}
      />
    </>
  );
}
