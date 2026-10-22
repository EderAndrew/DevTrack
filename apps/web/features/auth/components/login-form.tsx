"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { useToast } from "@/components/ui/toast";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { useLogin } from "../hooks/use-auth";
import { type LoginFormInput, LoginFormSchema, loginMessages } from "../schemas/forms";

const FIELD_IDS = { email: "email", password: "senha" } as const;

/** The API refusal is a toast that closes by itself (002, 2026-09-29 amendment). */
const REFUSAL_TOAST_MS = 5_000;

export interface LoginFormProps {
  /** Already validated by `safeNextPath`. */
  next: string;
}

export function LoginForm({ next }: LoginFormProps) {
  const router = useRouter();
  const login = useLogin();
  const { toast } = useToast();
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<LoginFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(LoginFormSchema, { error: loginMessages }),
    defaultValues: { email: "", password: "" },
  });
  // Stays busy after success while the next page loads.
  const pending = formState.isSubmitting || login.isSuccess;

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await login.mutateAsync(values);
      router.replace(next);
      router.refresh();
    } catch (error) {
      // Never points at a field: the API does not say whether the e-mail or the password is wrong.
      // Focus stays on "Entrar"; the toast is announced.
      toast({
        variant: "danger",
        title: "Não foi possível entrar",
        description: messageForError(error),
        duration: REFUSAL_TOAST_MS,
      });
    }
  }, onInvalid);

  return (
    <form noValidate onSubmit={(event) => (pending ? event.preventDefault() : void onSubmit(event))} aria-label="Entrar">
      <ErrorSummary errors={errors} title="Não foi possível entrar" />
      <Field id="email" type="email" label="E-mail" autoComplete="email" required error={errorFor("email")} {...register("email")} />
      <Field
        id="senha"
        type="password"
        label="Senha"
        autoComplete="current-password"
        required
        error={errorFor("senha")}
        {...register("password")}
      />
      <SubmitButton pending={pending} pendingLabel="Entrando…">
        <LogIn aria-hidden="true" />
        Entrar
      </SubmitButton>
    </form>
  );
}
