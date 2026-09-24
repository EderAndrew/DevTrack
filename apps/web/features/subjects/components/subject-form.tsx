"use client";

import type { SubjectView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, fieldErrorId, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCreateSubject, useUpdateSubject } from "../hooks/use-subjects";
import {
  NAME_ERROR_CODES,
  type SubjectFormInput,
  SubjectFormSchema,
  subjectFormMessages,
  toSubjectRequest,
} from "../schemas/subject-form";

const FIELD_IDS = { name: "nome", description: "descricao" } as const;

export interface SubjectFormProps {
  /** The subject being edited; absent when creating one. */
  initial?: SubjectView;
  /** Editing only: called with the saved subject (the detail page closes the form). */
  onSaved?: (saved: SubjectView) => void;
  /** Editing only: "Cancelar" closes the form instead of leaving the page. */
  onCancel?: () => void;
}

/**
 * Create or edit a subject (004/FR-002). Errors appear next to each field and in the summary;
 * a repeated name (`SUBJECT_NAME_TAKEN`) is shown on the Nome field. A new subject opens its
 * page ("Disciplina criada.").
 */
export function SubjectForm({ initial, onSaved, onCancel }: SubjectFormProps) {
  const router = useRouter();
  const create = useCreateSubject();
  const update = useUpdateSubject(initial?.id ?? "");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<SubjectFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(SubjectFormSchema, { error: subjectFormMessages }),
    defaultValues: { name: initial?.name ?? "", description: initial?.description ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const body = toSubjectRequest(values);
      if (initial) {
        onSaved?.(await update.mutateAsync(body));
      } else {
        const created = await create.mutateAsync(body);
        router.push(`/disciplinas/${created.id}?criada=1`);
      }
    } catch (error) {
      const code = apiErrorCode(error);
      setErrors([
        { fieldId: code && NAME_ERROR_CODES.includes(code) ? FIELD_IDS.name : undefined, message: messageForError(error) },
      ]);
    }
  }, onInvalid);

  const descriptionError = errorFor(FIELD_IDS.description);

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-label={initial ? "Editar disciplina" : "Nova disciplina"}
      className="max-w-160"
    >
      <ErrorSummary
        errors={errors}
        title={initial ? "Não foi possível salvar" : "Não foi possível criar a disciplina"}
      />
      <Field
        id={FIELD_IDS.name}
        label="Nome"
        hint="Ex.: Programação Orientada a Objetos."
        autoComplete="off"
        required
        error={errorFor(FIELD_IDS.name)}
        {...register("name")}
      />
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor={FIELD_IDS.description}>Descrição</Label>
        <Textarea
          id={FIELD_IDS.description}
          rows={4}
          aria-invalid={descriptionError ? true : undefined}
          aria-describedby={descriptionError ? fieldErrorId(FIELD_IDS.description) : undefined}
          {...register("description")}
        />
        {descriptionError ? (
          <p id={fieldErrorId(FIELD_IDS.description)} className="m-0 font-semibold text-destructive">
            {descriptionError}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={formState.isSubmitting} pendingLabel="Salvando…">
          {initial ? "Salvar alterações" : "Criar disciplina"}
        </SubmitButton>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancelar
          </Button>
        ) : (
          <Button asChild variant="secondary">
            <Link href={initial ? `/disciplinas/${initial.id}` : "/disciplinas"}>Cancelar</Link>
          </Button>
        )}
      </div>
    </form>
  );
}
