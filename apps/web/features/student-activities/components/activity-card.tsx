"use client";

import type { StudentActivitySummary } from "@repo/contracts";
import { AlarmClock, ChevronRight, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Status } from "@/components/ui/status";
import { formatLongDateTime } from "@/lib/messages/dates";
import { IN_GROUP } from "@/features/group-work/schemas/group-work";
import {
  ACTIVITY_TYPE_LABELS,
  STATUS_VARIANTS,
  actionLabel,
  activityHref,
  cardScore,
  formatGrade,
  gradePercent,
  statusLabel,
  wholePercent,
} from "../schemas/student-activity";
import { ActivityTypeIcon } from "./activity-type-icon";

/** The urgency in words and an icon, never color alone (FR-011). */
export function UrgentBadge({ item }: { item: Pick<StudentActivitySummary, "status" | "urgent"> }) {
  if (!item.urgent) return null;
  return (
    <Badge variant="warning">
      <AlarmClock aria-hidden="true" />
      {item.status === "OVERDUE" ? "Ainda aceita entrega com atraso" : "Vence em menos de 48 horas"}
    </Badge>
  );
}

/** What the right panel says while there is no released grade (012: never a grade before the release). */
function pendingGradeNote(item: StudentActivitySummary): string {
  if (item.status === "SUBMITTED" || item.status === "GRADED") return "A nota aparece quando o professor liberar o resultado.";
  return "A nota aparece depois da entrega, da correção e da liberação.";
}

/**
 * The score panel on the right of the card (layout of 2026-11-16): a released grade with its share of the total (the
 * API sends `result` only after the release, 012), an exercise's points (013, never called a grade), or, for a work or
 * an exam not yet released, the maximum grade and when the grade will show. The share is computed in whole hundredths.
 */
function ScorePanel({ item }: { item: StudentActivitySummary }) {
  const score = cardScore(item);
  const panel = "flex flex-col gap-2 rounded-md bg-muted p-4 lg:w-64";

  if (item.result) {
    const percent = gradePercent(item.result.grade, item.totalGrade);
    return (
      <div data-slot="activity-score" className={panel}>
        <p className="m-0 text-label uppercase text-text-secondary">Nota obtida</p>
        <p className="m-0 flex flex-wrap items-baseline gap-2">
          <span className="font-brand text-display">{formatGrade(item.result.grade)}</span>
          {item.totalGrade ? <span className="text-body text-text-secondary">de {formatGrade(item.totalGrade)}</span> : null}
        </p>
        {percent !== null ? (
          <>
            <Progress value={percent} aria-label={`Nota obtida: ${percent}% da nota máxima`} />
            <p className="m-0 text-body-sm font-semibold">{percent}% da nota máxima</p>
          </>
        ) : null}
      </div>
    );
  }

  if (item.points && score) {
    const percent = wholePercent(item.points.earned, item.points.possible);
    return (
      <div data-slot="activity-score" className={panel}>
        <p className="m-0 text-label uppercase text-text-secondary">{score.label}</p>
        <p className="m-0 flex flex-wrap items-baseline gap-2">
          <span className="font-brand text-display">{item.points.earned}</span>
          <span className="text-body text-text-secondary">de {item.points.possible}</span>
        </p>
        {percent !== null ? <Progress value={percent} aria-label={`${score.label}: ${item.points.earned} de ${item.points.possible}`} /> : null}
        {item.points.awaitingCorrection ? <p className="m-0 text-body-sm">Aguardando correção</p> : null}
      </div>
    );
  }

  if (!item.totalGrade) return null;
  return (
    <div data-slot="activity-score" className={panel}>
      <p className="m-0 text-label uppercase text-text-secondary">Nota máxima</p>
      <p className="m-0 text-h2">{formatGrade(item.totalGrade)}</p>
      <p className="m-0 text-body-sm text-text-secondary">{pendingGradeNote(item)}</p>
    </div>
  );
}

export interface ActivityCardProps {
  item: StudentActivitySummary;
  headingLevel?: "h3" | "h2";
}

/**
 * One activity of "Minhas atividades" (012 contracts/web-ui.md, FR-012; layout of 2026-11-16): the type's icon, the
 * title with the type and "Em grupo" badges, turma/disciplina, the summary, professor, publication and deadline, the
 * situation in words with the urgency and feedback badges, the action ("Iniciar", "Continuar", "Ver resultado"…) and
 * the score panel. Texts render as text (never HTML).
 */
export function ActivityCard({ item, headingLevel: Heading = "h3" }: ActivityCardProps) {
  const headingId = `atividade-${item.id}`;
  const where = item.subjectName ? `${item.class.name} · ${item.subjectName}` : item.class.name;
  return (
    <article
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm lg:flex-row"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-start gap-4">
          <ActivityTypeIcon type={item.type} />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Heading id={headingId} className="m-0 text-h3">
                {item.title}
              </Heading>
              <Badge variant="neutral">{ACTIVITY_TYPE_LABELS[item.type]}</Badge>
              {/* 023/US3-3: a group work, for every member, with the group attempt's situation below. */}
              {item.groupSize !== undefined ? (
                <Badge variant="neutral">
                  <Users aria-hidden="true" />
                  {IN_GROUP}
                </Badge>
              ) : null}
            </div>
            <p className="m-0 text-body-sm text-text-secondary">{where}</p>
            {item.summary ? <p className="m-0 text-body-sm">{item.summary}</p> : null}
          </div>
        </div>

        <dl className="m-0 grid grid-cols-1 gap-4 text-body-sm sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-text-secondary">Professor</dt>
            <dd className="m-0">{item.teacherName}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-text-secondary">Publicada em</dt>
            <dd className="m-0">{formatLongDateTime(item.publishedAt)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="text-caption text-text-secondary">Prazo</dt>
            <dd className={`m-0 ${item.urgent ? "font-semibold text-warning-text" : ""}`}>
              {item.deadline ? formatLongDateTime(item.deadline) : "Sem prazo"}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sr-only">Situação:</span>
            <Status variant={STATUS_VARIANTS[item.status]}>{statusLabel(item)}</Status>
            <UrgentBadge item={item} />
            {item.result?.hasFeedback ? (
              <Badge variant="info">
                <MessageSquareText aria-hidden="true" />
                Com feedback
              </Badge>
            ) : null}
          </div>
          <Button asChild variant={item.canAnswer ? "primary" : "secondary"}>
            <Link href={activityHref(item.id)} aria-describedby={headingId}>
              {actionLabel(item)}
              <ChevronRight aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>

      <ScorePanel item={item} />
    </article>
  );
}
