import * as React from "react"
import { cn } from "@/lib/utils"
import { CircleAlert, CircleCheck } from "lucide-react"

type FieldMessageTone = "description" | "error" | "success"

const TONE_CLASSES: Record<FieldMessageTone, string> = {
  description: "text-caption text-text-secondary",
  error: "text-body-sm font-semibold text-danger-text",
  success: "text-body-sm text-success-text",
}

const TONE_ICONS = { error: CircleAlert, success: CircleCheck } as const

/**
 * Text under a field, linked to it by `id` through `aria-describedby`: a description, or an
 * error or success message that pairs the color with an icon and words (005 US2-3).
 */
function FieldMessage({
  tone = "description",
  className,
  children,
  ...props
}: React.ComponentProps<"p"> & { id: string; tone?: FieldMessageTone }) {
  const Icon = tone === "description" ? null : TONE_ICONS[tone]
  return (
    <p
      data-slot="field-message"
      data-tone={tone}
      className={cn("m-0", TONE_CLASSES[tone], Icon && "flex items-start gap-1", className)}
      {...props}
    >
      {Icon ? <Icon aria-hidden="true" className="mt-px size-4 shrink-0" /> : null}
      {children}
    </p>
  )
}

export { FieldMessage, type FieldMessageTone }
