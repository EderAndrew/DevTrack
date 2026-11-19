"use client";

import { CohortStatusSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClassStatusBadge } from "@/features/classes/components/class-status-badge";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { CLASS_STATUS_LABELS } from "@/lib/messages/status-labels";
import { type CohortFilters, useCohorts } from "../hooks/use-cohorts";
import {
  type CohortFiltersFormInput,
  CohortFiltersFormSchema,
  cohortFiltersMessages,
  DEFAULT_STATUS,
  toCohortFilters,
} from "../schemas/cohort-filters";
import { CohortFormDialog } from "./cohort-form";

const FIELD_IDS = { q: "busca-turma", academicYear: "ano-turma", status: "situacao-turma" } as const;
const NO_FILTERS: CohortFiltersFormInput = { q: "", academicYear: "", status: DEFAULT_STATUS };

export interface CohortListProps {
  /** Shows "Nova turma" (UX only; the API authorizes). */
  canCreate: boolean;
}

/**
 * Every turma, for the MANAGER (027/FR-006): search by name or code and filters by year and situation, applied by
 * the API; most recent year first, 20 at a time with "Carregar mais". Names are text, never HTML (FR-033).
 */
export function CohortList({ canCreate }: CohortListProps) {
  const [filters, setFilters] = useState<CohortFilters>({});
  const cohorts = useCohorts(filters);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<CohortFiltersFormInput>(FIELD_IDS);
  const { register, handleSubmit, control } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(CohortFiltersFormSchema, { error: cohortFiltersMessages }),
    defaultValues: NO_FILTERS,
  });

  const onSearch = handleSubmit((values) => {
    setErrors([]);
    setFilters(toCohortFilters(values));
  }, onInvalid);

  const items = cohorts.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      {canCreate ? (
        <div className="mb-4 flex flex-wrap gap-4">
          <CohortFormDialog />
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar turmas"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={FIELD_IDS.q}
          type="search"
          label="Pesquisar por nome ou código"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={errorFor(FIELD_IDS.q)}
          {...register("q")}
        />
        <Field
          id={FIELD_IDS.academicYear}
          label="Ano letivo"
          inputMode="numeric"
          autoComplete="off"
          className="mb-0 w-32"
          error={errorFor(FIELD_IDS.academicYear)}
          {...register("academicYear")}
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
                  <SelectItem value={DEFAULT_STATUS}>Ativas e inativas</SelectItem>
                  {CohortStatusSchema.options.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CLASS_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <SubmitButton pending={cohorts.isFetching && !cohorts.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Corrija a pesquisa" />

      <p className="sr-only" aria-live="polite">
        {cohorts.isSuccess && !cohorts.isFetching ? `${items.length} turma(s) listada(s).` : ""}
      </p>

      {cohorts.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : cohorts.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(cohorts.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void cohorts.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>Nenhuma turma encontrada.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Turmas</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">Código</TableHead>
              <TableHead scope="col">Ano</TableHead>
              <TableHead scope="col">Período</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Alunos</TableHead>
              <TableHead scope="col">Disciplinas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/gestao/turmas/${item.id}`}>{item.name}</Link>
                </TableCell>
                <TableCell>{item.code}</TableCell>
                <TableCell>{item.academicYear}</TableCell>
                <TableCell>{item.period ?? "—"}</TableCell>
                <TableCell>
                  <ClassStatusBadge status={item.status} />
                </TableCell>
                <TableCell>{item.activeEnrollmentCount}</TableCell>
                <TableCell>{item.classCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {cohorts.isError && items.length > 0 ? <p role="alert">{messageForError(cohorts.error)}</p> : null}
      {cohorts.hasNextPage ? (
        <Button
          type="button"
          aria-busy={cohorts.isFetchingNextPage || undefined}
          onClick={() => (cohorts.isFetchingNextPage ? undefined : void cohorts.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
