"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, Notice, SubmitButton } from "@/components/shared";
import { ApiError } from "../../../lib/api-client";
import {
  type AdminActivationPreview,
  authApi,
  errorMessage,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
} from "../../../lib/auth-api";

/** Keeps the token across the login detour of SIGN_IN_REQUIRED without putting it in `?next=`. */
export const ACTIVATION_TOKEN_KEY = "devtrack.admin-activation-token";

type State =
  | { step: "loading" }
  | { step: "invalid"; message: string }
  | { step: "ready"; preview: AdminActivationPreview }
  | { step: "done" };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

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
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const store = storage();
    if (tokenFromUrl) {
      store?.setItem(ACTIVATION_TOKEN_KEY, tokenFromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenFromUrl ?? store?.getItem(ACTIVATION_TOKEN_KEY) ?? null;
    tokenRef.current = token;
    if (!token) {
      setState({ step: "invalid", message: "O link de ativação está incompleto." });
      return;
    }
    authApi
      .previewAdminActivation(token)
      .then((preview) => setState({ step: "ready", preview }))
      .catch((error: unknown) => {
        store?.removeItem(ACTIVATION_TOKEN_KEY);
        setState({ step: "invalid", message: errorMessage(error) });
      });
  }, [tokenFromUrl]);

  const activate = async (password?: string) => {
    const token = tokenRef.current;
    if (!token || pending) return;
    setPending(true);
    try {
      await authApi.activateAdmin(token, password);
      storage()?.removeItem(ACTIVATION_TOKEN_KEY);
      setState({ step: "done" });
    } catch (error) {
      if (error instanceof ApiError && (error.code === "TOKEN_INVALID" || error.code === "BOOTSTRAP_ALREADY_DONE")) {
        storage()?.removeItem(ACTIVATION_TOKEN_KEY);
        setState({ step: "invalid", message: errorMessage(error) });
        return;
      }
      const fieldId = error instanceof ApiError && error.code === "WEAK_PASSWORD" ? "senha" : undefined;
      setErrors([{ fieldId, message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  const onSubmitPassword = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("senha") ?? "");
    const length = passwordLength(password);
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
      setErrors([
        { fieldId: "senha", message: `A senha deve ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.` },
      ]);
      return;
    }
    setErrors([]);
    void activate(password);
  };

  const onSubmitSignedIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors([]);
    void activate();
  };

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
  const errorFor = (id: string) => errors.find((error) => error.fieldId === id)?.message;

  if (mode === "SIGN_IN_REQUIRED") {
    return (
      <div>
        <p>
          O e-mail <strong>{email}</strong> já tem uma conta. Entre nessa conta e depois conclua a ativação — sua senha
          não será alterada.
        </p>
        <p>
          <Link href="/entrar?next=%2Fativar-admin">Entrar para concluir</Link>
        </p>
        <form noValidate onSubmit={onSubmitSignedIn} aria-label="Concluir ativação">
          <ErrorSummary errors={errors} title="Não foi possível ativar" />
          <SubmitButton pending={pending} pendingLabel="Ativando…">
            Concluir ativação
          </SubmitButton>
        </form>
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmitPassword} aria-label="Definir senha">
      <p>
        Defina a senha da conta <strong>{email}</strong>.
        {mode === "CLAIM_ACCOUNT" ? " Todas as sessões abertas dessa conta serão encerradas." : null}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível ativar" />
      <Field
        id="senha"
        name="senha"
        type="password"
        label="Nova senha"
        autoComplete="new-password"
        hint={`De ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres. Evite senhas comuns.`}
        required
        error={errorFor("senha")}
      />
      <SubmitButton pending={pending} pendingLabel="Ativando…">
        Ativar administrador
      </SubmitButton>
    </form>
  );
}
