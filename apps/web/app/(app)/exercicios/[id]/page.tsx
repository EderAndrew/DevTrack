import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExerciseDetail } from "@/features/exercises/components/exercise-detail";

export const metadata: Metadata = { title: "Exercício" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExercisePage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/exercicios/${id}`)}`);
  if (!me.permissions.includes("questoes.visualizar")) return <NoAccess title="Exercício" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Exercício" breadcrumb={[{ label: "Banco de Exercícios", href: "/exercicios" }, { label: "Exercício" }]} />
      <ExerciseDetail exerciseId={id} canEdit={me.permissions.includes("questoes.editar")} />
    </section>
  );
}
