"use client";

import Link from "next/link";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import { useRouter } from "next/navigation";
import { ApiError } from "../../../lib/api-client";
import { type InvitationPreview, invitationApi, ROLE_LABELS } from "../../../lib/admin-api";
import { authApi, errorMessage, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength } from "../../../lib/auth-api";

/** Keeps the token across the login detour of SIGN_IN_REQUIRED without putting it in `?next=`. */
export const INVITATION_TOKEN_KEY = "devtrack.invitation-token";

type State =
  | { step: "loading" }
  | { step: "invalid"; message: string }
  | { step: "ready"; preview: InvitationPreview }
  | { step: "done"; role: string };

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export interface InvitationAcceptanceProps {
  /** `?token` of the e-mailed link; null when absent (e.g. back from the login page). */
  token: string | null;
  /** Account of the current session, if any (UX only). */
  signedInAs?: { name: string; email: string } | null;
}

const LOGIN_BACK_HERE = "/entrar?next=%2Fconvite";

/** Accepts a MANAGER/TEACHER invitation (R15). The API decides the mode and every rule. */
export function InvitationAcceptance({ token: tokenFromUrl, signedInAs = null }: InvitationAcceptanceProps) {
  const router = useRouter();
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
      store?.setItem(INVITATION_TOKEN_KEY, tokenFromUrl);
      window.history.replaceState(null, "", window.location.pathname);
    }
    const token = tokenFromUrl ?? store?.getItem(INVITATION_TOKEN_KEY) ?? null;
    tokenRef.current = token;
    if (!token) {
      setState({ step: "invalid", message: "O link do convite está incompleto." });
      return;
    }
    invitationApi
      .preview(token)
      .then((preview) => setState({ step: "ready", preview }))
      .catch((error: unknown) => {
        store?.removeItem(INVITATION_TOKEN_KEY);
        setState({ step: "invalid", message: errorMessage(error) });
      });
  }, [tokenFromUrl]);

  const accept = async (password?: string) => {
    const token = tokenRef.current;
    if (!token || pending) return;
    setPending(true);
    try {
      const { role } = await invitationApi.accept(token, password);
      storage()?.removeItem(INVITATION_TOKEN_KEY);
      setState({ step: "done", role });
    } catch (error) {
      if (error instanceof ApiError && error.code === "TOKEN_INVALID") {
        storage()?.removeItem(INVITATION_TOKEN_KEY);
        setState({ step: "invalid", message: error.message });
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
    void accept(password);
  };

  /** Leaves the wrong account; the token stays in sessionStorage for the way back. */
  const switchAccount = async () => {
    try {
      await authApi.logout();
    } catch {
      // Already signed out is fine.
    }
    router.replace(LOGIN_BACK_HERE);
    router.refresh();
  };

  const onSubmitSignedIn = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrors([]);
    void accept();
  };

  if (state.step === "loading") return <p role="status">Verificando o convite…</p>;

  if (state.step === "invalid") {
    return (
      <div className="notice" role="status">
        <h2>Não foi possível usar este convite</h2>
        <p>{state.message}</p>
        <p>O convite pode ter expirado, sido revogado ou substituído. Peça um novo convite a quem o enviou.</p>
      </div>
    );
  }

  if (state.step === "done") {
    return (
      <div className="notice" role="status">
        <h2>Convite aceito</h2>
        <p>
          Boas-vindas! Você agora tem o papel de {ROLE_LABELS[state.role] ?? state.role}.{" "}
          {signedInAs ? <Link href="/">Ir para o início</Link> : <Link href="/entrar">Entrar</Link>}
        </p>
      </div>
    );
  }

  const { email, displayName, role, mode } = state.preview;
  const roleLabel = ROLE_LABELS[role] ?? role;
  const errorFor = (id: string) => errors.find((error) => error.fieldId === id)?.message;

  if (mode === "SIGN_IN_REQUIRED") {
    const rightAccount = signedInAs?.email.toLowerCase() === email.toLowerCase();
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
          <div className="notice" role="status">
            <p>Para aceitar, é preciso entrar com a conta {email}.</p>
            <button type="button" className="button" onClick={() => void switchAccount()}>
              Sair e entrar com outra conta
            </button>
          </div>
        ) : null}
        {rightAccount ? (
          <form noValidate onSubmit={onSubmitSignedIn} aria-label="Aceitar convite">
            <ErrorSummary errors={errors} title="Não foi possível aceitar" />
            <SubmitButton pending={pending} pendingLabel="Aceitando…">
              Aceitar convite
            </SubmitButton>
          </form>
        ) : null}
      </div>
    );
  }

  return (
    <form noValidate onSubmit={onSubmitPassword} aria-label="Definir senha">
      <p>
        {displayName}, você foi convidado para o papel de <strong>{roleLabel}</strong>. Defina a senha da conta{" "}
        <strong>{email}</strong>.
      </p>
      {mode === "CLAIM_ACCOUNT" ? (
        <p className="notice">
          Este e-mail já tinha um cadastro não confirmado. Ao aceitar, a senha anterior deixa de funcionar e todas as
          sessões abertas dessa conta serão encerradas.
        </p>
      ) : null}
      <ErrorSummary errors={errors} title="Não foi possível aceitar" />
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
      <SubmitButton pending={pending} pendingLabel="Aceitando…">
        Aceitar convite
      </SubmitButton>
    </form>
  );
}
