import type { FeedbackCategory, FeedbackStatus } from "@repo/contracts";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "../schemas/feedback-form";
import { STATUS_LABELS } from "../schemas/admin-feedback";

const STATUS_VARIANT = { RECEIVED: "info", IN_REVIEW: "warning", RESOLVED: "success", ARCHIVED: "neutral" } as const satisfies Record<
  FeedbackStatus,
  "info" | "warning" | "success" | "neutral"
>;

/** A feedback's status as a badge; the word carries the meaning, the colour only repeats it. */
export function FeedbackStatusBadge({ status }: { status: FeedbackStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}

export function FeedbackCategoryBadge({ category }: { category: FeedbackCategory }) {
  return <Badge>{CATEGORY_LABELS[category]}</Badge>;
}
