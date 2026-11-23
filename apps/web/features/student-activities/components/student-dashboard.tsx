"use client";

import type { DashboardRanking, StudentDashboard as Dashboard, StudentActivityFilter } from "@repo/contracts";
import { AlarmClock, ArrowUpRight, ChevronRight, CircleCheck, ClipboardList, Hourglass, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatLongDay } from "@/lib/messages/dates";
import { RankingCard } from "@/features/ranking/components/ranking-card";
import { formatPosition } from "@/features/ranking/schemas/ranking";
import { DASHBOARD_PATH } from "@/lib/navigation";
import { useCurrentSubject, useForgetMissingSubject } from "../hooks/use-current-subject";
import { useStudentDashboard } from "../hooks/use-student-activities";
import { formatPoints, myActivitiesHref } from "../schemas/student-activity";
import { historyHref } from "../schemas/student-history";
import { DashboardActivityRow } from "./dashboard-activity-row";
import { LoadFailed, Loading } from "./load-states";
import { SubjectSwitcher, SubjectUnavailableNotice } from "./subject-switcher";

export const EMPTY_DASHBOARD = "Nenhuma atividade pendente.";
export const DASHBOARD_SUBTITLE = "Organize seus estudos e acompanhe cada conquista.";

interface Counter {
  key: keyof Dashboard["counts"];
  label: string;
  caption: string;
  /** The list of the same subject with this filter; "Concluídas" opens the "Histórico" instead (028/FR-025). */
  href: (materia: string | null) => string;
  icon: LucideIcon;
  /** The icon's tint; the label says the same in words. */
  tone: string;
}

const listOf = (status: StudentActivityFilter) => (materia: string | null) => myActivitiesHref({ status, materia });

const COUNTERS: Counter[] = [
  { key: "pending", label: "Pendentes", caption: "Ainda não iniciadas", href: listOf("PENDING"), icon: ClipboardList, tone: "bg-primary-subtle text-primary" },
  { key: "inProgress", label: "Em andamento", caption: "Iniciadas, sem entrega", href: listOf("IN_PROGRESS"), icon: Hourglass, tone: "bg-info-surface text-info-text" },
  { key: "overdue", label: "Atrasadas", caption: "Com o prazo vencido", href: listOf("OVERDUE"), icon: AlarmClock, tone: "bg-warning-surface text-warning-text" },
  {
    key: "completed",
    label: "Concluídas",
    caption: "Entregues ou corrigidas",
    href: (materia) => historyHref({ tab: null, q: "", classId: materia }),
    icon: CircleCheck,
    tone: "bg-success-surface text-success-text",
  },
];

/**
 * The four counters as cards, each a link to the filtered list of the same subject (012 US2-1, 026/US2-4); "Concluídas"
 * to the subject's "Histórico" (028/FR-025).
 */
function Counters({ counts, materia }: { counts: Dashboard["counts"]; materia: string | null }) {
  return (
    <nav aria-label="Resumo das suas atividades">
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-4">
        {COUNTERS.map(({ key, label, caption, href, icon: Icon, tone }) => (
          <li key={key}>
            <Link
              href={href(materia)}
              className="flex h-full min-h-11 flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground no-underline shadow-sm transition-colors hover:bg-accent"
            >
              <span className="flex items-start justify-between gap-2">
                <span className="text-body-sm text-text-secondary">{label}</span>
                <span aria-hidden="true" className={`flex size-10 shrink-0 items-center justify-center rounded-md ${tone}`}>
                  <Icon className="size-5" />
                </span>
              </span>
              <span className="text-display">{counts[key]}</span>
              <span className="text-caption text-text-secondary">{caption}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * "Seu desempenho": the student's place in the classes whose top 5 already lists them (013/FR-021 sends only the top
 * 5, so a student further down gets no highlight; nothing here is computed beyond what the server sent).
 */
function ViewerHighlight({ rankings }: { rankings: DashboardRanking[] }) {
  const places = rankings.flatMap((ranking) => {
    const row = ranking.top.find((entry) => entry.isViewer);
    return row ? [{ classId: ranking.class.id, className: ranking.class.name, position: row.position, points: row.points }] : [];
  });
  if (places.length === 0) return null;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-primary p-5 text-primary-foreground shadow-md">
      <div className="flex items-start justify-between gap-3">
        <h3 className="m-0 text-label uppercase">
          Seu desempenho
        </h3>
        <ArrowUpRight aria-hidden="true" className="size-5" />
      </div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {places.map((place) => (
          <li key={place.classId} className="flex flex-col">
            <span className="text-h3">
              Você está em {formatPosition(place.position)} lugar
            </span>
            <span className="text-body-sm">
              {place.className} · {formatPoints(place.points)}
            </span>
          </li>
        ))}
      </ul>
      <p className="m-0 text-body-sm">Continue assim!</p>
    </div>
  );
}

/**
 * The student's start page (012 US2, contracts/web-ui.md `/painel`; layout reworked on 2026-11-16 with the same
 * data): the day by the server's clock, "Olá, {primeiro nome}", the four counters as cards (links to the filtered
 * list), the next activities by deadline as the first section (SC-001: the next one and its deadline without
 * scrolling) and the overdue ones that still accept a submission. Since 013, one ranking card per class (FR-021),
 * after the activities; from `xl` the rankings sit in a column on the right (the page root is `data-layout="wide"`).
 * Since 026 every block is one subject's (the "Matéria" card, `?materia=<classId>`), asked only once the subject is
 * known, and the counters and "Ver todas" carry it to "Minhas atividades".
 */
export function StudentDashboard({ materia }: { materia: string | null }) {
  const router = useRouter();
  const subject = useCurrentSubject(materia);
  const classId = subject.current?.id ?? null;
  const query = useStudentDashboard(classId, { enabled: !subject.isPending && !subject.isError });
  const forgetting = useForgetMissingSubject(subject, classId, query.error);

  const data = query.isSuccess ? query.data : undefined;
  return (
    <>
      {data ? <p className="m-0 mb-1 text-label uppercase text-text-secondary">{formatLongDay(data.serverNow)}</p> : null}
      {/* One tree for every state, so the card (and its focus) stays while another subject loads. */}
      <PageHeader
        title={data ? (data.firstName ? `Olá, ${data.firstName}` : "Olá") : "Painel"}
        description={data ? DASHBOARD_SUBTITLE : undefined}
        actions={
          subject.current ? (
            <SubjectSwitcher
              options={subject.options}
              currentId={subject.current.id}
              onChange={(id) => router.replace(`${DASHBOARD_PATH}?${new URLSearchParams({ materia: id })}`)}
            />
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        {subject.current && subject.unavailable ? <SubjectUnavailableNotice /> : null}
        {subject.isError ? (
          <LoadFailed error={subject.error} onRetry={subject.refetch} />
        ) : query.isPending || forgetting ? (
          <Loading label="Carregando suas atividades…" />
        ) : query.isError ? (
          <LoadFailed error={query.error} onRetry={() => void query.refetch()} />
        ) : (
          <DashboardBody data={query.data} classId={classId} />
        )}
      </div>
    </>
  );
}

/** The counters, the activities and the rankings of the subject shown. */
function DashboardBody({ data, classId }: { data: Dashboard; classId: string | null }) {
  const { counts, next, overdueOpen, rankings } = data;
  const withRankings = rankings.length > 0;
  return (
    <>
      <Counters counts={counts} materia={classId} />

      <div className={`grid items-start gap-6 ${withRankings ? "xl:grid-cols-3" : ""}`}>
        <div className={`flex min-w-0 flex-col gap-6 ${withRankings ? "xl:col-span-2" : ""}`}>
          <section aria-labelledby="proximas-titulo">
            <Card className="gap-2 shadow-sm">
              <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="proximas-titulo" className="m-0 text-h2">
                  Próximas atividades
                </h2>
                <Link
                  href={myActivitiesHref({ materia: classId })}
                  className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap text-body-sm font-semibold text-primary no-underline hover:underline"
                >
                  Ver todas
                  <ChevronRight aria-hidden="true" className="size-4" />
                </Link>
              </CardHeader>
              <CardContent>
                {next.length === 0 ? (
                  <EmptyState icon={CircleCheck} headingLevel="h3" title={EMPTY_DASHBOARD} />
                ) : (
                  <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                    {next.map((item) => (
                      <li key={item.id}>
                        <DashboardActivityRow item={item} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </section>

          {overdueOpen.length > 0 ? (
            <section aria-labelledby="atrasadas-titulo">
              <Card className="gap-2 border-warning shadow-sm">
                <CardHeader className="flex items-center gap-2">
                  <AlarmClock aria-hidden="true" className="size-5 text-warning-text" />
                  <h2 id="atrasadas-titulo" className="m-0 text-h2">
                    Atrasadas — ainda aceitam entrega
                  </h2>
                </CardHeader>
                <CardContent>
                  <ul className="m-0 flex list-none flex-col divide-y divide-border p-0">
                    {overdueOpen.map((item) => (
                      <li key={item.id}>
                        <DashboardActivityRow item={item} />
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </div>

        {withRankings ? (
          <section aria-labelledby="ranking-titulo" className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 id="ranking-titulo" className="m-0 text-h2">
                Ranking das turmas
              </h2>
              <p className="m-0 text-body-sm text-text-secondary">Pequenas entregas, grandes conquistas.</p>
            </div>
            <ViewerHighlight rankings={rankings} />
            <ul className="m-0 grid list-none gap-4 p-0 md:grid-cols-2 xl:grid-cols-1">
              {rankings.map((ranking) => (
                <li key={ranking.class.id}>
                  <RankingCard ranking={ranking} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
