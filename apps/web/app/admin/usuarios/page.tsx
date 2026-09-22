import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "../../../components/shared/no-access";
import type { AccountPage } from "../../../lib/admin-api";
import { serverGet } from "../../../lib/server-api";
import { getMe } from "../../../lib/session";
import { UsersAdmin } from "./users-admin";

export const metadata: Metadata = { title: "Contas de usuário" };

const LOGIN = "/entrar?next=%2Fadmin%2Fusuarios";

export default async function UsersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("usuarios.visualizar")) return <NoAccess title="Contas de usuário" />;

  const page = await serverGet<AccountPage>("/users");
  if (!page) redirect(LOGIN);

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Contas de usuário</h1>
      <p>Somente dados de identidade: nome, e-mail, situação da conta e papéis.</p>
      <UsersAdmin initialPage={page} currentUserId={me.id} />
    </section>
  );
}
