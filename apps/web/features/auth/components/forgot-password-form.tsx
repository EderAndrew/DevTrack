"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { useRequestPasswordReset } from "../hooks/use-auth";
import { type ForgotPasswordFormInput, ForgotPasswordFormSchema, forgotPasswordMessages } from "../schemas/forms";

const FIELD_IDS = { email: "email" } as const;

export function ForgotPasswordForm() {
  const requestReset = useRequestPasswordReset();
  const [done, setDone] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ForgotPasswordFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ForgotPasswordFormSchema, { error: forgotPasswordMessages }),
    defaultValues: { email: "" },
  });

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      setDone((await requestReset.mutateAsync(values)).message);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  if (done) {
    return (
      <Notice ref={doneRef} role="status" tabIndex={-1}>
        <h2>Verifique seu e-mail</h2>
        <p>{done}</p>
        <p>O link vale por 1 hora. Se pedir de novo, só o link mais recente funcionará.</p>
      </Notice>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-label="Recuperar senha"
    >
      <ErrorSummary errors={errors} title="Não foi possível enviar" />
      <Field id="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} {...register("email")} />
      <SubmitButton pending={formState.isSubmitting} pendingLabel="Enviando…">
        Enviar link
      </SubmitButton>
    </form>
  );
}
