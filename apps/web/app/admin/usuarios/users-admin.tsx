"use client";

import { type FormEvent, useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
import {
  type AccountPage,
  adminApi,
  ROLE_LABELS,
  STATUS_LABELS,
  type UserAccountView,
} from "../../../lib/admin-api";
import { errorMessage } from "../../../lib/auth-api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <form noValidate onSubmit={search} aria-label="Buscar contas" className="mb-4 flex flex-wrap items-end gap-4">
        <Field
          id="busca"
          name="busca"
          type="search"
          label="Buscar por nome ou e-mail"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
        />
        <SubmitButton pending={loading} pendingLabel="Buscando…">
          Buscar
        </SubmitButton>
      </form>
      <ErrorSummary errors={errors} title="Não foi possível concluir" />

      {accounts.length === 0 ? (
        <p>Nenhuma conta encontrada.</p>
      ) : (
        <Table className="mb-6">
          <TableCaption className="sr-only">Contas de usuário</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">Nome</TableHead>
              <TableHead scope="col">E-mail</TableHead>
              <TableHead scope="col">Conta</TableHead>
              <TableHead scope="col">Papéis</TableHead>
              <TableHead scope="col">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map((account) => (
              <TableRow key={account.id}>
                <TableCell>{account.name}</TableCell>
                <TableCell>
                  {account.email}
                  {account.emailVerified ? null : <span> (e-mail não verificado)</span>}
                </TableCell>
                <TableCell>{STATUS_LABELS[account.status]}</TableCell>
                <TableCell>{describeRoles(account)}</TableCell>
                <TableCell>
                  {account.id === currentUserId ? (
                    <span>Sua conta</span>
                  ) : (
                    <Button
                      type="button"
                      variant="secondary"
                      aria-busy={busy === account.id || undefined}
                      aria-label={`${account.status === "SUSPENDED" ? "Reativar" : "Suspender"} conta de ${account.name}`}
                      onClick={() => void toggle(account)}
                    >
                      {account.status === "SUSPENDED" ? "Reativar" : "Suspender"}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {cursor ? (
        <Button type="button" aria-busy={loading || undefined} onClick={() => void loadMore()}>
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
