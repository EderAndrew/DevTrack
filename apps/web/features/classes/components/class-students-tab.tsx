"use client";

import type { EnrollmentStatus } from "@repo/contracts";
import { EnrollmentStatusSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
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
import { type EnrollmentFilters, useEnrollments } from "../hooks/use-enrollments";
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
}

/**
 * "Alunos" tab of a disciplina da turma (003 FR-045; 027/FR-021): the students of the turma, read only — search by
 * name or RA and status filter applied by the API (active enrollments by default, by name), 20 at a time. Inviting,
 * including and ending an enrollment are the MANAGER's, on the turma's page.
 */
export function ClassStudentsTab({ classId }: ClassStudentsTabProps) {
  const [filters, setFilters] = useState<EnrollmentFilters>(DEFAULT_ENROLLMENT_FILTERS);
  const enrollments = useEnrollments(classId, filters);
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.student.name}</TableCell>
                <TableCell>{item.student.ra ?? "—"}</TableCell>
                <TableCell>{item.student.email}</TableCell>
                <TableCell>
                  <Badge variant={item.status === "ACTIVE" ? "success" : "neutral"}>
                    {ENROLLMENT_STATUS_LABELS[item.status]}
                  </Badge>
                </TableCell>
                <TableCell>{formatDateTime(item.enrolledAt)}</TableCell>
                <TableCell>{item.removedAt ? formatDateTime(item.removedAt) : "—"}</TableCell>
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
