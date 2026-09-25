import { UuidSchema } from "@repo/contracts";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NoAccess } from "@/components/shared/no-access";
import { getMe } from "@/features/auth/api/server";
import { SyllabusDocumentDetail } from "@/features/syllabus/components/syllabus-document-detail";

export const metadata: Metadata = { title: "Ementa" };

export default async function SyllabusDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; documentId: string }>;
  searchParams: Promise<{ turma?: string }>;
}) {
  const { id, documentId } = await params;
  const { turma } = await searchParams;
  const me = await getMe();
  if (!me) redirect(`/entrar?next=${encodeURIComponent(`/disciplinas/${id}/ementa/${documentId}`)}`);
  if (!me.permissions.includes("ementas.visualizar")) return <NoAccess title="Ementa" />;

  return (
    <section className="mx-auto w-full max-w-256">
      <SyllabusDocumentDetail
        subjectId={id}
        documentId={documentId}
        classId={UuidSchema.safeParse(turma).success ? turma : undefined}
        canRetry={me.permissions.includes("ementas.enviar")}
        canReview={me.permissions.includes("ementas.revisar")}
      />
    </section>
  );
}
