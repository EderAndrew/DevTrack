import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe, getOwnSessions } from "../../../lib/session";
import { SessionsList } from "./sessions-list";
import { Notice } from "@/components/shared";

export const metadata: Metadata = { title: "Minhas sessões" };

const LOGIN = "/entrar?next=%2Fconta%2Fsessoes";

export default async function SessionsPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);

  if (!me.emailVerified) {
    return (
      <section className="mx-auto max-w-160 px-4 py-8">
        <h1>Minhas sessões</h1>
        <Notice role="status">
          <h2>Confirme seu e-mail</h2>
          <p>
            Para ver e encerrar suas sessões, confirme seu e-mail pelo link que enviamos.{" "}
            <Link href="/verificar-email">Receber novo link</Link>
          </p>
        </Notice>
      </section>
    );
  }

  const sessions = await getOwnSessions();
  if (!sessions) redirect(LOGIN);

  return (
    <section className="mx-auto max-w-160 px-4 py-8">
      <h1>Minhas sessões</h1>
      <p>Estas são as sessões abertas na sua conta. Encerre as que você não reconhece.</p>
      <SessionsList initialSessions={sessions} />
    </section>
  );
}
