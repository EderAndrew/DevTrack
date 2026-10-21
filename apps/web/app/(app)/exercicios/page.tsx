import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExerciseBankHome } from "@/features/exercises/components/exercise-bank-home";

export const metadata: Metadata = { title: "Banco de Exercícios" };

interface Props {
  searchParams: Promise<{ criados?: string }>;
}

export default async function ExerciseBankPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fexercicios");
  if (!me.permissions.includes("questoes.visualizar")) return <NoAccess title="Banco de Exercícios" />;
  const created = Number((await searchParams).criados);

  return (
    <section className="w-full">
      <ExerciseBankHome
        canCreate={me.permissions.includes("questoes.criar")}
        canGenerate={me.permissions.includes("ia.exercicios.gerar")} created={Number.isInteger(created) && created > 0 ? created : 0} />
    </section>
  );
}
