import type { ComponentProps } from "react";
import { Alert } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

/**
 * Confirmations and "link not usable" states (Phase 001 `.notice`) as the `info` `Alert`. It keeps
 * only the `role` the caller passes, so a notice without one stays out of the live regions.
 */
export function Notice({ className, role, ...props }: ComponentProps<"div">) {
  return <Alert variant="info" role={role} className={cn("mb-6 [&_h2]:mt-0 [&_h2]:text-h3", className)} {...props} />;
}
