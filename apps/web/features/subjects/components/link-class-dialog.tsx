"use client";

import type { ClassView, SubjectView } from "@repo/contracts";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { ErrorSummary, type FormError, SubmitButton, fieldErrorId } from "@/components/shared";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SELECT_CLASS } from "@/features/class-plan/components/topic-form-dialog";
import { useClasses, useLinkClassToSubject } from "@/features/classes/hooks/use-classes";
import { messageForError } from "@/lib/messages/error-messages";

const SELECT_ID = "turma-existente";

export interface LinkClassDialogProps {
  subject: SubjectView;
  /** Called with the message of the page notice once the class is linked. */
  onLinked: (message: string) => void;
}

/**
 * "Vincular turma existente" (004/US1-7, FR-005): one of the teacher's classes created on the
 * Turmas page that is not an offering of this subject yet. A class of another subject that already
 * uses a syllabus or has topics is refused by the API (FR-004).
 */
export function LinkClassDialog({ subject, onLinked }: LinkClassDialogProps) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" className="mb-4">
          <Link2 aria-hidden="true" />
          Vincular turma existente
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vincular turma existente</DialogTitle>
          <DialogDescription>
            Escolha uma das suas turmas para ligá-la à disciplina {subject.name}.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <LinkClassForm
            subject={subject}
            onLinked={(message) => {
              setOpen(false);
              onLinked(message);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function LinkClassForm({ subject, onLinked }: LinkClassDialogProps) {
  const classes = useClasses({});
  const link = useLinkClassToSubject();
  const [classId, setClassId] = useState("");
  const [errors, setErrors] = useState<FormError[]>([]);
  const candidates = (classes.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item) => item.subject?.id !== subject.id,
  );
  const fieldError = errors.find((error) => error.fieldId === SELECT_ID)?.message;

  const submit = async () => {
    const chosen = candidates.find((item) => item.id === classId);
    if (!chosen) {
      setErrors([{ fieldId: SELECT_ID, message: "Escolha uma turma." }]);
      return;
    }
    setErrors([]);
    try {
      const linked = await link.mutateAsync({ classId: chosen.id, subjectId: subject.id });
      onLinked(linkedMessage(linked));
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  };

  if (classes.isPending) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando turmas…</span>
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (classes.isError && candidates.length === 0) {
    return (
      <div role="alert">
        <p>{messageForError(classes.error)}</p>
        <Button type="button" variant="secondary" onClick={() => void classes.refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  }
  if (candidates.length === 0 && !classes.hasNextPage) {
    return <p>Você não tem outras turmas para vincular. Use “Nova turma” para criar uma.</p>;
  }

  return (
    <form
      noValidate
      aria-label="Vincular turma existente"
      onSubmit={(event) => {
        event.preventDefault();
        if (!link.isPending) void submit();
      }}
    >
      <ErrorSummary errors={errors} title="Não foi possível vincular a turma" />
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor={SELECT_ID}>Turma</Label>
        <select
          id={SELECT_ID}
          className={SELECT_CLASS}
          value={classId}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? fieldErrorId(SELECT_ID) : undefined}
          onChange={(event) => setClassId(event.target.value)}
        >
          <option value="">Escolha uma turma</option>
          {candidates.map((item) => (
            <option key={item.id} value={item.id}>
              {optionLabel(item)}
            </option>
          ))}
        </select>
        {fieldError ? (
          <p id={fieldErrorId(SELECT_ID)} className="m-0 font-semibold text-destructive">
            {fieldError}
          </p>
        ) : null}
      </div>
      {classes.hasNextPage ? (
        <Button
          type="button"
          variant="secondary"
          className="mb-4"
          aria-busy={classes.isFetchingNextPage || undefined}
          onClick={() => (classes.isFetchingNextPage ? undefined : void classes.fetchNextPage())}
        >
          Carregar mais turmas
        </Button>
      ) : null}
      <DialogFooter>
        <SubmitButton pending={link.isPending} pendingLabel="Vinculando…">
          Vincular turma
        </SubmitButton>
        <DialogClose asChild>
          <Button type="button" variant="secondary">
            Cancelar
          </Button>
        </DialogClose>
      </DialogFooter>
    </form>
  );
}

const optionLabel = (item: ClassView) =>
  item.subject ? `${item.name} (disciplina atual: ${item.subject.name})` : item.name;

/** US1-4: without both dates the class cannot use syllabus, calendar and plan yet. */
const linkedMessage = (item: ClassView) =>
  item.startsOn && item.endsOn
    ? `Turma ${item.name} vinculada à disciplina.`
    : `Turma ${item.name} vinculada à disciplina. Informe as datas de início e término da turma para usar ementa, calendário e planejamento.`;
