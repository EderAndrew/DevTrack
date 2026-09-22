"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { useResendVerification, useVerifyEmail } from "../hooks/use-auth";
import {
  type ResendVerificationFormInput,
  ResendVerificationFormSchema,
  resendVerificationMessages,
} from "../schemas/forms";

type State = "verifying" | "verified" | "invalid";

export interface VerifyEmailProps {
  /** `?token` of the e-mailed link; null when absent. */
  token: string | null;
}

/**
 * Sends the token once when the page opens (FR-014) and removes it from the address bar; the
 * token travels only in the mutation (FR-027). When the link cannot be used, offers a new one (FR-015).
 */
export function VerifyEmail({ token }: VerifyEmailProps) {
  const [state, setState] = useState<State>(token ? "verifying" : "invalid");
  const [problem, setProblem] = useState<string | null>(token ? null : "O link de verificação está incompleto.");
  const { mutate: verifyToken } = useVerifyEmail();
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    window.history.replaceState(null, "", window.location.pathname);
    verifyToken(token, {
      onSuccess: () => setState("verified"),
      onError: (error) => {
        setProblem(messageForError(error));
        setState("invalid");
      },
    });
  }, [token, verifyToken]);

  return (
    <div aria-live="polite">
      {state === "verifying" ? <p role="status">Verificando seu e-mail…</p> : null}
      {state === "verified" ? (
        <Notice role="status">
          <h2>E-mail verificado</h2>
          <p>
            Seu e-mail foi confirmado. <Link href="/entrar">Entrar</Link>
          </p>
        </Notice>
      ) : null}
      {state === "invalid" ? <ResendVerification problem={problem} /> : null}
    </div>
  );
}

const FIELD_IDS = { email: "email" } as const;

function ResendVerification({ problem }: { problem: string | null }) {
  const resend = useResendVerification();
  const [done, setDone] = useState<string | null>(null);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ResendVerificationFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ResendVerificationFormSchema, { error: resendVerificationMessages }),
    defaultValues: { email: "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      setDone((await resend.mutateAsync(values)).message);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  return (
    <div>
      <h2>Não foi possível verificar</h2>
      {problem ? <p>{problem}</p> : null}
      <p>O link pode ter expirado ou sido substituído por um mais recente. Peça um novo link abaixo.</p>
      {done ? (
        <Notice role="status">
          <p className="m-0">{done}</p>
        </Notice>
      ) : (
        <form
          noValidate
          onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
          aria-labelledby="reenvio-titulo"
        >
          <h3 id="reenvio-titulo">Receber novo link</h3>
          <ErrorSummary errors={errors} />
          <Field id="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} {...register("email")} />
          <SubmitButton pending={formState.isSubmitting}>Enviar novo link</SubmitButton>
        </form>
      )}
    </div>
  );
}
