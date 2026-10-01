import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkGenerationRequestsList } from "@/features/works/components/work-generation-requests";

export const metadata: Metadata = { title: "Pedidos de geração" };

export default async function WorkGenerationRequestsPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Ftrabalhos%2Fpedidos");
  if (!me.permissions.includes("trabalhos.visualizar"))
    return <NoAccess title="Pedidos de geração" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Pedidos de geração"
        breadcrumb={[
          { label: "Banco de Trabalhos", href: "/trabalhos" },
          { label: "Pedidos de geração" },
        ]}
      />
      <WorkGenerationRequestsList />
    </section>
  );
}
