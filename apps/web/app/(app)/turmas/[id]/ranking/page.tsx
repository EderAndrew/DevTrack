import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { TeacherClassRanking } from "@/features/ranking/components/teacher-class-ranking";
import { teacherClassRankingHref } from "@/features/ranking/schemas/ranking";

export const metadata: Metadata = { title: "Ranking da turma" };

/** The full ranking of one of the teacher's classes (013/US5); the layout checks `turmas.visualizar`. */
export default async function TeacherClassRankingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(teacherClassRankingHref(id))}`);
  if (!me.permissions.includes("ranking.visualizar")) return <NoAccess title="Ranking" />;
  return <TeacherClassRanking classId={id} />;
}
