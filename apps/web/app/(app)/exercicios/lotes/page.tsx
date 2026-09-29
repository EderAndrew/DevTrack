import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExerciseBatchesList } from "@/features/exercises/components/exercise-batches-list";

export const metadata: Metadata = { title: "Lotes gerados com IA" };

interface Props {
  searchParams: Promise<{ pedido?: string }>;
}

export default async function ExerciseBatchesPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fexercicios%2Flotes");
  if (!me.permissions.includes("questoes.visualizar")) return <NoAccess title="Lotes gerados com IA" />;
  const { pedido } = await searchParams;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Lotes gerados com IA" breadcrumb={[{ label: "Banco de Exercícios", href: "/exercicios" }, { label: "Lotes gerados com IA" }]} />
      <ExerciseBatchesList requested={pedido === "1"} />
    </section>
  );
}
