"use client";

import type { TeacherActivity } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Lock } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { formatLongDateTime } from "@/lib/messages/dates";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { isActivityVersionConflict, useActivity, useActivityActions } from "../hooks/use-activities";
import {
  ACTIVITY_TYPE_LABELS,
  type ActivityEditValues,
  ActivityEditSchema,
  activityEditDefaults,
  activityFormMessages,
  formatGrade,
  LATE_POLICY_LABELS,
  ROSTER_STATUS_LABELS,
  toUpdateActivityRequest,
} from "../schemas/activity-form";
import { ActivityQuestions } from "./activity-questions";
import { ActivitySituation } from "./class-activities";
import { LatePolicyField, TextareaField } from "./form-fields";

export const VERSION_CONFLICT_NOTICE = "Esta atividade mudou em outra aba. Mostramos a versão atual; revise antes de continuar.";

export const EDIT_FIELD_IDS = {
  title: "editar-titulo",
  instructions: "editar-instrucoes",
  publishAt: "editar-publicacao",
  deadline: "editar-prazo",
} as const;

const FIELD_OF_CODE: Record<string, string> = {
  INVALID_SCHEDULE: EDIT_FIELD_IDS.deadline,
  ALREADY_PUBLISHED: EDIT_FIELD_IDS.publishAt,
};

export interface ActivityDetailProps {
  classId: string;
  activityId: string;
  /** `atividades.aplicar`: edit, close and cancel (UX only; the API authorizes). */
  canApply: boolean;
}

/**
 * One activity of the class (012 contracts/web-ui.md, `/turmas/[id]/atividades/[activityId]`): its
 * data and edit (título, instruções, prazo, regra de atraso; publicação only while scheduled), the
 * questions with the answer key, the students' situations, "Encerrar atividade" and "Cancelar
 * atividade" (danger, explicit text and confirmation). Another tab's change reloads it with a notice.
 */
export function ActivityDetail({ classId, activityId, canApply }: ActivityDetailProps) {
  const query = useActivity(classId, activityId);
  const actions = useActivityActions(classId, activityId);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Carregando a atividade…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const activity = query.data;

  const conflict = async () => {
    await actions.reload();
    setNotice(VERSION_CONFLICT_NOTICE);
  };
  const run = async (action: () => Promise<unknown>, done: string) => {
    setNotice(null);
    setError(null);
    try {
      await action();
      setNotice(done);
    } catch (caught) {
      setError(messageForError(caught));
    }
  };
  const save = async (values: ActivityEditValues) => {
    setNotice(null);
    setError(null);
    try {
      await actions.update.mutateAsync(toUpdateActivityRequest(values, activity));
      setNotice("Alterações salvas.");
    } catch (caught) {
      if (!isActivityVersionConflict(caught)) throw caught;
      await conflict();
    }
  };

  return (
    <section aria-labelledby="atividade-titulo" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="atividade-titulo" className="m-0 text-h2">
          {activity.title}
        </h2>
        {error ? (
          <p role="alert" className="m-0 text-danger-text">
            {error}
          </p>
        ) : null}
        <p role="status" className={notice ? "m-0" : "sr-only"}>
          {notice ?? ""}
        </p>
        <ActivitySituation status={activity.status} phase={activity.phase} />
        <dl className="m-0 grid gap-2">
          <Item term="Tipo">{ACTIVITY_TYPE_LABELS[activity.type]}</Item>
          <Item term="Publicação">{formatLongDateTime(activity.publishAt)}</Item>
          <Item term="Prazo">{formatLongDateTime(activity.deadline)}</Item>
          <Item term="Entrega atrasada">{LATE_POLICY_LABELS[activity.latePolicy]}</Item>
          <Item term="Nota total">{formatGrade(activity.totalGrade)}</Item>
          {activity.outOfScopeTopicCount > 0 ? (
            <Item term="Tópicos ainda não concluídos, confirmados ao aplicar">{activity.outOfScopeTopicCount}</Item>
          ) : null}
          {activity.instructions ? <Item term="Instruções">{activity.instructions}</Item> : null}
        </dl>
        {canApply ? <LifecycleActions activity={activity} actions={actions} run={run} /> : null}
      </div>

      {canApply && activity.status === "ACTIVE" ? (
        // Keyed by version: a save or another tab's change loads the activity again.
        <ActivityEditForm key={activity.version} activity={activity} onSave={save} />
      ) : null}

      <Roster activity={activity} />
      <ActivityQuestions questions={activity.questions} />
    </section>
  );
}

function LifecycleActions({
  activity,
  actions,
  run,
}: {
  activity: TeacherActivity;
  actions: ReturnType<typeof useActivityActions>;
  run: (action: () => Promise<unknown>, done: string) => Promise<void>;
}) {
  if (activity.status === "CANCELLED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {activity.status === "ACTIVE" ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="secondary">
              <Lock aria-hidden="true" />
              Encerrar atividade
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Encerrar esta atividade?</AlertDialogTitle>
              <AlertDialogDescription>
                Os alunos não poderão mais salvar respostas nem entregar, mesmo antes do prazo. As entregas feitas
                continuam com você.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void run(actions.close.mutateAsync, "Atividade encerrada.")}>
                Encerrar atividade
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="danger">
            <Ban aria-hidden="true" />
            Cancelar atividade
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar esta atividade?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela deixa de aparecer para os alunos e não pode ser reaberta. As entregas já feitas ficam guardadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => void run(actions.cancel.mutateAsync, "Atividade cancelada.")}>
              Cancelar atividade
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ActivityEditForm({ activity, onSave }: { activity: TeacherActivity; onSave: (values: ActivityEditValues) => Promise<void> }) {
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<ActivityEditValues>(EDIT_FIELD_IDS);
  const { register, handleSubmit, formState } = useForm<ActivityEditValues>({
    shouldFocusError: false,
    resolver: zodResolver(ActivityEditSchema, { error: activityFormMessages }),
    defaultValues: activityEditDefaults(activity),
  });
  const scheduled = activity.phase === "SCHEDULED";

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await onSave(values);
    } catch (caught) {
      const code = apiErrorCode(caught);
      setErrors([{ fieldId: code ? FIELD_OF_CODE[code] : undefined, message: messageForError(caught) }]);
    }
  }, onInvalid);

  return (
    <form
      noValidate
      aria-label="Editar atividade"
      className="max-w-160"
      onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
    >
      <h3 className="m-0 mb-4 text-h3">Editar atividade</h3>
      <ErrorSummary errors={errors} title="Não foi possível salvar" />
      <Field id={EDIT_FIELD_IDS.title} label="Título" required autoComplete="off" error={errorFor(EDIT_FIELD_IDS.title)} {...register("title")} />
      <TextareaField
        id={EDIT_FIELD_IDS.instructions}
        label="Instruções"
        hint="Opcional."
        error={errorFor(EDIT_FIELD_IDS.instructions)}
        {...register("instructions")}
      />
      <Field
        id={EDIT_FIELD_IDS.publishAt}
        type="datetime-local"
        label="Data e hora da publicação"
        hint={scheduled ? "Muda enquanto a atividade estiver agendada." : "A atividade já foi publicada."}
        readOnly={!scheduled}
        error={errorFor(EDIT_FIELD_IDS.publishAt)}
        {...register("publishAt")}
      />
      <Field
        id={EDIT_FIELD_IDS.deadline}
        type="datetime-local"
        label="Prazo de entrega"
        required
        error={errorFor(EDIT_FIELD_IDS.deadline)}
        {...register("deadline")}
      />
      <LatePolicyField idPrefix="editar-atraso" {...register("latePolicy")} />
      <SubmitButton pending={formState.isSubmitting} pendingLabel="Salvando…">
        Salvar alterações
      </SubmitButton>
    </form>
  );
}

/** Each student's situation, in words (FR-006); grades and corrections arrive with the grading. */
function Roster({ activity }: { activity: TeacherActivity }) {
  return (
    <section aria-labelledby="alunos-titulo" className="flex flex-col gap-2">
      <h3 id="alunos-titulo" className="m-0 text-h3">
        Alunos
      </h3>
      <p className="m-0">
        Entregas: {activity.counts.submitted + activity.counts.submittedLate} de {activity.counts.enrolled}
      </p>
      {activity.roster.length === 0 ? (
        <p className="m-0">Nenhum aluno matriculado nesta turma.</p>
      ) : (
        <Table>
          <TableCaption>Situação de cada aluno nesta atividade.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Aluno</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Entregue em</TableHead>
              <TableHead scope="col">Nota</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activity.roster.map((entry) => (
              <TableRow key={entry.studentUserId}>
                <TableCell>
                  {entry.name}
                  {entry.enrollment === "REMOVED" ? " (removido da turma)" : ""}
                </TableCell>
                <TableCell>{ROSTER_STATUS_LABELS[entry.status]}</TableCell>
                <TableCell>{entry.submittedAt ? formatLongDateTime(entry.submittedAt) : "—"}</TableCell>
                <TableCell>
                  {entry.grade === null ? "—" : entry.gradePartial ? "Correção pendente" : formatGrade(entry.grade)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-label text-text-secondary">{term}</dt>
      <dd className="m-0 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
