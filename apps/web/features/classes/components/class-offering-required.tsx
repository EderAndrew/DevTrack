import Link from "next/link";
import { Notice } from "@/components/shared";

export interface ClassOfferingRequiredProps {
  classId: string;
  /** Offers the link to the class form (UX only; `turmas.editar` and a class that is not archived). */
  canEdit: boolean;
}

/**
 * Shown by Ementa, Calendário and Planejamento while the class is not plannable: it needs a
 * subject and both dates (004/US1-4, research E2).
 */
export function ClassOfferingRequired({ classId, canEdit }: ClassOfferingRequiredProps) {
  return (
    <Notice role="status">
      <p className="mt-0">Informe a disciplina e as datas de início e término da turma para planejar.</p>
      {canEdit ? (
        <p className="mb-0">
          <Link href={`/turmas/${classId}/editar`}>Editar turma</Link>
        </p>
      ) : null}
    </Notice>
  );
}
