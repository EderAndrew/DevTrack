"use client";

import type { ClassView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, fieldErrorId, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSubjects } from "@/features/subjects/hooks/use-subjects";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCreateClass, useUpdateClass } from "../hooks/use-classes";
import {
  CODE_ERROR_CODES,
  type ClassFormInput,
  ClassFormSchema,
  classFormMessages,
  NO_SUBJECT,
  SUBJECT_ERROR_CODES,
  toClassRequest,
} from "../schemas/class-form";

const FIELD_IDS = {
  name: "nome",
  code: "codigo",
  academicYear: "ano",
  subjectId: "disciplina",
  period: "periodo",
  startsOn: "inicio",
  endsOn: "termino",
  description: "descricao",
} as const;

export interface ClassFormProps {
  /** The class being edited; absent when creating one. */
  initial?: ClassView;
  /** New class only: the subject chosen beforehand ("Nova turma" of a subject, `?disciplina=`). */
  defaultSubjectId?: string;
}

/**
 * Create or edit a class (003 FR-001, FR-003; 004/US1-3, US1-4). Errors appear next to each field
 * and in the summary; a repeated code (`CLASS_CODE_TAKEN`) is shown on the Código field and a
 * refused subject on Disciplina. The subject select offers the active subjects, plus the class's
 * current one when it was deactivated. On success, goes to the class page.
 */
export function ClassForm({ initial, defaultSubjectId }: ClassFormProps) {
  const router = useRouter();
  const create = useCreateClass();
  const update = useUpdateClass(initial?.id ?? "");
  const subjects = useSubjects({ status: "ACTIVE" });
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ClassFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState, control } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ClassFormSchema, { error: classFormMessages }),
    defaultValues: {
      name: initial?.name ?? "",
      code: initial?.code ?? "",
      academicYear: initial ? String(initial.academicYear) : String(new Date().getFullYear()),
      period: initial?.period ?? "",
      description: initial?.description ?? "",
      subjectId: initial ? (initial.subject?.id ?? NO_SUBJECT) : (defaultSubjectId ?? NO_SUBJECT),
      startsOn: initial?.startsOn ?? "",
      endsOn: initial?.endsOn ?? "",
    },
  });

  const activeSubjects = subjects.data?.pages.flatMap((page) => page.items) ?? [];
  const subjectOptions =
    initial?.subject && !activeSubjects.some((subject) => subject.id === initial.subject!.id)
      ? [{ id: initial.subject.id, name: `${initial.subject.name} (inativa)` }, ...activeSubjects]
      : activeSubjects;

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const body = toClassRequest(values);
      const saved = initial ? await update.mutateAsync(body) : await create.mutateAsync(body);
      router.push(`/turmas/${saved.id}`);
    } catch (error) {
      const code = apiErrorCode(error);
      const fieldId =
        code && CODE_ERROR_CODES.includes(code)
          ? FIELD_IDS.code
          : code && SUBJECT_ERROR_CODES.includes(code)
            ? FIELD_IDS.subjectId
            : undefined;
      setErrors([{ fieldId, message: messageForError(error) }]);
    }
  }, onInvalid);

  const descriptionError = errorFor(FIELD_IDS.description);
  const subjectError = errorFor(FIELD_IDS.subjectId);

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
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor={FIELD_IDS.subjectId}>Disciplina</Label>
        <Controller
          control={control}
          name="subjectId"
          render={({ field }) => (
            <Select name={field.name} value={field.value} onValueChange={field.onChange}>
              <SelectTrigger
                id={FIELD_IDS.subjectId}
                className="min-h-11 w-full max-w-120"
                onBlur={field.onBlur}
                aria-invalid={subjectError ? true : undefined}
                aria-describedby={subjectError ? fieldErrorId(FIELD_IDS.subjectId) : undefined}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUBJECT}>Sem disciplina</SelectItem>
                {subjectOptions.map((subject) => (
                  <SelectItem key={subject.id} value={subject.id}>
                    {subject.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        {subjectError ? (
          <p id={fieldErrorId(FIELD_IDS.subjectId)} className="m-0 font-semibold text-danger-text">
            {subjectError}
          </p>
        ) : null}
      </div>
      <Field
        id={FIELD_IDS.period}
        label="Período"
        hint="Opcional. Ex.: 2026.1."
        autoComplete="off"
        error={errorFor(FIELD_IDS.period)}
        {...register("period")}
      />
      <Field
        id={FIELD_IDS.startsOn}
        type="date"
        label="Data de início"
        hint="A disciplina e as duas datas são necessárias para planejar a turma."
        error={errorFor(FIELD_IDS.startsOn)}
        {...register("startsOn")}
      />
      <Field
        id={FIELD_IDS.endsOn}
        type="date"
        label="Data de término"
        error={errorFor(FIELD_IDS.endsOn)}
        {...register("endsOn")}
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
          <p id={fieldErrorId(FIELD_IDS.description)} className="m-0 font-semibold text-danger-text">
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
