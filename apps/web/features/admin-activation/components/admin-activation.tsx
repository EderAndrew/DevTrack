"use client";

import type { AdminActivationPreview } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { PASSWORD_HINT } from "@/features/auth/schemas/password";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useActivateAdmin, usePreviewAdminActivation } from "../hooks/use-admin-activation";
import {
  type ActivationPasswordFormInput,
  ActivationPasswordFormSchema,
  activationPasswordMessages,
} from "../schemas/activation-form";

/**
 * Keeps the token across the login detour of SIGN_IN_REQUIRED without putting it in `?next=`
 * (001/T075); removed as soon as the link is used or refused, so nothing stays after the flow.
 */
export const ACTIVATION_TOKEN_KEY = "devtrack.admin-activation-token";

type State =
  | { step: "loading" }
  | { step: "invalid"; message: string }
  | { step: "ready"; preview: AdminActivationPreview; token: string }
  | { step: "done" };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const FIELD_IDS = { password: "senha" } as const;

export interface AdminActivationProps {
  /** `?token` of the e-mailed link; null when absent (e.g. back from the login page). */
  token: string | null;
}

/**
 * Completes the first-ADMIN bootstrap started by the operator (R14). The API decides the mode;
 * this only shows the matching form and relays the answer.
 */
export function AdminActivation({ token: tokenFromUrl }: AdminActivationProps) {
  const [state, setState] = useState<State>({ step: "loading" });
  const started = useRef(false);
  const { mutate: preview } = usePreviewAdminActivation();
  const activate = useActivateAdmin();
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ActivationPasswordFormInput>(FIELD_IDS);
  const passwordForm = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ActivationPasswordFormSchema, { error: activationPasswordMessages }),
    defaultValues: { password: "" },
  });
  const signedInForm = useForm();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const store = storage();
    if (tokenFromUrl) {
      store?.setItem(ACTIVATION_TOKEN_KEY, tokenFromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenFromUrl ?? store?.getItem(ACTIVATION_TOKEN_KEY) ?? null;
    if (!token) {
      // sessionStorage is only readable after hydration: this effect syncs with the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "invalid", message: "O link de ativação está incompleto." });
      return;
    }
    preview(token, {
      onSuccess: (result) => setState({ step: "ready", preview: result, token }),
      onError: (error) => {
        store?.removeItem(ACTIVATION_TOKEN_KEY);
        setState({ step: "invalid", message: messageForError(error) });
      },
    });
  }, [tokenFromUrl, preview]);

  const submit = async (password?: string) => {
    if (state.step !== "ready") return;
    const { token } = state;
    setErrors([]);
    try {
      await activate.mutateAsync(password === undefined ? { token } : { token, password });
      storage()?.removeItem(ACTIVATION_TOKEN_KEY);
      setState({ step: "done" });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "TOKEN_INVALID" || code === "BOOTSTRAP_ALREADY_DONE") {
        storage()?.removeItem(ACTIVATION_TOKEN_KEY);
        setState({ step: "invalid", message: messageForError(error) });
        return;
      }
      setErrors([{ fieldId: code === "WEAK_PASSWORD" ? "senha" : undefined, message: messageForError(error) }]);
    }
  };

  const onSubmitPassword = passwordForm.handleSubmit(({ password }) => submit(password), onInvalid);
  const onSubmitSignedIn = signedInForm.handleSubmit(() => submit());

  if (state.step === "loading") return <p role="status">Verificando o link de ativação…</p>;

  if (state.step === "invalid") {
    return (
      <Notice role="status">
        <h2>Não foi possível usar este link</h2>
        <p>{state.message}</p>
        <p>Peça ao responsável pela instalação que execute o comando de bootstrap novamente para gerar um novo link.</p>
      </Notice>
    );
  }

  if (state.step === "done") {
    return (
      <Notice role="status">
        <h2>Conta de administrador ativada</h2>
        <p>
          O papel de administrador foi concedido. <Link href="/entrar">Entrar</Link>
        </p>
      </Notice>
    );
  }

  const { email, mode } = state.preview;

  if (mode === "SIGN_IN_REQUIRED") {
    const pending = signedInForm.formState.isSubmitting;
    return (
      <div>
        <p>
          O e-mail <strong>{email}</strong> já tem uma conta. Entre nessa conta e depois conclua a ativação — sua senha
          não será alterada.
        </p>
        <p>
          <Link href="/entrar?next=%2Fativar-admin">Entrar para concluir</Link>
        </p>
        <form
          noValidate
          onSubmit={(event) => (pending ? event.preventDefault() : void onSubmitSignedIn(event))}
          aria-label="Concluir ativação"
        >
          <ErrorSummary errors={errors} title="Não foi possível ativar" />
          <SubmitButton pending={pending} pendingLabel="Ativando…">
            Concluir ativação
          </SubmitButton>
        </form>
      </div>
    );
  }

  const pending = passwordForm.formState.isSubmitting;
  return (
    <form
      noValidate
      onSubmit={(event) => (pending ? event.preventDefault() : void onSubmitPassword(event))}
      aria-label="Definir senha"
    >
      <p>
        Defina a senha da conta <strong>{email}</strong>.
        {mode === "CLAIM_ACCOUNT" ? " Todas as sessões abertas dessa conta serão encerradas." : null}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível ativar" />
      <Field
        id="senha"
        type="password"
        label="Nova senha"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        required
        error={errorFor("senha")}
        {...passwordForm.register("password")}
      />
      <SubmitButton pending={pending} pendingLabel="Ativando…">
        Ativar administrador
      </SubmitButton>
    </form>
  );
}
