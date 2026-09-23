"use client";

import type { ClassView } from "@repo/contracts";
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
import { useCreateClass, useUpdateClass } from "../hooks/use-classes";
import {
  CODE_ERROR_CODES,
  type ClassFormInput,
  ClassFormSchema,
  classFormMessages,
  toClassRequest,
} from "../schemas/class-form";

const FIELD_IDS = {
  name: "nome",
  code: "codigo",
  academicYear: "ano",
  period: "periodo",
  description: "descricao",
} as const;

export interface ClassFormProps {
  /** The class being edited; absent when creating one. */
  initial?: ClassView;
}

/**
 * Create or edit a class (FR-001, FR-003). Errors appear next to each field and in the summary;
 * a repeated code (`CLASS_CODE_TAKEN`) is shown on the Código field. On success, goes to the
 * class page.
 */
export function ClassForm({ initial }: ClassFormProps) {
  const router = useRouter();
  const create = useCreateClass();
  const update = useUpdateClass(initial?.id ?? "");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ClassFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ClassFormSchema, { error: classFormMessages }),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      academicYear: initial ? String(initial.academicYear) : String(new Date().getFullYear()),
      period: initial?.period ?? "",
      description: initial?.description ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const body = toClassRequest(values);
      const saved = initial ? await update.mutateAsync(body) : await create.mutateAsync(body);
      router.push(`/turmas/${saved.id}`);
    } catch (error) {
      const code = apiErrorCode(error);
      setErrors([{ fieldId: code && CODE_ERROR_CODES.includes(code) ? FIELD_IDS.code : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  const descriptionError = errorFor(FIELD_IDS.description);

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-label={initial ? "Editar turma" : "Nova turma"}
      className="max-w-160"
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
        hint="Opcional. Ex.: 2º semestre."
        autoComplete="off"
        error={errorFor(FIELD_IDS.period)}
        {...register("period")}
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
          {initial ? "Salvar alterações" : "Criar turma"}
        </SubmitButton>
        <Button asChild variant="secondary">
          <Link href={initial ? `/turmas/${initial.id}` : "/turmas"}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
