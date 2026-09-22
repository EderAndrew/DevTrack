import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "../../components/shared/no-access";
import type { TeacherListItem } from "../../lib/admin-api";
import { serverGet } from "../../lib/server-api";
import { getMe } from "../../lib/session";
import { TeachersAdmin } from "./teachers-admin";

export const metadata: Metadata = { title: "Professores" };

const LOGIN = "/entrar?next=%2Fprofessores";

export default async function TeachersPage() {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes("professores.visualizar")) return <NoAccess title="Professores" />;

  const teachers = await serverGet<{ items: TeacherListItem[] }>("/teachers");
  if (!teachers) redirect(LOGIN);

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Professores</h1>
      <TeachersAdmin initialTeachers={teachers.items} />
    </section>
  );
}
