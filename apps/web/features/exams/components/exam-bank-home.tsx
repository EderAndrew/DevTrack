import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { ExamBankList } from "./exam-bank-list";

export interface ExamBankHomeProps {
  canCreate: boolean;
  /** An exam was just saved (`?criada=1`). */
  created: boolean;
}

/** "Banco de Provas" (018/US1): the manual creation and the teacher's exams with their filters. */
export function ExamBankHome({ canCreate, created }: ExamBankHomeProps) {
  const actions = canCreate ? (
    <Button asChild>
      <Link href="/provas/nova">Criar prova manualmente</Link>
    </Button>
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
