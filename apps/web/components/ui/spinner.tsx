import * as React from "react"
import { cn } from "@/lib/utils"
import { LoaderCircle } from "lucide-react"

/** Loading indicator: a spinning icon (only with motion allowed) and text for screen readers. */
function Spinner({
  label = "Carregando…",
  showLabel = false,
  className,
  ...props
}: Omit<React.ComponentProps<"span">, "children"> & {
  label?: string
  /** Also show the text; otherwise it is read only by assistive technology. */
  showLabel?: boolean
}) {
  return (
    <span
      role="status"
      data-slot="spinner"
      className={cn("inline-flex items-center gap-2 text-text-secondary", className)}
      {...props}
    >
      <LoaderCircle aria-hidden="true" className="size-5 text-primary motion-safe:animate-spin" />
      <span className={showLabel ? "text-body-sm" : "sr-only"}>{label}</span>
    </span>
  )
}

export { Spinner }
