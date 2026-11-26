import type { DayKind } from "@repo/contracts";
import {
  BookOpen,
  CalendarClock,
  ClipboardList,
  FileCheck,
  Flag,
  type LucideIcon,
  RotateCcw,
  Sparkles,
  Umbrella,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DAY_KIND_LABELS,
  DAY_KINDS,
  DOT_CLASSES,
  ICON_CLASSES,
  LEGEND_TITLE,
} from "../schemas/day-kinds";

/** The icon of each kind (031/FR-010): with the words, never color alone. */
const ICONS: Record<DayKind, LucideIcon> = {
  CLASS: BookOpen,
  EXAM: FileCheck,
  ASSIGNMENT: ClipboardList,
  REVIEW: RotateCcw,
  MAKEUP: CalendarClock,
  HOLIDAY: Flag,
  RECESS: Umbrella,
  SPECIAL_EVENT: Sparkles,
  TEACHER_ABSENCE: UserX,
};

export function DayKindIcon({
  kind,
  className,
}: {
  kind: DayKind;
  className?: string;
}) {
  const Icon = ICONS[kind];
  return (
    <Icon
      aria-hidden="true"
      data-kind={kind}
      className={cn("size-4 shrink-0", className)}
    />
  );
}

/** The dot of a kind (CK9); decorative, the kind is always said in words next to it. */
export function DayKindDot({ kind }: { kind: DayKind }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block size-2 shrink-0 rounded-full",
        DOT_CLASSES[kind],
      )}
    />
  );
}

/** "Tipos de dia": the nine kinds with their dot and icon, in three columns. */
export function DayKindLegend() {
  return (
    <section aria-labelledby="legenda-tipos" className="flex flex-col gap-3">
      <h3 id="legenda-tipos" className="m-0 text-label">
        {LEGEND_TITLE}
      </h3>
      <ul className="m-0 grid list-none grid-cols-2 gap-x-6 gap-y-3 p-0 text-body-sm text-text-secondary sm:grid-cols-3">
        {DAY_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-2">
            <DayKindDot kind={kind} />
            <DayKindIcon kind={kind} className={ICON_CLASSES[kind]} />
            {DAY_KIND_LABELS[kind]}
          </li>
        ))}
      </ul>
    </section>
  );
}
