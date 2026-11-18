"use client";

import type { EnrollmentSource } from "@repo/contracts";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/messages/status-labels";
import { useCohortEnrollments } from "../hooks/use-cohort-enrollments";

/** How the student entered the turma (027/FR-034). */
export const SOURCE_LABELS: Record<EnrollmentSource, string> = { INVITATION: "Convite", DIRECT: "Inclusão direta" };

/**
 * "Alunos" of the MANAGER's turma page (027/FR-007): name, e-mail, enrollment and how it began, ordered by name, 20 at
 * a time. Names and e-mails are text. "Encerrar matrícula" joins with US5.
 */
export function CohortStudentsTab({ cohortId }: { cohortId: string }) {
  const enrollments = useCohortEnrollments(cohortId);
  const items = enrollments.data?.pages.flatMap((page) => page.items) ?? [];

  if (enrollments.isPending) {
    return (
      <div aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">Carregando alunos…</span>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (enrollments.isError && items.length === 0) {
    return (
      <div role="alert">
        <p>{messageForError(enrollments.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void enrollments.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (items.length === 0) return <p>Nenhum aluno na turma ainda.</p>;

  return (
    <div>
      <Table className="mb-4">
        <TableCaption className="sr-only">Alunos da turma</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Nome</TableHead>
            <TableHead scope="col">E-mail</TableHead>
            <TableHead scope="col">Matrícula</TableHead>
            <TableHead scope="col">Entrada</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.student.name}</TableCell>
              <TableCell>{item.student.email}</TableCell>
              <TableCell>{ENROLLMENT_STATUS_LABELS[item.status]}</TableCell>
              <TableCell>{SOURCE_LABELS[item.source]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {enrollments.hasNextPage ? (
        <Button
          type="button"
          aria-busy={enrollments.isFetchingNextPage || undefined}
          onClick={() => (enrollments.isFetchingNextPage ? undefined : void enrollments.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
