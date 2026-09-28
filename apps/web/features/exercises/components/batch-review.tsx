"use client";

import { type ExerciseBatchStatus, type ExerciseBatchView, type ExerciseTeacherView, ExerciseTypeSchema, type ExerciseStatus } from "@repo/contracts";
import { AlertTriangle, Pencil, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import { Notice } from "@/components/shared/notice";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Status, type StatusVariant } from "@/components/ui/status";
import { messageForError } from "@/lib/messages/error-messages";
import { useBatchReview, useExerciseBatch, useRequestExerciseBatch } from "../hooks/use-exercises";
import { COGNITIVE_OBJECTIVE_LABELS, DIFFICULTY_LABELS, EXERCISE_TYPE_LABELS } from "../schemas/exercise-form";
import { DraftEditor } from "./draft-editor";

const BATCH_STATUS: Record<ExerciseBatchStatus, { label: string; variant: StatusVariant }> = {
  PENDING: { label: "Gerando", variant: "info" },
  GENERATED: { label: "Gerado", variant: "success" },
  FAILED: { label: "Falhou", variant: "danger" },
  CANCELLED: { label: "Cancelado", variant: "neutral" },
};

const EXERCISE_STATUS: Record<ExerciseStatus, { label: string; variant: StatusVariant }> = {
  DRAFT: { label: "Rascunho", variant: "warning" },
  APPROVED: { label: "Aprovado", variant: "success" },
  ARCHIVED: { label: "Arquivado", variant: "neutral" },
};

/** The same request again, linked to this batch (US4-6): the counts it had, a new key. */
function regenerateBody(batch: ExerciseBatchView) {
  const types = ExerciseTypeSchema.options.filter((type) => batch.counts[type] > 0);
  return {
    syllabusRevisionId: batch.topic.syllabusRevisionId,
    syllabusItemId: batch.topic.syllabusItemId,
    difficulty: batch.difficulty,
    total: batch.total,
    types,
    distribution:
      batch.distribution === "AUTO"
        ? ({ mode: "AUTO" } as const)
        : ({ mode: "MANUAL", counts: Object.fromEntries(types.map((type) => [type, batch.counts[type]])) } as const),
    trickQuestions: batch.trickQuestions,
    idempotencyKey: crypto.randomUUID(),
    regeneratedFromId: batch.id,
  };
}

/**
 * The review of a generated batch (010 contracts/web-ui.md, `/exercicios/lotes/[id]`, US4): its
 * status (looked at again while generating), each draft editable inline, "Excluir" with
 * confirmation, "Aprovar" one or the selected ones, and "Gerar de novo". Badges say "Gerado por
 * IA", "Editado por você" and "Pegadinha" in words, with an icon. The AI never approves anything:
 * every approval here is the teacher's.
 */
export function BatchReview({ batchId }: { batchId: string }) {
  const router = useRouter();
  const query = useExerciseBatch(batchId);
  const review = useBatchReview(batchId);
  const regenerate = useRequestExerciseBatch();
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p role="status">Carregando o lote…</p>;
  const { batch, exercises } = query.data;
  const drafts = exercises.filter((exercise) => exercise.status === "DRAFT");
  const selectedDrafts = drafts.filter((exercise) => selected.has(exercise.id));

  const run = async (action: () => Promise<unknown>, done: string) => {
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(done);
    } catch (caught) {
      setError(messageForError(caught));
    }
  };
  const toggle = (id: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const onRegenerate = () =>
    void run(async () => {
      const created = await regenerate.mutateAsync(regenerateBody(batch));
      router.push(`/exercicios/lotes/${created.id}`);
    }, "Novo lote pedido.");

  return (
    <>
      <div className="mb-6 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="m-0 text-h3">{batch.topic.itemText}</h2>
          <Status variant={BATCH_STATUS[batch.status].variant}>{BATCH_STATUS[batch.status].label}</Status>
        </div>
        <p className="m-0 text-text-secondary">
          {batch.topic.subjectName} · {DIFFICULTY_LABELS[batch.difficulty]} · {batch.total} exercícios
          {batch.language ? ` · ${batch.language.name}` : ""}
        </p>
        {batch.status === "GENERATED" ? (
          <p className="m-0">
            {batch.pendingReview} para revisar · {batch.approved} aprovado{batch.approved === 1 ? "" : "s"} · {batch.discarded} excluído
            {batch.discarded === 1 ? "" : "s"}
          </p>
        ) : null}
      </div>

      {batch.status === "PENDING" ? (
        <Notice role="status">
          <p className="m-0">A IA está gerando os exercícios. Esta página se atualiza sozinha.</p>
        </Notice>
      ) : null}
      {batch.status === "FAILED" || batch.status === "CANCELLED" ? (
        <Notice role="alert">
          <p className="m-0">
            {batch.status === "FAILED" ? "A geração falhou e nenhum exercício foi criado." : "A geração foi cancelada."} Você pode pedir de novo.
          </p>
        </Notice>
      ) : null}
      {error ? (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      ) : null}
      <p role="status" className={notice ? "m-0 mb-4" : "sr-only"}>
        {notice ?? ""}
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {drafts.length > 0 ? (
          <Button
            type="button"
            disabled={selectedDrafts.length === 0 || review.approveMany.isPending}
            onClick={() =>
              void run(async () => {
                await review.approveMany.mutateAsync(selectedDrafts.map((exercise) => exercise.id));
                setSelected(new Set());
              }, `${selectedDrafts.length} exercício${selectedDrafts.length === 1 ? "" : "s"} aprovado${selectedDrafts.length === 1 ? "" : "s"}.`)
            }
          >
            Aprovar selecionados ({selectedDrafts.length})
          </Button>
        ) : null}
        {batch.status !== "PENDING" ? (
          <Button type="button" variant="secondary" onClick={onRegenerate} aria-busy={regenerate.isPending || undefined}>
            <RefreshCw aria-hidden="true" />
            Gerar de novo
          </Button>
        ) : null}
      </div>

      <ol className="m-0 flex list-none flex-col gap-6 p-0">
        {exercises.map((exercise, index) => {
          const n = index + 1;
          const draft = exercise.status === "DRAFT";
          const headingId = `rascunho-${n}-titulo`;
          return (
            <li key={exercise.id}>
              <Card role="group" aria-labelledby={headingId}>
                <CardHeader className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id={headingId} className="m-0 text-h3">
                      Exercício {n} — {EXERCISE_TYPE_LABELS[exercise.type]}
                    </h3>
                    <Status variant={EXERCISE_STATUS[exercise.status].variant}>{EXERCISE_STATUS[exercise.status].label}</Status>
                  </div>
                  <ExerciseBadges exercise={exercise} />
                </CardHeader>
                <CardContent>
                  {editing === exercise.id ? (
                    <DraftEditor
                      exercise={exercise}
                      n={n}
                      onCancel={() => setEditing(null)}
                      onSave={async (body) => {
                        await review.update.mutateAsync({ id: exercise.id, body });
                        setEditing(null);
                        setNotice(`Exercício ${n} salvo.`);
                      }}
                    />
                  ) : (
                    <ExerciseContent exercise={exercise} />
                  )}
                  {draft && editing !== exercise.id ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <div className="flex min-h-11 items-center gap-2">
                        <Checkbox
                          id={`rascunho-${n}-selecionar`}
                          checked={selected.has(exercise.id)}
                          onChange={(event) => toggle(exercise.id, event.target.checked)}
                        />
                        <Label htmlFor={`rascunho-${n}-selecionar`}>
                          Selecionar <span className="sr-only">exercício {n}</span>
                        </Label>
                      </div>
                      <Button type="button" variant="secondary" onClick={() => setEditing(exercise.id)}>
                        <Pencil aria-hidden="true" />
                        Editar <span className="sr-only">exercício {n}</span>
                      </Button>
                      <Button
                        type="button"
                        onClick={() =>
                          void run(() => review.approve.mutateAsync({ id: exercise.id, version: exercise.version }), `Exercício ${n} aprovado.`)
                        }
                      >
                        Aprovar <span className="sr-only">exercício {n}</span>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button type="button" variant="danger">
                            <Trash2 aria-hidden="true" />
                            Excluir <span className="sr-only">exercício {n}</span>
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir o exercício {n}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              O rascunho sai do lote e não poderá ser aprovado. O lote registra que ele foi descartado.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              variant="danger"
                              onClick={() =>
                                void run(() => review.remove.mutateAsync({ id: exercise.id, version: exercise.version }), `Exercício ${n} excluído.`)
                              }
                            >
                              Excluir exercício
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** "Gerado por IA", "Editado por você" and "Pegadinha": words and an icon, never color alone. */
function ExerciseBadges({ exercise }: { exercise: ExerciseTeacherView }) {
  return (
    <div className="flex flex-wrap gap-2">
      {exercise.origin === "AI_GENERATED" ? (
        <Badge variant="info">
          <Sparkles aria-hidden="true" />
          Gerado por IA
        </Badge>
      ) : null}
      {exercise.humanEdited ? (
        <Badge variant="neutral">
          <Pencil aria-hidden="true" />
          Editado por você
        </Badge>
      ) : null}
      {exercise.isTrickQuestion ? (
        <Badge variant="warning">
          <AlertTriangle aria-hidden="true" />
          Pegadinha
        </Badge>
      ) : null}
    </div>
  );
}

/** What the teacher reads of an exercise: everything, answers included (never shown to students). */
function ExerciseContent({ exercise }: { exercise: ExerciseTeacherView }) {
  return (
    <dl className="m-0 flex flex-col gap-2">
      <Item term="Enunciado">{exercise.statement}</Item>
      <Item term="Dificuldade e objetivo">
        {DIFFICULTY_LABELS[exercise.difficulty]} · {COGNITIVE_OBJECTIVE_LABELS[exercise.cognitiveObjective]}
      </Item>
      {exercise.expectedAnswer !== null ? <Item term="Resposta esperada">{exercise.expectedAnswer}</Item> : null}
      {exercise.type === "MULTIPLE_CHOICE" ? (
        <Item term="Alternativas">
          <ol className="m-0 pl-6">
            {exercise.alternatives.map((alternative) => (
              <li key={alternative.id}>
                {alternative.text}
                {alternative.isCorrect ? <strong> (correta)</strong> : null}
              </li>
            ))}
          </ol>
        </Item>
      ) : null}
      {exercise.instructions !== null ? <Item term="Instruções">{exercise.instructions}</Item> : null}
      {exercise.starterCode !== null ? <Item term="Código inicial">{exercise.starterCode}</Item> : null}
      {exercise.expectedSolution !== null ? <Item term="Solução esperada">{exercise.expectedSolution}</Item> : null}
      {exercise.language ? <Item term="Linguagem">{exercise.language.name}</Item> : null}
      <Item term="Explicação">{exercise.explanation}</Item>
    </dl>
  );
}

function Item({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-label text-text-secondary">{term}</dt>
      <dd className="m-0 whitespace-pre-wrap">{children}</dd>
    </div>
  );
}
