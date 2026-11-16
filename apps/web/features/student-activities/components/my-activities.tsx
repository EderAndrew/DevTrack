"use client";

import { ActivityTypeSchema, StudentActivityFilterSchema } from "@repo/contracts";
import { ChartColumn, CircleCheck, ListChecks, type LucideIcon, Trophy, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { StudentActivityListFilters } from "../api/student-activities";
import { useCurrentSubject } from "../hooks/use-current-subject";
import { useStudentActivities } from "../hooks/use-student-activities";
import { ACTIVITY_TYPE_LABELS, FILTER_OPTIONS, formatHundredths, gradeSummary, myActivitiesHref, type GradeSummary } from "../schemas/student-activity";
import { ActivityCard } from "./activity-card";
import { LoadFailed, Loading } from "./load-states";
import { SubjectSwitcher } from "./subject-switcher";

export const FILTER_IDS = { status: "filtro-situacao", type: "filtro-tipo" } as const;
export const MY_ACTIVITIES_SUBTITLE = "Acompanhe suas entregas, consulte suas notas e evolua a cada atividade.";

/** "Exibindo 3 atividades" (only what is loaded: the list is paged by "Carregar mais", the API sends no total). */
export const shownLabel = (count: number) => `Exibindo ${count} ${count === 1 ? "atividade" : "atividades"}`;

export const NO_GRADE_YET = "Nenhuma nota liberada nas exibidas";

interface SummaryCard {
  label: string;
  value: string;
  caption: string;
  icon: LucideIcon;
  /** The icon's tint; the label says the same in words. */
  tone: string;
}

function summaryCards(summary: GradeSummary): SummaryCard[] {
  const graded = summary.graded > 0;
  return [
    {
      label: "Atividades corrigidas",
      value: String(summary.graded),
      caption: "com nota liberada, nas atividades exibidas",
      icon: CircleCheck,
      tone: "bg-success-surface text-success-text",
    },
    {
      label: "Pontuação obtida",
      value: graded ? formatHundredths(summary.earned) : "—",
      caption: graded ? `de ${formatHundredths(summary.possible)} possíveis nas corrigidas` : NO_GRADE_YET,
      icon: ChartColumn,
      tone: "bg-primary-subtle text-primary",
    },
    {
      label: "Aproveitamento",
      value: summary.percent !== null ? `${summary.percent}%` : "—",
      caption: summary.percent !== null ? "nas atividades exibidas" : NO_GRADE_YET,
      icon: Trophy,
      tone: "bg-warning-surface text-warning-text",
    },
  ];
}

/**
 * The three summary cards (layout of 2026-11-16): computed over the activities on screen, in whole hundredths (the
 * list is paged and the API sends no total, so every caption says so). Exercícios' points never count as a grade (013).
 */
function GradeSummaryCards({ summary }: { summary: GradeSummary }) {
  return (
    <section aria-labelledby="resumo-titulo">
      <h2 id="resumo-titulo" className="sr-only">
        Resumo das atividades exibidas
      </h2>
      <ul className="m-0 grid list-none grid-cols-1 gap-4 p-0 sm:grid-cols-3">
        {summaryCards(summary).map(({ label, value, caption, icon: Icon, tone }) => (
          <li key={label} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-sm">
            <span className="flex items-start justify-between gap-2">
              <span className="text-body-sm text-text-secondary">{label}</span>
              <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
                <Icon className="size-5" />
              </span>
            </span>
            <span className="text-display">{value}</span>
            <span className="text-caption text-text-secondary">{caption}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export interface MyActivitiesProps {
  filters: StudentActivityListFilters;
  /** The `materia` of the address (026): checked against "Minhas turmas" before anything is asked. */
  materia: string | null;
}

/**
 * "Minhas atividades" (012 US2, FR-012): the activities of one subject (026, the "Matéria" card, `?materia=<classId>`) by
 * deadline, filtered by situação and tipo through the URL (`?situacao=&tipo=`, so a counter of the dashboard links to
 * it), with "Carregar mais". The list is asked only once the subject is known, so it never mixes subjects; a student
 * with no class gets the list of 012 (empty) with no card.
 */
export function MyActivities({ filters, materia }: MyActivitiesProps) {
  const router = useRouter();
  const subject = useCurrentSubject(materia);
  const classId = subject.current?.id ?? null;
  const query = useStudentActivities(filters, classId, { enabled: !subject.isPending && !subject.isError });
  const go = (next: Partial<StudentActivityListFilters> & { materia?: string }) =>
    router.replace(myActivitiesHref({ ...filters, materia: classId, ...next }));

  if (subject.isError) return <LoadFailed error={subject.error} onRetry={subject.refetch} />;

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const filtered = Boolean(filters.status || filters.type);
  return (
    <div className="flex flex-col gap-4">
      {subject.current ? (
        <SubjectSwitcher
          options={subject.options}
          currentId={subject.current.id}
          unavailable={subject.unavailable}
          onChange={(id) => go({ materia: id })}
        />
      ) : null}
      {query.isSuccess ? <GradeSummaryCards summary={gradeSummary(items)} /> : null}
      <form
        aria-label="Filtrar atividades"
        className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1 sm:flex-none">
          <Label htmlFor={FILTER_IDS.status}>Situação</Label>
          <NativeSelect
            id={FILTER_IDS.status}
            value={filters.status ?? ""}
            onChange={(event) => go({ status: StudentActivityFilterSchema.safeParse(event.target.value).data ?? null })}
          >
            <option value="">Todas</option>
            {StudentActivityFilterSchema.options.map((filter) => (
              <option key={filter} value={filter}>
                {FILTER_OPTIONS[filter].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1 sm:flex-none">
          <Label htmlFor={FILTER_IDS.type}>Tipo</Label>
          <NativeSelect
            id={FILTER_IDS.type}
            value={filters.type ?? ""}
            onChange={(event) => go({ type: ActivityTypeSchema.safeParse(event.target.value).data ?? null })}
          >
            <option value="">Todos</option>
            {ActivityTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </div>
        {filtered ? (
          <Button type="button" variant="ghost" onClick={() => go({ status: null, type: null })}>
            <X aria-hidden="true" />
            Limpar filtros
          </Button>
        ) : null}
      </form>

      {query.isPending ? (
        <Loading label="Carregando suas atividades…" />
      ) : query.isError && items.length === 0 ? (
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filtered ? "Nenhuma atividade com esses filtros." : "Você ainda não tem atividades."}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="m-0 text-body-sm font-semibold">
              {shownLabel(items.length)}
              {query.hasNextPage ? <span className="font-normal text-text-secondary"> · há mais para carregar</span> : null}
            </p>
            <p className="m-0 text-caption text-text-secondary">Ordenadas pelo prazo</p>
          </div>
          <ul aria-label="Suas atividades" className="m-0 flex list-none flex-col gap-4 p-0">
            {items.map((item) => (
              <li key={item.id}>
                <ActivityCard item={item} headingLevel="h2" />
              </li>
            ))}
          </ul>
          {query.isFetchNextPageError ? <LoadFailed error={query.error} onRetry={() => void query.fetchNextPage()} /> : null}
          {query.hasNextPage ? (
            <Button
              type="button"
              variant="secondary"
              className="self-start"
              aria-disabled={query.isFetchingNextPage || undefined}
              onClick={() => {
                if (!query.isFetchingNextPage) void query.fetchNextPage();
              }}
            >
              {query.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
