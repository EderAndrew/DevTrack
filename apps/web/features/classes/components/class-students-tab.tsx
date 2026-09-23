"use client";

import type { EnrollmentStatus, EnrollmentView } from "@repo/contracts";
import { EnrollmentStatusSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/messages/status-labels";
import { type EnrollmentFilters, useEnrollments, useRemoveEnrollment } from "../hooks/use-enrollments";
import {
  DEFAULT_ENROLLMENT_FILTERS,
  type EnrollmentFiltersFormInput,
  EnrollmentFiltersFormSchema,
  enrollmentFiltersMessages,
  toEnrollmentFilters,
} from "../schemas/enrollment-filters";

const FIELD_IDS = { query: "busca-alunos", status: "situacao-alunos" } as const;
const NO_FILTERS: EnrollmentFiltersFormInput = { query: "", status: "ACTIVE" };

/** Options of the status filter, in the plural. */
const FILTER_LABELS: Record<EnrollmentStatus, string> = { ACTIVE: "Ativas", REMOVED: "Removidas" };

const EMPTY: Record<EnrollmentStatus, string> = {
  ACTIVE: "Nenhum aluno nesta turma.",
  REMOVED: "Nenhum aluno removido desta turma.",
};

export interface ClassStudentsTabProps {
  classId: string;
  /** UX only (the API authorizes): "Remover" on active enrollments. */
  canRemove: boolean;
}

/**
 * "Alunos" tab of a class (FR-044, FR-045): search by name or RA and status filter applied by the
 * API (active enrollments by default, by name), 20 at a time. An active student can be removed
 * after a confirmation; the enrollment is kept as removed and the class's count is refreshed.
 */
export function ClassStudentsTab({ classId, canRemove }: ClassStudentsTabProps) {
  const [filters, setFilters] = useState<EnrollmentFilters>(DEFAULT_ENROLLMENT_FILTERS);
  const enrollments = useEnrollments(classId, filters);
  const remove = useRemoveEnrollment(classId);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<EnrollmentFiltersFormInput>(FIELD_IDS);
  const { register, handleSubmit, control } = useForm({
    shouldFocusError: false,
    resolver: zodResolver(EnrollmentFiltersFormSchema, { error: enrollmentFiltersMessages }),
    defaultValues: NO_FILTERS,
  });

  const onSearch = handleSubmit((values) => {
    setErrors([]);
    setFilters(toEnrollmentFilters(values));
  }, onInvalid);

  const removeStudent = async (item: EnrollmentView) => {
    if (remove.isPending) return;
    setActionErrors([]);
    setAnnouncement("");
    try {
      await remove.mutateAsync(item.id);
      setAnnouncement("Aluno removido.");
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    }
  };

  const items = enrollments.data?.pages.flatMap((page) => page.items) ?? [];
  const status = filters.status ?? "ACTIVE";

  return (
    <div>
      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar alunos"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={FIELD_IDS.query}
          type="search"
          label="Pesquisar por nome ou RA"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={errorFor(FIELD_IDS.query)}
          {...register("query")}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={FIELD_IDS.status}>Situação</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={FIELD_IDS.status} className="min-h-11 w-40" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EnrollmentStatusSchema.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <SubmitButton pending={enrollments.isFetching && !enrollments.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Corrija a pesquisa" />

      <p role="status" className="m-0 font-semibold">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível remover o aluno" />

      {enrollments.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando alunos…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : enrollments.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(enrollments.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void enrollments.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>{EMPTY[status]}</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Alunos da turma</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">RA</TableHead>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Matrícula</TableHead>
              <TableHead scope="col">Remoção</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.student.name}</TableCell>
                <TableCell>{item.student.ra ?? "—"}</TableCell>
                <TableCell>{item.student.email}</TableCell>
                <TableCell>
                  <Badge variant={item.status === "ACTIVE" ? "default" : "outline"}>
                    {ENROLLMENT_STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(item.enrolledAt)}</TableCell>
                <TableCell>{item.removedAt ? formatDateTime(item.removedAt) : "—"}</TableCell>
                <TableCell>
                  {canRemove && item.status === "ACTIVE" ? (
                    <RemoveStudent enrollment={item} onConfirm={() => void removeStudent(item)} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {enrollments.isError && items.length > 0 ? <p role="alert">{messageForError(enrollments.error)}</p> : null}
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

/** "Remover" with a confirmation (FR-044); the dialog returns focus to its button. */
function RemoveStudent({ enrollment, onConfirm }: { enrollment: EnrollmentView; onConfirm: () => void }) {
  const { name } = enrollment.student;
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive" aria-label={`Remover ${name} da turma`}>
          Remover
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover {name} da turma?</AlertDialogTitle>
          <AlertDialogDescription>
            A matrícula fica registrada como removida. A conta do aluno continua existindo, e ele pode voltar à turma por
            um novo convite.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remover aluno</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
