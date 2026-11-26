import { ArrowRight, BookOpen, CalendarDays, Clock, Trophy, User } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { classRankingHref } from "@/features/ranking/schemas/ranking";
import { formatDateTime } from "@/lib/messages/dates";
import {
  cardHeading,
  cardStatusBadge,
  mySubjectLabel,
  NO_PERIOD,
  NO_SUBJECTS_YET,
  RANKING_PANEL_TEXT,
  RANKING_PANEL_TITLE,
  subjectActivitiesHref,
  type SubjectCard as SubjectCardData,
} from "../schemas/my-classes";

export interface SubjectCardProps {
  card: SubjectCardData;
  /** Holds `ranking.turma.visualizar`: the "Ranking da turma" panel (013/FR-021). */
  showRanking: boolean;
}

/**
 * One disciplina da turma of the 030 "Minhas turmas" (contracts/ui.md "Card"): an `article` named by its heading, the
 * data on the left and the ranking panel on the right on wide screens, stacked on phones. A turma without disciplinas
 * keeps the turma's facts and says so, with no access or ranking. Every name is text, never HTML.
 */
export function SubjectCard({ card, showRanking }: SubjectCardProps) {
  const headingId = `disciplina-${card.key.replace(/[^a-z0-9-]/gi, "-")}`;
  const heading = cardHeading(card);
  const badge = cardStatusBadge(card);
  const label = mySubjectLabel(card.subjectName, card.cohortName);
  const withRanking = showRanking && card.classId !== null;

  return (
    <article
      aria-labelledby={headingId}
      className="grid gap-6 rounded-md border border-border bg-card p-6 text-card-foreground md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
    >
      <div className="flex min-w-0 flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant="neutral">{card.cohortCode}</Badge>
          <span className="text-body text-text-secondary">{card.cohortName}</span>
          {badge ? <Badge variant="neutral">{badge}</Badge> : null}
        </div>

        <div className="flex flex-col gap-1">
          <h2 id={headingId} className="m-0 text-display break-words">
            {heading.title}
          </h2>
          {heading.isSubject ? <p className="m-0 text-body-sm text-text-secondary">Disciplina</p> : null}
        </div>

        <Separator />

        <dl className="m-0 grid gap-4 sm:grid-cols-3">
          {card.teacherName !== null ? <Fact icon={<User />} term="Professor" value={card.teacherName} /> : null}
          <Fact icon={<CalendarDays />} term="Ano" value={String(card.academicYear)} />
          <Fact icon={<BookOpen />} term="Período" value={card.period ?? NO_PERIOD} />
          <Fact icon={<Clock />} term="Entrada na turma" value={formatDateTime(card.enrolledAt)} wide />
        </dl>

        {card.classId !== null ? (
          <div className="flex flex-wrap items-center gap-4">
            <Button asChild>
              <Link href={subjectActivitiesHref(card.classId)} aria-label={`Acessar ${label}`}>
                Acessar turma
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <span className="text-body-sm text-text-secondary">Código da turma: {card.cohortCode}</span>
          </div>
        ) : (
          <p className="m-0">{NO_SUBJECTS_YET}</p>
        )}
      </div>

      {withRanking && card.classId !== null ? (
        <section className="flex flex-col gap-4 rounded-md border border-border bg-surface p-5" aria-labelledby={`${headingId}-ranking`}>
          <span className="flex size-11 items-center justify-center rounded-md bg-primary-subtle text-primary">
            <Trophy aria-hidden="true" className="size-5" />
          </span>
          <h3 id={`${headingId}-ranking`} className="m-0 text-h3">
            {RANKING_PANEL_TITLE}
          </h3>
          <p className="m-0 text-body text-text-secondary">{RANKING_PANEL_TEXT}</p>
          <Separator className="mt-auto" />
          <Button asChild variant="outline">
            <Link href={classRankingHref(card.classId)} aria-label={`Ver ranking de ${label}`} className="justify-between">
              Ver ranking
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </section>
      ) : null}
    </article>
  );
}

function Fact({ icon, term, value, wide = false }: { icon: ReactNode; term: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "flex min-w-0 flex-col gap-1 sm:col-span-3" : "flex min-w-0 flex-col gap-1"}>
      <dt className="flex items-center gap-2 text-body-sm text-text-secondary">
        <span aria-hidden="true" className="flex [&_svg]:size-4">
          {icon}
        </span>
        {term}
      </dt>
      <dd className="m-0 pl-6 text-body break-words">{value}</dd>
    </div>
  );
}
