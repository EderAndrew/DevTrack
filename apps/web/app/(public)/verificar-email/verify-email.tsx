"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import { authApi, errorMessage } from "../../../lib/auth-api";

type State = "verifying" | "verified" | "invalid";

export interface VerifyEmailProps {
  /** `?token` of the e-mailed link; null when absent. */
  token: string | null;
}

/**
 * Sends the token once when the page opens (FR-014) and removes it from the address bar.
 * When the link cannot be used, offers a new one (FR-015).
 */
export function VerifyEmail({ token }: VerifyEmailProps) {
  const [state, setState] = useState<State>(token ? "verifying" : "invalid");
  const [problem, setProblem] = useState<string | null>(token ? null : "O link de verificação está incompleto.");
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    authApi
      .verifyEmail(token)
      .then(() => setState("verified"))
      .catch((error: unknown) => {
        setProblem(errorMessage(error));
        setState("invalid");
      });
  }, [token]);

  return (
    <div aria-live="polite">
      {state === "verifying" ? <p role="status">Verificando seu e-mail…</p> : null}
      {state === "verified" ? (
        <div className="notice" role="status">
          <h2>E-mail verificado</h2>
          <p>
            Seu e-mail foi confirmado. <Link href="/entrar">Entrar</Link>
          </p>
        </div>
      ) : null}
      {state === "invalid" ? <ResendVerification problem={problem} /> : null}
    </div>
  );
}

function ResendVerification({ problem }: { problem: string | null }) {
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<string | null>(null);

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
      setDone((await authApi.resendVerification(email)).message);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <h2>Não foi possível verificar</h2>
      {problem ? <p>{problem}</p> : null}
      <p>O link pode ter expirado ou sido substituído por um mais recente. Peça um novo link abaixo.</p>
      {done ? (
        <p className="notice" role="status">
          {done}
        </p>
      ) : (
        <form noValidate onSubmit={onSubmit} aria-labelledby="reenvio-titulo">
          <h3 id="reenvio-titulo">Receber novo link</h3>
          <ErrorSummary errors={errors} />
          <Field
            id="email"
            name="email"
            type="email"
            label="E-mail"
            autoComplete="email"
            required
            error={errors.find((error) => error.fieldId === "email")?.message}
          />
          <SubmitButton pending={pending}>Enviar novo link</SubmitButton>
        </form>
      )}
    </div>
  );
}
