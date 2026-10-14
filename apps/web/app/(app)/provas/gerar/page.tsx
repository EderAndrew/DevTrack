import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExamGenerationForm } from "@/features/exams/components/exam-generation-form";

export const metadata: Metadata = { title: "Criar prova com IA" };

export default async function GenerateExamPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fprovas%2Fgerar");
  if (!me.permissions.includes("ia.provas.gerar")) return <NoAccess title="Criar prova com IA" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Criar prova com IA" breadcrumb={[{ label: "Banco de Provas", href: "/provas" }, { label: "Criar prova com IA" }]} />
      <ExamGenerationForm />
    </section>
  );
}
