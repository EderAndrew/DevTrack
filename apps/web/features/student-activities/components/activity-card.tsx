"use client";

import type { StudentActivitySummary } from "@repo/contracts";
import { AlarmClock, MessageSquareText, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  pointsSummary,
  statusLabel,
} from "../schemas/student-activity";

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

/**
 * The student's score, larger, on the right of the card. The same facts as the list beside it, so screen readers read
 * them once: a released grade (never before, 012), or an exercise's points, never called a grade (013).
 */
function CardScore({ item }: { item: StudentActivitySummary }) {
  const score = cardScore(item);
  if (!score) return null;
  return (
    <div aria-hidden="true" className="flex shrink-0 flex-col items-end">
      <span className="font-brand text-h1 text-primary">{score.value}</span>
      <span className="text-caption text-text-secondary">{score.label}</span>
    </div>
  );
}

export interface ActivityCardProps {
  item: StudentActivitySummary;
  /** "Minhas atividades" shows the summary, teacher, publication, grade and feedback too (FR-012). */
  detailed?: boolean;
  headingLevel?: "h3" | "h2";
}

/**
 * One activity of the student (012 contracts/web-ui.md): título, turma/disciplina, tipo, prazo,
 * situação in words, the urgency badge and the action ("Iniciar", "Continuar", "Ver entrega"…).
 * Texts render as text (never HTML).
 */
export function ActivityCard({ item, detailed = false, headingLevel: Heading = "h3" }: ActivityCardProps) {
  const headingId = `atividade-${item.id}`;
  return (
    <article aria-labelledby={headingId} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Heading id={headingId} className="m-0 text-h3">
          {item.title}
        </Heading>
        <div className="flex flex-wrap items-center gap-2">
          {/* 023/US3-3: a group work, for every member, with the group attempt's situation below. */}
          {item.groupSize !== undefined ? (
            <Badge variant="neutral">
              <Users aria-hidden="true" />
              {IN_GROUP}
            </Badge>
          ) : null}
          <UrgentBadge item={item} />
        </div>
      </div>
      {detailed && item.summary ? <p className="m-0 text-body-sm text-text-secondary">{item.summary}</p> : null}
      <div className="flex items-center justify-between gap-4">
        <dl className="m-0 grid min-w-0 grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-body-sm">
          <dt className="text-text-secondary">Turma</dt>
          <dd className="m-0">{item.subjectName ? `${item.class.name} · ${item.subjectName}` : item.class.name}</dd>
          <dt className="text-text-secondary">Tipo</dt>
          <dd className="m-0">{ACTIVITY_TYPE_LABELS[item.type]}</dd>
          {detailed ? (
            <>
              <dt className="text-text-secondary">Professor</dt>
              <dd className="m-0">{item.teacherName}</dd>
              <dt className="text-text-secondary">Publicada em</dt>
              <dd className="m-0">{formatLongDateTime(item.publishedAt)}</dd>
            </>
          ) : null}
          <dt className="text-text-secondary">Prazo</dt>
          <dd className="m-0">{item.deadline ? formatLongDateTime(item.deadline) : "Sem prazo"}</dd>
          <dt className="text-text-secondary">Situação</dt>
          <dd className="m-0">
            <Status variant={STATUS_VARIANTS[item.status]}>{statusLabel(item)}</Status>
          </dd>
          {item.points ? (
            <>
              <dt className="text-text-secondary">Pontos</dt>
              <dd className="m-0">
                {pointsSummary(item.points)}
                {item.points.awaitingCorrection ? " · Aguardando correção" : ""}
              </dd>
            </>
          ) : null}
          {item.result ? (
            <>
              <dt className="text-text-secondary">Nota</dt>
              <dd className="m-0">
                {formatGrade(item.result.grade)} de {formatGrade(item.totalGrade ?? "0.00")}
              </dd>
            </>
          ) : null}
        </dl>
        {detailed ? <CardScore item={item} /> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button asChild variant={item.canAnswer ? "primary" : "secondary"}>
          <Link href={activityHref(item.id)} aria-describedby={headingId}>
            {actionLabel(item)}
          </Link>
        </Button>
        {item.result?.hasFeedback ? (
          <Badge variant="info">
            <MessageSquareText aria-hidden="true" />
            Com feedback
          </Badge>
        ) : null}
      </div>
    </article>
  );
}
