import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { ClassSyllabusSection } from "@/features/classes/components/class-sections";

export const metadata: Metadata = { title: "Ementa da turma" };

export default async function ClassSyllabusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/turmas/${id}/ementa`)}`);
  if (!me.permissions.includes("planejamento.visualizar")) return <NoAccess title="Ementa" />;
  return (
    <ClassSyllabusSection
      classId={id}
      canEditClass={me.permissions.includes("turmas.editar")}
      canUpload={me.permissions.includes("ementas.enviar")}
      canSelect={me.permissions.includes("planejamento.editar")}
    />
  );
}
