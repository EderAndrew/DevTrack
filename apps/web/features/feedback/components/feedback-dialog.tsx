"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { FeedbackCategorySchema, OriginPathSchema } from "@repo/contracts";
import { type ReactNode, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { messageForError } from "@/lib/messages/error-messages";
import type { SendFailure } from "../api/feedback-api";
import { useSendFeedback } from "../hooks/use-send-feedback";
import {
  CATEGORY_HINTS,
  CATEGORY_LABELS,
  CATEGORY_LEGEND,
  counterLabel,
  FEEDBACK_DESCRIPTION,
  FEEDBACK_SENT,
  type FeedbackFormInput,
  type FeedbackFormOutput,
  FeedbackFormSchema,
  limitReached,
  MESSAGE_LABEL,
  ORIGIN_NOTE,
  SEND,
  SEND_FAILED,
  SEND_FEEDBACK,
  SENDING,
} from "../schemas/feedback-form";

const MESSAGE_ID = "feedback-mensagem";
const COUNTER_ID = `${MESSAGE_ID}-contador`;
const CATEGORY_ERROR_ID = "feedback-categoria-erro";
const EMPTY: FeedbackFormInput = { category: null, message: "" };

/** The page the student is on, only when it is a plain pathname of the portal (research J2). */
function originPath(): string | null {
  const path = window.location.pathname;
  return OriginPathSchema.safeParse(path).success ? path : null;
}

const failureText = (failure: SendFailure) =>
  failure.kind === "limit" ? limitReached(failure.retryAfterSeconds) : failure.kind === "network" ? SEND_FAILED : messageForError(failure.error);

/**
 * "Enviar feedback" (020 US1, contracts/web-ui.md): the category, the message (10–2 000 characters
 * counted as the student sees them) and the note that the page is recorded. The `submissionId` is
 * generated when the dialog opens and kept across retries, so a repeated send keeps one feedback. A
 * refusal keeps the text in the field. The dialog traps the focus, Esc closes it and the focus returns
 * to its `trigger`.
 */
export function FeedbackDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [submissionId, setSubmissionId] = useState<string>("");
  const { toast } = useToast();
  const send = useSendFeedback();
  const { register, handleSubmit, control, formState, reset } = useForm<FeedbackFormInput, unknown, FeedbackFormOutput>({
    resolver: zodResolver(FeedbackFormSchema),
    defaultValues: EMPTY,
  });
  const message = useWatch({ control, name: "message" });
  const categoryError = formState.errors.category?.message;

  const changeOpen = (next: boolean) => {
    if (send.isPending) return;
    if (next) {
      setSubmissionId(crypto.randomUUID());
      send.reset();
      reset(EMPTY);
    }
    setOpen(next);
  };

  const submit = handleSubmit(({ category, message: text }) => {
    send.mutate(
      { submissionId, category: category!, message: text, originPath: originPath() },
      {
        onSuccess: () => {
          setOpen(false);
          toast({ variant: "success", title: FEEDBACK_SENT });
        },
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <form className="flex flex-col gap-4" noValidate onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{SEND_FEEDBACK}</DialogTitle>
            <DialogDescription>{FEEDBACK_DESCRIPTION}</DialogDescription>
          </DialogHeader>
          <RadioGroup
            legend={CATEGORY_LEGEND}
            aria-invalid={categoryError ? true : undefined}
            aria-describedby={categoryError ? CATEGORY_ERROR_ID : undefined}
          >
            {FeedbackCategorySchema.options.map((category) => (
              <label key={category} className="flex items-start gap-2 text-body">
                <Radio value={category} disabled={send.isPending} {...register("category")} />
                <span className="flex flex-col">
                  {CATEGORY_LABELS[category]}
                  {CATEGORY_HINTS[category] ? <span className="text-caption text-text-secondary">{CATEGORY_HINTS[category]}</span> : null}
                </span>
              </label>
            ))}
            {categoryError ? (
              <FieldMessage id={CATEGORY_ERROR_ID} tone="error">
                {categoryError}
              </FieldMessage>
            ) : null}
          </RadioGroup>
          <FormField id={MESSAGE_ID} label={MESSAGE_LABEL} error={formState.errors.message?.message} required className="mb-0">
            {({ "aria-describedby": describedBy, ...field }) => (
              <Textarea {...field} aria-describedby={[describedBy, COUNTER_ID].filter(Boolean).join(" ")} rows={6} {...register("message")} />
            )}
          </FormField>
          <FieldMessage id={COUNTER_ID}>{counterLabel(message)}</FieldMessage>
          <p className="m-0 text-body-sm text-text-secondary">{ORIGIN_NOTE}</p>
          {send.failure ? (
            <Alert variant="danger" role="alert">
              <AlertTitle>{failureText(send.failure)}</AlertTitle>
            </Alert>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={send.isPending}>
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" loading={send.isPending}>
              {send.isPending ? SENDING : SEND}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
