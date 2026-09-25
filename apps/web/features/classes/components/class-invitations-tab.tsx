"use client";

import type { ClassInvitationStatus, ClassInvitationView } from "@repo/contracts";
import { ClassInvitationStatusSchema } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { CLASS_INVITATION_STATUS_LABELS } from "@/lib/messages/status-labels";
import {
  type ClassInvitationFilters,
  useCancelInvitation,
  useClassInvitations,
  useResendInvitation,
} from "../hooks/use-class-invitations";
import {
  DEFAULT_INVITATION_FILTERS,
  type InvitationFiltersFormInput,
  InvitationFiltersFormSchema,
  invitationFiltersMessages,
  toInvitationFilters,
} from "../schemas/invitation-filters";

const FIELD_IDS = { query: "busca-convites", status: "situacao-convites" } as const;
const NO_FILTERS: InvitationFiltersFormInput = { query: "", status: "PENDING" };

/** Options of the status filter, in the plural. */
const FILTER_LABELS: Record<ClassInvitationStatus, string> = {
  PENDING: "Pendentes",
  ACCEPTED: "Aceitos",
  EXPIRED: "Expirados",
  CANCELLED: "Cancelados",
};

const EMPTY: Record<ClassInvitationStatus, string> = {
  PENDING: "Nenhum convite pendente.",
  ACCEPTED: "Nenhum convite aceito.",
  EXPIRED: "Nenhum convite expirado.",
  CANCELLED: "Nenhum convite cancelado.",
};

const STATUS_VARIANT = {
  PENDING: "info",
  ACCEPTED: "success",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
} as const satisfies Record<ClassInvitationStatus, "info" | "success" | "neutral">;

export interface ClassInvitationsTabProps {
  classId: string;
  /** UX only (the API authorizes): which actions to offer on pending invitations. */
  canResend: boolean;
  canCancel: boolean;
}

/**
 * "Convites" tab of a class (FR-020–FR-023): search by e-mail and status filter applied by the
 * API (pending by default), 20 at a time; pending invitations can be resent or, after a
 * confirmation, cancelled. Next to the status, "Enviando" while the e-mail waits for its (next)
 * attempt and "Envio falhou" once the attempts ran out (FR-019).
 */
export function ClassInvitationsTab({ classId, canResend, canCancel }: ClassInvitationsTabProps) {
  const [filters, setFilters] = useState<ClassInvitationFilters>(DEFAULT_INVITATION_FILTERS);
  const invitations = useClassInvitations(classId, filters);
  const resend = useResendInvitation(classId);
  const cancel = useCancelInvitation(classId);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<InvitationFiltersFormInput>(FIELD_IDS);
  const { register, handleSubmit, control } = useForm({
    shouldFocusError: false,
    resolver: zodResolver(InvitationFiltersFormSchema, { error: invitationFiltersMessages }),
    defaultValues: NO_FILTERS,
  });

  const onSearch = handleSubmit((values) => {
    setErrors([]);
    setFilters(toInvitationFilters(values));
  }, onInvalid);

  const run = async (action: "resend" | "cancel", invitation: ClassInvitationView) => {
    const mutation = action === "resend" ? resend : cancel;
    if (mutation.isPending) return;
    setActionErrors([]);
    setAnnouncement("");
    try {
      await mutation.mutateAsync(invitation.id);
      setAnnouncement(action === "resend" ? "Convite reenviado." : "Convite cancelado.");
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    }
  };

  const items = invitations.data?.pages.flatMap((page) => page.items) ?? [];
  const status = filters.status ?? "PENDING";

  return (
    <div>
      <form
        noValidate
        onSubmit={(event) => void onSearch(event)}
        aria-label="Pesquisar convites"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id={FIELD_IDS.query}
          type="search"
          label="Pesquisar por e-mail"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={errorFor(FIELD_IDS.query)}
          {...register("query")}
        />
        <div className="flex flex-col gap-1">
          <Label htmlFor={FIELD_IDS.status}>Situação</Label>
          <Controller
            control={control}
            name="status"
            render={({ field }) => (
              <Select name={field.name} value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={FIELD_IDS.status} className="min-h-11 w-44" onBlur={field.onBlur}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ClassInvitationStatusSchema.options.map((option) => (
                    <SelectItem key={option} value={option}>
                      {FILTER_LABELS[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <SubmitButton pending={invitations.isFetching && !invitations.isFetchingNextPage} pendingLabel="Pesquisando…">
          Pesquisar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Corrija a pesquisa" />

      <p role="status" className="m-0 font-semibold">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível alterar o convite" />

      {invitations.isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">Carregando convites…</span>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : invitations.isError && items.length === 0 ? (
        <div role="alert">
          <p>{messageForError(invitations.error)}</p>
          <Button type="button" variant="secondary" onClick={() => void invitations.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : items.length === 0 ? (
        <p>{EMPTY[status]}</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Convites da turma</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Validade</TableHead>
              <TableHead scope="col">Envios</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.email}</TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant={STATUS_VARIANT[item.status]}>{CLASS_INVITATION_STATUS_LABELS[item.status]}</Badge>
                    {item.status === "PENDING" && item.delivery === "FAILED" ? (
                      <Badge variant="danger">Envio falhou</Badge>
                    ) : item.status === "PENDING" && item.delivery === "SENDING" ? (
                      <Badge variant="neutral">Enviando</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>{formatDateTime(item.expiresAt)}</TableCell>
                <TableCell>{item.sendCount}</TableCell>
                <TableCell>
                  {item.status === "PENDING" ? (
                    <span className="flex flex-wrap gap-2">
                      {canResend ? (
                        <Button
                          type="button"
                          variant="secondary"
                          aria-label={`Reenviar convite para ${item.email}`}
                          aria-busy={(resend.isPending && resend.variables === item.id) || undefined}
                          onClick={() => void run("resend", item)}
                        >
                          Reenviar
                        </Button>
                      ) : null}
                      {canCancel ? <CancelInvitation invitation={item} onConfirm={() => void run("cancel", item)} /> : null}
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {invitations.isError && items.length > 0 ? <p role="alert">{messageForError(invitations.error)}</p> : null}
      {invitations.hasNextPage ? (
        <Button
          type="button"
          aria-busy={invitations.isFetchingNextPage || undefined}
          onClick={() => (invitations.isFetchingNextPage ? undefined : void invitations.fetchNextPage())}
        >
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}

/** "Cancelar" with a confirmation (FR-022); the dialog returns focus to its button. */
function CancelInvitation({ invitation, onConfirm }: { invitation: ClassInvitationView; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="danger" aria-label={`Cancelar convite para ${invitation.email}`}>
          Cancelar
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar o convite de {invitation.email}?</AlertDialogTitle>
          <AlertDialogDescription>
            O link enviado deixa de valer na hora. Para convidar este e-mail de novo, envie um convite novo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          <AlertDialogAction variant="danger" onClick={onConfirm}>Cancelar convite</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
