import type { ClassStatus } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { CLASS_STATUS_LABELS } from "@/lib/messages/status-labels";

const VARIANT = { ACTIVE: "success", INACTIVE: "warning", ARCHIVED: "neutral" } as const satisfies Record<
  ClassStatus,
  "success" | "warning" | "neutral"
>;

/** Status of a class as a badge; the text carries the meaning, the color only repeats it. */
export function ClassStatusBadge({ status }: { status: ClassStatus }) {
  return <Badge variant={VARIANT[status]}>{CLASS_STATUS_LABELS[status]}</Badge>;
}
