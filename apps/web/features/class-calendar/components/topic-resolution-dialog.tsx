"use client";

import type { TopicResolution, TopicView } from "@repo/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatIsoDate } from "./calendar-dates";

type Action = TopicResolution["action"];

const ACTIONS: readonly { value: Action; label: string }[] = [
  { value: "MOVE", label: "Mover para outra aula" },
  { value: "UNSCHEDULE", label: "Deixar sem data" },
  { value: "MERGE", label: "Juntar com outro tópico" },
  { value: "ARCHIVE", label: "Arquivar" },
];

interface Choice {
  action?: Action;
  meetingDate?: string;
  intoTopicId?: string;
}

const SELECT_CLASS = "min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground";

export interface TopicResolutionDialogProps {
  /** The date being unmarked ("YYYY-MM-DD"); `null` keeps the dialog closed. */
  meetingDate: string | null;
  /** Non-archived topics of that meeting, from the plan in the cache. */
  topics: readonly TopicView[];
  /** Other class days a topic can move to, with their label ("Aula 02 — 17/02/2027"). */
  moveTargets: readonly { date: string; label: string }[];
  /** Topics a topic of this meeting can be merged into. */
  mergeCandidates: readonly TopicView[];
  onConfirm: (resolutions: TopicResolution[]) => void;
  onCancel: () => void;
}

/**
 * "Esta aula tem tópicos planejados" (004/US4-6, FR-029): before a class day with topics is
 * unmarked, the teacher chooses for each topic to move it, leave it without a date, merge it or
 * archive it. Nothing is sent here; the choices go with "Salvar calendário".
 */
export function TopicResolutionDialog({
  meetingDate,
  topics,
  moveTargets,
  mergeCandidates,
  onConfirm,
  onCancel,
}: TopicResolutionDialogProps) {
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [error, setError] = useState("");

  const choose = (topicId: string, choice: Choice) =>
    setChoices((current) => ({ ...current, [topicId]: { ...current[topicId], ...choice } }));

  const onAction = (topicId: string, action: Action) =>
    choose(topicId, {
      action,
      meetingDate: choices[topicId]?.meetingDate ?? moveTargets[0]?.date,
      intoTopicId: choices[topicId]?.intoTopicId ?? mergeCandidates[0]?.id,
    });

  const confirm = () => {
    const resolutions: TopicResolution[] = [];
    for (const topic of topics) {
      const choice = choices[topic.id];
      if (choice?.action === "MOVE" && choice.meetingDate) {
        resolutions.push({ topicId: topic.id, action: "MOVE", meetingDate: choice.meetingDate });
      } else if (choice?.action === "MERGE" && choice.intoTopicId) {
        resolutions.push({ topicId: topic.id, action: "MERGE", intoTopicId: choice.intoTopicId });
      } else if (choice?.action === "UNSCHEDULE" || choice?.action === "ARCHIVE") {
        resolutions.push({ topicId: topic.id, action: choice.action });
      }
    }
    if (resolutions.length < topics.length) {
      setError("Escolha o que fazer com cada tópico.");
      return;
    }
    onConfirm(resolutions);
  };

  return (
    <Dialog open={meetingDate !== null} onOpenChange={(open) => (open ? undefined : onCancel())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Esta aula tem tópicos planejados</DialogTitle>
          <DialogDescription>
            {meetingDate ? `Escolha o que fazer com cada tópico antes de desmarcar ${formatIsoDate(meetingDate)}.` : null}
          </DialogDescription>
        </DialogHeader>
        {error ? (
          <p role="alert" className="m-0 font-semibold text-destructive">
            {error}
          </p>
        ) : null}
        {topics.length === 0 ? (
          <p role="alert" className="m-0">
            Não foi possível mostrar os tópicos desta aula. Atualize a página e tente novamente.
          </p>
        ) : (
          <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
            {topics.map((topic) => {
              const choice = choices[topic.id] ?? {};
              const name = `resolucao-${topic.id}`;
              return (
                <fieldset key={topic.id} className="m-0 rounded-md border border-border p-3">
                  <legend className="px-1 font-semibold">{topic.title}</legend>
                  {ACTIONS.map((action) => {
                    const id = `${name}-${action.value}`;
                    const unavailable =
                      (action.value === "MOVE" && moveTargets.length === 0) ||
                      (action.value === "MERGE" && mergeCandidates.length === 0);
                    return (
                      <div key={action.value} className="flex min-h-11 items-center gap-2">
                        <input
                          type="radio"
                          id={id}
                          name={name}
                          value={action.value}
                          checked={choice.action === action.value}
                          disabled={unavailable}
                          onChange={() => onAction(topic.id, action.value)}
                          className="size-5"
                        />
                        <Label htmlFor={id}>{action.label}</Label>
                      </div>
                    );
                  })}
                  {choice.action === "MOVE" ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <Label htmlFor={`${name}-aula`}>Aula de destino</Label>
                      <select
                        id={`${name}-aula`}
                        className={SELECT_CLASS}
                        value={choice.meetingDate}
                        onChange={(event) => choose(topic.id, { meetingDate: event.target.value })}
                      >
                        {moveTargets.map((target) => (
                          <option key={target.date} value={target.date}>
                            {target.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                  {choice.action === "MERGE" ? (
                    <div className="mt-2 flex flex-col gap-1">
                      <Label htmlFor={`${name}-topico`}>Juntar com</Label>
                      <select
                        id={`${name}-topico`}
                        className={SELECT_CLASS}
                        value={choice.intoTopicId}
                        onChange={(event) => choose(topic.id, { intoTopicId: event.target.value })}
                      >
                        {mergeCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : null}
                </fieldset>
              );
            })}
          </div>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="secondary">
              Cancelar
            </Button>
          </DialogClose>
          {topics.length > 0 ? (
            <Button type="button" onClick={confirm}>
              Desmarcar aula
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
