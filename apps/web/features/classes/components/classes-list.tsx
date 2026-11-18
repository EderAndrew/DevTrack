"use client";

import { ClassStatusSchema } from "@repo/contracts";
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
import { CLASS_STATUS_LABELS } from "@/lib/messages/status-labels";
import { type ClassFilters, useClasses } from "../hooks/use-classes";
import {
  type ClassFiltersFormInput,
  ClassFiltersFormSchema,
  classFiltersMessages,
  DEFAULT_STATUS,
  toClassFilters,
} from "../schemas/class-filters";
import { classLabel } from "../schemas/class-label";
import { ClassStatusBadge } from "./class-status-badge";

const FIELD_IDS = { query: "busca", year: "ano", status: "situacao" } as const;
const NO_FILTERS: ClassFiltersFormInput = { query: "", year: "", status: DEFAULT_STATUS };

export interface ClassesListProps {
  /** Shows "Acrescentar disciplina" (UX only; the API authorizes). */
  canCreate: boolean;
}

/**
 * The teacher's disciplinas da turma (003 FR-007; 027/FR-020): "<disciplina> · <turma>", the turma's code, year and
 * period and the effective status; search by the turma's name or code and filters by year and status, all applied by
 * the API; newest first, 20 at a time with "Carregar mais". Names are text (FR-033).
 */
export function ClassesList({ canCreate }: ClassesListProps) {
  const [filters, setFilters] = useState<ClassFilters>({});
  const classes = useClasses(filters);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ClassFiltersFormInput>(FIELD_IDS);
  const { register, handleSubmit, control } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ClassFiltersFormSchema, { error: classFiltersMessages }),
    defaultValues: NO_FILTERS,
  });

  const onSearch = handleSubmit((values) => {
    setErrors([]);
    setFilters(toClassFilters(values));
  }, onInvalid);

  const items = classes.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div>
      {canCreate ? (
        <Button asChild className="mb-4">
          <Link href="/turmas/nova">
            <Plus aria-hidden="true" />
            Acrescentar disciplina
          </Link>
        </Button>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar turmas"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={FIELD_IDS.query}
          type="search"
          label="Pesquisar por turma ou código"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={errorFor(FIELD_IDS.query)}
          {...register("query")}
        />
        <Field
          id={FIELD_IDS.year}
          label="Ano letivo"
          inputMode="numeric"
          autoComplete="off"
          className="mb-0 w-32"
          error={errorFor(FIELD_IDS.year)}
          {...register("year")}
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
                  {ClassStatusSchema.options.map((status) => (
                    <SelectItem key={status} value={status}>
                      {CLASS_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <SubmitButton pending={classes.isFetching && !classes.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Corrija a pesquisa" />

      <p className="sr-only" aria-live="polite">
        {classes.isSuccess && !classes.isFetching ? `${items.length} disciplina(s) da turma listada(s).` : ""}
      </p>

      {classes.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando turmas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : classes.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(classes.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void classes.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>Nenhuma disciplina da turma encontrada.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Suas disciplinas nas turmas</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Disciplina · Turma</TableHead>
              <TableHead scope="col">Código</TableHead>
              <TableHead scope="col">Ano</TableHead>
              <TableHead scope="col">Período</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Alunos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/turmas/${item.id}`}>{classLabel(item)}</Link>
                </TableCell>
                <TableCell>{item.cohort.code}</TableCell>
                <TableCell>{item.cohort.academicYear}</TableCell>
                <TableCell>{item.cohort.period ?? "—"}</TableCell>
                <TableCell>
                  <ClassStatusBadge status={item.effectiveStatus} />
                </TableCell>
                <TableCell>{item.activeStudentCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {classes.isError && items.length > 0 ? <p role="alert">{messageForError(classes.error)}</p> : null}
      {classes.hasNextPage ? (
        <Button
          type="button"
          aria-busy={classes.isFetchingNextPage || undefined}
          onClick={() => (classes.isFetchingNextPage ? undefined : void classes.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
