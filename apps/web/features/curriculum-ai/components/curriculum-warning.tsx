import type { CurriculumReviewWarningCode } from "@repo/contracts";
import { TriangleAlert } from "lucide-react";
import { CURRICULUM_WARNING_MESSAGES } from "@/lib/messages/error-messages";
import { cn } from "@/lib/utils";

export interface CurriculumWarningProps {
  code: CurriculumReviewWarningCode;
  id?: string;
  className?: string;
}

/** A warning of the proposal next to what it concerns: an icon and the catalog text, never color alone (007/FR-026). */
export function CurriculumWarning({ code, id, className }: CurriculumWarningProps) {
  return (
    <p id={id} data-warning={code} className={cn("m-0 flex items-start gap-1 text-body-sm text-warning-text", className)}>
      <TriangleAlert aria-hidden="true" className="mt-px size-4 shrink-0" />
      {CURRICULUM_WARNING_MESSAGES[code]}
    </p>
  );
}
