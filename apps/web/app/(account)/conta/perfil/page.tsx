import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared";
import { getMe } from "@/features/auth/api/server";
import { ProfileDetails } from "@/features/profile/components/profile-details";
import { fetchOwnSessions } from "@/features/sessions/api/server";
import { SessionsList } from "@/features/sessions/components/sessions-list";

export const metadata: Metadata = { title: "Meu perfil" };

const LOGIN = "/entrar?next=%2Fconta%2Fperfil";

export default async function ProfilePage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);

  const sessions = me.emailVerified ? await fetchOwnSessions() : null;
  if (me.emailVerified && !sessions) redirect(LOGIN);

  return (
    <section className="mx-auto w-full max-w-160">
      <PageHeader title="Meu perfil" />
      <ProfileDetails me={me} />
      <section aria-labelledby="minhas-sessoes">
        <h2 id="minhas-sessoes">Minhas sessões</h2>
        {sessions ? (
          <>
            <p>Estas são as sessões abertas na sua conta. Encerre as que você não reconhece.</p>
            <SessionsList initialData={sessions} />
          </>
        ) : (
          <Notice role="status">
            <h3>Confirme seu e-mail</h3>
            <p>
              Para ver e encerrar suas sessões, confirme seu e-mail pelo link que enviamos.{" "}
              <Link href="/verificar-email">Receber novo link</Link>
            </p>
          </Notice>
        )}
      </section>
    </section>
  );
}
