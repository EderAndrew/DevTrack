"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useSubjectDocuments } from "../hooks/use-syllabus-documents";
import { SyllabusStatusBadge } from "./syllabus-status";

/** Link to a version's page; from a class page, `?turma=` brings the teacher back to it (FR-006). */
export const syllabusDocumentHref = (subjectId: string, documentId: string, classId?: string) =>
  `/disciplinas/${subjectId}/ementa/${documentId}${classId ? `?turma=${classId}` : ""}`;

export interface SyllabusVersionsListProps {
  subjectId: string;
  /** Set when shown on a class page. */
  classId?: string;
}

/** Versions of a subject's syllabus, newest first, each with its processing status (004/US2). */
export function SyllabusVersionsList({ subjectId, classId }: SyllabusVersionsListProps) {
  const query = useSubjectDocuments(subjectId);

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando versões da ementa…</span>
        <Skeleton className="h-10 w-full" />
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
  if (query.data.items.length === 0) return <p>Nenhuma ementa enviada.</p>;

  return (
    <Table className="mb-4">
      <TableCaption className="sr-only">Versões da ementa</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Versão</TableHead>
          <TableHead scope="col">Arquivo</TableHead>
          <TableHead scope="col">Enviado em</TableHead>
          <TableHead scope="col">Situação</TableHead>
          <TableHead scope="col">Conteúdo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {query.data.items.map((document) => (
          <TableRow key={document.id}>
            <TableCell>{document.version}</TableCell>
            <TableCell>
              <Link href={syllabusDocumentHref(subjectId, document.id, classId)}>{document.originalFilename}</Link>
            </TableCell>
            <TableCell>{formatDateTime(document.uploadedAt)}</TableCell>
            <TableCell>
              <SyllabusStatusBadge status={document.processingStatus} />
            </TableCell>
            <TableCell>
              {document.confirmedRevision
                ? `Confirmado (revisão ${document.confirmedRevision.number})${document.confirmedRevision.source === "AI_ASSISTED" ? " — Preenchido com IA" : ""}`
                : "Não confirmado"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
