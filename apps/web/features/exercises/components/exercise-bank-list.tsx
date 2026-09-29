"use client";

import {
  CognitiveObjectiveSchema,
  type ExerciseOrigin,
  ExerciseDifficultySchema,
  ExerciseOriginSchema,
  ExerciseStatusSchema,
  ExerciseTypeSchema,
} from "@repo/contracts";
import { ListChecks } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { type ExerciseFilters, useExercises, useProgrammingLanguages, useTopicRevision, useTopicSubjects, useTopicSyllabi } from "../hooks/use-exercises";
import { COGNITIVE_OBJECTIVE_LABELS, DIFFICULTY_LABELS, EXERCISE_TYPE_LABELS } from "../schemas/exercise-form";
import { EXERCISE_STATUS_LABELS, ExerciseStatusLabel } from "./exercise-parts";

export const EXERCISE_ORIGIN_LABELS: Record<ExerciseOrigin, string> = { MANUAL: "Manual", AI_GENERATED: "Gerado por IA" };

/** The filter form: every value a string, "" for "any". */
interface FilterValues {
  query: string;
  subjectId: string;
  syllabusRevisionId: string;
  syllabusItemId: string;
  difficulty: string;
  cognitiveObjective: string;
  type: string;
  origin: string;
  status: string;
  languageId: string;
}

const NO_FILTERS: FilterValues = {
  query: "",
  subjectId: "",
  syllabusRevisionId: "",
  syllabusItemId: "",
  difficulty: "",
  cognitiveObjective: "",
  type: "",
  origin: "",
  status: "",
  languageId: "",
};

/** The form's values as the list query; "any" is left out (the API validates the rest). */
const toFilters = (values: FilterValues): ExerciseFilters =>
  Object.fromEntries(Object.entries(values).flatMap(([key, value]) => (value.trim() === "" ? [] : [[key, key === "query" ? value.trim() : value]]))) as ExerciseFilters;

const fieldId = (field: keyof FilterValues) => `banco-${field}`;

/**
 * The teacher's bank (010 contracts/web-ui.md, `/exercicios`, US5-1, FR-034): search in the
 * statement and filters by subject, syllabus, topic, difficulty, objective, type, origin, status
 * and language, all applied by the API; most recently changed first, 20 at a time with "Carregar
 * mais". Archived exercises appear only when "Arquivado" is chosen.
 */
export function ExerciseBankList() {
  const [filters, setFilters] = useState<ExerciseFilters>({});
  const exercises = useExercises(filters);
  const form = useForm<FilterValues>({ defaultValues: NO_FILTERS });
  const { register, handleSubmit, control, setValue, reset } = form;
  const [subjectId, revisionId] = useWatch({ control, name: ["subjectId", "syllabusRevisionId"] });
  const subjects = useTopicSubjects();
  const syllabi = useTopicSyllabi(subjectId);
  const revision = useTopicRevision(revisionId || null);
  const languages = useProgrammingLanguages();
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision ? [{ id: document.confirmedRevision.id, version: document.version }] : [],
  );

  const onSearch = handleSubmit((values) => setFilters(toFilters(values)));
  const onClear = () => {
    reset(NO_FILTERS);
    setFilters({});
  };

  const items = exercises.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.keys(filters).length > 0;

  const select = (field: keyof FilterValues, label: string, anyLabel: string, options: [string, string][], extra: Parameters<typeof register>[1] = {}, disabled = false) => (
    <FormField id={fieldId(field)} label={label} className="mb-0">
      {(controlProps) => (
        <NativeSelect {...controlProps} className="w-full" disabled={disabled} {...register(field, extra)}>
          <option value="">{anyLabel}</option>
          {options.map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </NativeSelect>
      )}
    </FormField>
  );

  return (
    <div>
      <form noValidate onSubmit={(event) => void onSearch(event)} aria-label="Pesquisar exercícios" className="mb-6 flex flex-col gap-4">
        <FormField id={fieldId("query")} label="Pesquisar no enunciado" className="mb-0">
          {(controlProps) => <Input {...controlProps} type="search" autoComplete="off" maxLength={200} {...register("query")} />}
        </FormField>
        <div className="grid gap-4 md:grid-cols-3">
          {select(
            "subjectId",
            "Disciplina",
            "Todas",
            (subjects.data?.items ?? []).map((subject) => [subject.id, subject.name]),
            {
              onChange: () => {
                setValue("syllabusRevisionId", "");
                setValue("syllabusItemId", "");
              },
            },
          )}
          {select(
            "syllabusRevisionId",
            "Ementa",
            "Todas",
            confirmed.map((syllabus) => [syllabus.id, `Versão ${syllabus.version}`]),
            { onChange: () => setValue("syllabusItemId", "") },
            subjectId === "",
          )}
          <FormField id={fieldId("syllabusItemId")} label="Tópico" className="mb-0">
            {(controlProps) => (
              <NativeSelect {...controlProps} className="w-full" disabled={revisionId === ""} {...register("syllabusItemId")}>
                <option value="">Todos</option>
                {(revision.data?.groups ?? []).map((group) => (
                  <optgroup key={group.id} label={group.title ?? `Grupo ${group.position}`}>
                    {group.items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.text}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </NativeSelect>
            )}
          </FormField>
          {select("difficulty", "Dificuldade", "Todas", ExerciseDifficultySchema.options.map((value) => [value, DIFFICULTY_LABELS[value]]))}
          {select("cognitiveObjective", "Objetivo cognitivo", "Todos", CognitiveObjectiveSchema.options.map((value) => [value, COGNITIVE_OBJECTIVE_LABELS[value]]))}
          {select("type", "Tipo", "Todos", ExerciseTypeSchema.options.map((value) => [value, EXERCISE_TYPE_LABELS[value]]))}
          {select("origin", "Origem", "Todas", ExerciseOriginSchema.options.map((value) => [value, EXERCISE_ORIGIN_LABELS[value]]))}
          {select("status", "Situação", "Rascunho e aprovado", ExerciseStatusSchema.options.map((value) => [value, EXERCISE_STATUS_LABELS[value]]))}
          {select("languageId", "Linguagem", "Todas", (languages.data ?? []).map((language) => [language.id, language.name]))}
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={exercises.isFetching && !exercises.isFetchingNextPage} pendingLabel="Pesquisando…">
            Pesquisar
          </SubmitButton>
          <Button type="button" variant="secondary" onClick={onClear}>
            Limpar filtros
          </Button>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {exercises.isSuccess && !exercises.isFetching ? `${items.length} exercício(s) listado(s).` : ""}
      </p>

      {exercises.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando exercícios…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : exercises.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(exercises.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void exercises.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <p>Nenhum exercício atende a esses filtros.</p>
        ) : (
          <EmptyState icon={ListChecks} title="Seu banco ainda não tem exercícios" description="Os exercícios que você salvar ficam aqui, visíveis só para você." />
        )
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Seus exercícios</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Enunciado</TableHead>
              <TableHead scope="col">Tipo</TableHead>
              <TableHead scope="col">Dificuldade</TableHead>
              <TableHead scope="col">Tópico</TableHead>
              <TableHead scope="col">Origem</TableHead>
              <TableHead scope="col">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/exercicios/${item.id}`} className="line-clamp-2">
                    {item.statement}
                  </Link>
                </TableCell>
                <TableCell>{EXERCISE_TYPE_LABELS[item.type]}</TableCell>
                <TableCell>{DIFFICULTY_LABELS[item.difficulty]}</TableCell>
                <TableCell>{item.topic ? <Topic subject={item.topic.subjectName}>{item.topic.itemText}</Topic> : "—"}</TableCell>
                <TableCell>{EXERCISE_ORIGIN_LABELS[item.origin]}</TableCell>
                <TableCell>
                  <ExerciseStatusLabel status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {exercises.isError && items.length > 0 ? <p role="alert">{messageForError(exercises.error)}</p> : null}
      {exercises.hasNextPage ? (
        <Button
          type="button"
          aria-busy={exercises.isFetchingNextPage || undefined}
          onClick={() => (exercises.isFetchingNextPage ? undefined : void exercises.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}

function Topic({ subject, children }: { subject: string; children: ReactNode }) {
  return (
    <>
      {children}
      <span className="block text-text-secondary">{subject}</span>
    </>
  );
}
