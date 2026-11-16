"use client";

import type { StudentActivitySummary } from "@repo/contracts";
import { Users } from "lucide-react";
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
  pointsSummary,
  statusLabel,
} from "../schemas/student-activity";
import { UrgentBadge } from "./activity-card";
import { ActivityTypeIcon } from "./activity-type-icon";

/**
 * One activity of the dashboard as a compact row (012 US2, visual of 2026-11-16): the type's icon, the title with
 * type and class, the deadline, the situation in words (and an exercise's points) and the action. The same facts as
 * `ActivityCard`, laid out as a table row from `md`; urgency stays in words and an icon (FR-011).
 */
export function DashboardActivityRow({ item }: { item: StudentActivitySummary }) {
  const headingId = `atividade-${item.id}`;
  const where = item.subjectName ? `${item.class.name} · ${item.subjectName}` : item.class.name;
  return (
    <article
      aria-labelledby={headingId}
      className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 py-4 md:grid-cols-[auto_minmax(0,1fr)_10rem_8.5rem_11rem]"
    >
      <ActivityTypeIcon type={item.type} />

      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={headingId} className="m-0 text-body font-semibold">
          {item.title}
        </h3>
        <p className="m-0 text-caption text-text-secondary">
          {ACTIVITY_TYPE_LABELS[item.type]} • {where}
        </p>
        {item.groupSize !== undefined || item.urgent ? (
          <div className="flex flex-wrap items-center gap-2">
            {item.groupSize !== undefined ? (
              <Badge variant="neutral">
                <Users aria-hidden="true" />
                {IN_GROUP}
              </Badge>
            ) : null}
            <UrgentBadge item={item} />
          </div>
        ) : null}
      </div>

      <dl className="col-span-2 m-0 grid grid-cols-2 gap-4 md:col-span-2 md:grid-cols-[10rem_8.5rem]">
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-caption text-text-secondary">Prazo</dt>
          <dd className={`m-0 text-body-sm ${item.urgent ? "font-semibold text-warning-text" : ""}`}>
            {item.deadline ? formatLongDateTime(item.deadline) : "Sem prazo"}
          </dd>
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <dt className="text-caption text-text-secondary">{item.points ? "Situação e pontos" : "Situação"}</dt>
          <dd className="m-0 flex flex-col items-start gap-1 text-body-sm">
            <Status variant={STATUS_VARIANTS[item.status]}>{statusLabel(item)}</Status>
            {item.points ? <span className="text-primary">{pointsSummary(item.points)} pontos</span> : null}
          </dd>
        </div>
      </dl>

      <div className="col-span-2 md:col-span-1 md:justify-self-end">
        <Button asChild size="sm" variant={item.canAnswer ? "primary" : "secondary"}>
          <Link href={activityHref(item.id)} aria-describedby={headingId}>
            {actionLabel(item)}
          </Link>
        </Button>
      </div>
    </article>
  );
}
