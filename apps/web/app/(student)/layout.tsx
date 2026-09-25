import { StudentLayout } from "@/components/layout/student-layout";
import { getMeForNavigation } from "@/features/auth/api/server";

/** Student screens ("Minhas turmas") in the student layout (005 FR-024, research V13). */
export default async function StudentAreaLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const me = await getMeForNavigation();
  return <StudentLayout me={me}>{children}</StudentLayout>;
}
