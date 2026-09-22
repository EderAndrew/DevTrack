"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorSummary, type FormError } from "@/components/shared";
import { authApi, errorMessage, type SessionView } from "../../../lib/auth-api";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const dateTime = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});
const format = (iso: string) => dateTime.format(new Date(iso));

export interface SessionsListProps {
  initialSessions: SessionView[];
}

export function SessionsList({ initialSessions }: SessionsListProps) {
  const router = useRouter();
  const [sessions, setSessions] = useState(initialSessions);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const goToLogin = () => {
    router.replace("/entrar");
    router.refresh();
  };

  const revoke = async (session: SessionView) => {
    if (busy) return;
    setBusy(session.id);
    setErrors([]);
    try {
      await authApi.revokeSession(session.id);
      if (session.current) return goToLogin();
      setSessions((current) => current.filter((item) => item.id !== session.id));
      setAnnouncement(`Sessão iniciada em ${format(session.createdAt)} encerrada.`);
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
    } finally {
      setBusy(null);
    }
  };

  const logoutAll = async () => {
    if (busy) return;
    setBusy("all");
    setErrors([]);
    try {
      await authApi.logoutAll();
      goToLogin();
    } catch (error) {
      setErrors([{ message: errorMessage(error) }]);
      setBusy(null);
    }
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
          {sessions.map((session) => (
            <TableRow key={session.id}>
              <TableCell>
                {format(session.createdAt)}
                {session.current ? <strong> (esta sessão)</strong> : null}
              </TableCell>
              <TableCell>{format(session.lastUsedAt)}</TableCell>
              <TableCell>{format(session.expiresAt)}</TableCell>
              <TableCell>
                <Button
                  type="button"
                  variant="secondary"
                  aria-busy={busy === session.id || undefined}
                  aria-label={`Encerrar sessão iniciada em ${format(session.createdAt)}${session.current ? " (esta sessão)" : ""}`}
                  onClick={() => void revoke(session)}
                >
                  Encerrar
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Button type="button" aria-busy={busy === "all" || undefined} onClick={() => void logoutAll()}>
        Sair de todos os dispositivos
      </Button>
    </div>
  );
}
