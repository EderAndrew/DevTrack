"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { type CodeHighlight, HELP_QUESTION_MAX } from "@repo/contracts";
import { MessageCircle } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { messageForError } from "@/lib/messages/error-messages";
import { useRequestHelp, useWorkHelp } from "../hooks/use-work-help";
import {
  ASK_HELP,
  HELP_DIALOG_TITLE,
  HELP_EXHAUSTED,
  HELP_NOTE,
  HELP_QUESTION_LABEL,
  HELP_SEND,
  type HelpFormInput,
  type HelpFormOutput,
  HelpFormSchema,
  remainingAfterEach,
} from "../schemas/work-help";
import { HelpChatMessage } from "./help-chat-message";
import { HelpCounter } from "./help-counter";

const FIELD_ID = "pergunta-ajuda";
const COUNTER_ID = `${FIELD_ID}-contador`;
const TRIGGER_COUNTER_ID = "ajudas-restantes";

/**
 * The AI help of an open attempt as a chat (015 amendment 2026-10-31): one icon fixed on the right of the screen opens
 * a side panel with the whole conversation and a field about the question on screen. Whether a help is used, pending or
 * refused comes from the API. The panel traps the focus, Esc closes it and the focus returns to the icon.
 * `data-help-question-id` lets the controlled mode tell the help field from the answer (its clipboard block covers
 * the whole page); `notice` is what it shows here.
 */
export function HelpChat({
  activityId,
  questionId,
  questions,
  canAsk,
  used,
  notice,
}: {
  activityId: string;
  /** The question on screen, the one a new message is about. */
  questionId: string;
  questions: readonly { id: string; language?: { highlight?: CodeHighlight | null } | null }[];
  /** Whoever may not ask (a group reader, 023/FR-022) reads the conversation with no field. */
  canAsk: boolean;
  /**
   * The helps delivered as the polled activity counts them (023/FR-022): when another group member's request
   * is delivered, the count moves and the orientations are read again, so every member sees them.
   */
  used?: number;
  /** The controlled mode's message about the help field (a blocked paste). */
  notice?: ReactNode;
}) {
  const help = useWorkHelp(activityId, true);
  const { refetch } = help;
  const seen = useRef(used);
  useEffect(() => {
    if (used === seen.current) return;
    seen.current = used;
    void refetch();
  }, [used, refetch]);
  const request = useRequestHelp(activityId);
  const [open, setOpen] = useState(false);
  const { register, handleSubmit, control, formState, reset, setFocus } = useForm<HelpFormInput, unknown, HelpFormOutput>({
    resolver: zodResolver(HelpFormSchema),
    defaultValues: { question: "" },
  });
  const length = useWatch({ control, name: "question" }).length;
  const fieldError = formState.errors.question?.message;
  const log = useRef<HTMLDivElement>(null);
  const state = help.data;
  const lastItem = state?.items.at(-1);
  const lastKey = lastItem ? `${state?.items.length}:${lastItem.status}` : "";
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lastKey, open]);

  if (!state || state.allowance === 0) return null;
  const exhausted = state.used >= state.allowance;
  const remaining = remainingAfterEach(state.items, state.allowance);
  const left = Math.max(0, state.allowance - state.used);

  const send = (question: string) => {
    request.mutate({ questionId, question, idempotencyKey: crypto.randomUUID() }, { onSuccess: () => reset() });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) request.reset();
        setOpen(next);
      }}
    >
      <SheetTrigger asChild>
        <Button
          type="button"
          size="icon"
          aria-label={ASK_HELP}
          aria-describedby={TRIGGER_COUNTER_ID}
          title={ASK_HELP}
          className="fixed right-4 bottom-24 z-(--z-sticky) rounded-full shadow-overlay"
        >
          <MessageCircle aria-hidden="true" />
          <span aria-hidden="true" className="text-body-sm font-semibold">
            {left}
          </span>
          <span className="sr-only">
            <HelpCounter id={TRIGGER_COUNTER_ID} allowance={state.allowance} used={state.used} />
          </span>
        </Button>
      </SheetTrigger>
      <SheetContent
        data-help-question-id={questionId}
        className="w-full gap-3 sm:max-w-md"
        onOpenAutoFocus={(event) => {
          if (!canAsk || exhausted) return;
          event.preventDefault();
          setFocus("question");
        }}
      >
        <SheetHeader>
          <SheetTitle>{HELP_DIALOG_TITLE}</SheetTitle>
          <SheetDescription>{HELP_NOTE}</SheetDescription>
          <HelpCounter allowance={state.allowance} used={state.used} />
        </SheetHeader>
        <div ref={log} role="log" aria-live="polite" aria-label="Conversa com a IA" tabIndex={0} className="flex-1 overflow-y-auto p-4">
          <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {state.items.map((item, index) => {
            const at = questions.findIndex((question) => question.id === item.questionId);
            return (
              <HelpChatMessage
                key={item.id}
                item={item}
                position={at >= 0 ? at + 1 : null}
                highlight={questions[at]?.language?.highlight ?? undefined}
                remaining={remaining[index]!}
                waitExpired={help.waitExpired}
              />
            );
          })}
          </ol>
        </div>
        <div className="flex flex-col gap-2 p-4">
          {notice}
          {request.isError ? (
            <Alert variant="danger">
              <AlertTitle>{messageForError(request.error)}</AlertTitle>
            </Alert>
          ) : null}
          {exhausted ? <p className="m-0 text-body-sm">{HELP_EXHAUSTED}</p> : null}
          {canAsk && !exhausted ? (
            <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit(({ question }) => send(question))}>
              <FormField id={FIELD_ID} label={HELP_QUESTION_LABEL} error={fieldError} required className="mb-0">
                {({ "aria-describedby": describedBy, ...field }) => (
                  <Textarea {...field} aria-describedby={[describedBy, COUNTER_ID].filter(Boolean).join(" ")} maxLength={HELP_QUESTION_MAX} {...register("question")} />
                )}
              </FormField>
              <FieldMessage id={COUNTER_ID}>
                {length} de {HELP_QUESTION_MAX} caracteres
              </FieldMessage>
              <Button type="submit" loading={request.isPending}>
                {HELP_SEND}
              </Button>
            </form>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
