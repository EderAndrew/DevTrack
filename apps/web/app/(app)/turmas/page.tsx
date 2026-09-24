import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassesList } from "@/features/classes/components/classes-list";

export const metadata: Metadata = { title: "Turmas" };

export default async function ClassesPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fturmas");
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turmas" />;

  return (
    <section className="mx-auto w-full max-w-256 px-4 py-8">
      <h1>Turmas</h1>
      <ClassesList canCreate={me.permissions.includes("turmas.criar")} />
    </section>
  );
}
