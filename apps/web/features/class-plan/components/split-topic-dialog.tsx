"use client";

import type { ClassMeetingView, PlanCoverage, TopicFields, TopicView } from "@repo/contracts";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorSummary, Field, type FormError, SubmitButton } from "@/components/shared";
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
import { Textarea } from "@/components/ui/textarea";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useRefreshPlan, useSplitTopic } from "../hooks/use-class-plan";
import { NO_MEETING } from "../schemas/topic-form";
import { ItemPicker, withLinkedItems } from "./item-picker";
import { SELECT_CLASS } from "./topic-form-dialog";

const MIN_PARTS = 2;
const MAX_PARTS = 10;

interface Part {
  key: number;
  title: string;
  description: string;
  meetingId: string;
  itemIds: string[];
}

export interface SplitTopicDialogProps {
  classId: string;
  topic: TopicView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meetings: readonly ClassMeetingView[];
  groups: PlanCoverage["groups"];
  onSaved: (message: string) => void;
}

/**
 * "Dividir tópico" (004/US6-3, FR-037): two to ten parts, each with its title, description, class
 * day and syllabus items (an item may be in several parts). The first part stays in the topic;
 * the others record which topic they came from.
 */
export function SplitTopicDialog({ classId, topic, open, onOpenChange, meetings, groups, onSaved }: SplitTopicDialogProps) {
  const split = useSplitTopic(classId);
  const refresh = useRefreshPlan(classId);
  const [parts, setParts] = useState<Part[]>(() => [
    {
      key: 1,
      title: topic.title,
      description: topic.description ?? "",
      meetingId: topic.meetingId ?? NO_MEETING,
      itemIds: topic.items.map((item) => item.id),
    },
    { key: 2, title: "", description: "", meetingId: topic.meetingId ?? NO_MEETING, itemIds: [] },
  ]);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [conflict, setConflict] = useState(false);
  const itemGroups = withLinkedItems(groups, topic.items);

  const change = (key: number, patch: Partial<Part>) =>
    setParts((current) => current.map((part) => (part.key === key ? { ...part, ...patch } : part)));
  const titleId = (index: number) => `titulo-parte-${index + 1}`;

  const submit = async () => {
    const invalid = parts.flatMap((part, index) =>
      part.title.trim() === "" ? [{ fieldId: titleId(index), message: `Informe o título da parte ${index + 1}.` }] : [],
    );
    setConflict(false);
    setErrors(invalid);
    if (invalid.length > 0) return;
    const fields: TopicFields[] = parts.map((part) => ({
      title: part.title.trim(),
      description: part.description.trim() || null,
      meetingId: part.meetingId || null,
      itemIds: part.itemIds,
    }));
    try {
      await split.mutateAsync({ topicId: topic.id, parts: fields });
      onOpenChange(false);
      onSaved("Tópico dividido.");
    } catch (error) {
      setConflict(apiErrorCode(error) === "PLAN_REVISION_CONFLICT");
      setErrors([{ message: messageForError(error) }]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dividir tópico</DialogTitle>
          <DialogDescription>
            “{topic.title}” continua como a primeira parte; as demais registram de qual tópico vieram. Um item da ementa pode
            ficar em mais de uma parte.
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Dividir tópico"
          onSubmit={(event) => {
            event.preventDefault();
            if (!split.isPending) void submit();
          }}
        >
          <ErrorSummary errors={errors} title="Não foi possível dividir o tópico" />
          {conflict ? (
            <div className="mb-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  void refresh().then(() => {
                    setErrors([]);
                    setConflict(false);
                  })
                }
              >
                Atualizar
              </Button>
            </div>
          ) : null}
          {parts.map((part, index) => {
            const error = errors.find((entry) => entry.fieldId === titleId(index))?.message;
            return (
              <fieldset key={part.key} className="m-0 mb-4 rounded-md border border-border p-3">
                <legend className="px-1 font-semibold">Parte {index + 1}</legend>
                <Field
                  id={titleId(index)}
                  name={titleId(index)}
                  label="Título"
                  required
                  error={error}
                  value={part.title}
                  onChange={(event) => change(part.key, { title: event.target.value })}
                />
                <div className="mb-4 flex flex-col gap-1">
                  <Label htmlFor={`descricao-parte-${index + 1}`}>Descrição</Label>
                  <Textarea
                    id={`descricao-parte-${index + 1}`}
                    rows={2}
                    value={part.description}
                    onChange={(event) => change(part.key, { description: event.target.value })}
                  />
                </div>
                <div className="mb-4 flex flex-col gap-1">
                  <Label htmlFor={`aula-parte-${index + 1}`}>Aula</Label>
                  <select
                    id={`aula-parte-${index + 1}`}
                    className={SELECT_CLASS}
                    value={part.meetingId}
                    onChange={(event) => change(part.key, { meetingId: event.target.value })}
                  >
                    <option value={NO_MEETING}>Sem data</option>
                    {meetings.map((meeting) => (
                      <option key={meeting.id} value={meeting.id}>
                        {meetingLabel(meeting.number, meeting.date)}
                      </option>
                    ))}
                  </select>
                </div>
                <ItemPicker
                  idPrefix={`busca-parte-${index + 1}`}
                  groups={itemGroups}
                  value={part.itemIds}
                  onChange={(itemIds) => change(part.key, { itemIds })}
                />
                {parts.length > MIN_PARTS && index > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setParts((current) => current.filter((entry) => entry.key !== part.key))}
                  >
                    <Trash2 aria-hidden="true" />
                    Remover parte {index + 1}
                  </Button>
                ) : null}
              </fieldset>
            );
          })}
          {parts.length < MAX_PARTS ? (
            <div className="mb-4">
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setParts((current) => [
                    ...current,
                    { key: Math.max(...current.map((part) => part.key)) + 1, title: "", description: "", meetingId: NO_MEETING, itemIds: [] },
                  ])
                }
              >
                <Plus aria-hidden="true" />
                Adicionar parte
              </Button>
            </div>
          ) : null}
          <DialogFooter>
            <SubmitButton pending={split.isPending} pendingLabel="Dividindo…">
              Dividir tópico
            </SubmitButton>
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </DialogClose>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
