"use client";

import { LatePolicySchema } from "@repo/contracts";
import type { ComponentProps } from "react";
import { fieldErrorId } from "@/components/shared";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { LATE_POLICY_LABELS } from "../schemas/activity-form";

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

/** "Entrega atrasada": Não aceitar / Aceitar e marcar como atrasada (FR-024a). */
export function LatePolicyField({ idPrefix, ...register }: Omit<ComponentProps<"input">, "id" | "type" | "value"> & { idPrefix: string }) {
  return (
    <RadioGroup legend="Entrega atrasada" className="mb-4">
      {LatePolicySchema.options.map((policy) => (
        <div key={policy} className="flex items-center gap-2">
          <Radio id={`${idPrefix}-${policy}`} value={policy} {...register} />
          <Label htmlFor={`${idPrefix}-${policy}`}>{LATE_POLICY_LABELS[policy]}</Label>
        </div>
      ))}
    </RadioGroup>
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
