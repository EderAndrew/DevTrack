import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { AiOperationsPage } from "@/features/ai-operations/components/ai-operations-page";
import { aiOperationsTabOf } from "@/features/ai-operations/components/ai-operations-tabs";
import { AI_OPERATIONS_AREA } from "@/lib/navigation";

export const metadata: Metadata = { title: AI_OPERATIONS_AREA.label };

const LOGIN = "/entrar?next=%2Fadmin%2Fia";

export default async function AiOperationsRoute({ searchParams }: { searchParams: Promise<{ aba?: string | string[] }> }) {
  const me = await getMe();
  if (!me) redirect(LOGIN);
  if (!me.permissions.includes(AI_OPERATIONS_AREA.permission)) return <NoAccess title={AI_OPERATIONS_AREA.label} />;

  return (
    <section data-layout="wide" className="w-full">
      <PageHeader title={AI_OPERATIONS_AREA.label} description="Saúde, uso e custo dos agentes de IA. Nenhum conteúdo de professores aparece aqui." />
      <AiOperationsPage canManage={me.permissions.includes("ia.agentes.gerenciar")} initialTab={aiOperationsTabOf((await searchParams).aba)} />
    </section>
  );
}
