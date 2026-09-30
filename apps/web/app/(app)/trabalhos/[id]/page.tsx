import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkDetail } from "@/features/works/components/work-detail";

export const metadata: Metadata = { title: "Trabalho" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WorkPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/trabalhos/${id}`)}`);
  if (!me.permissions.includes("trabalhos.visualizar"))
    return <NoAccess title="Trabalho" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Trabalho"
        breadcrumb={[
          { label: "Banco de Trabalhos", href: "/trabalhos" },
          { label: "Trabalho" },
        ]}
      />
      <WorkDetail
        workId={id}
        canEdit={me.permissions.includes("trabalhos.editar")}
        canApprove={me.permissions.includes("trabalhos.aprovar")}
      />
    </section>
  );
}
