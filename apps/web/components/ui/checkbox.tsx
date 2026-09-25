import * as React from "react"
import { cn } from "@/lib/utils"

/** Choice-control tokens shared by `Checkbox` and `Radio` (005 research V10): 20 px, primary. */
const choiceClasses =
  "size-5 shrink-0 cursor-pointer accent-primary disabled:cursor-not-allowed aria-invalid:outline-2 aria-invalid:outline-offset-2 aria-invalid:outline-danger"

/** Native `<input type="checkbox">`; label it with `<Label htmlFor>` as any other field. */
function Checkbox({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      data-slot="checkbox"
      className={cn(choiceClasses, className)}
      {...props}
    />
  )
}

export { Checkbox, choiceClasses }
