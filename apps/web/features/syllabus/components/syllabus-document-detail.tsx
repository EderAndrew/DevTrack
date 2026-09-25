"use client";

import type { CreateSyllabusRevisionRequest, SyllabusExtraction } from "@repo/contracts";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SyllabusForClassDialog } from "@/features/class-plan/components/syllabus-for-class-dialog";
import { formatDateTime } from "@/lib/messages/dates";
import { ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { syllabusDocumentsApi } from "../api/syllabus-documents";
import { useSyllabusDocument } from "../hooks/use-syllabus-documents";
import { useCreateSyllabusRevision } from "../hooks/use-syllabus-revisions";
import { SyllabusContent } from "./syllabus-content";
import { SyllabusRevisionPanel } from "./syllabus-revision-panel";
import { SyllabusStatus } from "./syllabus-status";

const MEDIA_TYPE_LABELS = { PDF: "PDF", DOCX: "DOCX", PNG: "PNG", JPEG: "JPG" } as const;

const sizeFormat = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
/** "812 bytes", "2,9 KB", "9,8 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${sizeFormat.format(bytes / 1024)} KB`;
  return `${sizeFormat.format(bytes / (1024 * 1024))} MB`;
}

export interface SyllabusDocumentDetailProps {
  subjectId: string;
  documentId: string;
  /** Came from a class page (`?turma=`): the way back goes to its Ementa section. */
  classId?: string;
  /** UX only (`ementas.enviar`): "Tentar novamente". */
  canRetry: boolean;
  /** UX only (`ementas.revisar`): "Revisar conteúdo", "Preencher manualmente", the editor, "Nova revisão". */
  canReview: boolean;
}

/**
 * One version of a subject's syllabus (004/US2, US3): its data, processing status, "Baixar
 * original" (always a download, never shown inline — research E18) and, side by side, what was
 * read (the image itself, or the text the extractor read, as stored) and the reviewed content.
 */
export function SyllabusDocumentDetail({ subjectId, documentId, classId, canRetry, canReview }: SyllabusDocumentDetailProps) {
  const query = useSyllabusDocument(documentId);
  const create = useCreateSyllabusRevision(subjectId, documentId);
  const [createError, setCreateError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  /** The revision confirmed on this page, offered to the class the teacher came from (FR-006). */
  const [confirmedId, setConfirmedId] = useState<string | null>(null);
  const back = classId ? (
    <Link href={`/turmas/${classId}/ementa`}>Voltar para a turma</Link>
  ) : (
    <Link href={`/disciplinas/${subjectId}`}>Voltar para a disciplina</Link>
  );

  if (query.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando ementa…</span>
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (query.isError || query.data.subjectId !== subjectId) {
    return (
      <div role="alert">
        <p>{query.isError ? messageForError(query.error) : ERROR_MESSAGES.NOT_FOUND}</p>
        <p>{back}</p>
      </div>
    );
  }

  const document = query.data;
  const image = document.mediaType === "PNG" || document.mediaType === "JPEG";
  const startRevision = (body: CreateSyllabusRevisionRequest) => {
    setCreateError("");
    setAnnouncement("");
    create.mutate(body, { onError: (error) => setCreateError(messageForError(error)) });
  };
  // "Preencher manualmente" while there is no reviewed content yet (FR-022); afterwards the panel
  // offers the draft or "Nova revisão".
  const fillManually =
    canReview && !document.draftRevisionId && !document.confirmedRevision
      ? () => !create.isPending && startRevision({ source: "MANUAL" })
      : undefined;

  return (
    <div>
      <p className="mt-0">{back}</p>
      <h1>Ementa — versão {document.version}</h1>
      <dl className="mb-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
        <dt className="font-semibold">Arquivo</dt>
        <dd className="m-0 break-all">{document.originalFilename}</dd>
        <dt className="font-semibold">Tipo</dt>
        <dd className="m-0">
          {MEDIA_TYPE_LABELS[document.mediaType]}
          {document.pageCount ? `, ${document.pageCount} página${document.pageCount > 1 ? "s" : ""}` : ""}
        </dd>
        <dt className="font-semibold">Tamanho</dt>
        <dd className="m-0">{formatFileSize(document.sizeBytes)}</dd>
        <dt className="font-semibold">Enviado em</dt>
        <dd className="m-0">{formatDateTime(document.uploadedAt)}</dd>
      </dl>
      <div className="mb-6 flex flex-col gap-4">
        <SyllabusStatus documentId={document.id} subjectId={subjectId} canRetry={canRetry} onFillManually={fillManually} />
        <div>
          <Button asChild variant="secondary">
            <a href={syllabusDocumentsApi.fileUrl(document.id)} download>
              <Download aria-hidden="true" />
              Baixar original
            </a>
          </Button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          {image ? (
            <section aria-labelledby="imagem-titulo">
              <h2 id="imagem-titulo">Imagem enviada</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- bytes from the API, sandboxed (E18) */}
              <img
                src={syllabusDocumentsApi.fileUrl(document.id, true)}
                alt={`Ementa enviada: ${document.originalFilename}`}
                className="max-h-[32rem] max-w-full rounded-md border"
              />
            </section>
          ) : null}
          {document.extraction ? <ExtractedText extraction={document.extraction} /> : null}
        </div>
        <section aria-labelledby="revisao-conteudo-titulo">
          <h2 id="revisao-conteudo-titulo">Conteúdo revisado</h2>
          {createError ? (
            <p role="alert" className="font-semibold text-danger-text">
              {createError}
            </p>
          ) : null}
          <SyllabusRevisionPanel
            subjectId={subjectId}
            document={document}
            canReview={canReview}
            creating={create.isPending}
            onCreate={startRevision}
            onConfirmed={(revision) => {
              setAnnouncement("Conteúdo confirmado.");
              setConfirmedId(revision.id);
            }}
          />
          {classId && confirmedId ? <SyllabusForClassDialog classId={classId} revisionId={confirmedId} /> : null}
        </section>
      </div>
    </div>
  );
}

/** What extractor version 1 read, as stored (it is reviewed and confirmed in a revision, US3). */
function ExtractedText({ extraction }: { extraction: SyllabusExtraction }) {
  return (
    <section aria-labelledby="extraido-titulo">
      <h2 id="extraido-titulo">Texto extraído</h2>
      <SyllabusContent content={extraction} kind="extraction" />
    </section>
  );
}
