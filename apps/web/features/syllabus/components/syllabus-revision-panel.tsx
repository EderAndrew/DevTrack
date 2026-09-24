"use client";

import type {
  CreateSyllabusRevisionRequest,
  SyllabusDocumentDetail,
  SyllabusRevisionSource,
  SyllabusRevisionView,
} from "@repo/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { isInProgress } from "../hooks/use-syllabus-documents";
import { useSyllabusRevision } from "../hooks/use-syllabus-revisions";
import { SyllabusContent } from "./syllabus-content";
import { SyllabusRevisionEditor } from "./syllabus-revision-editor";

const SOURCE_LABELS: Record<SyllabusRevisionSource, string> = {
  EXTRACTION: "A partir do texto extraído.",
  MANUAL: "Preenchido manualmente.",
  REVISION: "A partir de uma revisão confirmada.",
};

export interface SyllabusRevisionPanelProps {
  subjectId: string;
  document: SyllabusDocumentDetail;
  /** UX only (`ementas.revisar`): start, edit and confirm revisions. */
  canReview: boolean;
  creating: boolean;
  onCreate: (body: CreateSyllabusRevisionRequest) => void;
  onConfirmed: (revision: SyllabusRevisionView) => void;
}

/**
 * The reviewed content of a version (004/US3): the open draft in the editor, or else the latest
 * confirmed revision, read-only, with "Nova revisão"; with neither, "Revisar conteúdo" once the
 * text was read.
 */
export function SyllabusRevisionPanel({ subjectId, document, canReview, creating, onCreate, onConfirmed }: SyllabusRevisionPanelProps) {
  const shownId = document.draftRevisionId ?? document.confirmedRevision?.id ?? null;
  const query = useSyllabusRevision(shownId);

  if (shownId === null) {
    if (canReview && document.extractionResult === "TEXT") {
      return (
        <div>
          <p>Revise o texto extraído e confirme o conteúdo para usá-lo no planejamento.</p>
          <Button type="button" aria-busy={creating || undefined} onClick={() => !creating && onCreate({ source: "EXTRACTION" })}>
            Revisar conteúdo
          </Button>
        </div>
      );
    }
    if (isInProgress(document.processingStatus)) {
      return <p>O conteúdo poderá ser revisado quando o processamento terminar.</p>;
    }
    return <p>Nenhum conteúdo revisado.</p>;
  }

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando revisão…</span>
        <Skeleton className="h-40 w-full" />
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

  const revision = query.data;
  const content = {
    ...revision,
    groups: revision.groups.map((group) => ({ title: group.title, items: group.items.map((item) => item.text) })),
  };

  if (revision.status === "DRAFT") {
    return (
      <div>
        <p className="mt-0">
          <strong>Revisão {revision.number} — rascunho.</strong> {SOURCE_LABELS[revision.source]}
        </p>
        {canReview ? (
          <SyllabusRevisionEditor key={revision.id} subjectId={subjectId} revision={revision} onConfirmed={onConfirmed} />
        ) : (
          <SyllabusContent content={content} kind="revision" />
        )}
      </div>
    );
  }

  return (
    <div>
      <p className="mt-0">
        <strong>Conteúdo confirmado — revisão {revision.number}.</strong> {SOURCE_LABELS[revision.source]}
        {revision.confirmedAt ? ` Confirmado em ${formatDateTime(revision.confirmedAt)}.` : null}
      </p>
      <SyllabusContent content={content} kind="revision" />
      {canReview ? (
        <Button
          type="button"
          variant="secondary"
          aria-busy={creating || undefined}
          onClick={() => !creating && onCreate({ source: "REVISION", basedOnRevisionId: revision.id })}
        >
          Nova revisão
        </Button>
      ) : null}
    </div>
  );
}
