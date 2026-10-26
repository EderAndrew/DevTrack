import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ExamBankHome } from "@/features/exams/components/exam-bank-home";

export const metadata: Metadata = { title: "Banco de Provas" };

interface Props {
  searchParams: Promise<{ criada?: string }>;
}

export default async function ExamBankPage({ searchParams }: Props) {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fprovas");
  if (!me.permissions.includes("provas.visualizar")) return <NoAccess title="Banco de Provas" />;

  return (
    <section data-layout="wide" className="w-full">
      <ExamBankHome
        canCreate={me.permissions.includes("provas.criar")}
        canGenerate={me.permissions.includes("ia.provas.gerar")}
        created={(await searchParams).criada === "1"}
      />
    </section>
  );
}
