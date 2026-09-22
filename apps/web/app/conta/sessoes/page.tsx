import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, getOwnSessions } from "../../../lib/session";
import { SessionsList } from "./sessions-list";

export const metadata: Metadata = { title: "Minhas sessões" };

const LOGIN = "/entrar?next=%2Fconta%2Fsessoes";

export default async function SessionsPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);

  if (!me.emailVerified) {
    return (
      <section className="page">
        <h1>Minhas sessões</h1>
        <div className="notice" role="status">
          <h2>Confirme seu e-mail</h2>
          <p>
            Para ver e encerrar suas sessões, confirme seu e-mail pelo link que enviamos.{" "}
            <Link href="/verificar-email">Receber novo link</Link>
          </p>
        </div>
      </section>
    );
  }

  const sessions = await getOwnSessions();
  if (!sessions) redirect(LOGIN);

  return (
    <section className="page">
      <h1>Minhas sessões</h1>
      <p>Estas são as sessões abertas na sua conta. Encerre as que você não reconhece.</p>
      <SessionsList initialSessions={sessions} />
    </section>
  );
}
