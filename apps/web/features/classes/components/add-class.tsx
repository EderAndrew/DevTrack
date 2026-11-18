"use client";

import type { ClassView, CohortDirectoryItem } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton, fieldErrorId } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubjects } from "@/features/subjects/hooks/use-subjects";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCohortDirectory, useCreateClass } from "../hooks/use-classes";
import {
  ADD_CLASS_MESSAGES,
  type AddClassFormInput,
  AddClassFormSchema,
  type CohortSearchFormInput,
  CohortSearchFormSchema,
  cohortSearchMessages,
  SUBJECT_ERROR_CODES,
  toAddClassRequest,
} from "../schemas/add-class";

const SEARCH_IDS = { q: "busca-turma" } as const;
const FIELD_IDS = { cohortId: "turma-escolhida", subjectId: "disciplina", startsOn: "inicio", endsOn: "termino" } as const;

export interface AddClassProps {
  /** The subject chosen beforehand ("Acrescentar a uma turma" of a subject page, `?disciplina=`). */
  defaultSubjectId?: string;
}

/** "ADS 3NA · ADS-3NA · 2026 · Noturno": what identifies a turma in the results (FR-016), as text. */
const cohortLine = (cohort: CohortDirectoryItem) =>
  [cohort.code, String(cohort.academicYear), cohort.period].filter(Boolean).join(" · ");

/** "Banco de Dados (Ana), Redes (Beto)": the disciplinas the turma already has, as text (FR-033). */
const classesLine = (cohort: CohortDirectoryItem) =>
  cohort.classes.length === 0
    ? "Ainda sem disciplinas."
    : `Disciplinas: ${cohort.classes.map((item) => `${item.subjectName ?? "Sem disciplina"} (${item.teacherName})`).join(", ")}.`;

/**
 * "Acrescentar disciplina a uma turma" (027/US3, contracts/ui.md): the teacher searches the ACTIVE turmas of the
 * MANAGER (name, code, year, period and the disciplinas they already have), picks one, picks an own active subject and
 * optionally the calendar, and adds it. The API decides everything (owner, status, duplicate); the screen only shows
 * its answer next to the field it concerns. Names are rendered as text, never HTML (FR-033).
 */
export function AddClass({ defaultSubjectId }: AddClassProps) {
  const [term, setTerm] = useState("");
  const [added, setAdded] = useState<ClassView | null>(null);
  const directory = useCohortDirectory(term);
  const subjects = useSubjects({ status: "ACTIVE" });
  const create = useCreateClass();

  const searchSummary = useErrorSummary<CohortSearchFormInput>(SEARCH_IDS);
  const searchForm = useForm({
    shouldFocusError: false,
    resolver: zodResolver(CohortSearchFormSchema, { error: cohortSearchMessages }),
    defaultValues: { q: "" },
  });

  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<AddClassFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState, reset, setValue, getValues } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(AddClassFormSchema),
    defaultValues: { cohortId: "", subjectId: defaultSubjectId ?? "", startsOn: "", endsOn: "" },
  });

  const onSearch = searchForm.handleSubmit((values) => {
    searchSummary.setErrors([]);
    setAdded(null);
    setTerm(values.q);
    setValue("cohortId", "");
  }, searchSummary.onInvalid);

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const saved = await create.mutateAsync(toAddClassRequest(values));
      setAdded(saved);
      reset({ cohortId: "", subjectId: "", startsOn: "", endsOn: "" });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "COHORT_NOT_ACTIVE") {
        setErrors([{ fieldId: FIELD_IDS.cohortId, message: ADD_CLASS_MESSAGES.cohortNotActive }]);
        void directory.refetch();
        return;
      }
      const fieldId = code && SUBJECT_ERROR_CODES.includes(code) ? FIELD_IDS.subjectId : undefined;
      setErrors([{ fieldId, message: messageForError(error) }]);
    }
  }, onInvalid);

  const cohorts = directory.data?.pages.flatMap((page) => page.items) ?? [];
  const subjectOptions = subjects.data?.pages.flatMap((page) => page.items) ?? [];
  const defaultSubjectLoaded = Boolean(defaultSubjectId && subjectOptions.some((subject) => subject.id === defaultSubjectId));

  // The native select takes the subject of `?disciplina=` only once its option exists.
  useEffect(() => {
    if (defaultSubjectLoaded && getValues("subjectId") === defaultSubjectId) setValue("subjectId", defaultSubjectId);
  }, [defaultSubjectLoaded, defaultSubjectId, getValues, setValue]);
  const cohortError = errorFor(FIELD_IDS.cohortId);
  const subjectError = errorFor(FIELD_IDS.subjectId);

  return (
    <div className="max-w-200">
      {added ? (
        <Notice role="status">
          <p className="mt-0">{ADD_CLASS_MESSAGES.added}</p>
          <p className="mb-0">
            <Link href={`/turmas/${added.id}`}>
              Abrir {added.subject?.name ?? "a disciplina"} · {added.cohort.name}
            </Link>
          </p>
        </Notice>
      ) : null}

      <form
        noValidate
        role="search"
        aria-label="Pesquisar turmas"
        onSubmit={(event) => void onSearch(event)}
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={SEARCH_IDS.q}
          type="search"
          label="Turma (nome ou código)"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={searchSummary.errorFor(SEARCH_IDS.q)}
          {...searchForm.register("q")}
        />
        <SubmitButton pending={directory.isFetching && !directory.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={searchSummary.errors} title="Corrija a pesquisa" />

      <form
        noValidate
        aria-label="Acrescentar disciplina a uma turma"
        onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      >
        <ErrorSummary errors={errors} title="Não foi possível acrescentar a disciplina" />

        <div id={FIELD_IDS.cohortId} tabIndex={-1}>
        {term === "" ? null : directory.isPending ? (
          <div aria-busy="true" className="mb-4 flex flex-col gap-2">
            <span className="sr-only">Carregando turmas…</span>
            <Skeleton className="h-12 w-full" />
          </div>
        ) : directory.isError && cohorts.length === 0 ? (
          <div role="alert" className="mb-4">
            <p>{messageForError(directory.error)}</p>
            <Button type="button" variant="secondary" onClick={() => void directory.refetch()}>
              Tentar novamente
            </Button>
          </div>
        ) : cohorts.length === 0 ? (
          <p role="status">{ADD_CLASS_MESSAGES.notFound}</p>
        ) : (
          <div className="mb-4">
            <RadioGroup
              legend="Turma"
              aria-describedby={cohortError ? fieldErrorId(FIELD_IDS.cohortId) : undefined}
            >
              {cohorts.map((cohort) => (
                <label key={cohort.id} className="flex items-start gap-2 text-body">
                  <Radio value={cohort.id} className="mt-1" {...register("cohortId")} />
                  <span className="flex flex-col">
                    <span className="font-semibold">{cohort.name}</span>
                    <span className="text-body-sm">{cohortLine(cohort)}</span>
                    <span className="text-body-sm">{classesLine(cohort)}</span>
                  </span>
                </label>
              ))}
            </RadioGroup>
            {cohortError && cohorts.length > 0 ? (
              <p id={fieldErrorId(FIELD_IDS.cohortId)} className="m-0 font-semibold text-danger-text">
                {cohortError}
              </p>
            ) : null}
            {directory.hasNextPage ? (
              <Button
                type="button"
                variant="secondary"
                className="mt-2"
                aria-busy={directory.isFetchingNextPage || undefined}
                onClick={() => (directory.isFetchingNextPage ? undefined : void directory.fetchNextPage())}
              >
                Carregar mais turmas
              </Button>
            ) : null}
          </div>
        )}
        {cohortError && cohorts.length === 0 ? (
          <p id={fieldErrorId(FIELD_IDS.cohortId)} className="mb-4 font-semibold text-danger-text">
            {cohortError}
          </p>
        ) : null}
        </div>

        <div className="mb-4 flex flex-col gap-1">
          <Label htmlFor={FIELD_IDS.subjectId}>Disciplina</Label>
          <NativeSelect
            id={FIELD_IDS.subjectId}
            className="w-full max-w-120"
            aria-invalid={subjectError ? true : undefined}
            aria-describedby={subjectError ? fieldErrorId(FIELD_IDS.subjectId) : undefined}
            {...register("subjectId")}
          >
            <option value="">Escolha uma disciplina</option>
            {subjectOptions.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </NativeSelect>
          {subjectError ? (
            <p id={fieldErrorId(FIELD_IDS.subjectId)} className="m-0 font-semibold text-danger-text">
              {subjectError}
            </p>
          ) : null}
        </div>
        <Field
          id={FIELD_IDS.startsOn}
          type="date"
          label="Data de início"
          hint="Opcional. A disciplina e as duas datas são necessárias para planejar."
          error={errorFor(FIELD_IDS.startsOn)}
          {...register("startsOn")}
        />
        <Field id={FIELD_IDS.endsOn} type="date" label="Data de término" error={errorFor(FIELD_IDS.endsOn)} {...register("endsOn")} />
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={formState.isSubmitting} pendingLabel="Acrescentando…">
            Acrescentar disciplina
          </SubmitButton>
          <Button asChild variant="secondary">
            <Link href="/turmas">Cancelar</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
