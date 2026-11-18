import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { CohortList } from "@/features/cohorts/components/cohort-list";

export const metadata: Metadata = { title: "Turmas" };

/** The MANAGER's turmas (027 US1, contracts/ui.md). */
export default async function CohortsPage() {
  const me = await getMe();
  if (!me) redirect("/entrar?next=%2Fgestao%2Fturmas");
  if (!me.permissions.includes("turmas.visualizar")) return <NoAccess title="Turmas" />;

  return (
    <section data-layout="wide" className="w-full">
      <PageHeader title="Turmas" />
      <CohortList canCreate={me.permissions.includes("turmas.criar")} />
    </section>
  );
}
