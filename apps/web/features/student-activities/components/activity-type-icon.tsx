import type { ActivityType } from "@repo/contracts";
import { ClipboardCheck, FileText, ListChecks, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** The type's icon and tint; the type is always written beside it, so the icon is decoration. */
const TYPE_ICONS: Record<ActivityType, { icon: LucideIcon; tone: string }> = {
  EXERCISE: { icon: ListChecks, tone: "bg-primary-subtle text-primary" },
  ASSIGNMENT: { icon: FileText, tone: "bg-success-surface text-success-text" },
  EXAM: { icon: ClipboardCheck, tone: "bg-warning-surface text-warning-text" },
};

/** The activity type's icon in a tinted square (the student's dashboard and "Minhas atividades"). */
export function ActivityTypeIcon({ type, className }: { type: ActivityType; className?: string }) {
  const { icon: Icon, tone } = TYPE_ICONS[type];
  return (
    <span aria-hidden="true" className={cn("flex size-10 shrink-0 items-center justify-center rounded-md", tone, className)}>
      <Icon className="size-5" />
    </span>
  );
}
