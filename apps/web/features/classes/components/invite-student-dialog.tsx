"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
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
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useInviteStudent } from "../hooks/use-class-invitations";
import {
  EMAIL_ERROR_CODES,
  type InviteStudentFormInput,
  InviteStudentFormSchema,
  inviteStudentMessages,
} from "../schemas/invite-student";

const FIELD_IDS = { email: "email-convite" } as const;

export interface InviteStudentDialogProps {
  classId: string;
}

/**
 * "Convidar aluno" (FR-010, US2): a modal dialog with the e-mail only. Radix keeps focus inside
 * while it is open and returns it to the button when it closes. On success the dialog closes and
 * "Convite enviado." is announced; API refusals about the e-mail appear next to the field.
 */
export function InviteStudentDialog({ classId }: InviteStudentDialogProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const invite = useInviteStudent(classId);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<InviteStudentFormInput>(FIELD_IDS);
  const { register, handleSubmit, reset, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to the field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(InviteStudentFormSchema, { error: inviteStudentMessages }),
    defaultValues: { email: "" },
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setAnnouncement("");
    reset();
    setErrors([]);
  };

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await invite.mutateAsync(values);
      onOpenChange(false);
      setAnnouncement("Convite enviado.");
    } catch (error) {
      const code = apiErrorCode(error);
      setErrors([{ fieldId: code && EMAIL_ERROR_CODES.includes(code) ? FIELD_IDS.email : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button type="button">
            <UserPlus aria-hidden="true" />
            Convidar aluno
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convidar aluno</DialogTitle>
            <DialogDescription>
              O aluno recebe por e-mail um link para entrar na turma. O convite vale por 7 dias.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
            aria-label="Convidar aluno"
          >
            <ErrorSummary errors={errors} title="Não foi possível enviar o convite" />
            <Field
              id={FIELD_IDS.email}
              type="email"
              label="E-mail"
              autoComplete="off"
              required
              error={errorFor(FIELD_IDS.email)}
              {...register("email")}
            />
            <DialogFooter>
              <SubmitButton pending={formState.isSubmitting} pendingLabel="Enviando…">
                Enviar convite
              </SubmitButton>
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
