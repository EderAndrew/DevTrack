import type { Metadata } from "next";
import { UuidSchema } from "@repo/contracts";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { AddClass } from "@/features/classes/components/add-class";

const TITLE = "Acrescentar disciplina a uma turma";

export const metadata: Metadata = { title: TITLE };

/** 027/US3: the teacher finds a MANAGER's turma and adds one of their subjects to it. */
export default async function NewClassPage({ searchParams }: { searchParams: Promise<{ disciplina?: string }> }) {
  const { disciplina } = await searchParams;
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fturmas%2Fnova");
  if (!me.permissions.includes("disciplinas_turma.criar")) return <NoAccess title={TITLE} />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title={TITLE} breadcrumb={[{ label: "Turmas", href: "/turmas" }, { label: TITLE }]} />
      {/* "Acrescentar a uma turma" of a subject page (004/US1-7) arrives with the subject chosen. */}
      <AddClass defaultSubjectId={UuidSchema.safeParse(disciplina).success ? disciplina : undefined} />
    </section>
  );
}
