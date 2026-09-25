import * as React from "react"
import { cn } from "@/lib/utils"
import { fieldClasses } from "@/components/ui/input"

/** Multi-line field with the `Input` tokens and states; at least three lines tall. */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(fieldClasses, "flex field-sizing-content min-h-24", className)}
      {...props}
    />
  )
}

export { Textarea }
