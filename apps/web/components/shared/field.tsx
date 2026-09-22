import type { ComponentProps } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

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

export const fieldHintId = (id: string) => `${id}-dica`;
export const fieldErrorId = (id: string) => `${id}-erro`;

/**
 * Labelled input (FR-075, R22) on shadcn `Label`/`Input`: `<label for>`, `aria-describedby`
 * pointing to the hint and the error, and `aria-invalid` while there is an error. Takes the
 * props of React Hook Form's `register()` (name, ref, handlers).
 */
export function Field({ id, name, label, hint, error, required, className, ...inputProps }: FieldProps) {
  const describedBy = [hint && fieldHintId(id), error && fieldErrorId(id)].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("mb-4 flex flex-col gap-1", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? <span className="font-normal text-muted-foreground"> (obrigatório)</span> : null}
      </Label>
      {hint ? (
        <p id={fieldHintId(id)} className="m-0 text-[0.9rem] text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <Input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={fieldErrorId(id)} className="m-0 font-semibold text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
