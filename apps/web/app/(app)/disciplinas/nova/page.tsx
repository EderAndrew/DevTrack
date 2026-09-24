import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { SubjectForm } from "@/features/subjects/components/subject-form";

export const metadata: Metadata = { title: "Nova disciplina" };

export default async function NewSubjectPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fdisciplinas%2Fnova");
  if (!me.permissions.includes("disciplinas.criar")) return <NoAccess title="Nova disciplina" />;

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Nova disciplina</h1>
      <SubjectForm />
    </section>
  );
}
