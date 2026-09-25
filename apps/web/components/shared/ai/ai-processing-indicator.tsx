import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AiProcessingIndicatorProps {
  label?: string;
  className?: string;
}

/**
 * Work in progress without a percentage: the AI gives no progress (006/US9-1). The icon spins
 * only when motion is allowed; the text is always visible and announced politely.
 */
export function AiProcessingIndicator({ label = "Processando com IA…", className }: AiProcessingIndicatorProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-slot="ai-processing-indicator"
      className={cn("inline-flex items-center gap-2 text-body-sm text-text-secondary", className)}
    >
      <Loader aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />
      <span>{label}</span>
    </div>
  );
}
