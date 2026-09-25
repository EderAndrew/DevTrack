"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ClassMeetingView, PlanCoverage, TopicFields, TopicView } from "@repo/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ErrorSummary, Field, fieldErrorId, SubmitButton } from "@/components/shared";
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
import { NativeSelect } from "@/components/ui/native-select";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCreateTopic, useMergeTopics, useRefreshPlan, useUpdateTopic } from "../hooks/use-class-plan";
import {
  ITEM_ERROR_CODES,
  NO_MEETING,
  type TopicFormInput,
  type TopicFormOutput,
  TopicFormSchema,
  topicFormMessages,
  toTopicFields,
} from "../schemas/topic-form";
import { ItemPicker, withLinkedItems } from "./item-picker";

const FIELD_IDS = { title: "titulo-topico", description: "descricao-topico", meetingId: "aula-topico", itemIds: "busca-item" } as const;

type Kind = "create" | "edit" | "merge";

const TEXTS: Record<Kind, { title: string; submit: string; pending: string; saved: string; failed: string }> = {
  create: {
    title: "Novo tópico",
    submit: "Criar tópico",
    pending: "Criando…",
    saved: "Tópico criado.",
    failed: "Não foi possível criar o tópico",
  },
  edit: {
    title: "Editar tópico",
    submit: "Salvar tópico",
    pending: "Salvando…",
    saved: "Tópico salvo.",
    failed: "Não foi possível salvar o tópico",
  },
  merge: {
    title: "Juntar tópicos",
    submit: "Juntar tópicos",
    pending: "Juntando…",
    saved: "Tópicos juntados.",
    failed: "Não foi possível juntar os tópicos",
  },
};

export interface TopicFormDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class's meetings, for the Aula select. */
  meetings: readonly ClassMeetingView[];
  /** The groups and items of the syllabus revision the plan uses. */
  groups: PlanCoverage["groups"];
  /** New topic from "Criar tópico com este item" (FR-033): the item already chosen and its text as the title. */
  initial?: { title: string; itemIds: string[] };
  /** Editing this topic (FR-035). */
  topic?: TopicView;
  /** "Juntar tópicos" (FR-036): the first one stays; fields start from it, items from the union. */
  mergeTopics?: readonly TopicView[];
  /** Called with the message to announce once saved. */
  onSaved: (message: string) => void;
}

function defaults(props: TopicFormDialogProps): TopicFormInput {
  const [first] = props.mergeTopics ?? [];
  if (props.mergeTopics && first) {
    return {
      title: props.mergeTopics.map((topic) => topic.title).join(" + ").slice(0, 200),
      description: first.description ?? "",
      meetingId: first.meetingId ?? NO_MEETING,
      itemIds: [...new Set(props.mergeTopics.flatMap((topic) => topic.items.map((item) => item.id)))],
    };
  }
  if (props.topic) {
    return {
      title: props.topic.title,
      description: props.topic.description ?? "",
      meetingId: props.topic.meetingId ?? NO_MEETING,
      itemIds: props.topic.items.map((item) => item.id),
    };
  }
  return { title: props.initial?.title ?? "", description: "", meetingId: NO_MEETING, itemIds: props.initial?.itemIds ?? [] };
}

/**
 * The topic form (004/US5, US6; FR-034 – FR-036): title, description, the class day ("Sem data"
 * by default) and the syllabus items it covers. It creates a topic, edits one or reviews a merge.
 * Nothing here decides whether an item belongs to the plan: the API answers SYLLABUS_ITEM_NOT_IN_PLAN.
 * On 409 PLAN_REVISION_CONFLICT the form stays open and "Atualizar" fetches the plan again.
 */
export function TopicFormDialog(props: TopicFormDialogProps) {
  const { classId, open, onOpenChange, meetings, groups, topic, mergeTopics, onSaved } = props;
  const kind: Kind = mergeTopics ? "merge" : topic ? "edit" : "create";
  const texts = TEXTS[kind];
  const create = useCreateTopic(classId);
  const update = useUpdateTopic(classId);
  const merge = useMergeTopics(classId);
  const refresh = useRefreshPlan(classId);
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<TopicFormInput>(FIELD_IDS);
  const { register, control, handleSubmit, formState } = useForm<TopicFormInput, unknown, TopicFormOutput>({
    shouldFocusError: false,
    resolver: zodResolver(TopicFormSchema, { error: topicFormMessages }),
    defaultValues: defaults(props),
  });
  /** 409 PLAN_REVISION_CONFLICT: "Atualizar" fetches the plan again and keeps what was typed. */
  const [conflict, setConflict] = useState(false);

  const send = (fields: TopicFields) => {
    if (kind === "merge") return merge.mutateAsync({ topicIds: mergeTopics!.map((entry) => entry.id), fields });
    if (kind === "edit") return update.mutateAsync({ topicId: topic!.id, fields });
    return create.mutateAsync(fields);
  };

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    setConflict(false);
    try {
      await send(toTopicFields(values));
      onOpenChange(false);
      onSaved(texts.saved);
    } catch (error) {
      const code = apiErrorCode(error);
      setConflict(code === "PLAN_REVISION_CONFLICT");
      setErrors([{ fieldId: code && ITEM_ERROR_CODES.includes(code) ? FIELD_IDS.itemIds : undefined, message: messageForError(error) }]);
    }
  }, onInvalid);

  const titleError = errorFor(FIELD_IDS.title);
  const descriptionError = errorFor(FIELD_IDS.description);
  const linked = [...(topic?.items ?? []), ...(mergeTopics ?? []).flatMap((entry) => entry.items)];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{texts.title}</DialogTitle>
          <DialogDescription>
            {mergeTopics
              ? `Fica o tópico “${mergeTopics[0]?.title}”; os outros são arquivados indicando em qual foram juntados. Revise os dados antes de confirmar.`
              : "Escolha a aula e os itens da ementa que o tópico cobre. Os dois podem ficar em branco."}
          </DialogDescription>
        </DialogHeader>
        {mergeTopics ? (
          <ul aria-label="Tópicos que serão juntados" className="m-0 pl-5">
            {mergeTopics.map((entry) => (
              <li key={entry.id}>{entry.title}</li>
            ))}
          </ul>
        ) : null}
        <form
          noValidate
          aria-label={texts.title}
          onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
        >
          <ErrorSummary errors={errors} title={texts.failed} />
          {conflict ? (
            <div className="mb-4">
              <Button type="button" variant="secondary" onClick={() =>
                  void refresh().then(() => {
                    setErrors([]);
                    setConflict(false);
                  })
                }>
                Atualizar
              </Button>
            </div>
          ) : null}
          <Field id={FIELD_IDS.title} label="Título" required error={titleError} {...register("title")} />
          <div className="mb-4 flex flex-col gap-1">
            <Label htmlFor={FIELD_IDS.description}>Descrição</Label>
            <Textarea
              id={FIELD_IDS.description}
              rows={3}
              aria-invalid={descriptionError ? true : undefined}
              aria-describedby={descriptionError ? fieldErrorId(FIELD_IDS.description) : undefined}
              {...register("description")}
            />
            {descriptionError ? (
              <p id={fieldErrorId(FIELD_IDS.description)} className="m-0 font-semibold text-danger-text">
                {descriptionError}
              </p>
            ) : null}
          </div>
          <div className="mb-4 flex flex-col gap-1">
            <Label htmlFor={FIELD_IDS.meetingId}>Aula</Label>
            <NativeSelect id={FIELD_IDS.meetingId} {...register("meetingId")}>
              <option value={NO_MEETING}>Sem data</option>
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {meetingLabel(meeting.number, meeting.date)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Controller
            control={control}
            name="itemIds"
            render={({ field }) => (
              <ItemPicker
                idPrefix={FIELD_IDS.itemIds}
                groups={withLinkedItems(groups, linked)}
                value={field.value}
                onChange={field.onChange}
                error={errorFor(FIELD_IDS.itemIds)}
              />
            )}
          />
          <DialogFooter>
            <SubmitButton pending={formState.isSubmitting} pendingLabel={texts.pending}>
              {texts.submit}
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
