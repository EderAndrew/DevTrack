import type { ComponentProps } from "react";
import { FormField, fieldErrorId, fieldHintId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";

export { fieldErrorId, fieldHintId };

export interface FieldProps extends Omit<ComponentProps<"input">, "id" | "name"> {
  /** Also the target of ErrorSummary links (`#id`). */
  id: string;
  name: string;
  label: string;
  /** Help text shown below the label, announced with the field. */
  hint?: string;
  /** Validation message; marks the input `aria-invalid`. */
  error?: string;
}

/**
 * Labelled text input (FR-075, R22) on the design system's `FormField` and `Input`: `<label
 * for>`, `aria-describedby` pointing to the hint and the error, and `aria-invalid` while there
 * is an error. Takes the props of React Hook Form's `register()` (name, ref, handlers).
 */
export function Field({ id, name, label, hint, error, required, className, ...inputProps }: FieldProps) {
  return (
    <FormField id={id} label={label} description={hint} error={error} required={required} className={className}>
      {(control) => <Input name={name} {...control} {...inputProps} />}
    </FormField>
  );
}
