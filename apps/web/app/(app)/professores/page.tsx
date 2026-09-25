import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { fetchTeachers } from "@/features/teachers/api/server";
import { TeachersAdmin } from "@/features/teachers/components/teachers-admin";

export const metadata: Metadata = { title: "Professores" };

const LOGIN = "/entrar?next=%2Fprofessores";

export default async function TeachersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("professores.visualizar")) return <NoAccess title="Professores" />;

  const teachers = await fetchTeachers();
  if (!teachers) redirect(LOGIN);

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Professores" />
      <TeachersAdmin initialTeachers={teachers} />
    </section>
  );
}
