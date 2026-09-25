import type { SubjectStatus } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { SUBJECT_STATUS_LABELS } from "@/lib/messages/status-labels";

/** Status of a subject as a badge; the text carries the meaning, the color only repeats it. */
export function SubjectStatusBadge({ status }: { status: SubjectStatus }) {
  return <Badge variant={status === "ACTIVE" ? "success" : "neutral"}>{SUBJECT_STATUS_LABELS[status]}</Badge>;
}
