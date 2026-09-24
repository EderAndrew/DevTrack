import type { Metadata } from "next";
import { UuidSchema } from "@repo/contracts";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassForm } from "@/features/classes/components/class-form";

export const metadata: Metadata = { title: "Nova turma" };

export default async function NewClassPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina } = await searchParams;
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fturmas%2Fnova");
  if (!me.permissions.includes("turmas.criar")) return <NoAccess title="Nova turma" />;

  return (
    <section className="mx-auto w-full max-w-256 px-4 py-8">
      <h1>Nova turma</h1>
      {/* "Nova turma" of a subject page (004/US1-3) arrives with the subject chosen. */}
      <ClassForm defaultSubjectId={UuidSchema.safeParse(disciplina).success ? disciplina : undefined} />
    </section>
  );
}
