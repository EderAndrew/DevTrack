"use client";

import { useCallback, useState } from "react";
import type { FieldErrors, FieldValues } from "react-hook-form";
import type { FormError } from "@/components/shared";

/**
 * Bridges React Hook Form and `ErrorSummary`: validation errors of the schema and API errors
 * both land in one list, in the order of the fields on screen. `fieldIds` maps each form value
 * to the id of its input (the target of the summary links).
 */
export function useErrorSummary<T extends FieldValues>(fieldIds: Readonly<Partial<Record<keyof T & string, string>>>) {
  const [errors, setErrors] = useState<FormError[]>([]);

  const onInvalid = useCallback(
    (fieldErrors: FieldErrors<T>) =>
      setErrors(
        Object.entries(fieldIds).flatMap(([key, fieldId]) => {
          const message = fieldErrors[key]?.message;
          return typeof message === "string" && fieldId ? [{ fieldId, message }] : [];
        }),
      ),
    [fieldIds],
  );

  const errorFor = (fieldId: string) => errors.find((error) => error.fieldId === fieldId)?.message;

  return { errors, setErrors, onInvalid, errorFor };
}
