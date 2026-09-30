"use client";

import {
  WorkDifficultySchema,
  WorkOriginSchema,
  type WorkStatus,
  WorkStatusSchema,
} from "@repo/contracts";
import { ClipboardList, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Status, type StatusVariant } from "@/components/ui/status";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { messageForError } from "@/lib/messages/error-messages";
import {
  useWorkRevision,
  useWorks,
  useWorkSubjects,
  useWorkSyllabi,
  type WorkFilters,
} from "../hooks/use-works";
import {
  formatGrade,
  WORK_DIFFICULTY_LABELS,
  WORK_ORIGIN_LABELS,
  WORK_STATUS_LABELS,
} from "../schemas/work-form";

const STATUS_VARIANTS: Record<WorkStatus, StatusVariant> = {
  DRAFT: "warning",
  APPROVED: "success",
  ARCHIVED: "neutral",
};

/** The work's status in words (never color alone). */
export function WorkStatusLabel({ status }: { status: WorkStatus }) {
  return (
    <Status variant={STATUS_VARIANTS[status]}>
      {WORK_STATUS_LABELS[status]}
    </Status>
  );
}

/** The filter form: every value a string, "" for "any". */
interface FilterValues {
  query: string;
  subjectId: string;
  syllabusRevisionId: string;
  syllabusItemId: string;
  origin: string;
  status: string;
  difficulty: string;
  createdFrom: string;
  createdTo: string;
}

const NO_FILTERS: FilterValues = {
  query: "",
  subjectId: "",
  syllabusRevisionId: "",
  syllabusItemId: "",
  origin: "",
  status: "",
  difficulty: "",
  createdFrom: "",
  createdTo: "",
};

/** The form's values as the list query; "any" is left out (the API validates the rest). */
const toFilters = (values: FilterValues): WorkFilters =>
  Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      value.trim() === ""
        ? []
        : [[key, key === "query" ? value.trim() : value]],
    ),
  ) as WorkFilters;

const fieldId = (field: keyof FilterValues) => `banco-trabalhos-${field}`;

/**
 * The teacher's work bank (011 contracts/web-ui.md, `/trabalhos`, US7, FR-031): a title search and
 * filters by subject, syllabus, topic, origin, status, difficulty and creation period, all applied
 * by the API; most recently changed first, 20 at a time with "Carregar mais". Archived works
 * appear only when "Arquivado" is chosen.
 */
export function WorkBankList() {
  const [filters, setFilters] = useState<WorkFilters>({});
  const works = useWorks(filters);
  const { register, handleSubmit, control, setValue, reset } =
    useForm<FilterValues>({ defaultValues: NO_FILTERS });
  const [subjectId, revisionId] = useWatch({
    control,
    name: ["subjectId", "syllabusRevisionId"],
  });
  const subjects = useWorkSubjects();
  const syllabi = useWorkSyllabi(subjectId);
  const revision = useWorkRevision(revisionId || null);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision
      ? [{ id: document.confirmedRevision.id, version: document.version }]
      : [],
  );

  const onSearch = handleSubmit((values) => setFilters(toFilters(values)));
  const onClear = () => {
    reset(NO_FILTERS);
    setFilters({});
  };

  const items = works.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Object.keys(filters).length > 0;

  const select = (
    field: keyof FilterValues,
    label: string,
    anyLabel: string,
    options: [string, string][],
    extra: Parameters<typeof register>[1] = {},
    disabled = false,
  ) => (
    <FormField id={fieldId(field)} label={label} className="mb-0">
      {(controlProps) => (
        <NativeSelect
          {...controlProps}
          className="w-full"
          disabled={disabled}
          {...register(field, extra)}
        >
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
      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar trabalhos"
        className="mb-6 flex flex-col gap-4"
      >
        <FormField
          id={fieldId("query")}
          label="Pesquisar no título"
          className="mb-0"
        >
          {(controlProps) => (
            <Input
              {...controlProps}
              type="search"
              autoComplete="off"
              maxLength={200}
              {...register("query")}
            />
          )}
        </FormField>
        <div className="grid gap-4 md:grid-cols-3">
          {select(
            "subjectId",
            "Disciplina",
            "Todas",
            (subjects.data?.items ?? []).map((subject) => [
              subject.id,
              subject.name,
            ]),
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
            confirmed.map((syllabus) => [
              syllabus.id,
              `Versão ${syllabus.version}`,
            ]),
            { onChange: () => setValue("syllabusItemId", "") },
            subjectId === "",
          )}
          <FormField
            id={fieldId("syllabusItemId")}
            label="Tópico"
            className="mb-0"
          >
            {(controlProps) => (
              <NativeSelect
                {...controlProps}
                className="w-full"
                disabled={revisionId === ""}
                {...register("syllabusItemId")}
              >
                <option value="">Todos</option>
                {(revision.data?.groups ?? []).map((group) => (
                  <optgroup
                    key={group.id}
                    label={group.title ?? `Grupo ${group.position}`}
                  >
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
          {select(
            "origin",
            "Origem",
            "Todas",
            WorkOriginSchema.options.map((value) => [
              value,
              WORK_ORIGIN_LABELS[value],
            ]),
          )}
          {select(
            "status",
            "Situação",
            "Rascunho e aprovado",
            WorkStatusSchema.options.map((value) => [
              value,
              WORK_STATUS_LABELS[value],
            ]),
          )}
          {select(
            "difficulty",
            "Dificuldade",
            "Todas",
            WorkDifficultySchema.options.map((value) => [
              value,
              WORK_DIFFICULTY_LABELS[value],
            ]),
          )}
          <FormField
            id={fieldId("createdFrom")}
            label="Criado a partir de"
            className="mb-0"
          >
            {(controlProps) => (
              <Input
                {...controlProps}
                type="date"
                {...register("createdFrom")}
              />
            )}
          </FormField>
          <FormField
            id={fieldId("createdTo")}
            label="Criado até"
            className="mb-0"
          >
            {(controlProps) => (
              <Input {...controlProps} type="date" {...register("createdTo")} />
            )}
          </FormField>
        </div>
        <div className="flex flex-wrap gap-2">
          <SubmitButton
            pending={works.isFetching && !works.isFetchingNextPage}
            pendingLabel="Pesquisando…"
          >
            Pesquisar
          </SubmitButton>
          <Button type="button" variant="secondary" onClick={onClear}>
            Limpar filtros
          </Button>
        </div>
      </form>

      <p className="sr-only" aria-live="polite">
        {works.isSuccess && !works.isFetching
          ? `${items.length} trabalho(s) listado(s).`
          : ""}
      </p>

      {works.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando trabalhos…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : works.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(works.error)}</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void works.refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        filtered ? (
          <p>Nenhum trabalho atende a esses filtros.</p>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Seu banco ainda não tem trabalhos"
            description="Os trabalhos que você salvar ou gerar com IA ficam aqui, visíveis só para você."
          />
        )
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Seus trabalhos</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Título</TableHead>
              <TableHead scope="col">Disciplina e tópicos</TableHead>
              <TableHead scope="col">Questões e nota</TableHead>
              <TableHead scope="col">Dificuldade</TableHead>
              <TableHead scope="col">Origem</TableHead>
              <TableHead scope="col">Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link href={`/trabalhos/${item.id}`}>{item.title}</Link>
                </TableCell>
                <TableCell>
                  {item.subject.name}
                  {item.topics.length > 0 ? (
                    <span className="block text-text-secondary">
                      {item.topics.map((topic) => topic.itemText).join(", ")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  {item.questionCount}{" "}
                  {item.questionCount === 1 ? "questão" : "questões"} · nota{" "}
                  {formatGrade(item.totalGrade)}
                </TableCell>
                <TableCell>
                  {item.difficulty
                    ? WORK_DIFFICULTY_LABELS[item.difficulty]
                    : "—"}
                </TableCell>
                <TableCell>
                  {WORK_ORIGIN_LABELS[item.origin]}
                  {item.humanEdited ? (
                    <span className="flex items-center gap-1 text-text-secondary">
                      <Pencil aria-hidden="true" className="size-4" />
                      Editado por você
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>
                  <WorkStatusLabel status={item.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {works.isError && items.length > 0 ? (
        <p role="alert">{messageForError(works.error)}</p>
      ) : null}
      {works.hasNextPage ? (
        <Button
          type="button"
          aria-busy={works.isFetchingNextPage || undefined}
          onClick={() =>
            works.isFetchingNextPage ? undefined : void works.fetchNextPage()
          }
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
