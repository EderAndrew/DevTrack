import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "../../../components/shared/no-access";
import type { InvitationView, ManagerView } from "../../../lib/admin-api";
import { serverGet } from "../../../lib/server-api";
import { getMe } from "../../../lib/session";
import { ManagersAdmin } from "./managers-admin";

export const metadata: Metadata = { title: "Gestores de cadastros" };

const LOGIN = "/entrar?next=%2Fadmin%2Fmanagers";

export default async function ManagersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("managers.visualizar")) return <NoAccess title="Gestores de cadastros" />;

  const [managers, invitations] = await Promise.all([
    serverGet<{ items: ManagerView[] }>("/managers"),
    serverGet<{ items: InvitationView[] }>("/manager-invitations"),
  ]);
  if (!managers || !invitations) redirect(LOGIN);

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Gestores de cadastros</h1>
      <ManagersAdmin initialManagers={managers.items} initialInvitations={invitations.items} />
    </section>
  );
}
