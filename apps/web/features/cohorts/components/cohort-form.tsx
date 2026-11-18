"use client";

import type { CohortView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, fieldErrorId, SubmitButton } from "@/components/shared";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCreateCohort, useUpdateCohort } from "../hooks/use-cohorts";
import {
  CODE_ERROR_CODES,
  type CohortFormInput,
  CohortFormSchema,
  cohortFormDefaults,
  cohortFormMessages,
  toCohortRequest,
} from "../schemas/cohort-form";

const FIELD_IDS = {
  name: "turma-nome",
  code: "turma-codigo",
  academicYear: "turma-ano",
  period: "turma-periodo",
  description: "turma-descricao",
} as const;

export interface CohortFormDialogProps {
  /** The turma being edited; absent when creating one. */
  initial?: CohortView;
}

/**
 * "Nova turma" / "Editar" (027/FR-001, FR-003; contracts/ui.md): a modal dialog with the turma's fields. Errors
 * appear next to each field and in the summary; a code already used in the year (`COHORT_CODE_TAKEN`) goes to the
 * Código field. On success the dialog closes and "Turma criada." / "Turma atualizada." is announced (FR-032).
 */
export function CohortFormDialog({ initial }: CohortFormDialogProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const create = useCreateCohort();
  const update = useUpdateCohort(initial?.id ?? "");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<CohortFormInput>(FIELD_IDS);
  const { register, handleSubmit, reset, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(CohortFormSchema, { error: cohortFormMessages }),
    defaultValues: cohortFormDefaults(initial),
  });

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setAnnouncement("");
    reset(cohortFormDefaults(initial));
    setErrors([]);
  };

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const body = toCohortRequest(values);
      if (initial) await update.mutateAsync(body);
      else await create.mutateAsync(body);
      onOpenChange(false);
      setAnnouncement(initial ? "Turma atualizada." : "Turma criada.");
    } catch (error) {
      const code = apiErrorCode(error);
      setErrors([{ fieldId: code && CODE_ERROR_CODES.includes(code) ? FIELD_IDS.code : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  const descriptionError = errorFor(FIELD_IDS.description);
  const title = initial ? "Editar turma" : "Nova turma";

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button type="button" variant={initial ? "secondary" : "primary"}>
            {initial ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}
            {initial ? "Editar" : "Nova turma"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>O código não se repete no mesmo ano letivo.</DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
            aria-label={title}
          >
            <ErrorSummary errors={errors} title={initial ? "Não foi possível salvar" : "Não foi possível criar a turma"} />
            <Field id={FIELD_IDS.name} label="Nome" autoComplete="off" required error={errorFor(FIELD_IDS.name)} {...register("name")} />
            <Field
              id={FIELD_IDS.code}
              label="Código"
              hint="Até 30 caracteres: letras, números, hífen, ponto e sublinhado."
              autoComplete="off"
              required
              error={errorFor(FIELD_IDS.code)}
              {...register("code")}
            />
            <Field
              id={FIELD_IDS.academicYear}
              label="Ano letivo"
              inputMode="numeric"
              autoComplete="off"
              required
              error={errorFor(FIELD_IDS.academicYear)}
              {...register("academicYear")}
            />
            <Field
              id={FIELD_IDS.period}
              label="Período"
              hint="Opcional. Ex.: 2026.2."
              autoComplete="off"
              error={errorFor(FIELD_IDS.period)}
              {...register("period")}
            />
            <div className="mb-4 flex flex-col gap-1">
              <Label htmlFor={FIELD_IDS.description}>Descrição</Label>
              <Textarea
                id={FIELD_IDS.description}
                rows={3}
                aria-invalid={descriptionError ? true : undefined}
                aria-describedby={descriptionError ? fieldErrorId(FIELD_IDS.description) : undefined}
                {...register("description")}
              />
              {descriptionError ? (
                <p id={fieldErrorId(FIELD_IDS.description)} className="m-0 font-semibold text-danger-text">
                  {descriptionError}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <SubmitButton pending={formState.isSubmitting} pendingLabel="Salvando…">
                {initial ? "Salvar alterações" : "Criar turma"}
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
