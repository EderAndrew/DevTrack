import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { StudentHistory } from "@/features/student-activities/components/student-history";
import { HISTORY_DESCRIPTION, historyFromSearch } from "@/features/student-activities/schemas/student-history";
import { HISTORY_PATH } from "@/lib/navigation";

export const metadata: Metadata = { title: "Histórico" };

/** "Histórico" (012 US6, 028): the student's deliveries with their totals, grade and feedback once released; the tab lives in the address (`?aba=`). */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ aba?: string }> }) {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(HISTORY_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Histórico" />;
  const filters = historyFromSearch(await searchParams);
  return (
    <section>
      <PageHeader title="Histórico" description={HISTORY_DESCRIPTION} />
      <StudentHistory filters={filters} />
    </section>
  );
}
