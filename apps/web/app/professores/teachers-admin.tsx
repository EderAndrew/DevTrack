"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../components/form";
import { ApiError } from "../../lib/api-client";
import { adminApi, STATUS_LABELS, type TeacherListItem, type TeacherStatus } from "../../lib/admin-api";
import { errorMessage } from "../../lib/auth-api";

/** API errors about the invited e-mail, shown next to that field. */
const EMAIL_ERRORS = ["ALREADY_TEACHER", "TEACHER_REACTIVATION_REQUIRED", "SELF_INVITE_FORBIDDEN", "INVITATION_ALREADY_PENDING"];

const FILTERS: { value: "" | TeacherStatus; label: string }[] = [
  { value: "", label: "Todos" },
  { value: "INVITED", label: "Convidado" },
  { value: "ACTIVE", label: "Ativo" },
  { value: "SUSPENDED", label: "Suspenso" },
  { value: "INACTIVE", label: "Inativo" },
];

interface RowAction {
  label: string;
  run: () => Promise<unknown>;
}

/** Actions offered per status; the API validates every transition again. */
function actionsFor(item: TeacherListItem): RowAction[] {
  if (item.status === "INVITED" && item.invitationId) {
    const id = item.invitationId;
    return [
      { label: "Reenviar convite", run: () => adminApi.resendTeacherInvitation(id) },
      { label: "Revogar convite", run: () => adminApi.revokeTeacherInvitation(id) },
    ];
  }
  if (!item.userId) return [];
  const userId = item.userId;
  const suspend = { label: "Suspender", run: () => adminApi.suspendTeacher(userId) };
  const deactivate = { label: "Desativar", run: () => adminApi.deactivateTeacher(userId) };
  const reactivate = { label: "Reativar", run: () => adminApi.reactivateTeacher(userId) };
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

export interface TeachersAdminProps {
  initialTeachers: TeacherListItem[];
}

export function TeachersAdmin({ initialTeachers }: TeachersAdminProps) {
  const [teachers, setTeachers] = useState(initialTeachers);
  const [filter, setFilter] = useState<"" | TeacherStatus>("");
  const [inviteErrors, setInviteErrors] = useState<FormError[]>([]);
  const [actionErrors, setActionErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [pending, setPending] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = async (status: "" | TeacherStatus = filter) => {
    const { items } = await adminApi.listTeachers(status || undefined);
    setTeachers(items);
    return items;
  };

  const onFilter = async (event: ChangeEvent<HTMLSelectElement>) => {
    const status = event.target.value as "" | TeacherStatus;
    setFilter(status);
    setActionErrors([]);
    try {
      const items = await reload(status);
      setAnnouncement(`${items.length} professor(es) listado(s).`);
    } catch (error) {
      setActionErrors([{ message: errorMessage(error) }]);
    }
  };

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
      const invitation = await adminApi.inviteTeacher(email, displayName);
      form.reset();
      await reload();
      setAnnouncement(`Convite enviado para ${invitation.email}.`);
    } catch (error) {
      const fieldId = error instanceof ApiError && EMAIL_ERRORS.includes(error.code) ? "email" : undefined;
      setInviteErrors([{ fieldId, message: errorMessage(error) }]);
    } finally {
      setPending(false);
    }
  };

  const runAction = async (item: TeacherListItem, action: RowAction) => {
    const key = item.userId ?? item.invitationId ?? item.email;
    if (busy) return;
    setBusy(key);
    setActionErrors([]);
    try {
      await action.run();
      await reload();
      setAnnouncement(`${action.label}: ${item.displayName} — concluído.`);
    } catch (error) {
      setActionErrors([{ message: errorMessage(error) }]);
    } finally {
      setBusy(null);
    }
  };

  const inviteError = (id: string) => inviteErrors.find((error) => error.fieldId === id)?.message;

  return (
    <div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>

      <h2 id="convidar-titulo">Convidar professor</h2>
      <form noValidate onSubmit={onInvite} aria-labelledby="convidar-titulo">
        <ErrorSummary errors={inviteErrors} title="Não foi possível convidar" />
        <Field id="nome" name="nome" label="Nome" autoComplete="off" required error={inviteError("nome")} />
        <Field id="email" name="email" type="email" label="E-mail" autoComplete="off" required error={inviteError("email")} />
        <SubmitButton pending={pending} pendingLabel="Enviando convite…">
          Enviar convite
        </SubmitButton>
      </form>

      <h2>Cadastro docente</h2>
      <div className="field">
        <label htmlFor="filtro">Situação</label>
        <select id="filtro" value={filter} onChange={(event) => void onFilter(event)}>
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
        <table className="table">
          <caption className="visually-hidden">Professores</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Situação</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {teachers.map((item) => {
              const key = item.userId ?? item.invitationId ?? item.email;
              return (
                <tr key={key}>
                  <td>{item.displayName}</td>
                  <td>{item.email}</td>
                  <td>{STATUS_LABELS[item.status]}</td>
                  <td>
                    <span className="actions">
                      {actionsFor(item).map((action) => (
                        <button
                          key={action.label}
                          type="button"
                          className="button button--secondary"
                          aria-busy={busy === key || undefined}
                          aria-label={`${action.label}: ${item.displayName}`}
                          onClick={() => void runAction(item, action)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
