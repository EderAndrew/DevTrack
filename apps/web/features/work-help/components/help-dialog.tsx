"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { HELP_QUESTION_MAX } from "@repo/contracts";
import type { ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { HELP_DIALOG_TITLE, HELP_NOTE, HELP_QUESTION_LABEL, HELP_SEND, type HelpFormInput, type HelpFormOutput, HelpFormSchema } from "../schemas/work-help";

const FIELD_ID = "pergunta-ajuda";
const COUNTER_ID = `${FIELD_ID}-contador`;

/**
 * "Pedir ajuda" (015 contracts/web-ui.md): the note that the AI guides without answering, the
 * student's question (1–500 characters, with a counter) and "Enviar". The dialog traps the focus, Esc
 * closes it and the focus returns to its `trigger`, "Pedir ajuda". `data-help-question-id` lets the controlled mode
 * tell the help field from the answer (its clipboard block covers the whole page); `notice` is what it
 * shows here.
 */
export function HelpDialog({
  trigger,
  open,
  onOpenChange,
  questionId,
  pending,
  error,
  notice,
  onSend,
}: {
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string;
  pending: boolean;
  /** The refusal of the last send, already in words. */
  error: string | null;
  notice?: ReactNode;
  onSend: (question: string) => void;
}) {
  const { register, handleSubmit, control, formState, reset } = useForm<HelpFormInput, unknown, HelpFormOutput>({
    resolver: zodResolver(HelpFormSchema),
    defaultValues: { question: "" },
  });
  const length = useWatch({ control, name: "question" }).length;
  const fieldError = formState.errors.question?.message;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent data-help-question-id={questionId}>
        <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(({ question }) => onSend(question))}>
          <DialogHeader>
            <DialogTitle>{HELP_DIALOG_TITLE}</DialogTitle>
            <DialogDescription>{HELP_NOTE}</DialogDescription>
          </DialogHeader>
          <FormField id={FIELD_ID} label={HELP_QUESTION_LABEL} error={fieldError} required className="mb-0">
            {({ "aria-describedby": describedBy, ...control }) => (
              <Textarea
                {...control}
                aria-describedby={[describedBy, COUNTER_ID].filter(Boolean).join(" ")}
                maxLength={HELP_QUESTION_MAX}
                {...register("question")}
              />
            )}
          </FormField>
          <FieldMessage id={COUNTER_ID}>
            {length} de {HELP_QUESTION_MAX} caracteres
          </FieldMessage>
          {notice}
          {error ? (
            <Alert variant="danger">
              <AlertTitle>{error}</AlertTitle>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={pending}>
              {HELP_SEND}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
