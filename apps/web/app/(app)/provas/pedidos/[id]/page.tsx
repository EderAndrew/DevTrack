import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExamGenerationRequestDetail } from "@/features/exams/components/exam-generation-request";

export const metadata: Metadata = { title: "Pedido de prova" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamGenerationRequestPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/provas/pedidos/${id}`)}`);
  if (!me.permissions.includes("ia.provas.gerar")) return <NoAccess title="Pedido de prova" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Pedido de prova" breadcrumb={[{ label: "Banco de Provas", href: "/provas" }, { label: "Pedido de prova" }]} />
      <ExamGenerationRequestDetail id={id} />
    </section>
  );
}
