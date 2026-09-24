import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { SubjectDetail } from "@/features/subjects/components/subject-detail";

export const metadata: Metadata = { title: "Disciplina" };

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string }>;
}) {
  const { id } = await params;
  const { criada } = await searchParams;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/disciplinas/${id}`)}`);
  if (!me.permissions.includes("disciplinas.visualizar")) return <NoAccess title="Disciplina" />;

  return (
    <section className="mx-auto w-full max-w-256 px-4 py-8">
      <SubjectDetail
        id={id}
        created={criada === "1"}
        canEdit={me.permissions.includes("disciplinas.editar")}
        canCreateClass={me.permissions.includes("turmas.criar")}
        canLinkClass={me.permissions.includes("turmas.editar")}
        canViewSyllabus={me.permissions.includes("ementas.visualizar")}
        canUploadSyllabus={me.permissions.includes("ementas.enviar")}
      />
    </section>
  );
}
