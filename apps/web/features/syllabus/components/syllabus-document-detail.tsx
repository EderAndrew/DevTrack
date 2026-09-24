"use client";

import type { SyllabusExtraction } from "@repo/contracts";
import { Download } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/messages/dates";
import { ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { syllabusDocumentsApi } from "../api/syllabus-documents";
import { useSyllabusDocument } from "../hooks/use-syllabus-documents";
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
}

/**
 * One version of a subject's syllabus (004/US2): its data, processing status, "Baixar original"
 * (always a download, never shown inline — research E18), the image itself when it is one, and
 * the text the extractor read, as stored.
 */
export function SyllabusDocumentDetail({ subjectId, documentId, classId, canRetry }: SyllabusDocumentDetailProps) {
  const query = useSyllabusDocument(documentId);
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
        <SyllabusStatus documentId={document.id} subjectId={subjectId} canRetry={canRetry} />
        <div>
          <Button asChild variant="secondary">
            <a href={syllabusDocumentsApi.fileUrl(document.id)} download>
              <Download aria-hidden="true" />
              Baixar original
            </a>
          </Button>
        </div>
      </div>

      {image ? (
        <section aria-labelledby="imagem-titulo" className="mb-6">
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
  );
}

/** What extractor version 1 read, as stored (it is reviewed and confirmed in a revision, US3). */
function ExtractedText({ extraction }: { extraction: SyllabusExtraction }) {
  return (
    <section aria-labelledby="extraido-titulo">
      <h2 id="extraido-titulo">Texto extraído</h2>
      <dl className="grid grid-cols-1 gap-y-1">
        <dt className="font-semibold">Título</dt>
        <dd className="m-0 mb-3">{extraction.title ?? "Não encontrado"}</dd>
        <dt className="font-semibold">Ementa</dt>
        <dd className="m-0 mb-3 whitespace-pre-line">{extraction.syllabusText ?? "Não encontrada"}</dd>
        <dt className="font-semibold">Competência</dt>
        <dd className="m-0 mb-3 whitespace-pre-line">{extraction.competencyText ?? "Não encontrada"}</dd>
      </dl>
      <h3>Objetos de aprendizagem</h3>
      {extraction.groups.length === 0 ? (
        <p>Nenhum item encontrado.</p>
      ) : (
        <ol>
          {extraction.groups.map((group, index) => (
            <li key={index}>
              {group.title ?? "Sem título"}
              <ul>
                {group.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
