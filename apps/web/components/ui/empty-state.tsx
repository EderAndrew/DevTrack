import * as React from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

/** Empty list or area: an icon, a title, a short text and at most one action. */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  headingLevel = "h2",
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "title"> & {
  icon: LucideIcon
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
  headingLevel?: "h2" | "h3"
}) {
  const Heading = headingLevel
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-6 py-10 text-center",
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" className="size-6 text-text-secondary" />
      <Heading className="m-0 text-h3 text-foreground">{title}</Heading>
      {description ? <p className="m-0 max-w-(--reading-max) text-body-sm text-text-secondary">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
