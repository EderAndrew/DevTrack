import * as React from "react"
import { cn } from "@/lib/utils"
import { choiceClasses } from "@/components/ui/checkbox"

/** Native `<input type="radio">`; group the options in a `RadioGroup` (fieldset + legend). */
function Radio({ className, ...props }: Omit<React.ComponentProps<"input">, "type">) {
  return (
    <input
      type="radio"
      data-slot="radio"
      className={cn(choiceClasses, "rounded-full", className)}
      {...props}
    />
  )
}

/** `<fieldset>` whose `<legend>` names the group of options. */
function RadioGroup({
  legend,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<"fieldset">, "children"> & {
  legend: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <fieldset
      data-slot="radio-group"
      className={cn("m-0 flex flex-col gap-2 border-0 p-0", className)}
      {...props}
    >
      <legend className="mb-2 text-label text-foreground">{legend}</legend>
      {children}
    </fieldset>
  )
}

export { Radio, RadioGroup }
