import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { ExamBankList } from "./exam-bank-list";

export interface ExamBankHomeProps {
  canCreate: boolean;
  /** "Criar prova com IA" (`ia.provas.gerar`, 018/US7). */
  canGenerate?: boolean;
  /** An exam was just saved (`?criada=1`). */
  created: boolean;
}

/** "Banco de Provas" (018/US1): the manual creation, "Criar prova com IA" (US7) and the teacher's exams with their filters. */
export function ExamBankHome({ canCreate, canGenerate = false, created }: ExamBankHomeProps) {
  const actions =
    canCreate || canGenerate ? (
      <div className="flex flex-wrap gap-2">
        {canGenerate ? (
          <Button asChild variant={canCreate ? "secondary" : "primary"}>
            <Link href="/provas/gerar">Criar prova com IA</Link>
          </Button>
        ) : null}
        {canCreate ? (
          <Button asChild>
            <Link href="/provas/nova">Criar prova manualmente</Link>
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <PageHeader title="Banco de Provas" actions={actions} />
      {created ? (
        <Notice role="status">
          <p className="m-0">Prova salva.</p>
        </Notice>
      ) : null}
      <p className="mt-0 text-text-secondary">
        Provas de 1 a 20 questões, com gabarito, dificuldade e tópicos das suas ementas, separadas dos bancos de exercícios e de trabalhos.
      </p>
      <ExamBankList />
    </>
  );
}
