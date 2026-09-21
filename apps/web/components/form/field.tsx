import type { InputHTMLAttributes } from "react";

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> {
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
 * Labelled input (FR-075, R22): `<label for>`, `aria-describedby` pointing to the hint and
 * the error, and `aria-invalid` while there is an error.
 */
export function Field({ id, name, label, hint, error, required, className, ...inputProps }: FieldProps) {
  const describedBy = [hint && fieldHintId(id), error && fieldErrorId(id)].filter(Boolean).join(" ") || undefined;

  return (
    <div className={["field", error ? "field--invalid" : "", className ?? ""].filter(Boolean).join(" ")}>
      <label htmlFor={id}>
        {label}
        {required ? <span className="field__required"> (obrigatório)</span> : null}
      </label>
      {hint ? (
        <p id={fieldHintId(id)} className="field__hint">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {error ? (
        <p id={fieldErrorId(id)} className="field__error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
