import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { BatchReview } from "@/features/exercises/components/batch-review";

export const metadata: Metadata = { title: "Revisar lote" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExerciseBatchPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/exercicios/lotes/${id}`)}`);
  if (!me.permissions.includes("questoes.visualizar")) return <NoAccess title="Revisar lote" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Revisar lote"
        breadcrumb={[
          { label: "Banco de Exercícios", href: "/exercicios" },
          { label: "Lotes gerados com IA", href: "/exercicios/lotes" },
          { label: "Revisar lote" },
        ]}
      />
      <BatchReview batchId={id} />
    </section>
  );
}
