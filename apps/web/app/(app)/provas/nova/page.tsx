import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExamForm } from "@/features/exams/components/exam-form";

export const metadata: Metadata = { title: "Criar prova" };

export default async function NewExamPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fprovas%2Fnova");
  if (!me.permissions.includes("provas.criar")) return <NoAccess title="Criar prova" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Criar prova" breadcrumb={[{ label: "Banco de Provas", href: "/provas" }, { label: "Criar prova" }]} />
      <ExamForm />
    </section>
  );
}
