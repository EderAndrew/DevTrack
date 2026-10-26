import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassesList } from "@/features/classes/components/classes-list";

export const metadata: Metadata = { title: "Turmas" };

export default async function ClassesPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fturmas");
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turmas" />;

  return (
    <section data-layout="wide" className="w-full">
      <PageHeader title="Turmas" />
      <ClassesList canCreate={me.permissions.includes("turmas.criar")} />
    </section>
  );
}
