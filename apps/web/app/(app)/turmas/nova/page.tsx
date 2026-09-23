import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassForm } from "@/features/classes/components/class-form";

export const metadata: Metadata = { title: "Nova turma" };

export default async function NewClassPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fturmas%2Fnova");
  if (!me.permissions.includes("turmas.criar")) return <NoAccess title="Nova turma" />;

  return (
    <section className="mx-auto max-w-256 px-4 py-8">
      <h1>Nova turma</h1>
      <ClassForm />
    </section>
  );
}
