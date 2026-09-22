"use client";

import type { SessionListResponse, SessionView } from "@repo/contracts";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorSummary, type FormError } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLogoutAll } from "@/features/auth/hooks/use-auth";
import { formatDateTime } from "@/lib/messages/dates";
import { messageForError } from "@/lib/messages/error-messages";
import { useOwnSessions, useRevokeSession } from "../hooks/use-sessions";

export interface SessionsListProps {
  initialData: SessionListResponse;
}

export function SessionsList({ initialData }: SessionsListProps) {
  const router = useRouter();
  const { data } = useOwnSessions(initialData);
  const revoke = useRevokeSession();
  const logoutAll = useLogoutAll();
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const busy = revoke.isPending || logoutAll.isPending || logoutAll.isSuccess;

  const goToLogin = () => {
    router.replace("/entrar");
    router.refresh();
  };

  const onRevoke = (session: SessionView) => {
    if (busy) return;
    setErrors([]);
    revoke.mutate(session, {
      onSuccess: () => {
        if (session.current) return goToLogin();
        setAnnouncement(`Sessão iniciada em ${formatDateTime(session.createdAt)} encerrada.`);
      },
      onError: (error) => setErrors([{ message: messageForError(error) }]),
    });
  };

  const onLogoutAll = () => {
    if (busy) return;
    setErrors([]);
    logoutAll.mutate(undefined, {
      onSuccess: goToLogin,
      onError: (error) => setErrors([{ message: messageForError(error) }]),
    });
  };

  return (
    <div>
      <ErrorSummary errors={errors} title="Não foi possível concluir" />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <Table className="mb-6">
        <TableCaption className="sr-only">Sessões ativas</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Iniciada em</TableHead>
            <TableHead scope="col">Último uso</TableHead>
            <TableHead scope="col">Expira em</TableHead>
            <TableHead scope="col">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                {formatDateTime(session.createdAt)}
                {session.current ? <strong> (esta sessão)</strong> : null}
              </TableCell>
              <TableCell>{formatDateTime(session.lastUsedAt)}</TableCell>
              <TableCell>{formatDateTime(session.expiresAt)}</TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="secondary"
                  aria-busy={(revoke.isPending && revoke.variables?.id === session.id) || undefined}
                  aria-label={`Encerrar sessão iniciada em ${formatDateTime(session.createdAt)}${session.current ? " (esta sessão)" : ""}`}
                  onClick={() => onRevoke(session)}
                >
                  Encerrar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" aria-busy={logoutAll.isPending || undefined} onClick={onLogoutAll}>
        Sair de todos os dispositivos
      </Button>
    </div>
  );
}
