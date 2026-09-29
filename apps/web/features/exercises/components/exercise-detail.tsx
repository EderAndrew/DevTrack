"use client";

import { Archive, ArchiveRestore, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { messageForError } from "@/lib/messages/error-messages";
import { useExercise, useExerciseActions } from "../hooks/use-exercises";
import { EXERCISE_TYPE_LABELS } from "../schemas/exercise-form";
import { EXERCISE_ORIGIN_LABELS } from "./exercise-bank-list";
import { DraftEditor } from "./draft-editor";
import { EXERCISE_STATUS_LABELS, ExerciseBadges, ExerciseContent, ExerciseStatusLabel } from "./exercise-parts";

export interface ExerciseDetailProps {
  exerciseId: string;
  /** `questoes.editar`: "Editar", "Arquivar" and "Restaurar" (UX only; the API authorizes). */
  canEdit: boolean;
}

/**
 * One exercise of the bank (010 contracts/web-ui.md, `/exercicios/[id]`): everything the teacher
 * sees of it, "Editar" (the rules again; an APPROVED one stays APPROVED, US5-3), "Arquivar" with
 * confirmation and "Restaurar" to the status it had (US5-4). An archived exercise can't be edited.
 */
export function ExerciseDetail({ exerciseId, canEdit }: ExerciseDetailProps) {
  const query = useExercise(exerciseId);
  const actions = useExerciseActions(exerciseId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (query.isError) return <p role="alert">{messageForError(query.error)}</p>;
  if (!query.data) return <p role="status">Carregando o exercício…</p>;
  const exercise = query.data;
  const archived = exercise.status === "ARCHIVED";

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

  return (
    <>
      {error ? (
        <p role="alert" className="text-danger-text">
          {error}
        </p>
      ) : null}
      <p role="status" className={notice ? "m-0 mb-4" : "sr-only"}>
        {notice ?? ""}
      </p>

      <Card role="group" aria-labelledby="exercicio-titulo">
        <CardHeader className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="exercicio-titulo" className="m-0 text-h3">
              {EXERCISE_TYPE_LABELS[exercise.type]}
            </h2>
            <ExerciseStatusLabel status={exercise.status} />
          </div>
          <ExerciseBadges exercise={exercise} />
          <p className="m-0 text-text-secondary">
            Origem: {EXERCISE_ORIGIN_LABELS[exercise.origin]}
            {exercise.topic ? ` · ${exercise.topic.subjectName} · ${exercise.topic.itemText}` : ""}
            {exercise.reviewedBy && exercise.reviewedAt
              ? ` · Revisado por ${exercise.reviewedBy.name} em ${new Date(exercise.reviewedAt).toLocaleDateString("pt-BR")}`
              : ""}
          </p>
          {archived && exercise.archivedFromStatus ? (
            <p className="m-0">Arquivado. Ao restaurar, volta a {EXERCISE_STATUS_LABELS[exercise.archivedFromStatus].toLowerCase()}.</p>
          ) : null}
          {exercise.batchId ? (
            <p className="m-0">
              <Link href={`/exercicios/lotes/${exercise.batchId}`}>Ver o lote gerado com IA</Link>
            </p>
          ) : null}
        </CardHeader>
        <CardContent>
          {editing ? (
            <DraftEditor
              exercise={exercise}
              n={1}
              label="Editar exercício"
              onCancel={() => setEditing(false)}
              onSave={async (body) => {
                await actions.update.mutateAsync(body);
                setEditing(false);
                setError(null);
                setNotice("Exercício salvo.");
              }}
            />
          ) : (
            <ExerciseContent exercise={exercise} />
          )}
          {canEdit && !editing ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {archived ? (
                <Button
                  type="button"
                  aria-busy={actions.restore.isPending || undefined}
                  onClick={() => void run(() => actions.restore.mutateAsync(exercise.version), "Exercício restaurado.")}
                >
                  <ArchiveRestore aria-hidden="true" />
                  Restaurar
                </Button>
              ) : (
                <>
                  <Button type="button" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="danger">
                        <Archive aria-hidden="true" />
                        Arquivar
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Arquivar este exercício?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Ele sai da consulta do banco e não pode ser editado nem aprovado. Você pode restaurá-lo depois, filtrando por arquivados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction variant="danger" onClick={() => void run(() => actions.archive.mutateAsync(exercise.version), "Exercício arquivado.")}>
                          Arquivar exercício
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
