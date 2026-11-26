"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  MAX_ABSENCE_NOTICE_LENGTH,
  MAX_ABSENCE_REASON_LENGTH,
  MAX_DAY_DESCRIPTION_LENGTH,
} from "@repo/contracts";
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
  formValuesOf,
  hasDescription,
  KIND_LEGEND,
  longDate,
  MARK_DAY_TITLE,
  NOTICE_LABEL,
  REASON_LABEL,
  UNMARK_DAY,
} from "../schemas/day-kinds";
import { DayKindDot, DayKindIcon } from "./day-kind-icon";

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
    <DialogContent>
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={handleSubmit(onConfirm)}
      >
        <DialogHeader>
          <DialogTitle>{`${MARK_DAY_TITLE} — ${longDate(date)}`}</DialogTitle>
          <DialogDescription>
            Escolha o tipo do dia. Nada é gravado até “Salvar calendário”.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup
          legend={KIND_LEGEND}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
        >
          {DAY_KINDS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-body">
              <Radio value={option} {...register("kind")} />
              <DayKindDot kind={option} />
              <DayKindIcon kind={option} />
              {DAY_KIND_LABELS[option]}
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

        <DialogFooter>
          {mark ? (
            <Button
              type="button"
              variant="danger"
              className="sm:mr-auto"
              onClick={onUnmark}
            >
              {UNMARK_DAY}
            </Button>
          ) : null}
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancelar
            </Button>
          </DialogClose>
          <Button type="submit">{CONFIRM}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
