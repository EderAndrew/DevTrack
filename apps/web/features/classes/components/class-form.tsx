"use client";

import type { ClassView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { useUpdateClass } from "../hooks/use-classes";
import { type ClassFormInput, ClassFormSchema, toCalendarRequest } from "../schemas/class-form";

const FIELD_IDS = { startsOn: "inicio", endsOn: "termino" } as const;

export interface ClassFormProps {
  /** The disciplina da turma being edited. */
  initial: ClassView;
}

/**
 * The calendar of a disciplina da turma (004/US1-4, US1-5; 027/FR-019): the teacher edits only the start and end
 * dates — the turma's data are the MANAGER's and the subject never changes. Errors appear next to each field and in
 * the summary; on success, goes back to the class page.
 */
export function ClassForm({ initial }: ClassFormProps) {
  const router = useRouter();
  const update = useUpdateClass(initial.id);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ClassFormInput>(FIELD_IDS);
  const { register, handleSubmit, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(ClassFormSchema),
    defaultValues: { startsOn: initial.startsOn ?? "", endsOn: initial.endsOn ?? "" },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      const saved = await update.mutateAsync(toCalendarRequest(values));
      router.push(`/turmas/${saved.id}`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  return (
    <form
      noValidate
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
      aria-label="Editar calendário"
      className="max-w-160"
    >
      <ErrorSummary errors={errors} title="Não foi possível salvar" />
      <Field
        id={FIELD_IDS.startsOn}
        type="date"
        label="Data de início"
        hint="A disciplina e as duas datas são necessárias para planejar a turma."
        error={errorFor(FIELD_IDS.startsOn)}
        {...register("startsOn")}
      />
      <Field id={FIELD_IDS.endsOn} type="date" label="Data de término" error={errorFor(FIELD_IDS.endsOn)} {...register("endsOn")} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={formState.isSubmitting} pendingLabel="Salvando…">
          Salvar alterações
        </SubmitButton>
        <Button asChild variant="secondary">
          <Link href={`/turmas/${initial.id}`}>Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
