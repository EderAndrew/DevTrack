import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkForm } from "@/features/works/components/work-form";

export const metadata: Metadata = { title: "Criar trabalho" };

export default async function NewWorkPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Ftrabalhos%2Fnovo");
  if (!me.permissions.includes("trabalhos.criar"))
    return <NoAccess title="Criar trabalho" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <PageHeader
        title="Criar trabalho"
        breadcrumb={[
          { label: "Banco de Trabalhos", href: "/trabalhos" },
          { label: "Criar trabalho" },
        ]}
      />
      <WorkForm />
    </section>
  );
}
