"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import { ApiError } from "../../../lib/api-client";
import {
  authApi,
  errorMessage,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
} from "../../../lib/auth-api";

type State = { step: "form" } | { step: "invalid"; message: string } | { step: "done"; message: string };

export interface ResetPasswordFormProps {
  /** `?token` of the e-mailed link; null when absent. */
  token: string | null;
}

function InvalidLink({ message }: { message: string }) {
  return (
    <div className="notice" role="status">
      <h2>Não foi possível usar este link</h2>
      <p>{message}</p>
      <p>
        O link pode ter expirado, já ter sido usado ou sido substituído por um mais recente.{" "}
        <Link href="/esqueci-senha">Pedir um novo link</Link>
      </p>
    </div>
  );
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [state, setState] = useState<State>(
    token ? { step: "form" } : { step: "invalid", message: "O link de redefinição está incompleto." },
  );
  const [errors, setErrors] = useState<FormError[]>([]);
  const [pending, setPending] = useState(false);
  const tokenRef = useRef(token);
  const doneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) window.history.replaceState(null, "", window.location.pathname);
  }, [token]);

  useEffect(() => {
    if (state.step === "done") doneRef.current?.focus();
  }, [state.step]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !tokenRef.current) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("senha") ?? "");
    const confirmation = String(data.get("confirmacao") ?? "");

    const invalid: FormError[] = [];
    const length = passwordLength(password);
    if (length < PASSWORD_MIN_LENGTH || length > PASSWORD_MAX_LENGTH) {
      invalid.push({ fieldId: "senha", message: `A senha deve ter de ${PASSWORD_MIN_LENGTH} a ${PASSWORD_MAX_LENGTH} caracteres.` });
    }
    if (confirmation !== password) invalid.push({ fieldId: "confirmacao", message: "As senhas não coincidem." });
    setErrors(invalid);
    if (invalid.length > 0) return;

    setPending(true);
    try {
      const { message } = await authApi.confirmPasswordReset(tokenRef.current, password);
      setState({ step: "done", message });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TOKEN_INVALID") {
        setState({ step: "invalid", message: error.message });
        return;
      }
      const fieldId = error instanceof ApiError && error.code === "WEAK_PASSWORD" ? "senha" : undefined;
      setErrors([{ fieldId, message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  if (state.step === "invalid") return <InvalidLink message={state.message} />;

  if (state.step === "done") {
    return (
      <div ref={doneRef} className="notice" role="status" tabIndex={-1}>
        <h2>Senha redefinida</h2>
        <p>{state.message}</p>
        <p>
          <Link href="/entrar">Entrar</Link>
        </p>
      </div>
    );
  }

  const errorFor = (id: string) => errors.find((error) => error.fieldId === id)?.message;
  return (
    <form noValidate onSubmit={onSubmit} aria-label="Definir nova senha">
      <p>Ao concluir, todas as sessões abertas da sua conta serão encerradas.</p>
      <ErrorSummary errors={errors} title="Não foi possível redefinir" />
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
      <Field
        id="confirmacao"
        name="confirmacao"
        type="password"
        label="Confirme a nova senha"
        autoComplete="new-password"
        required
        error={errorFor("confirmacao")}
      />
      <SubmitButton pending={pending} pendingLabel="Salvando…">
        Redefinir senha
      </SubmitButton>
    </form>
  );
}
