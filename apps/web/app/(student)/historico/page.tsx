import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { StudentHistory } from "@/features/student-activities/components/student-history";
import { HISTORY_DESCRIPTION, historyFromSearch } from "@/features/student-activities/schemas/student-history";
import { HISTORY_PATH } from "@/lib/navigation";

export const metadata: Metadata = { title: "Histórico" };

/**
 * "Histórico" (012 US6, 028): the student's deliveries with their totals, grade and feedback once released; the tab, the
 * search and the subject live in the address (`?aba=&busca=&materia=`).
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ aba?: string | string[]; busca?: string | string[]; materia?: string | string[] }> }) {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(HISTORY_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Histórico" />;
  const filters = historyFromSearch(await searchParams);
  return (
    // Wider than the student area's 960 px: the table has seven columns (lifts the cap, then 1280 px).
    <section data-layout="wide" className="mx-auto w-full max-w-320">
      <PageHeader title="Histórico" description={HISTORY_DESCRIPTION} />
      <StudentHistory filters={filters} />
    </section>
  );
}
