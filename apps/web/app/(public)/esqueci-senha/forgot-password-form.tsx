"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, Notice, SubmitButton } from "@/components/shared";
import { authApi, errorMessage } from "../../../lib/auth-api";

export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    if (!email.trim()) {
      setErrors([{ fieldId: "email", message: "Informe seu e-mail." }]);
      return;
    }
    setErrors([]);
    setPending(true);
    try {
      setDone((await authApi.requestPasswordReset(email)).message);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

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
    <form noValidate onSubmit={onSubmit} aria-label="Recuperar senha">
      <ErrorSummary errors={errors} title="Não foi possível enviar" />
      <Field
        id="email"
        name="email"
        type="email"
        label="E-mail"
        autoComplete="email"
        required
        error={errors.find((error) => error.fieldId === "email")?.message}
      />
      <SubmitButton pending={pending} pendingLabel="Enviando…">
        Enviar link
      </SubmitButton>
    </form>
  );
}
