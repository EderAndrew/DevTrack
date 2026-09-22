"use client";

import type { InvitationListResponse, InvitationView, ManagerListResponse, ManagerView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { formatDateTime } from "@/lib/messages/dates";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { STATUS_LABELS } from "@/lib/messages/status-labels";
import {
  useInviteManager,
  useManagerInvitations,
  useManagers,
  useResendManagerInvitation,
  useRevokeManagerInvitation,
  useToggleManager,
} from "../hooks/use-managers";
import {
  EMAIL_ERROR_CODES,
  type InviteManagerFormInput,
  InviteManagerFormSchema,
  inviteManagerMessages,
} from "../schemas/invite-form";

const FIELD_IDS = { displayName: "nome", email: "email" } as const;

export interface ManagersAdminProps {
  initialManagers: ManagerListResponse;
  initialInvitations: InvitationListResponse;
}

export function ManagersAdmin({ initialManagers, initialInvitations }: ManagersAdminProps) {
  const { data: managers } = useManagers(initialManagers);
  const { data: invitations } = useManagerInvitations(initialInvitations);
  const invite = useInviteManager();
  const resend = useResendManagerInvitation();
  const revoke = useRevokeManagerInvitation();
  const toggle = useToggleManager();
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const { errors: inviteErrors, setErrors: setInviteErrors, onInvalid, errorFor } = useErrorSummary<InviteManagerFormInput>(FIELD_IDS);
  const { register, handleSubmit, reset, formState } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(InviteManagerFormSchema, { error: inviteManagerMessages }),
    defaultValues: { displayName: "", email: "" },
  });

  const onInvite = handleSubmit(async (values) => {
    setInviteErrors([]);
    try {
      const invitation = await invite.mutateAsync(values);
      setAnnouncement(`Convite enviado para ${invitation.email}.`);
      reset();
    } catch (error) {
      const code = apiErrorCode(error);
      setInviteErrors([{ fieldId: code && EMAIL_ERROR_CODES.includes(code) ? "email" : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setActionErrors([]);
    try {
      await action();
    } catch (error) {
      setActionErrors([{ message: messageForError(error) }]);
    } finally {
      setBusy(null);
    }
  };

  const toggleManager = (manager: ManagerView) =>
    run(manager.userId, async () => {
      const updated = await toggle.mutateAsync(manager);
      setAnnouncement(`${updated.name}: ${STATUS_LABELS[updated.status]}.`);
    });

  const resendInvitation = (invitation: InvitationView) =>
    run(invitation.id, async () => {
      await resend.mutateAsync(invitation.id);
      setAnnouncement(`Convite reenviado para ${invitation.email}.`);
    });

  const revokeInvitation = (invitation: InvitationView) =>
    run(invitation.id, async () => {
      await revoke.mutateAsync(invitation.id);
      setAnnouncement(`Convite de ${invitation.email} revogado.`);
    });

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível concluir" />

      <h2>Gestores</h2>
      {managers.items.length === 0 ? (
        <p>Nenhum gestor cadastrado.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Gestores de cadastros</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {managers.items.map((manager) => (
              <TableRow key={manager.userId}>
                <TableCell>{manager.name}</TableCell>
                <TableCell>{manager.email}</TableCell>
                <TableCell>{STATUS_LABELS[manager.status]}</TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="secondary"
                    aria-busy={busy === manager.userId || undefined}
                    aria-label={`${manager.status === "INACTIVE" ? "Reativar" : "Desativar"} ${manager.name}`}
                    onClick={() => void toggleManager(manager)}
                  >
                    {manager.status === "INACTIVE" ? "Reativar" : "Desativar"}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <h2 id="convidar-titulo">Convidar gestor</h2>
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

      <h2>Convites</h2>
      {invitations.items.length === 0 ? (
        <p>Nenhum convite.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Convites de gestor</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Convidado</TableHead>
              <TableHead scope="col">Situação</TableHead>
              <TableHead scope="col">Válido até</TableHead>
              <TableHead scope="col">Envios</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.items.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>
                  {invitation.displayName}
                  <br />
                  {invitation.email}
                </TableCell>
                <TableCell>{STATUS_LABELS[invitation.status]}</TableCell>
                <TableCell>{formatDateTime(invitation.expiresAt)}</TableCell>
                <TableCell>{invitation.sendCount}</TableCell>
                <TableCell>
                  {invitation.status === "PENDING" ? (
                    <span className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        aria-busy={busy === invitation.id || undefined}
                        aria-label={`Reenviar convite para ${invitation.email}`}
                        onClick={() => void resendInvitation(invitation)}
                      >
                        Reenviar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-busy={busy === invitation.id || undefined}
                        aria-label={`Revogar convite para ${invitation.email}`}
                        onClick={() => void revokeInvitation(invitation)}
                      >
                        Revogar
                      </Button>
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
