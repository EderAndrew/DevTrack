"use client";

import { type MouseEvent, useEffect, useRef } from "react";

export interface FormError {
  /** Id of the field in error; omit for errors about the whole form (e.g. API errors). */
  fieldId?: string;
  message: string;
}

export interface ErrorSummaryProps {
  /** Pass a new array on every submission so focus moves back to the summary. */
  errors: readonly FormError[];
  title?: string;
}

/**
 * Error summary (FR-075, R22): an always-present `aria-live="polite"` region, focused after
 * an invalid submission, with links that move focus to each field in error.
 */
export function ErrorSummary({ errors, title = "Corrija os itens abaixo" }: ErrorSummaryProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.length > 0) ref.current?.focus();
  }, [errors]);

  const focusField = (event: MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    const field = document.getElementById(fieldId);
    if (!field) return;
    event.preventDefault();
    field.focus();
    field.scrollIntoView?.({ block: "center" });
  };

  return (
    <div aria-live="polite">
      {errors.length > 0 ? (
        <div ref={ref} className="error-summary" tabIndex={-1} role="group" aria-labelledby="resumo-erros-titulo">
          <h2 id="resumo-erros-titulo" className="error-summary__title">
            {title}
          </h2>
          <ul>
            {errors.map((error, index) => (
              <li key={`${error.fieldId ?? "form"}-${index}`}>
                {error.fieldId ? (
                  <a href={`#${error.fieldId}`} onClick={(event) => focusField(event, error.fieldId!)}>
                    {error.message}
                  </a>
                ) : (
                  error.message
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
