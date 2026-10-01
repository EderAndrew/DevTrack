import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkGenerationForm } from "@/features/works/components/work-generation-form";

export const metadata: Metadata = { title: "Criar trabalho com IA" };

export default async function GenerateWorkPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Ftrabalhos%2Fgerar");
  if (!me.permissions.includes("ia.trabalhos.gerar"))
    return <NoAccess title="Criar trabalho com IA" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Criar trabalho com IA"
        breadcrumb={[
          { label: "Banco de Trabalhos", href: "/trabalhos" },
          { label: "Criar trabalho com IA" },
        ]}
      />
      <WorkGenerationForm />
    </section>
  );
}
