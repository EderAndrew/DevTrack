import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";

export interface WorkBankHomeProps {
  canCreate: boolean;
  /** `ia.trabalhos.gerar`: "Criar trabalho com IA" (US3). */
  canGenerate: boolean;
  /** A work was just saved (`?criado=1`). */
  created: boolean;
}

/**
 * "Banco de Trabalhos": the creation actions, manual (011/US1) and with AI, and the generation
 * requests (US3). The list and its filters come with US7.
 */
export function WorkBankHome({ canCreate, canGenerate, created }: WorkBankHomeProps) {
  const actions = (
    <div className="flex flex-wrap gap-2">
      {canCreate ? (
        <Button asChild>
          <Link href="/trabalhos/novo">Criar trabalho manualmente</Link>
        </Button>
      ) : null}
      {canGenerate ? (
        <Button asChild variant="secondary">
          <Link href="/trabalhos/gerar">Criar trabalho com IA</Link>
        </Button>
      ) : null}
      <Button asChild variant="ghost">
        <Link href="/trabalhos/pedidos">Pedidos de geração</Link>
      </Button>
    </div>
  );

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
