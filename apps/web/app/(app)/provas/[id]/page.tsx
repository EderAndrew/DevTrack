import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExamDetail } from "@/features/exams/components/exam-detail";

export const metadata: Metadata = { title: "Prova" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ExamPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/provas/${id}`)}`);
  if (!me.permissions.includes("provas.visualizar")) return <NoAccess title="Prova" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader title="Prova" breadcrumb={[{ label: "Banco de Provas", href: "/provas" }, { label: "Prova" }]} />
      <ExamDetail
        examId={id}
        canEdit={me.permissions.includes("provas.editar")}
        canApprove={me.permissions.includes("provas.aprovar")}
        canArchive={me.permissions.includes("provas.arquivar")}
      />
    </section>
  );
}
