"use client";

import { type ExerciseBatchStatus, type ExerciseBatchView, ExerciseTypeSchema } from "@repo/contracts";
import { Sparkles } from "lucide-react";
import Link from "next/link";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Status, type StatusVariant } from "@/components/ui/status";
import { messageForError } from "@/lib/messages/error-messages";
import { useExerciseBatches } from "../hooks/use-exercises";
import {
  DIFFICULTY_LABELS,
  EXERCISE_TYPE_LABELS,
} from "../schemas/exercise-form";

const STATUS: Record<
  ExerciseBatchStatus,
  { label: string; variant: StatusVariant }
> = {
  PENDING: { label: "Gerando", variant: "info" },
  GENERATED: { label: "Gerado", variant: "success" },
  FAILED: { label: "Falhou", variant: "danger" },
  CANCELLED: { label: "Cancelado", variant: "neutral" },
};

const countsText = (batch: ExerciseBatchView) =>
  ExerciseTypeSchema.options
    .filter((type) => batch.counts[type] > 0)
    .map((type) => `${EXERCISE_TYPE_LABELS[type]} ${batch.counts[type]}`)
    .join(" · ");

/**
 * The teacher's generation batches (010 contracts/web-ui.md, `/exercicios/lotes`), newest first,
 * with their status in words (never by color alone) and refreshed while one is still generating.
 */
export function ExerciseBatchesList({ requested }: { requested: boolean }) {
  const batches = useExerciseBatches();
  const items = batches.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <>
      {requested ? (
        <Notice role="status">
          <p className="m-0">
            Pedido enviado. Os exercícios aparecem aqui, em rascunho, quando a
            geração terminar.
          </p>
        </Notice>
      ) : null}
      {batches.isError ? (
        <p role="alert">{messageForError(batches.error)}</p>
      ) : null}
      {batches.isSuccess && items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nenhum lote gerado"
          description="Os exercícios que você pedir à IA aparecem aqui para revisão."
          action={
            <Button asChild>
              <Link href="/exercicios/gerar">Criar com IA</Link>
            </Button>
          }
        />
      ) : null}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((batch) => (
          <li
            key={batch.id}
            className="flex flex-col gap-1 rounded-md border border-border p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="m-0 text-h3">
                <Link href={`/exercicios/lotes/${batch.id}`}>{batch.topic.itemText}</Link>
              </h2>
              <Status variant={STATUS[batch.status].variant}>
                {STATUS[batch.status].label}
                {batch.status === "GENERATED" && batch.pendingReview > 0
                  ? ` — ${batch.pendingReview} para revisar`
                  : ""}
              </Status>
            </div>
            <p className="m-0 text-text-secondary">
              {batch.topic.subjectName} · {DIFFICULTY_LABELS[batch.difficulty]}{" "}
              · {batch.total} exercícios ({countsText(batch)})
              {batch.trickQuestions > 0
                ? ` · ${batch.trickQuestions} pegadinha${batch.trickQuestions > 1 ? "s" : ""}`
                : ""}
              {batch.language ? ` · ${batch.language.name}` : ""}
            </p>
          </li>
        ))}
      </ul>
      {batches.hasNextPage ? (
        <div className="mt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void batches.fetchNextPage()}
            aria-busy={batches.isFetchingNextPage || undefined}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </>
  );
}
