import * as React from "react"
import { cn } from "@/lib/utils"
import { FieldMessage } from "@/components/ui/field-message"
import { Label } from "@/components/ui/label"

export const fieldHintId = (id: string) => `${id}-dica`
/** The label's id: names a control that `for` can't reach, such as the code editor (014). */
export const fieldLabelId = (id: string) => `${id}-rotulo`
export const fieldErrorId = (id: string) => `${id}-erro`
export const fieldSuccessId = (id: string) => `${id}-sucesso`

/** Props `FormField` hands to its control so it is labelled and described. */
export interface FormControlProps {
  id: string
  required?: boolean
  "aria-invalid"?: true
  "aria-describedby"?: string
  "data-state"?: "success"
}

export interface FormFieldProps {
  /** The control's id: the label's `for`, and the target of ErrorSummary links (`#id`). */
  id: string
  label: React.ReactNode
  /** Help text between the label and the control. */
  description?: React.ReactNode
  /** Validation message; marks the control `aria-invalid`. */
  error?: React.ReactNode
  /** Confirmation message; marks the control `data-state="success"` (ignored with an error). */
  success?: React.ReactNode
  required?: boolean
  className?: string
  children: (control: FormControlProps) => React.ReactNode
}

/**
 * Label, control, description and message of one field (005 contracts/components.md
 * "FormField"), linked by `for`, `aria-describedby` and `aria-invalid`.
 */
function FormField({ id, label, description, error, success, required, className, children }: FormFieldProps) {
  const showSuccess = !error && Boolean(success)
  const describedBy =
    [description && fieldHintId(id), error && fieldErrorId(id), showSuccess && fieldSuccessId(id)]
      .filter(Boolean)
      .join(" ") || undefined

  return (
    <div data-slot="form-field" className={cn("mb-4 flex flex-col gap-1", className)}>
      <Label id={fieldLabelId(id)} htmlFor={id} required={required}>
        {label}
      </Label>
      {description ? <FieldMessage id={fieldHintId(id)}>{description}</FieldMessage> : null}
      {children({
        id,
        required,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
        "data-state": showSuccess ? "success" : undefined,
      })}
      {error ? (
        <FieldMessage id={fieldErrorId(id)} tone="error">
          {error}
        </FieldMessage>
      ) : null}
      {showSuccess ? (
        <FieldMessage id={fieldSuccessId(id)} tone="success">
          {success}
        </FieldMessage>
      ) : null}
    </div>
  )
}

export { FormField }
