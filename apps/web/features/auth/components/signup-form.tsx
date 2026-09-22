"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useSignup } from "../hooks/use-auth";
import { type SignupFormInput, SignupFormSchema, signupMessages } from "../schemas/forms";
import { PASSWORD_HINT } from "../schemas/password";

const FIELD_IDS = { name: "nome", email: "email", password: "senha" } as const;

/** Checks only what helps the user fill the form; the API is the authority (FR-011). */
export function SignupForm() {
  const signup = useSignup();
  const [done, setDone] = useState<string | null>(null);
  const doneRef = useRef<HTMLDivElement>(null);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<SignupFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(SignupFormSchema, { error: signupMessages }),
    defaultValues: { name: "", email: "", password: "" },
  });

  useEffect(() => {
    if (done) doneRef.current?.focus();
  }, [done]);

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      setDone((await signup.mutateAsync(values)).message);
    } catch (error) {
      const fieldId = apiErrorCode(error) === "WEAK_PASSWORD" ? "senha" : undefined;
      setErrors([{ fieldId, message: messageForError(error) }]);
    }
  }, onInvalid);

  if (done) {
    return (
      <Notice ref={doneRef} role="status" tabIndex={-1}>
        <h2>Verifique seu e-mail</h2>
        <p>{done}</p>
        <p>O link de confirmação vale por 24 horas.</p>
      </Notice>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-labelledby="cadastro-titulo"
    >
      <h2 id="cadastro-titulo" className="sr-only">
        Dados da conta
      </h2>
      <ErrorSummary errors={errors} />
      <Field id="nome" label="Nome" autoComplete="name" required error={errorFor("nome")} {...register("name")} />
      <Field id="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} {...register("email")} />
      <Field
        id="senha"
        type="password"
        label="Senha"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        required
        error={errorFor("senha")}
        {...register("password")}
      />
      <SubmitButton pending={formState.isSubmitting} pendingLabel="Criando conta…">
        Criar conta
      </SubmitButton>
    </form>
  );
}
