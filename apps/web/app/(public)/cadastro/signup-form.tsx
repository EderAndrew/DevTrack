"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import { ApiError } from "../../../lib/api-client";
import { authApi, errorMessage, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength } from "../../../lib/auth-api";

/** Checks only what helps the user fill the form; the API is the authority (FR-011). */
function localErrors(name: string, email: string, password: string): FormError[] {
  const errors: FormError[] = [];
  if (!name.trim()) errors.push({ fieldId: "nome", message: "Informe seu nome." });
  if (!email.trim()) errors.push({ fieldId: "email", message: "Informe seu e-mail." });
  const length = passwordLength(password);
  if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
    errors.push({
      fieldId: "senha",
      message: `A senha deve ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.`,
    });
  }
  return errors;
}

export function SignupForm() {
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
    const data = new FormData(event.currentTarget);
    const name = String(data.get("nome") ?? "");
    const email = String(data.get("email") ?? "");
    const password = String(data.get("senha") ?? "");

    const invalid = localErrors(name, email, password);
    setErrors(invalid);
    if (invalid.length > 0) return;

    setPending(true);
    try {
      const { message } = await authApi.signup({ name, email, password });
      setDone(message);
    } catch (error) {
      const fieldId = error instanceof ApiError && error.code === "WEAK_PASSWORD" ? "senha" : undefined;
      setErrors([{ fieldId, message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div ref={doneRef} className="notice" role="status" tabIndex={-1}>
        <h2>Verifique seu e-mail</h2>
        <p>{done}</p>
        <p>O link de confirmação vale por 24 horas.</p>
      </div>
    );
  }

  const errorFor = (id: string) => errors.find((error) => error.fieldId === id)?.message;

  return (
    <form noValidate onSubmit={onSubmit} aria-labelledby="cadastro-titulo">
      <h2 id="cadastro-titulo" className="visually-hidden">
        Dados da conta
      </h2>
      <ErrorSummary errors={errors} />
      <Field id="nome" name="nome" label="Nome" autoComplete="name" required error={errorFor("nome")} />
      <Field id="email" name="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} />
      <Field
        id="senha"
        name="senha"
        type="password"
        label="Senha"
        autoComplete="new-password"
        hint={`De ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres. Evite senhas comuns.`}
        required
        error={errorFor("senha")}
      />
      <SubmitButton pending={pending} pendingLabel="Criando conta…">
        Criar conta
      </SubmitButton>
    </form>
  );
}
