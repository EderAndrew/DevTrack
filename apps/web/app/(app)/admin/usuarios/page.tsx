import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { fetchFirstAccountsPage } from "@/features/accounts/api/server";
import { UsersAdmin } from "@/features/accounts/components/users-admin";
import { getMe } from "@/features/auth/api/server";

export const metadata: Metadata = { title: "Contas de usuário" };

const LOGIN = "/entrar?next=%2Fadmin%2Fusuarios";

export default async function UsersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("usuarios.visualizar")) return <NoAccess title="Contas de usuário" />;

  const page = await fetchFirstAccountsPage();
  if (!page) redirect(LOGIN);

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Contas de usuário" />
      <p>Somente dados de identidade: nome, e-mail, situação da conta e papéis.</p>
      <UsersAdmin initialPage={page} currentUserId={me.id} />
    </section>
  );
}
