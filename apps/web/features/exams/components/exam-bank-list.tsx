"use client";

import { type ExamStatus, ExamStatusSchema } from "@repo/contracts";
import { FileCheck2, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusVariant } from "@/components/ui/status";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import { type ExamFilters, useExams, useExamSubjects } from "../hooks/use-exams";
import { EXAM_ORIGIN_LABELS, EXAM_STATUS_LABELS, formatGrade } from "../schemas/exam-form";

const STATUS_VARIANTS: Record<ExamStatus, StatusVariant> = { DRAFT: "warning", APPROVED: "success", ARCHIVED: "neutral" };

/** The exam's status in words (never color alone). */
export function ExamStatusLabel({ status }: { status: ExamStatus }) {
  return <Status variant={STATUS_VARIANTS[status]}>{EXAM_STATUS_LABELS[status]}</Status>;
}

/** The filter form: every value a string, "" for "any". */
interface FilterValues {
  q: string;
  subjectId: string;
  status: string;
}
const NO_FILTERS: FilterValues = { q: "", subjectId: "", status: "" };

/** The form's values as the list query; "any" is left out (the API validates the rest). */
const toFilters = (values: FilterValues): ExamFilters =>
  Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) => (value.trim() === "" ? [] : [[key, key === "q" ? value.trim() : value]])),
  ) as ExamFilters;

const fieldId = (field: keyof FilterValues) => `banco-provas-${field}`;

/**
 * The teacher's Banco de Provas (018 contracts/web-ui.md, `/provas`): a title search and filters by
 * subject and status, applied by the API; most recently changed first, 20 at a time with "Carregar
 * mais". Archived exams appear only when "Arquivada" is chosen.
 */
export function ExamBankList() {
  const [filters, setFilters] = useState<ExamFilters>({});
  const exams = useExams(filters);
  const subjects = useExamSubjects();
  const { register, handleSubmit, reset } = useForm<FilterValues>({ defaultValues: NO_FILTERS });

  const onSearch = handleSubmit((values) => setFilters(toFilters(values)));
  const onClear = () => {
    reset(NO_FILTERS);
    setFilters({});
  };
  const items = exams.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.keys(filters).length > 0;

  return (
    <div>
      <form noValidate onSubmit={(event) => void onSearch(event)} aria-label="Pesquisar provas" className="mb-6 flex flex-col gap-4">
        <div className="grid gap-4 md:grid-cols-3">
          <FormField id={fieldId("q")} label="Pesquisar no título" className="mb-0">
            {(controlProps) => <Input {...controlProps} type="search" autoComplete="off" maxLength={200} {...register("q")} />}
          </FormField>
          <FormField id={fieldId("subjectId")} label="Disciplina" className="mb-0">
            {(controlProps) => (
              <NativeSelect {...controlProps} className="w-full" {...register("subjectId")}>
                <option value="">Todas</option>
                {(subjects.data?.items ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField id={fieldId("status")} label="Situação" className="mb-0">
            {(controlProps) => (
              <NativeSelect {...controlProps} className="w-full" {...register("status")}>
                <option value="">Rascunho e aprovada</option>
                {ExamStatusSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {EXAM_STATUS_LABELS[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton pending={exams.isFetching && !exams.isFetchingNextPage} pendingLabel="Pesquisando…">
            Pesquisar
          </SubmitButton>
          <Button type="button" variant="secondary" onClick={onClear}>
            Limpar filtros
          </Button>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {exams.isSuccess && !exams.isFetching ? `${items.length} prova(s) listada(s).` : ""}
      </p>

      {exams.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando provas…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : exams.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(exams.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void exams.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <p>Nenhuma prova atende a esses filtros.</p>
        ) : (
          <EmptyState
            icon={FileCheck2}
            title="Seu banco ainda não tem provas"
            description="As provas que você criar ficam aqui, visíveis só para você, e podem ser aplicadas a várias turmas."
          />
        )
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Suas provas</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Título</TableHead>
              <TableHead scope="col">Disciplina e tópicos</TableHead>
              <TableHead scope="col">Questões e nota</TableHead>
              <TableHead scope="col">Origem</TableHead>
              <TableHead scope="col">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/provas/${item.id}`}>{item.title}</Link>
                </TableCell>
                <TableCell>
                  {item.subject.name}
                  <span className="block text-text-secondary">{item.topics.map((topic) => topic.itemText).join(", ")}</span>
                </TableCell>
                <TableCell>
                  {item.questionCount} {item.questionCount === 1 ? "questão" : "questões"} · nota {formatGrade(item.totalGrade)}
                </TableCell>
                <TableCell>
                  {EXAM_ORIGIN_LABELS[item.origin]}
                  {item.humanEdited ? (
                    <span className="flex items-center gap-1 text-text-secondary">
                      <Pencil aria-hidden="true" className="size-4" />
                      Editada por você
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <ExamStatusLabel status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {exams.isError && items.length > 0 ? <p role="alert">{messageForError(exams.error)}</p> : null}
      {exams.hasNextPage ? (
        <Button
          type="button"
          aria-busy={exams.isFetchingNextPage || undefined}
          onClick={() => (exams.isFetchingNextPage ? undefined : void exams.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
