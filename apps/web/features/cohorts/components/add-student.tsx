"use client";

import type { StudentLookupResponse } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useInviteStudent } from "../hooks/use-cohort-invitations";
import { EMAIL_ERROR_CODES, type InviteStudentFormInput, InviteStudentFormSchema, inviteStudentMessages } from "../schemas/invite-student";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useEnrollStudent, useStudentLookup } from "../hooks/use-cohort-enrollments";

const FIELD_IDS = { email: "email-aluno-turma" } as const;

export interface AddStudentDialogProps {
  cohortId: string;
  /** UX only (the API authorizes): the lookup + direct inclusion (`turmas.incluir_aluno`) and the invitation. */
  canInclude: boolean;
  canInvite: boolean;
}

/**
 * "Adicionar aluno" (027/US2, FR-034, contracts/ui.md): one e-mail field. With `turmas.incluir_aluno` the submit asks
 * the lookup first: a student with an account shows "<nome> · já tem conta" and "Incluir na turma"; one already in
 * the turma shows "Esse aluno já está na turma." with no button; anyone else gets "Enviar convite". Without it the
 * submit invites directly (003). Each result is announced in a `role="status"` region; the names are text.
 */
export function AddStudentDialog({ cohortId, canInclude, canInvite }: AddStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [result, setResult] = useState<{ email: string; lookup: StudentLookupResponse } | null>(null);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const lookup = useStudentLookup(cohortId);
  const enroll = useEnrollStudent(cohortId);
  const invite = useInviteStudent(cohortId);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<InviteStudentFormInput>(FIELD_IDS);
  const { register, handleSubmit, reset, formState } = useForm({
    shouldFocusError: false,
    resolver: zodResolver(InviteStudentFormSchema, { error: inviteStudentMessages }),
    defaultValues: { email: "" },
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setAnnouncement("");
    reset();
    setErrors([]);
    setActionErrors([]);
    setResult(null);
  };

  const done = (message: string) => {
    onOpenChange(false);
    setAnnouncement(message);
  };

  const fail = (error: unknown) => {
    const code = apiErrorCode(error);
    setErrors([{ fieldId: code && EMAIL_ERROR_CODES.includes(code) ? FIELD_IDS.email : undefined, message: messageForError(error) }]);
  };

  const sendInvitation = async (email: string) => {
    setActionErrors([]);
    try {
      await invite.mutateAsync({ email });
      done("Convite enviado.");
    } catch (error) {
      fail(error);
    }
  };

  const onSubmit = handleSubmit(async ({ email }) => {
    setErrors([]);
    setActionErrors([]);
    setResult(null);
    if (!canInclude) return sendInvitation(email);
    try {
      setResult({ email, lookup: await lookup.mutateAsync(email) });
    } catch (error) {
      fail(error);
    }
  }, onInvalid);

  const include = async () => {
    if (!result || enroll.isPending) return;
    setActionErrors([]);
    try {
      await enroll.mutateAsync(result.email);
      done("Aluno incluído na turma.");
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    }
  };

  const found = result?.lookup.found ? result.lookup : null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button type="button">
            <UserPlus aria-hidden="true" />
            Adicionar aluno
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar aluno</DialogTitle>
            <DialogDescription>
              Informe o e-mail exato do aluno. Quem já tem conta de aluno entra na turma na hora; os demais recebem um
              convite por e-mail, válido por 7 dias.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
            aria-label="Adicionar aluno"
          >
            <ErrorSummary errors={errors} title="Não foi possível continuar" />
            <Field
              id={FIELD_IDS.email}
              type="email"
              label="E-mail"
              autoComplete="off"
              required
              error={errorFor(FIELD_IDS.email)}
              {...register("email", { onChange: () => setResult(null) })}
            />
            <div role="status" className="mb-4 flex flex-col gap-2">
              {found && found.alreadyEnrolled ? <p className="m-0 font-semibold">Esse aluno já está na turma.</p> : null}
              {found && !found.alreadyEnrolled ? (
                <p className="m-0">
                  <span className="font-semibold">{found.name}</span> · já tem conta
                </p>
              ) : null}
              {result && !result.lookup.found ? <p className="m-0">Esse e-mail ainda não tem conta de aluno.</p> : null}
            </div>
            <ErrorSummary errors={actionErrors} title="Não foi possível concluir" />
            <DialogFooter>
              {found && !found.alreadyEnrolled ? (
                <Button type="button" aria-busy={enroll.isPending || undefined} onClick={() => void include()}>
                  Incluir na turma
                </Button>
              ) : result && !result.lookup.found && canInvite ? (
                <Button type="button" aria-busy={invite.isPending || undefined} onClick={() => void sendInvitation(result.email)}>
                  Enviar convite
                </Button>
              ) : !result ? (
                <SubmitButton pending={formState.isSubmitting} pendingLabel="Verificando…">
                  {canInclude ? "Continuar" : "Enviar convite"}
                </SubmitButton>
              ) : null}
              <DialogClose asChild>
                <Button type="button" variant="secondary">
                  Cancelar
                </Button>
              </DialogClose>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p role="status" className="m-0 self-center font-semibold">
        {announcement}
      </p>
    </>
  );
}
