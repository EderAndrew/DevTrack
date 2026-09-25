import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Bordered box for confirmations and "link not usable" states (Phase 001 `.notice`). */
export function Notice({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("mb-6 rounded-md border-2 border-primary p-4 [&_h2]:mt-0 [&_h2]:text-h3", className)}
      {...props}
    />
  );
}
