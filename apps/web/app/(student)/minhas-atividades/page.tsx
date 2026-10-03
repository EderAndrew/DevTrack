import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { MyActivities } from "@/features/student-activities/components/my-activities";
import { filtersFromSearch, MY_ACTIVITIES_PATH } from "@/features/student-activities/schemas/student-activity";

export const metadata: Metadata = { title: "Minhas atividades" };

/** "Minhas atividades" (012 US2): the filters live in the URL (`?situacao=&tipo=`). */
export default async function MyActivitiesPage({ searchParams }: { searchParams: Promise<{ situacao?: string; tipo?: string }> }) {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(MY_ACTIVITIES_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Minhas atividades" />;
  const filters = filtersFromSearch(await searchParams);
  return (
    <section>
      <PageHeader title="Minhas atividades" />
      <MyActivities filters={filters} />
    </section>
  );
}
