import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Field tokens shared by `Input`, `Textarea` and `NativeSelect` (005 contracts/components.md
 * "Formulários"): `--border-control` border on `--surface`, error from `aria-invalid`, success
 * from `data-state="success"`, and the `--disabled-*` tokens.
 */
const fieldClasses =
  "w-full min-w-0 rounded-md border border-border-control bg-surface px-3 py-2 text-body text-foreground transition-colors duration-(--duration-fast) ease-standard selection:bg-primary selection:text-primary-foreground placeholder:text-text-secondary hover:border-foreground disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled-bg disabled:text-disabled-fg aria-invalid:border-2 aria-invalid:border-danger data-[state=success]:border-2 data-[state=success]:border-success"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClasses, "min-h-11", className)}
      {...props}
    />
  )
}

export { Input, fieldClasses }
