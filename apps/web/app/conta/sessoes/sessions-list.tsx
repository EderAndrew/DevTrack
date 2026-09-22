"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ErrorSummary, type FormError } from "../../../components/form";
import { authApi, errorMessage, type SessionView } from "../../../lib/auth-api";

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
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
      <table className="table">
        <caption className="visually-hidden">Sessões ativas</caption>
        <thead>
          <tr>
            <th scope="col">Iniciada em</th>
            <th scope="col">Último uso</th>
            <th scope="col">Expira em</th>
            <th scope="col">Ações</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session) => (
            <tr key={session.id}>
              <td>
                {format(session.createdAt)}
                {session.current ? <strong> (esta sessão)</strong> : null}
              </td>
              <td>{format(session.lastUsedAt)}</td>
              <td>{format(session.expiresAt)}</td>
              <td>
                <button
                  type="button"
                  className="button button--secondary"
                  aria-busy={busy === session.id || undefined}
                  aria-label={`Encerrar sessão iniciada em ${format(session.createdAt)}${session.current ? " (esta sessão)" : ""}`}
                  onClick={() => void revoke(session)}
                >
                  Encerrar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" className="button" aria-busy={busy === "all" || undefined} onClick={() => void logoutAll()}>
        Sair de todos os dispositivos
      </button>
    </div>
  );
}
