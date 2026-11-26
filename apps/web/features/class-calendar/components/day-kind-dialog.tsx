"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_ABSENCE_NOTICE_LENGTH,
  MAX_ABSENCE_REASON_LENGTH,
  MAX_DAY_DESCRIPTION_LENGTH,
} from "@repo/contracts";
import { Info, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  ABSENCE_NOTE,
  CONFIRM,
  counterLabel,
  DAY_KIND_HINTS,
  DAY_KIND_LABELS,
  DAY_KINDS,
  type DayKindFormInput,
  DayKindFormSchema,
  type DayMark,
  DESCRIPTION_LABEL,
  DIALOG_DESCRIPTION,
  DIALOG_SAVE_NOTE,
  DIALOG_SAVE_NOTE_DETAIL,
  ICON_CLASSES,
  formValuesOf,
  hasDescription,
  KIND_LEGEND,
  longDate,
  MARK_DAY_TITLE,
  NOTICE_LABEL,
  REASON_LABEL,
  selectedKindLabel,
  UNMARK_DAY,
} from "../schemas/day-kinds";
import { DayKindIcon } from "./day-kind-icon";

export interface DayKindDialogProps {
  /** The day being marked ("YYYY-MM-DD"); `null` keeps the dialog closed. */
  date: string | null;
  /** The day's current mark (pending or saved); `null` on an unmarked day. */
  mark: DayMark | null;
  onConfirm: (mark: DayMark) => void;
  onUnmark: () => void;
  onCancel: () => void;
}

/**
 * "Marcar dia" (031/US1, FR-003 – FR-006, contracts/ui.md): the nine kinds, Aula first and chosen on an unmarked day,
 * the description of the described kinds with the kind's hint, and the Falta's private reason and optional notice.
 * Nothing is sent here: "Confirmar" keeps the mark pending until "Salvar calendário". The dialog traps the focus and
 * gives it back to the day when it closes.
 */
export function DayKindDialog({
  date,
  mark,
  onConfirm,
  onUnmark,
  onCancel,
}: DayKindDialogProps) {
  // There is no `DialogTrigger`: when the dialog closes, the focus goes back to its day (031/FR-010). The calendar
  // re-renders its day buttons, so the day is found again by its `data-day` ("16/11/2026").
  useEffect(() => {
    if (date === null) return;
    return () => {
      setTimeout(() => {
        if (document.querySelector("[role=dialog]")) return;
        const [year, month, day] = date.split("-");
        document
          .querySelector<HTMLElement>(
            `button[data-day="${day}/${month}/${year}"]`,
          )
          ?.focus();
      });
    };
  }, [date]);

  return (
    <Dialog
      open={date !== null}
      onOpenChange={(open) => (open ? undefined : onCancel())}
    >
      {date !== null ? (
        <DayKindForm
          key={date}
          date={date}
          mark={mark}
          onConfirm={onConfirm}
          onUnmark={onUnmark}
        />
      ) : null}
    </Dialog>
  );
}

const DESCRIPTION_ID = "dia-descricao";
const REASON_ID = "dia-motivo";
const NOTICE_ID = "dia-aviso";
const counterId = (id: string) => `${id}-contador`;

function DayKindForm({
  date,
  mark,
  onConfirm,
  onUnmark,
}: Omit<DayKindDialogProps, "date" | "onCancel"> & { date: string }) {
  const { register, handleSubmit, control, formState } = useForm<
    DayKindFormInput,
    unknown,
    DayMark
  >({
    resolver: zodResolver(DayKindFormSchema),
    defaultValues: formValuesOf(mark),
  });
  const [kind, description, absenceReason, absenceNotice] = useWatch({
    control,
    name: ["kind", "description", "absenceReason", "absenceNotice"],
  });
  const { errors } = formState;

  return (
    <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={handleSubmit(onConfirm)}
      >
        <DialogHeader>
          <DialogTitle className="flex flex-col gap-2" aria-label={`${MARK_DAY_TITLE} — ${longDate(date)}`}>
            {MARK_DAY_TITLE}
            <span className="text-h3 font-normal first-letter:uppercase">{longDate(date)}</span>
          </DialogTitle>
          <DialogDescription>{DIALOG_DESCRIPTION}</DialogDescription>
        </DialogHeader>
        <div className="flex items-start gap-3 rounded-md bg-muted px-4 py-3">
          <Info aria-hidden="true" className="mt-1 size-4 shrink-0 text-text-secondary" />
          <p className="m-0 flex flex-col gap-1 text-body-sm">
            <span>{DIALOG_SAVE_NOTE}</span>
            <span className="text-text-secondary">{DIALOG_SAVE_NOTE_DETAIL}</span>
          </p>
        </div>
        <RadioGroup
          legend={<span className="text-caption tracking-wide text-text-secondary uppercase">{KIND_LEGEND}</span>}
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
        >
          {DAY_KINDS.map((option) => (
            <label
              key={option}
              className={cn(
                "flex cursor-pointer flex-col gap-3 rounded-md border border-border bg-card p-4 text-body transition-colors",
                "hover:border-border-control has-checked:border-primary has-checked:bg-primary-subtle",
                "has-focus-visible:ring-3 has-focus-visible:ring-ring",
              )}
            >
              <span className="flex items-start justify-between gap-2">
                <DayKindIcon kind={option} className={cn("size-5", ICON_CLASSES[option])} />
                <Radio value={option} {...register("kind")} />
              </span>
              <span className="font-medium">{DAY_KIND_LABELS[option]}</span>
            </label>
          ))}
        </RadioGroup>

        {hasDescription(kind) ? (
          <div className="flex flex-col gap-1">
            <FormField
              id={DESCRIPTION_ID}
              label={DESCRIPTION_LABEL}
              description={DAY_KIND_HINTS[kind as keyof typeof DAY_KIND_HINTS]}
              error={errors.description?.message}
              required
              className="mb-0"
            >
              {({ "aria-describedby": describedBy, ...field }) => (
                <Textarea
                  {...field}
                  rows={2}
                  aria-describedby={[describedBy, counterId(DESCRIPTION_ID)]
                    .filter(Boolean)
                    .join(" ")}
                  {...register("description")}
                />
              )}
            </FormField>
            <FieldMessage id={counterId(DESCRIPTION_ID)}>
              {counterLabel(description, MAX_DAY_DESCRIPTION_LENGTH)}
            </FieldMessage>
          </div>
        ) : null}

        {kind === "TEACHER_ABSENCE" ? (
          <>
            <div className="flex flex-col gap-1">
              <FormField
                id={REASON_ID}
                label={REASON_LABEL}
                error={errors.absenceReason?.message}
                required
                className="mb-0"
              >
                {({ "aria-describedby": describedBy, ...field }) => (
                  <Textarea
                    {...field}
                    rows={3}
                    aria-describedby={[describedBy, counterId(REASON_ID)]
                      .filter(Boolean)
                      .join(" ")}
                    {...register("absenceReason")}
                  />
                )}
              </FormField>
              <FieldMessage id={counterId(REASON_ID)}>
                {counterLabel(absenceReason, MAX_ABSENCE_REASON_LENGTH)}
              </FieldMessage>
            </div>
            <div className="flex flex-col gap-1">
              <FormField
                id={NOTICE_ID}
                label={NOTICE_LABEL}
                error={errors.absenceNotice?.message}
                className="mb-0"
              >
                {({ "aria-describedby": describedBy, ...field }) => (
                  <Textarea
                    {...field}
                    rows={2}
                    aria-describedby={[describedBy, counterId(NOTICE_ID)]
                      .filter(Boolean)
                      .join(" ")}
                    {...register("absenceNotice")}
                  />
                )}
              </FormField>
              <FieldMessage id={counterId(NOTICE_ID)}>
                {counterLabel(absenceNotice, MAX_ABSENCE_NOTICE_LENGTH)}
              </FieldMessage>
            </div>
            <p className="m-0 text-body-sm text-text-secondary">
              {ABSENCE_NOTE}
            </p>
          </>
        ) : null}

        <p aria-live="polite" className="m-0 border-t border-border pt-4 text-body-sm text-text-secondary">
          {selectedKindLabel(kind)}
        </p>

        <DialogFooter className="gap-3">
          {mark ? (
            <Button
              type="button"
              variant="danger"
              className="sm:mr-auto"
              onClick={onUnmark}
            >
              <Trash2 aria-hidden="true" />
              {UNMARK_DAY}
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="ghost" className="bg-muted">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit">{CONFIRM}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
