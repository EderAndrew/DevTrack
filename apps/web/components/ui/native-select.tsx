import * as React from "react"
import { cn } from "@/lib/utils"
import { ChevronDown } from "lucide-react"
import { fieldClasses } from "@/components/ui/input"

/**
 * Native `<select>` with the field tokens (005 research V10): the most accessible list for a
 * short set of options. The chevron sits over the select in the same grid cell.
 */
function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <div data-slot="native-select-wrapper" className="relative inline-grid">
      <select
        data-slot="native-select"
        className={cn(
          fieldClasses,
          "col-start-1 row-start-1 min-h-11 cursor-pointer appearance-none pr-10",
          className
        )}
        {...props}
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none col-start-1 row-start-1 mr-3 size-5 self-center justify-self-end text-text-secondary"
      />
    </div>
  )
}

export { NativeSelect }
