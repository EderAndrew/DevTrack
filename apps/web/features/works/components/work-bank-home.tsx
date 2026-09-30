import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";

export interface WorkBankHomeProps {
  canCreate: boolean;
  /** A work was just saved (`?criado=1`). */
  created: boolean;
}

/**
 * "Banco de Trabalhos": the creation action (011/US1). The list, its filters and the AI requests
 * come with their stories (US7, US3).
 */
export function WorkBankHome({ canCreate, created }: WorkBankHomeProps) {
  const actions = canCreate ? (
    <Button asChild>
      <Link href="/trabalhos/novo">Criar trabalho manualmente</Link>
    </Button>
  ) : null;

  return (
    <>
      <PageHeader title="Banco de Trabalhos" actions={actions} />
      {created ? (
        <Notice role="status">
          <p className="m-0">Trabalho salvo.</p>
        </Notice>
      ) : null}
      <p className="mt-0 text-text-secondary">
        Trabalhos de 1 a 10 questões, com gabarito, ligados aos tópicos das suas
        ementas.
      </p>
    </>
  );
}
