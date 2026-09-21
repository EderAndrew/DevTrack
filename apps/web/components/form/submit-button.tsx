"use client";

import type { MouseEvent, ReactNode } from "react";
import { useFormStatus } from "react-dom";

export interface SubmitButtonProps {
  children: ReactNode;
  /** Text shown and announced while the form is being sent. */
  pendingLabel?: string;
  /** For forms submitted by client code instead of a form action. */
  pending?: boolean;
}

/**
 * Submit button whose busy state is announced (FR-075, R22). It stays focusable while busy
 * (`aria-disabled` instead of `disabled`) and ignores repeated activation.
 */
export function SubmitButton({ children, pendingLabel = "Enviando…", pending: pendingProp = false }: SubmitButtonProps) {
  const status = useFormStatus();
  const pending = pendingProp || status.pending;

  const blockWhilePending = (event: MouseEvent<HTMLButtonElement>) => {
    if (pending) event.preventDefault();
  };

  return (
    <>
      <button
        type="submit"
        className="button"
        aria-disabled={pending || undefined}
        aria-busy={pending || undefined}
        onClick={blockWhilePending}
      >
        {pending ? pendingLabel : children}
      </button>
      <span className="visually-hidden" role="status">
        {pending ? pendingLabel : ""}
      </span>
    </>
  );
}
