import * as React from "react"
import { cn } from "@/lib/utils"

type StatusVariant = "neutral" | "info" | "success" | "warning" | "danger"

const DOT_CLASSES: Record<StatusVariant, string> = {
  neutral: "bg-text-secondary",
  info: "bg-info",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
}

/** Status indicator: a colored dot plus the status in words (never the dot alone). */
function Status({
  variant = "neutral",
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { variant?: StatusVariant; children: React.ReactNode }) {
  return (
    <span
      data-slot="status"
      data-variant={variant}
      className={cn("inline-flex items-center gap-2 text-body-sm text-foreground", className)}
      {...props}
    >
      <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", DOT_CLASSES[variant])} />
      {children}
    </span>
  )
}

export { Status, type StatusVariant }
