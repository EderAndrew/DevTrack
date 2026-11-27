"use client";

import type { ComponentProps } from "react";
import { fieldErrorId } from "@/components/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** A labelled textarea whose error is linked by `aria-describedby`. */
export function TextareaField({
  id,
  label,
  hint,
  error,
  ...props
}: Omit<ComponentProps<"textarea">, "id"> & { id: string; label: string; hint?: string; error?: string }) {
  return (
    <FormField id={id} label={label} description={hint} error={error}>
      {(control) => <Textarea rows={4} {...control} {...props} />}
    </FormField>
  );
}

/** A required confirmation: the box, its label and the error linked to it. */
export function ConfirmationField({
  id,
  label,
  error,
  ...props
}: Omit<ComponentProps<"input">, "id" | "type"> & { id: string; label: string; error?: string }) {
  return (
    <div className="mb-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Checkbox
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? fieldErrorId(id) : undefined}
          {...props}
        />
        <Label htmlFor={id}>{label}</Label>
      </div>
      {error ? (
        <p id={fieldErrorId(id)} className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}
