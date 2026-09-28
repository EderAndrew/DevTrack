import { ListChecks } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export interface ExerciseBankHomeProps {
  canCreate: boolean;
  /** How many exercises were just saved (`?criados=N`); 0 for none. */
  created: number;
}

/**
 * "Banco de Exercícios": the creation actions (010/US1). The list with filters and search
 * arrives with 010/US5.
 */
export function ExerciseBankHome({ canCreate, created }: ExerciseBankHomeProps) {
  const actions = canCreate ? (
    <>
      <Button asChild>
        <Link href="/exercicios/novo">Criar manualmente</Link>
      </Button>
      <Button asChild variant="secondary">
        <Link href="/exercicios/novo/avulso">Novo exercício</Link>
      </Button>
    </>
  ) : null;

  return (
    <>
      <PageHeader title="Banco de Exercícios" actions={actions} />
      {created > 0 ? (
        <Notice role="status">
          <p className="m-0">{created === 1 ? "1 exercício salvo." : `${created} exercícios salvos.`}</p>
        </Notice>
      ) : null}
      <EmptyState
        icon={ListChecks}
        title="A consulta do banco chega em breve"
        description="Os exercícios que você salvar ficam guardados no seu banco, visíveis só para você."
      />
    </>
  );
}
