import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { MyActivities } from "@/features/student-activities/components/my-activities";
import { filtersFromSearch, MY_ACTIVITIES_PATH, subjectFromSearch } from "@/features/student-activities/schemas/student-activity";

export const metadata: Metadata = { title: "Minhas atividades" };

/**
 * "Minhas atividades" (012 US2, 026): the subject and the filters live in the URL (`?materia=&situacao=&tipo=`); a wide
 * page, so each card fits its score panel.
 */
export default async function MyActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ materia?: string; situacao?: string; tipo?: string }>;
}) {
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(MY_ACTIVITIES_PATH)}`);
  if (!me.permissions.includes("atividades.proprias.visualizar")) return <NoAccess title="Minhas atividades" />;
  const search = await searchParams;
  return (
    <section data-layout="wide">
      <MyActivities filters={filtersFromSearch(search)} materia={subjectFromSearch(search)} />
    </section>
  );
}
