"use client";

import { type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import { ApiError } from "../../../lib/api-client";
import {
  adminApi,
  formatDateTime,
  type InvitationView,
  type ManagerView,
  STATUS_LABELS,
} from "../../../lib/admin-api";
import { errorMessage } from "../../../lib/auth-api";

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
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={actionErrors} title="Não foi possível concluir" />

      <h2>Gestores</h2>
      {managers.length === 0 ? (
        <p>Nenhum gestor cadastrado.</p>
      ) : (
        <table className="table">
          <caption className="visually-hidden">Gestores de cadastros</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Situação</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {managers.map((manager) => (
              <tr key={manager.userId}>
                <td>{manager.name}</td>
                <td>{manager.email}</td>
                <td>{STATUS_LABELS[manager.status]}</td>
                <td>
                  <button
                    type="button"
                    className="button button--secondary"
                    aria-busy={busy === manager.userId || undefined}
                    aria-label={`${manager.status === "INACTIVE" ? "Reativar" : "Desativar"} ${manager.name}`}
                    onClick={() => void toggleManager(manager)}
                  >
                    {manager.status === "INACTIVE" ? "Reativar" : "Desativar"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
        <table className="table">
          <caption className="visually-hidden">Convites de gestor</caption>
          <thead>
            <tr>
              <th scope="col">Convidado</th>
              <th scope="col">Situação</th>
              <th scope="col">Válido até</th>
              <th scope="col">Envios</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {invitations.map((invitation) => (
              <tr key={invitation.id}>
                <td>
                  {invitation.displayName}
                  <br />
                  {invitation.email}
                </td>
                <td>{STATUS_LABELS[invitation.status]}</td>
                <td>{formatDateTime(invitation.expiresAt)}</td>
                <td>{invitation.sendCount}</td>
                <td>
                  {invitation.status === "PENDING" ? (
                    <span className="actions">
                      <button
                        type="button"
                        className="button button--secondary"
                        aria-busy={busy === invitation.id || undefined}
                        aria-label={`Reenviar convite para ${invitation.email}`}
                        onClick={() => void resend(invitation)}
                      >
                        Reenviar
                      </button>
                      <button
                        type="button"
                        className="button button--secondary"
                        aria-busy={busy === invitation.id || undefined}
                        aria-label={`Revogar convite para ${invitation.email}`}
                        onClick={() => void revoke(invitation)}
                      >
                        Revogar
                      </button>
                    </span>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
