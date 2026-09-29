import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExerciseForm } from "@/features/exercises/components/exercise-form";

export const metadata: Metadata = { title: "Criar exercícios" };

export default async function NewExerciseSetPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fexercicios%2Fnovo");
  if (!me.permissions.includes("questoes.criar")) return <NoAccess title="Criar exercícios" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Criar exercícios" breadcrumb={[{ label: "Banco de Exercícios", href: "/exercicios" }, { label: "Criar exercícios" }]} />
      <ExerciseForm mode="set" />
    </section>
  );
}
