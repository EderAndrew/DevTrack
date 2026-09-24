"use client";

import { SubjectStatusSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { SUBJECT_STATUS_LABELS } from "@/lib/messages/status-labels";
import { type SubjectFilters, useSubjects } from "../hooks/use-subjects";
import {
  ALL_STATUSES,
  type SubjectFiltersFormInput,
  SubjectFiltersFormSchema,
  subjectFiltersMessages,
  toSubjectFilters,
} from "../schemas/subject-filters";
import { SubjectStatusBadge } from "./subject-status-badge";

const FIELD_IDS = { query: "busca", status: "situacao" } as const;
const NO_FILTERS: SubjectFiltersFormInput = { query: "", status: ALL_STATUSES };

export interface SubjectsListProps {
  /** Shows "Nova disciplina" (UX only; the API authorizes). */
  canCreate: boolean;
}

/**
 * The teacher's subjects (004/FR-001): search by name and status filter, both applied by the
 * API; ordered by name, 50 at a time with "Carregar mais".
 */
export function SubjectsList({ canCreate }: SubjectsListProps) {
  const [filters, setFilters] = useState<SubjectFilters>({});
  const subjects = useSubjects(filters);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<SubjectFiltersFormInput>(FIELD_IDS);
  const { register, handleSubmit, control } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(SubjectFiltersFormSchema, { error: subjectFiltersMessages }),
    defaultValues: NO_FILTERS,
  });

  const onSearch = handleSubmit((values) => {
    setErrors([]);
    setFilters(toSubjectFilters(values));
  }, onInvalid);

  const items = subjects.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      {canCreate ? (
        <Button asChild className="mb-4">
          <Link href="/disciplinas/nova">
            <Plus aria-hidden="true" />
            Nova disciplina
          </Link>
        </Button>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar disciplinas"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={FIELD_IDS.query}
          type="search"
          label="Pesquisar por nome"
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
                <SelectTrigger id={FIELD_IDS.status} className="min-h-11 w-48" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STATUSES}>Ativas e inativas</SelectItem>
                  {SubjectStatusSchema.options.map((status) => (
                    <SelectItem key={status} value={status}>
                      {SUBJECT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <SubmitButton pending={subjects.isFetching && !subjects.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Corrija a pesquisa" />

      <p className="sr-only" aria-live="polite">
        {subjects.isSuccess && !subjects.isFetching ? `${items.length} disciplina(s) listada(s).` : ""}
      </p>

      {subjects.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando disciplinas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : subjects.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(subjects.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void subjects.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>Nenhuma disciplina encontrada.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Suas disciplinas</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Turmas</TableHead>
              <TableHead scope="col">Versões da ementa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/disciplinas/${item.id}`}>{item.name}</Link>
                </TableCell>
                <TableCell>
                  <SubjectStatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.classCount}</TableCell>
                <TableCell>{item.documentCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {subjects.isError && items.length > 0 ? <p role="alert">{messageForError(subjects.error)}</p> : null}
      {subjects.hasNextPage ? (
        <Button
          type="button"
          aria-busy={subjects.isFetchingNextPage || undefined}
          onClick={() => (subjects.isFetchingNextPage ? undefined : void subjects.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
