"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useConfirmPasswordReset } from "../hooks/use-auth";
import { type ResetPasswordFormInput, ResetPasswordFormSchema, resetPasswordMessages } from "../schemas/forms";
import { PASSWORD_HINT } from "../schemas/password";

const FIELD_IDS = { password: "senha", confirmation: "confirmacao" } as const;

type State = { step: "form" } | { step: "invalid"; message: string } | { step: "done"; message: string };

export interface ResetPasswordFormProps {
  /** `?token` of the e-mailed link; null when absent. */
  token: string | null;
}

function InvalidLink({ message }: { message: string }) {
  return (
    <Notice role="status">
      <h2>Não foi possível usar este link</h2>
      <p>{message}</p>
      <p>
        O link pode ter expirado, já ter sido usado ou sido substituído por um mais recente.{" "}
        <Link href="/esqueci-senha">Pedir um novo link</Link>
      </p>
    </Notice>
  );
}

/** The token lives only in the props and in the mutation that sends it (FR-027). */
export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, setState] = useState<State>(
    token ? { step: "form" } : { step: "invalid", message: "O link de redefinição está incompleto." },
  );
  const doneRef = useRef<HTMLDivElement>(null);
  const confirmReset = useConfirmPasswordReset();
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ResetPasswordFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ResetPasswordFormSchema, { error: resetPasswordMessages }),
    defaultValues: { password: "", confirmation: "" },
  });

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  useEffect(() => {
    if (state.step === "done") doneRef.current?.focus();
  }, [state.step]);

  const onSubmit = handleSubmit(async ({ password }) => {
    if (!token) return;
    setErrors([]);
    try {
      const { message } = await confirmReset.mutateAsync({ token, password });
      setState({ step: "done", message });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "TOKEN_INVALID") {
        setState({ step: "invalid", message: messageForError(error) });
        return;
      }
      setErrors([{ fieldId: code === "WEAK_PASSWORD" ? "senha" : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  if (state.step === "invalid") return <InvalidLink message={state.message} />;

  if (state.step === "done") {
    return (
      <Notice ref={doneRef} role="status" tabIndex={-1}>
        <h2>Senha redefinida</h2>
        <p>{state.message}</p>
        <p>
          <Link href="/entrar">Entrar</Link>
        </p>
      </Notice>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-label="Definir nova senha"
    >
      <p>Ao concluir, todas as sessões abertas da sua conta serão encerradas.</p>
      <ErrorSummary errors={errors} title="Não foi possível redefinir" />
      <Field
        id="senha"
        type="password"
        label="Nova senha"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        required
        error={errorFor("senha")}
        {...register("password")}
      />
      <Field
        id="confirmacao"
        type="password"
        label="Confirme a nova senha"
        autoComplete="new-password"
        required
        error={errorFor("confirmacao")}
        {...register("confirmation")}
      />
      <SubmitButton pending={formState.isSubmitting} pendingLabel="Salvando…">
        Redefinir senha
      </SubmitButton>
    </form>
  );
}
