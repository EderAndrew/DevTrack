import { cn } from "@/lib/utils"

/**
 * Placeholder shape while content loads; hidden from assistive technology, so mark the
 * container `aria-busy="true"`. It pulses only when motion is allowed.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden="true"
      className={cn("rounded-md bg-border motion-safe:animate-pulse", className)}
      {...props}
    />
  )
}

export { Skeleton }
