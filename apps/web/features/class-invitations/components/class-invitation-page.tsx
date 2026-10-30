"use client";

import type { AcceptClassInvitationRequest, ClassInvitationPreview } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { type UseFormRegisterReturn, useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, Notice, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useLogout } from "@/features/auth/hooks/use-auth";
import { PASSWORD_HINT } from "@/features/auth/schemas/password";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { MY_CLASSES_PATH } from "@/lib/navigation";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useAcceptClassInvitation, usePreviewClassInvitation } from "../hooks/use-class-invitation";
import {
  ClaimAccountFormSchema,
  type CreateAccountFormInput,
  CreateAccountFormSchema,
  createAccountMessages,
  FIELD_ERROR_CODES,
  RaFormSchema,
} from "../schemas/acceptance-form";

const FIELD_IDS = {
  name: "nome",
  ra: "ra",
  password: "senha",
  passwordConfirmation: "confirmar-senha",
} as const;

/** 003 contracts/web-ui.md: an expired link says so; any other unusable one gets the same text. */
const EXPIRED = "Este convite expirou.";
const NOT_VALID = "Este convite não é mais válido.";
const WRONG_ACCOUNT = "Este convite é para outra conta. Saia e entre com o e-mail convidado.";
const unusableMessage = (error: unknown) => (apiErrorCode(error) === "TOKEN_EXPIRED" ? EXPIRED : NOT_VALID);
const UNUSABLE_CODES = new Set(["TOKEN_EXPIRED", "TOKEN_INVALID"]);

/** Login that comes back to this invitation (the token rides in `next`, checked by `safeNextPath`). */
export const loginBackTo = (token: string) =>
  `/entrar?next=${encodeURIComponent(`/convite-turma?token=${encodeURIComponent(token)}`)}`;

type State =
  | { step: "loading" }
  | { step: "unusable"; message: string }
  | { step: "ready"; preview: ClassInvitationPreview; token: string }
  | { step: "done"; alreadyEnrolled: boolean };

/** Fields a form sends besides the token. */
type AcceptFields = Omit<AcceptClassInvitationRequest, "token">;

export interface ClassInvitationPageProps {
  /** `?token` of the e-mailed link (or of the way back from the login); null when absent. */
  token: string | null;
  /** Account of the current session, if any (UX only: the API decides who may accept). */
  signedInAs?: { name: string; email: string } | null;
}

/**
 * Public class invitation page (003 US3/US4, D11). Shows the class, the teacher and the invited
 * e-mail, then the form of the mode the API decided: a new account (CREATE_ACCOUNT), taking over
 * a never-verified account (CLAIM_ACCOUNT), or accepting with the account's own session
 * (SIGN_IN_REQUIRED). The token leaves the address bar as soon as it is read and is kept only
 * in memory.
 */
export function ClassInvitationPage({ token, signedInAs = null }: ClassInvitationPageProps) {
  const router = useRouter();
  const [state, setState] = useState<State>({ step: "loading" });
  const started = useRef(false);
  const { mutate: preview } = usePreviewClassInvitation();
  const accept = useAcceptClassInvitation();

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (!token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState({ step: "unusable", message: NOT_VALID });
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    preview(token, {
      onSuccess: (result) => setState({ step: "ready", preview: result, token }),
      onError: (error) => setState({ step: "unusable", message: unusableMessage(error) }),
    });
  }, [token, preview]);

  if (state.step === "loading") return <p role="status">Verificando o convite…</p>;

  if (state.step === "unusable") {
    return (
      <Notice role="status">
        <h2>Não foi possível usar este convite</h2>
        <p>{state.message}</p>
        <p className="mb-0">Peça um novo convite ao professor da turma.</p>
      </Notice>
    );
  }

  if (state.step === "done") {
    return (
      <Notice role="status">
        <h2>{state.alreadyEnrolled ? "Você já faz parte desta turma." : "Você agora faz parte da turma."}</h2>
        <p className="mb-0">
          <Link href={MY_CLASSES_PATH}>Ver minhas turmas</Link>
        </p>
      </Notice>
    );
  }

  const { preview: invitation } = state;
  const acceptedToken = state.token;
  const handlers = {
    onSubmit: async (fields: AcceptFields) => {
      const result = await accept.mutateAsync({ token: acceptedToken, ...fields });
      setState({ step: "done", alreadyEnrolled: result.alreadyEnrolled });
      // FR-038: a new enrollment goes on to "Minhas turmas", which repeats the confirmation.
      if (!result.alreadyEnrolled) router.replace(`${MY_CLASSES_PATH}?bem-vindo=1`);
      // 022 Z8: a new or claimed account may have just signed in; the root layout reads its theme again.
      router.refresh();
    },
    onUnusable: (error: unknown) => setState({ step: "unusable", message: unusableMessage(error) }),
  };

  return (
    <div>
      <InvitationSummary preview={invitation} />
      {invitation.mode === "CREATE_ACCOUNT" ? (
        <AccountForm email={invitation.email} withRa {...handlers} />
      ) : invitation.mode === "CLAIM_ACCOUNT" ? (
        <>
          <Notice>
            <p className="m-0">
              Este e-mail já tinha um cadastro não confirmado. Ao entrar na turma, você define o nome e a senha da conta,
              a senha anterior deixa de funcionar e todas as sessões abertas dela são encerradas.
            </p>
          </Notice>
          <AccountForm email={invitation.email} withRa={invitation.raRequired} {...handlers} />
        </>
      ) : (
        <SignInAcceptance
          email={invitation.email}
          raRequired={invitation.raRequired}
          signedInAs={signedInAs}
          loginPath={loginBackTo(acceptedToken)}
          {...handlers}
        />
      )}
    </div>
  );
}

function InvitationSummary({ preview }: { preview: ClassInvitationPreview }) {
  const { class: schoolClass, teacherName } = preview;
  return (
    <div className="mb-6">
      <p className="mb-1">Você foi convidado para participar da turma</p>
      <h2 className="mt-0 mb-1">{schoolClass.name}</h2>
      <p className="m-0">
        Código {schoolClass.code} · {schoolClass.academicYear}
        {schoolClass.period ? ` · ${schoolClass.period}` : ""}
      </p>
      <p className="m-0">Professor(a): {teacherName}</p>
    </div>
  );
}

interface AcceptHandlers {
  onSubmit: (fields: AcceptFields) => Promise<void>;
  /** The token stopped working while the form was open. */
  onUnusable: (error: unknown) => void;
}

/** Turns an API refusal into the page's state or an error of the summary (next to a field when it has one). */
function acceptError(error: unknown, onUnusable: (error: unknown) => void): FormError[] {
  const code = apiErrorCode(error);
  if (code && UNUSABLE_CODES.has(code)) {
    onUnusable(error);
    return [];
  }
  const field = code ? FIELD_ERROR_CODES[code] : undefined;
  return [{ fieldId: field ? FIELD_IDS[field] : undefined, message: messageForError(error) }];
}

/**
 * CREATE_ACCOUNT (name, RA, password) and CLAIM_ACCOUNT (name, password, and RA when the profile
 * has none), with the password confirmation (FR-030, FR-034).
 */
function AccountForm({ email, withRa, onSubmit, onUnusable }: { email: string; withRa: boolean } & AcceptHandlers) {
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<CreateAccountFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm<CreateAccountFormInput>({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(withRa ? CreateAccountFormSchema : ClaimAccountFormSchema, { error: createAccountMessages }),
    defaultValues: { name: "", ra: "", password: "", passwordConfirmation: "" },
  });

  const submit = handleSubmit(async ({ name, ra, password }) => {
    setErrors([]);
    try {
      await onSubmit(withRa ? { name, ra, password } : { name, password });
    } catch (error) {
      setErrors(acceptError(error, onUnusable));
    }
  }, onInvalid);

  const pending = formState.isSubmitting;
  return (
    <form
      noValidate
      onSubmit={(event) => (pending ? event.preventDefault() : void submit(event))}
      aria-label="Concluir cadastro"
    >
      <ErrorSummary errors={errors} title="Não foi possível concluir o cadastro" />
      <Field
        id="email"
        name="email"
        type="email"
        label="E-mail"
        hint="O e-mail do convite; não pode ser alterado."
        value={email}
        readOnly
      />
      <Field id={FIELD_IDS.name} label="Nome completo" autoComplete="name" required error={errorFor(FIELD_IDS.name)} {...register("name")} />
      {withRa ? <RaField error={errorFor(FIELD_IDS.ra)} {...register("ra")} /> : null}
      <Field
        id={FIELD_IDS.password}
        type="password"
        label="Senha"
        autoComplete="new-password"
        hint={PASSWORD_HINT}
        required
        error={errorFor(FIELD_IDS.password)}
        {...register("password")}
      />
      <Field
        id={FIELD_IDS.passwordConfirmation}
        type="password"
        label="Confirmar senha"
        autoComplete="new-password"
        required
        error={errorFor(FIELD_IDS.passwordConfirmation)}
        {...register("passwordConfirmation")}
      />
      <SubmitButton pending={pending} pendingLabel="Entrando na turma…">
        Entrar na turma
      </SubmitButton>
    </form>
  );
}

function RaField({ error, ...props }: { error?: string } & UseFormRegisterReturn) {
  return (
    <Field
      id={FIELD_IDS.ra}
      label="RA"
      hint="Seu registro acadêmico: letras, números, ponto, barra e hífen."
      autoComplete="off"
      required
      error={error}
      {...props}
    />
  );
}

interface SignInAcceptanceProps extends AcceptHandlers {
  email: string;
  raRequired: boolean;
  signedInAs: { name: string; email: string } | null;
  /** `/entrar?next=…` back to this invitation. */
  loginPath: string;
}

/**
 * SIGN_IN_REQUIRED (FR-032, FR-033): the e-mail already has a verified account. Without a
 * session the person signs in and comes back; with another account's session, the page says so
 * and offers to leave it; with the invited account, one button (plus the RA when missing).
 */
function SignInAcceptance({ email, raRequired, signedInAs, loginPath, onSubmit, onUnusable }: SignInAcceptanceProps) {
  const router = useRouter();
  const logout = useLogout();
  const [wrongAccount, setWrongAccount] = useState(false);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<{ ra: string }>({ ra: FIELD_IDS.ra });
  const { register, handleSubmit, formState } = useForm<{ ra: string }>({
    shouldFocusError: false,
    resolver: raRequired ? zodResolver(RaFormSchema, { error: createAccountMessages }) : undefined,
    defaultValues: { ra: "" },
  });

  const rightAccount = !wrongAccount && signedInAs?.email.toLowerCase() === email.toLowerCase();

  const submit = handleSubmit(async ({ ra }) => {
    setErrors([]);
    try {
      await onSubmit(raRequired ? { ra } : {});
    } catch (error) {
      // The session changed under the page: show the same guidance as for another account.
      if (apiErrorCode(error) === "WRONG_ACCOUNT") setWrongAccount(true);
      else setErrors(acceptError(error, onUnusable));
    }
  }, onInvalid);

  /** Leaves the current account (cache dropped, 001/FR-024) and signs in again, back to this invitation. */
  const switchAccount = () => {
    if (logout.isPending) return;
    logout.mutate(undefined, {
      onSettled: () => {
        router.replace(loginPath);
        router.refresh();
      },
    });
  };

  if (!signedInAs) {
    return (
      <div>
        <p>
          O e-mail <strong>{email}</strong> já tem uma conta. Entre com ela para aceitar o convite; sua senha não é pedida
          nem alterada pelo convite.
        </p>
        <Button asChild>
          <Link href={loginPath}>Entrar para aceitar</Link>
        </Button>
      </div>
    );
  }

  if (!rightAccount) {
    return (
      <Notice role="status">
        <p>{WRONG_ACCOUNT}</p>
        <Button type="button" aria-busy={logout.isPending || undefined} onClick={switchAccount}>
          Sair e entrar com outra conta
        </Button>
      </Notice>
    );
  }

  const pending = formState.isSubmitting;
  return (
    <form
      noValidate
      onSubmit={(event) => (pending ? event.preventDefault() : void submit(event))}
      aria-label="Aceitar convite"
    >
      <p>
        Você está conectado como <strong>{signedInAs.email}</strong>. A turma entra na sua conta.
      </p>
      <ErrorSummary errors={errors} title="Não foi possível aceitar o convite" />
      {raRequired ? <RaField error={errorFor(FIELD_IDS.ra)} {...register("ra")} /> : null}
      <SubmitButton pending={pending} pendingLabel="Aceitando…">
        Aceitar convite
      </SubmitButton>
    </form>
  );
}
