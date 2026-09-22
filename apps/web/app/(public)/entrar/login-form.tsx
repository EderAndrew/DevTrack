"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import { authApi, errorMessage } from "../../../lib/auth-api";

export interface LoginFormProps {
  /** Already validated by `safeNextPath`. */
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("senha") ?? "");

    const missing: FormError[] = [];
    if (!email.trim()) missing.push({ fieldId: "email", message: "Informe seu e-mail." });
    if (!password) missing.push({ fieldId: "senha", message: "Informe sua senha." });
    setErrors(missing);
    if (missing.length > 0) return;

    setPending(true);
    try {
      await authApi.login(email, password);
      router.replace(next);
      router.refresh();
    } catch (error) {
      // Never points at a field: the API does not say whether the e-mail or the password is wrong.
      setErrors([{ message: errorMessage(error) }]);
      setPending(false);
    }
  };

  const errorFor = (id: string) => errors.find((error) => error.fieldId === id)?.message;

  return (
    <form noValidate onSubmit={onSubmit} aria-label="Entrar">
      <ErrorSummary errors={errors} title="Não foi possível entrar" />
      <Field id="email" name="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} />
      <Field
        id="senha"
        name="senha"
        type="password"
        label="Senha"
        autoComplete="current-password"
        required
        error={errorFor("senha")}
      />
      <SubmitButton pending={pending} pendingLabel="Entrando…">
        Entrar
      </SubmitButton>
    </form>
  );
}
