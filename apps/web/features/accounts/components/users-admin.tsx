"use client";

import type { AccountPage, UserAccountView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ErrorSummary, Field, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { messageForError } from "@/lib/messages/error-messages";
import { ROLE_LABELS, STATUS_LABELS } from "@/lib/messages/status-labels";
import { useAccountPages, useLoadAccountPage, useToggleAccount } from "../hooks/use-accounts";
import { type AccountSearchFormInput, AccountSearchFormSchema, accountSearchMessages } from "../schemas/search-form";

const FIELD_IDS = { query: "busca" } as const;

export interface UsersAdminProps {
  initialPage: AccountPage;
  /** The own account is not offered for suspension (the API refuses it anyway). */
  currentUserId: string;
}

const describeRoles = (account: UserAccountView) =>
  account.roles.map((role) => `${ROLE_LABELS[role.key] ?? role.key} (${STATUS_LABELS[role.status]})`).join(", ") ||
  "Nenhum";

export function UsersAdmin({ initialPage, currentUserId }: UsersAdminProps) {
  const [search, setSearch] = useState<{ query: string; cursors: (string | null)[] }>({ query: "", cursors: [null] });
  const pages = useAccountPages(search.query, search.cursors, initialPage);
  const loadPage = useLoadAccountPage();
  const toggle = useToggleAccount();
  const [announcement, setAnnouncement] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<AccountSearchFormInput>(FIELD_IDS);
  const { register, handleSubmit } = useForm({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(AccountSearchFormSchema, { error: accountSearchMessages }),
    defaultValues: { query: "" },
  });

  const accounts = pages.flatMap((page) => page.data?.items ?? []);
  const nextCursor = pages.at(-1)?.data?.nextCursor ?? null;

  const onSearch = handleSubmit(async (values) => {
    if (loading) return;
    const query = values.query?.trim() ?? "";
    setLoading(true);
    setErrors([]);
    try {
      const page = await loadPage(query, null);
      setSearch({ query, cursors: [null] });
      setAnnouncement(`${page.items.length} conta(s) encontrada(s).`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    } finally {
      setLoading(false);
    }
  }, onInvalid);

  const loadMore = async () => {
    if (!nextCursor || loading) return;
    setLoading(true);
    try {
      const page = await loadPage(search.query, nextCursor);
      setSearch((current) => ({ ...current, cursors: [...current.cursors, nextCursor] }));
      setAnnouncement(`${page.items.length} conta(s) a mais carregada(s).`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    } finally {
      setLoading(false);
    }
  };

  const onToggle = async (account: UserAccountView) => {
    if (busy) return;
    setBusy(account.id);
    setErrors([]);
    try {
      const updated = await toggle.mutateAsync(account);
      setAnnouncement(`${updated.name}: conta ${STATUS_LABELS[updated.status]?.toLowerCase()}.`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <form
        noValidate
        onSubmit={(event) => (loading ? event.preventDefault() : void onSearch(event))}
        aria-label="Buscar contas"
        className="mb-4 flex flex-wrap items-end gap-4"
      >
        <Field
          id="busca"
          type="search"
          label="Buscar por nome ou e-mail"
          autoComplete="off"
          className="mb-0 flex-[1_1_16rem]"
          error={errorFor("busca")}
          {...register("query")}
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
                      onClick={() => void onToggle(account)}
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
      {nextCursor ? (
        <Button type="button" aria-busy={loading || undefined} onClick={() => void loadMore()}>
          Carregar mais
        </Button>
      ) : null}
    </div>
  );
}
