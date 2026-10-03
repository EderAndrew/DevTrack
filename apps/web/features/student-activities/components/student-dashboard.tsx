"use client";

import type { StudentDashboard as Dashboard, StudentActivityFilter } from "@repo/contracts";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { useStudentDashboard } from "../hooks/use-student-activities";
import { myActivitiesHref } from "../schemas/student-activity";
import { ActivityCard } from "./activity-card";
import { LoadFailed, Loading } from "./load-states";

export const EMPTY_DASHBOARD = "Nenhuma atividade pendente.";

const COUNTERS: { key: keyof Dashboard["counts"]; label: string; filter: StudentActivityFilter }[] = [
  { key: "pending", label: "Pendentes", filter: "PENDING" },
  { key: "inProgress", label: "Em andamento", filter: "IN_PROGRESS" },
  { key: "overdue", label: "Atrasadas", filter: "OVERDUE" },
  { key: "completed", label: "Concluídas", filter: "COMPLETED" },
];

/**
 * The student's start page (012 US2, contracts/web-ui.md `/painel`): "Olá, {primeiro nome}", the
 * four counters (one row of links to the filtered list), the next activities by deadline as the
 * first section (SC-001: the next one and its deadline without scrolling) and the overdue ones that
 * still accept a submission.
 */
export function StudentDashboard() {
  const query = useStudentDashboard();

  if (query.isPending) {
    return (
      <>
        <PageHeader title="Painel" />
        <Loading label="Carregando suas atividades…" />
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <PageHeader title="Painel" />
        <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const { firstName, counts, next, overdueOpen } = query.data;
  return (
    <>
      <PageHeader title={firstName ? `Olá, ${firstName}` : "Olá"} />
      <div className="flex flex-col gap-6">
        <nav aria-label="Resumo das suas atividades">
          <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 md:grid-cols-4">
            {COUNTERS.map((counter) => (
              <li key={counter.key}>
                <Link
                  href={myActivitiesHref({ status: counter.filter })}
                  className="flex min-h-11 flex-col rounded-md border border-border bg-surface p-3 text-foreground no-underline hover:bg-accent"
                >
                  <span className="text-h2 font-bold">{counts[counter.key]}</span>
                  <span className="text-body-sm">{counter.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <section aria-labelledby="proximas-titulo" className="flex flex-col gap-3">
          <h2 id="proximas-titulo" className="m-0 text-h2">
            Próximas atividades
          </h2>
          {next.length === 0 ? (
            <EmptyState icon={CircleCheck} headingLevel="h3" title={EMPTY_DASHBOARD} />
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {next.map((item) => (
                <li key={item.id}>
                  <ActivityCard item={item} />
                </li>
              ))}
            </ul>
          )}
        </section>

        {overdueOpen.length > 0 ? (
          <section aria-labelledby="atrasadas-titulo" className="flex flex-col gap-3">
            <h2 id="atrasadas-titulo" className="m-0 text-h2">
              Atrasadas — ainda aceitam entrega
            </h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {overdueOpen.map((item) => (
                <li key={item.id}>
                  <ActivityCard item={item} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
