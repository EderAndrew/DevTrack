import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { SubjectsList } from "@/features/subjects/components/subjects-list";

export const metadata: Metadata = { title: "Minhas disciplinas" };

export default async function SubjectsPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fdisciplinas");
  if (!me.permissions.includes("disciplinas.visualizar")) return <NoAccess title="Minhas disciplinas" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Minhas disciplinas" />
      <SubjectsList canCreate={me.permissions.includes("disciplinas.criar")} />
    </section>
  );
}
