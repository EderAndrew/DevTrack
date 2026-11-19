"use client";

import type { CohortEnrollmentView, EnrollmentSource } from "@repo/contracts";
import { useState } from "react";
import { ErrorSummary, type FormError } from "@/components/shared";
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
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/messages/status-labels";
import { useCohortEnrollments, useRemoveEnrollment } from "../hooks/use-cohort-enrollments";

/** How the student entered the turma (027/FR-034). */
export const SOURCE_LABELS: Record<EnrollmentSource, string> = { INVITATION: "Convite", DIRECT: "Inclusão direta" };

export interface CohortStudentsTabProps {
  cohortId: string;
  /** UX only (the API authorizes): "Encerrar matrícula" on the active students (027/US5). */
  canRemove?: boolean;
}

/**
 * "Alunos" of the MANAGER's turma page (027/FR-007): name, e-mail, enrollment and how it began, ordered by name, 20 at
 * a time. Names and e-mails are text. "Encerrar matrícula" (US5, FR-014) asks for a confirmation; the enrollment ends
 * in every disciplina of the turma, is kept as ended, and the list and the turma's count are refreshed.
 */
export function CohortStudentsTab({ cohortId, canRemove = false }: CohortStudentsTabProps) {
  const enrollments = useCohortEnrollments(cohortId);
  const remove = useRemoveEnrollment(cohortId);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const items = enrollments.data?.pages.flatMap((page) => page.items) ?? [];

  const removeStudent = async (item: CohortEnrollmentView) => {
    if (remove.isPending) return;
    setActionErrors([]);
    setAnnouncement("");
    try {
      await remove.mutateAsync(item.id);
      setAnnouncement(`Matrícula de ${item.student.name} encerrada.`);
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    }
  };

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

  return (
    <div>
      <p role="status" className="m-0 font-semibold">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível encerrar a matrícula" />
      {items.length === 0 ? (
        <p>Nenhum aluno na turma ainda.</p>
      ) : (
        <Table className="mb-4">
          <TableCaption className="sr-only">Alunos da turma</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Matrícula</TableHead>
              <TableHead scope="col">Entrada</TableHead>
              {canRemove ? <TableHead scope="col">Ações</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.student.name}</TableCell>
                <TableCell>{item.student.email}</TableCell>
                <TableCell>{ENROLLMENT_STATUS_LABELS[item.status]}</TableCell>
                <TableCell>{SOURCE_LABELS[item.source]}</TableCell>
                {canRemove ? (
                  <TableCell>
                    {item.status === "ACTIVE" ? <RemoveEnrollment enrollment={item} onConfirm={() => void removeStudent(item)} /> : null}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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

/** "Encerrar matrícula" with a confirmation (027/FR-014); the dialog returns focus to its button. */
function RemoveEnrollment({ enrollment, onConfirm }: { enrollment: CohortEnrollmentView; onConfirm: () => void }) {
  const name = enrollment.student.name;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="danger" aria-label={`Encerrar matrícula de ${name}`}>
          Encerrar matrícula
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Encerrar a matrícula de {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            O aluno deixa de ver todas as disciplinas desta turma. As entregas e as notas que ele já tem continuam com os
            professores. Para trazê-lo de volta, convide ou inclua o aluno de novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm}>
            Encerrar matrícula
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
