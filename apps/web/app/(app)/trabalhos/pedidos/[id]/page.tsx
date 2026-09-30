import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkGenerationRequestDetail } from "@/features/works/components/work-generation-requests";

export const metadata: Metadata = { title: "Pedido de geração" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function WorkGenerationRequestPage({ params }: Props) {
  const { id } = await params;
  const me = await getMe();
  if (!me)
    redirect(`/entrar?next=${encodeURIComponent(`/trabalhos/pedidos/${id}`)}`);
  if (!me.permissions.includes("trabalhos.visualizar"))
    return <NoAccess title="Pedido de geração" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Pedido de geração"
        breadcrumb={[
          { label: "Banco de Trabalhos", href: "/trabalhos" },
          { label: "Pedidos de geração", href: "/trabalhos/pedidos" },
          { label: "Pedido de geração" },
        ]}
      />
      <WorkGenerationRequestDetail id={id} />
    </section>
  );
}
