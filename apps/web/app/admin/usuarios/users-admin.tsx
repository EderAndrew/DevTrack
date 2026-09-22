"use client";

import { type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "../../../components/form";
import {
  type AccountPage,
  adminApi,
  ROLE_LABELS,
  STATUS_LABELS,
  type UserAccountView,
} from "../../../lib/admin-api";
import { errorMessage } from "../../../lib/auth-api";

export interface UsersAdminProps {
  initialPage: AccountPage;
  /** The own account is not offered for suspension (the API refuses it anyway). */
  currentUserId: string;
}

const describeRoles = (account: UserAccountView) =>
  account.roles.map((role) => `${ROLE_LABELS[role.key] ?? role.key} (${STATUS_LABELS[role.status]})`).join(", ") ||
  "Nenhum";

export function UsersAdmin({ initialPage, currentUserId }: UsersAdminProps) {
  const [accounts, setAccounts] = useState(initialPage.items);
  const [cursor, setCursor] = useState(initialPage.nextCursor);
  const [query, setQuery] = useState("");
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const text = String(new FormData(event.currentTarget).get("busca") ?? "").trim();
    setLoading(true);
    setErrors([]);
    try {
      const page = await adminApi.listUsers({ query: text || undefined });
      setQuery(text);
      setAccounts(page.items);
      setCursor(page.nextCursor);
      setAnnouncement(`${page.items.length} conta(s) encontrada(s).`);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    try {
      const page = await adminApi.listUsers({ query: query || undefined, cursor });
      setAccounts((items) => [...items, ...page.items]);
      setCursor(page.nextCursor);
      setAnnouncement(`${page.items.length} conta(s) a mais carregada(s).`);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setLoading(false);
    }
  };

  const toggle = async (account: UserAccountView) => {
    if (busy) return;
    setBusy(account.id);
    setErrors([]);
    try {
      const updated =
        account.status === "SUSPENDED" ? await adminApi.reactivateUser(account.id) : await adminApi.suspendUser(account.id);
      setAccounts((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      setAnnouncement(`${updated.name}: conta ${STATUS_LABELS[updated.status]?.toLowerCase()}.`);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <form noValidate onSubmit={search} aria-label="Buscar contas" className="search">
        <Field id="busca" name="busca" type="search" label="Buscar por nome ou e-mail" autoComplete="off" />
        <SubmitButton pending={loading} pendingLabel="Buscando…">
          Buscar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Não foi possível concluir" />

      {accounts.length === 0 ? (
        <p>Nenhuma conta encontrada.</p>
      ) : (
        <table className="table">
          <caption className="visually-hidden">Contas de usuário</caption>
          <thead>
            <tr>
              <th scope="col">Nome</th>
              <th scope="col">E-mail</th>
              <th scope="col">Conta</th>
              <th scope="col">Papéis</th>
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((account) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td>
                  {account.email}
                  {account.emailVerified ? null : <span> (e-mail não verificado)</span>}
                </td>
                <td>{STATUS_LABELS[account.status]}</td>
                <td>{describeRoles(account)}</td>
                <td>
                  {account.id === currentUserId ? (
                    <span>Sua conta</span>
                  ) : (
                    <button
                      type="button"
                      className="button button--secondary"
                      aria-busy={busy === account.id || undefined}
                      aria-label={`${account.status === "SUSPENDED" ? "Reativar" : "Suspender"} conta de ${account.name}`}
                      onClick={() => void toggle(account)}
                    >
                      {account.status === "SUSPENDED" ? "Reativar" : "Suspender"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {cursor ? (
        <button type="button" className="button" aria-busy={loading || undefined} onClick={() => void loadMore()}>
          Carregar mais
        </button>
      ) : null}
    </div>
  );
}
