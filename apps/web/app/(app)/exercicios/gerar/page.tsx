import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { GenerationForm } from "@/features/exercises/components/generation-form";

export const metadata: Metadata = { title: "Criar com IA" };

export default async function GenerateExercisesPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fexercicios%2Fgerar");
  if (!me.permissions.includes("ia.exercicios.gerar")) return <NoAccess title="Criar com IA" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Criar com IA"
        breadcrumb={[{ label: "Banco de Exercícios", href: "/exercicios" }, { label: "Criar com IA" }]}
        description="A IA prepara rascunhos a partir de um tópico da ementa; você revisa e aprova cada um."
      />
      <GenerationForm />
    </section>
  );
}
