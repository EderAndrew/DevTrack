import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { fetchManagersPage } from "@/features/managers/api/server";
import { ManagersAdmin } from "@/features/managers/components/managers-admin";

export const metadata: Metadata = { title: "Gestores de cadastros" };

const LOGIN = "/entrar?next=%2Fadmin%2Fmanagers";

export default async function ManagersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("managers.visualizar")) return <NoAccess title="Gestores de cadastros" />;

  const initial = await fetchManagersPage();
  if (!initial) redirect(LOGIN);

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Gestores de cadastros</h1>
      <ManagersAdmin initialManagers={initial.managers} initialInvitations={initial.invitations} />
    </section>
  );
}
