import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { WorkBankHome } from "@/features/works/components/work-bank-home";

export const metadata: Metadata = { title: "Banco de Trabalhos" };

interface Props {
  searchParams: Promise<{ criado?: string }>;
}

export default async function WorkBankPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Ftrabalhos");
  if (!me.permissions.includes("trabalhos.visualizar"))
    return <NoAccess title="Banco de Trabalhos" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <WorkBankHome
        canCreate={me.permissions.includes("trabalhos.criar")}
        canGenerate={me.permissions.includes("ia.trabalhos.gerar")}
        created={(await searchParams).criado === "1"}
      />
    </section>
  );
}
