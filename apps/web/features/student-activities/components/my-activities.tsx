"use client";

import { ActivityTypeSchema, StudentActivityFilterSchema } from "@repo/contracts";
import { ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { StudentActivityListFilters } from "../api/student-activities";
import { useStudentActivities } from "../hooks/use-student-activities";
import { ACTIVITY_TYPE_LABELS, FILTER_OPTIONS, myActivitiesHref } from "../schemas/student-activity";
import { ActivityCard } from "./activity-card";
import { LoadFailed, Loading } from "./load-states";

export const FILTER_IDS = { status: "filtro-situacao", type: "filtro-tipo" } as const;

/**
 * "Minhas atividades" (012 US2, FR-012): every activity of the student by deadline, filtered by
 * situação and tipo through the URL (`?situacao=&tipo=`, so a counter of the dashboard links to it),
 * with "Carregar mais".
 */
export function MyActivities({ filters }: { filters: StudentActivityListFilters }) {
  const router = useRouter();
  const query = useStudentActivities(filters);
  const change = (next: Partial<StudentActivityListFilters>) => router.replace(myActivitiesHref({ ...filters, ...next }));

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <form aria-label="Filtrar atividades" className="flex flex-wrap gap-4" onSubmit={(event) => event.preventDefault()}>
        <div className="flex flex-col gap-1">
          <Label htmlFor={FILTER_IDS.status}>Situação</Label>
          <NativeSelect
            id={FILTER_IDS.status}
            value={filters.status ?? ""}
            onChange={(event) => change({ status: StudentActivityFilterSchema.safeParse(event.target.value).data ?? null })}
          >
            <option value="">Todas</option>
            {StudentActivityFilterSchema.options.map((filter) => (
              <option key={filter} value={filter}>
                {FILTER_OPTIONS[filter].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={FILTER_IDS.type}>Tipo</Label>
          <NativeSelect
            id={FILTER_IDS.type}
            value={filters.type ?? ""}
            onChange={(event) => change({ type: ActivityTypeSchema.safeParse(event.target.value).data ?? null })}
          >
            <option value="">Todos</option>
            {ActivityTypeSchema.options.map((type) => (
              <option key={type} value={type}>
                {ACTIVITY_TYPE_LABELS[type]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </form>

      {query.isPending ? (
        <Loading label="Carregando suas atividades…" />
      ) : query.isError && items.length === 0 ? (
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={ListChecks}
          title={filters.status || filters.type ? "Nenhuma atividade com esses filtros." : "Você ainda não tem atividades."}
        />
      ) : (
        <>
          <ul aria-label="Suas atividades" className="m-0 flex list-none flex-col gap-3 p-0">
            {items.map((item) => (
              <li key={item.id}>
                <ActivityCard item={item} detailed headingLevel="h2" />
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
