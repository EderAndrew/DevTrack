"use client";

import type { TeacherListItem, TeacherListResponse, TeacherStatus } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { type ChangeEvent, useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { STATUS_LABELS } from "@/lib/messages/status-labels";
import { type TeacherAction, useInviteTeacher, useLoadTeachers, useTeacherAction, useTeachers } from "../hooks/use-teachers";
import {
  EMAIL_ERROR_CODES,
  type InviteTeacherFormInput,
  InviteTeacherFormSchema,
  inviteTeacherMessages,
} from "../schemas/invite-form";

const FIELD_IDS = { displayName: "nome", email: "email" } as const;

const FILTERS: { value: "" | TeacherStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "INVITED", label: "Convidado" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "INACTIVE", label: "Inativo" },
];

interface RowAction {
  label: string;
  action: TeacherAction;
  id: string;
}

/** Actions offered per status; the API validates every transition again. */
function actionsFor(item: TeacherListItem): RowAction[] {
  if (item.status === "INVITED" && item.invitationId) {
    const id = item.invitationId;
    return [
      { label: "Reenviar convite", action: "resend", id },
      { label: "Revogar convite", action: "revoke", id },
    ];
  }
  if (!item.userId) return [];
  const id = item.userId;
  const suspend: RowAction = { label: "Suspender", action: "suspend", id };
  const deactivate: RowAction = { label: "Desativar", action: "deactivate", id };
  const reactivate: RowAction = { label: "Reativar", action: "reactivate", id };
  switch (item.status) {
    case "ACTIVE":
      return [suspend, deactivate];
    case "SUSPENDED":
      return [reactivate, deactivate];
    case "INACTIVE":
      return [reactivate];
    default:
      return [];
  }
}

const rowKey = (item: TeacherListItem) => item.userId ?? item.invitationId ?? item.email;

export interface TeachersAdminProps {
  initialTeachers: TeacherListResponse;
}

export function TeachersAdmin({ initialTeachers }: TeachersAdminProps) {
  const [filter, setFilter] = useState<"" | TeacherStatus>("");
  const { data } = useTeachers(filter || undefined, initialTeachers);
  const loadTeachers = useLoadTeachers();
  const invite = useInviteTeacher();
  const teacherAction = useTeacherAction();
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { errors: inviteErrors, setErrors: setInviteErrors, onInvalid, errorFor } = useErrorSummary<InviteTeacherFormInput>(FIELD_IDS);
  const { register, handleSubmit, reset, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(InviteTeacherFormSchema, { error: inviteTeacherMessages }),
    defaultValues: { displayName: "", email: "" },
  });
  const teachers = data?.items ?? [];

  const onFilter = async (event: ChangeEvent<HTMLSelectElement>) => {
    const status = event.target.value as "" | TeacherStatus;
    setActionErrors([]);
    try {
      const { items } = await loadTeachers(status || undefined);
      setFilter(status);
      setAnnouncement(`${items.length} professor(es) listado(s).`);
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    }
  };

  const onInvite = handleSubmit(async (values) => {
    setInviteErrors([]);
    try {
      const invitation = await invite.mutateAsync(values);
      reset();
      setAnnouncement(`Convite enviado para ${invitation.email}.`);
    } catch (error) {
      const code = apiErrorCode(error);
      setInviteErrors([{ fieldId: code && EMAIL_ERROR_CODES.includes(code) ? "email" : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  const runAction = async (item: TeacherListItem, action: RowAction) => {
    if (busy) return;
    setBusy(rowKey(item));
    setActionErrors([]);
    try {
      await teacherAction.mutateAsync({ action: action.action, id: action.id });
      setAnnouncement(`${action.label}: ${item.displayName} — concluído.`);
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>

      <h2 id="convidar-titulo">Convidar professor</h2>
      <form
        noValidate
        onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onInvite(event))}
        aria-labelledby="convidar-titulo"
      >
        <ErrorSummary errors={inviteErrors} title="Não foi possível convidar" />
        <Field id="nome" label="Nome" autoComplete="off" required error={errorFor("nome")} {...register("displayName")} />
        <Field id="email" type="email" label="E-mail" autoComplete="off" required error={errorFor("email")} {...register("email")} />
        <SubmitButton pending={formState.isSubmitting} pendingLabel="Enviando convite…">
          Enviar convite
        </SubmitButton>
      </form>

      <h2>Cadastro docente</h2>
      <div className="mb-4 flex flex-col gap-1">
        <Label htmlFor="filtro">Situação</Label>
        <select
          id="filtro"
          className="min-h-11 rounded-md border border-input bg-background px-3 py-2 text-body text-foreground"
          value={filter}
          onChange={(event) => void onFilter(event)}
        >
          {FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <ErrorSummary errors={actionErrors} title="Não foi possível concluir" />

      {teachers.length === 0 ? (
        <p>Nenhum professor encontrado.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Professores</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {teachers.map((item) => {
              const key = rowKey(item);
              return (
                <TableRow key={key}>
                  <TableCell>{item.displayName}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{STATUS_LABELS[item.status]}</TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-2">
                      {actionsFor(item).map((action) => (
                        <Button
                          key={action.label}
                          type="button"
                          variant="secondary"
                          aria-busy={busy === key || undefined}
                          aria-label={`${action.label}: ${item.displayName}`}
                          onClick={() => void runAction(item, action)}
                        >
                          {action.label}
                        </Button>
                      ))}
                    </span>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
