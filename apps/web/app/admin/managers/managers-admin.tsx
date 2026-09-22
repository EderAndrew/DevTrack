"use client";

import { type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import { ApiError } from "../../../lib/api-client";
import {
  adminApi,
  formatDateTime,
  type InvitationView,
  type ManagerView,
  STATUS_LABELS,
} from "../../../lib/admin-api";
import { errorMessage } from "../../../lib/auth-api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface ManagersAdminProps {
  initialManagers: ManagerView[];
  initialInvitations: InvitationView[];
}

export function ManagersAdmin({ initialManagers, initialInvitations }: ManagersAdminProps) {
  const [managers, setManagers] = useState(initialManagers);
  const [invitations, setInvitations] = useState(initialInvitations);
  const [inviteErrors, setInviteErrors] = useState<FormError[]>([]);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const replaceInvitation = (updated: InvitationView) =>
    setInvitations((items) => items.map((item) => (item.id === updated.id ? updated : item)));

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const displayName = String(data.get("nome") ?? "");
    const email = String(data.get("email") ?? "");
    const missing: FormError[] = [];
    if (!displayName.trim()) missing.push({ fieldId: "nome", message: "Informe o nome." });
    if (!email.trim()) missing.push({ fieldId: "email", message: "Informe o e-mail." });
    setInviteErrors(missing);
    if (missing.length > 0) return;

    setPending(true);
    try {
      const invitation = await adminApi.inviteManager(email, displayName);
      setInvitations((items) => [invitation, ...items]);
      setAnnouncement(`Convite enviado para ${invitation.email}.`);
      form.reset();
    } catch (error) {
      const fieldId =
        error instanceof ApiError && ["SELF_INVITE_FORBIDDEN", "ALREADY_MANAGER", "INVITATION_ALREADY_PENDING"].includes(error.code)
          ? "email"
          : undefined;
      setInviteErrors([{ fieldId, message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  const run = async (key: string, action: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    setActionErrors([]);
    try {
      await action();
    } catch (error) {
      setActionErrors([{ message: errorMessage(error) }]);
    } finally {
      setBusy(null);
    }
  };

  const toggleManager = (manager: ManagerView) =>
    run(manager.userId, async () => {
      const updated =
        manager.status === "INACTIVE"
          ? await adminApi.reactivateManager(manager.userId)
          : await adminApi.deactivateManager(manager.userId);
      setManagers((items) => items.map((item) => (item.userId === updated.userId ? updated : item)));
      setAnnouncement(`${updated.name}: ${STATUS_LABELS[updated.status]}.`);
    });

  const resend = (invitation: InvitationView) =>
    run(invitation.id, async () => {
      replaceInvitation(await adminApi.resendManagerInvitation(invitation.id));
      setAnnouncement(`Convite reenviado para ${invitation.email}.`);
    });

  const revoke = (invitation: InvitationView) =>
    run(invitation.id, async () => {
      replaceInvitation(await adminApi.revokeManagerInvitation(invitation.id));
      setAnnouncement(`Convite de ${invitation.email} revogado.`);
    });

  const inviteError = (id: string) => inviteErrors.find((error) => error.fieldId === id)?.message;

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível concluir" />

      <h2>Gestores</h2>
      {managers.length === 0 ? (
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
            {managers.map((manager) => (
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
      <form noValidate onSubmit={onInvite} aria-labelledby="convidar-titulo">
        <ErrorSummary errors={inviteErrors} title="Não foi possível convidar" />
        <Field id="nome" name="nome" label="Nome" autoComplete="off" required error={inviteError("nome")} />
        <Field id="email" name="email" type="email" label="E-mail" autoComplete="off" required error={inviteError("email")} />
        <SubmitButton pending={pending} pendingLabel="Enviando convite…">
          Enviar convite
        </SubmitButton>
      </form>

      <h2>Convites</h2>
      {invitations.length === 0 ? (
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
            {invitations.map((invitation) => (
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
                        onClick={() => void resend(invitation)}
                      >
                        Reenviar
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        aria-busy={busy === invitation.id || undefined}
                        aria-label={`Revogar convite para ${invitation.email}`}
                        onClick={() => void revoke(invitation)}
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
