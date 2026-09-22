"use client";

import type { InvitationPreview } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, Notice, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-auth";
import { PASSWORD_HINT } from "@/features/auth/schemas/password";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { ROLE_LABELS } from "@/lib/messages/status-labels";
import { useAcceptInvitation, usePreviewInvitation } from "../hooks/use-invitation";
import {
  type AcceptancePasswordFormInput,
  AcceptancePasswordFormSchema,
  acceptancePasswordMessages,
} from "../schemas/acceptance-form";

/**
 * Keeps the token across the login detour of SIGN_IN_REQUIRED without putting it in `?next=`
 * (001/R15); removed as soon as the invitation is accepted or refused, so nothing stays after the flow.
 */
export const INVITATION_TOKEN_KEY = "devtrack.invitation-token";

type State =
  | { step: "loading" }
  | { step: "invalid"; message: string }
  | { step: "ready"; preview: InvitationPreview; token: string }
  | { step: "done"; role: InvitationPreview["role"] };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const FIELD_IDS = { password: "senha" } as const;
const LOGIN_BACK_HERE = "/entrar?next=%2Fconvite";

export interface InvitationAcceptanceProps {
  /** `?token` of the e-mailed link; null when absent (e.g. back from the login page). */
  token: string | null;
  /** Account of the current session, if any (UX only). */
  signedInAs?: { name: string; email: string } | null;
}

/** Accepts a MANAGER/TEACHER invitation (R15). The API decides the mode and every rule. */
export function InvitationAcceptance({ token: tokenFromUrl, signedInAs = null }: InvitationAcceptanceProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const started = useRef(false);
  const { mutate: preview } = usePreviewInvitation();
  const accept = useAcceptInvitation();
  const logout = useLogout();
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<AcceptancePasswordFormInput>(FIELD_IDS);
  const passwordForm = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(AcceptancePasswordFormSchema, { error: acceptancePasswordMessages }),
    defaultValues: { password: "" },
  });
  const signedInForm = useForm();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const store = storage();
    if (tokenFromUrl) {
      store?.setItem(INVITATION_TOKEN_KEY, tokenFromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenFromUrl ?? store?.getItem(INVITATION_TOKEN_KEY) ?? null;
    if (!token) {
      // sessionStorage is only readable after hydration: this effect syncs with the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "invalid", message: "O link do convite está incompleto." });
      return;
    }
    preview(token, {
      onSuccess: (result) => setState({ step: "ready", preview: result, token }),
      onError: (error) => {
        store?.removeItem(INVITATION_TOKEN_KEY);
        setState({ step: "invalid", message: messageForError(error) });
      },
    });
  }, [tokenFromUrl, preview]);

  const submit = async (password?: string) => {
    if (state.step !== "ready") return;
    const { token } = state;
    setErrors([]);
    try {
      const { role } = await accept.mutateAsync(password === undefined ? { token } : { token, password });
      storage()?.removeItem(INVITATION_TOKEN_KEY);
      setState({ step: "done", role });
    } catch (error) {
      const code = apiErrorCode(error);
      if (code === "TOKEN_INVALID") {
        storage()?.removeItem(INVITATION_TOKEN_KEY);
        setState({ step: "invalid", message: messageForError(error) });
        return;
      }
      setErrors([{ fieldId: code === "WEAK_PASSWORD" ? "senha" : undefined, message: messageForError(error) }]);
    }
  };

  const onSubmitPassword = passwordForm.handleSubmit(({ password }) => submit(password), onInvalid);
  const onSubmitSignedIn = signedInForm.handleSubmit(() => submit());

  /** Leaves the wrong account (cache dropped, FR-024); the token stays in sessionStorage for the way back. */
  const switchAccount = () => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace(LOGIN_BACK_HERE);
        router.refresh();
      },
    });
  };

  if (state.step === "loading") return <p role="status">Verificando o convite…</p>;

  if (state.step === "invalid") {
    return (
      <Notice role="status">
        <h2>Não foi possível usar este convite</h2>
        <p>{state.message}</p>
        <p>O convite pode ter expirado, sido revogado ou substituído. Peça um novo convite a quem o enviou.</p>
      </Notice>
    );
  }

  if (state.step === "done") {
    return (
      <Notice role="status">
        <h2>Convite aceito</h2>
        <p>
          Boas-vindas! Você agora tem o papel de {ROLE_LABELS[state.role] ?? state.role}.{" "}
          {signedInAs ? <Link href="/">Ir para o início</Link> : <Link href="/entrar">Entrar</Link>}
        </p>
      </Notice>
    );
  }

  const { email, displayName, role, mode } = state.preview;
  const roleLabel = ROLE_LABELS[role] ?? role;

  if (mode === "SIGN_IN_REQUIRED") {
    const rightAccount = signedInAs?.email.toLowerCase() === email.toLowerCase();
    const pending = signedInForm.formState.isSubmitting;
    return (
      <div>
        <p>
          {displayName}, você foi convidado para o papel de <strong>{roleLabel}</strong>. O e-mail <strong>{email}</strong> já
          tem uma conta: o convite é aceito nela, e sua senha não será alterada.
        </p>
        {signedInAs ? (
          <p>
            Você está conectado como <strong>{signedInAs.email}</strong>.
          </p>
        ) : null}
        {!signedInAs ? (
          <p>
            <Link href={LOGIN_BACK_HERE}>Entrar para aceitar</Link>
          </p>
        ) : null}
        {signedInAs && !rightAccount ? (
          <Notice role="status">
            <p>Para aceitar, é preciso entrar com a conta {email}.</p>
            <Button type="button" aria-busy={logout.isPending || undefined} onClick={switchAccount}>
              Sair e entrar com outra conta
            </Button>
          </Notice>
        ) : null}
        {rightAccount ? (
          <form
            noValidate
            onSubmit={(event) => (pending ? event.preventDefault() : void onSubmitSignedIn(event))}
            aria-label="Aceitar convite"
          >
            <ErrorSummary errors={errors} title="Não foi possível aceitar" />
            <SubmitButton pending={pending} pendingLabel="Aceitando…">
              Aceitar convite
            </SubmitButton>
          </form>
        ) : null}
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
        {displayName}, você foi convidado para o papel de <strong>{roleLabel}</strong>. Defina a senha da conta{" "}
        <strong>{email}</strong>.
      </p>
      {mode === "CLAIM_ACCOUNT" ? (
        <Notice>
          <p className="m-0">
            Este e-mail já tinha um cadastro não confirmado. Ao aceitar, a senha anterior deixa de funcionar e todas as
            sessões abertas dessa conta serão encerradas.
          </p>
        </Notice>
      ) : null}
      <ErrorSummary errors={errors} title="Não foi possível aceitar" />
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
      <SubmitButton pending={pending} pendingLabel="Aceitando…">
        Aceitar convite
      </SubmitButton>
    </form>
  );
}
