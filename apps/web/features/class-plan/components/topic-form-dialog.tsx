"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type { ClassMeetingView, PlanCoverage } from "@repo/contracts";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { meetingLabel } from "@/features/class-calendar/components/calendar-dates";
import { useErrorSummary } from "@/lib/forms/use-error-summary";
import { apiErrorCode, messageForError } from "@/lib/messages/error-messages";
import { useCreateTopic } from "../hooks/use-class-plan";
import {
  ITEM_ERROR_CODES,
  NO_MEETING,
  type TopicFormInput,
  type TopicFormOutput,
  TopicFormSchema,
  topicFormMessages,
  toTopicFields,
} from "../schemas/topic-form";

const FIELD_IDS = { title: "titulo-topico", description: "descricao-topico", meetingId: "aula-topico", itemIds: "busca-item" } as const;

const SELECT_CLASS = "min-h-11 rounded-md border border-input bg-background px-3 py-2 text-base text-foreground";

/** Lower case without accents, so "padroes" finds "Padrões". */
const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

export interface TopicFormDialogProps {
  classId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The class's meetings, for the Aula select. */
  meetings: readonly ClassMeetingView[];
  /** The groups and items of the syllabus revision the plan uses. */
  groups: PlanCoverage["groups"];
  /** "Criar tópico com este item" (FR-033): the item already chosen and its text as the title. */
  initial?: { title: string; itemIds: string[] };
  /** Called with the message to announce once the topic is saved. */
  onSaved: (message: string) => void;
}

/**
 * "Novo tópico" (004/US5, FR-034, FR-035): title, description, the class day ("Sem data" by
 * default) and the syllabus items it covers, as checkboxes by group with a search. Nothing here
 * decides whether an item belongs to the plan: the API answers SYLLABUS_ITEM_NOT_IN_PLAN.
 */
export function TopicFormDialog({ classId, open, onOpenChange, meetings, groups, initial, onSaved }: TopicFormDialogProps) {
  const create = useCreateTopic(classId);
  const [search, setSearch] = useState("");
  const { errors, setErrors, onInvalid, errorFor } = useErrorSummary<TopicFormInput>(FIELD_IDS);
  const { register, control, handleSubmit, formState } = useForm<TopicFormInput, unknown, TopicFormOutput>({
    shouldFocusError: false,
    resolver: zodResolver(TopicFormSchema, { error: topicFormMessages }),
    defaultValues: { title: initial?.title ?? "", description: "", meetingId: NO_MEETING, itemIds: initial?.itemIds ?? [] },
  });

  const onSubmit = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await create.mutateAsync(toTopicFields(values));
      onOpenChange(false);
      onSaved("Tópico criado.");
    } catch (error) {
      const code = apiErrorCode(error);
      setErrors([
        { fieldId: code && ITEM_ERROR_CODES.includes(code) ? FIELD_IDS.itemIds : undefined, message: messageForError(error) },
      ]);
    }
  }, onInvalid);

  const query = normalize(search.trim());
  const shownGroups = groups
    .map((group) => ({ ...group, items: group.items.filter((item) => normalize(item.text).includes(query)) }))
    .filter((group) => group.items.length > 0);
  const titleError = errorFor(FIELD_IDS.title);
  const descriptionError = errorFor(FIELD_IDS.description);
  const itemsError = errorFor(FIELD_IDS.itemIds);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Novo tópico</DialogTitle>
          <DialogDescription>Escolha a aula e os itens da ementa que o tópico cobre. Os dois podem ficar em branco.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          aria-label="Novo tópico"
          onSubmit={(event) => (formState.isSubmitting ? event.preventDefault() : void onSubmit(event))}
        >
          <ErrorSummary errors={errors} title="Não foi possível criar o tópico" />
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
              <p id={fieldErrorId(FIELD_IDS.description)} className="m-0 font-semibold text-destructive">
                {descriptionError}
              </p>
            ) : null}
          </div>
          <div className="mb-4 flex flex-col gap-1">
            <Label htmlFor={FIELD_IDS.meetingId}>Aula</Label>
            <select id={FIELD_IDS.meetingId} className={SELECT_CLASS} {...register("meetingId")}>
              <option value={NO_MEETING}>Sem data</option>
              {meetings.map((meeting) => (
                <option key={meeting.id} value={meeting.id}>
                  {meetingLabel(meeting.number, meeting.date)}
                </option>
              ))}
            </select>
          </div>
          <Controller
            control={control}
            name="itemIds"
            render={({ field }) => {
              const toggle = (id: string, checked: boolean) =>
                field.onChange(checked ? [...field.value, id] : field.value.filter((value) => value !== id));
              return (
                <fieldset className="m-0 mb-4 flex flex-col gap-2 rounded-md border border-border p-3">
                  <legend className="px-1 font-semibold">Itens da ementa</legend>
                  <Label htmlFor={FIELD_IDS.itemIds}>Buscar item da ementa</Label>
                  <Input
                    id={FIELD_IDS.itemIds}
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    aria-invalid={itemsError ? true : undefined}
                    aria-describedby={itemsError ? fieldErrorId(FIELD_IDS.itemIds) : undefined}
                  />
                  {itemsError ? (
                    <p id={fieldErrorId(FIELD_IDS.itemIds)} className="m-0 font-semibold text-destructive">
                      {itemsError}
                    </p>
                  ) : null}
                  <p aria-live="polite" className="m-0 text-muted-foreground">
                    {field.value.length === 1 ? "1 item marcado." : `${field.value.length} itens marcados.`}
                  </p>
                  {shownGroups.length === 0 ? <p className="m-0">Nenhum item encontrado.</p> : null}
                  <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
                    {shownGroups.map((group) => (
                      <fieldset key={group.id} className="m-0 border-0 p-0">
                        <legend className="font-semibold">{group.title ?? "Itens"}</legend>
                        {group.items.map((item) => {
                          const id = `item-${item.id}`;
                          return (
                            <div key={item.id} className="flex min-h-11 items-center gap-2">
                              <input
                                type="checkbox"
                                id={id}
                                checked={field.value.includes(item.id)}
                                onChange={(event) => toggle(item.id, event.target.checked)}
                                className="size-5 shrink-0"
                              />
                              <Label htmlFor={id} className="font-normal">
                                {item.text}
                              </Label>
                            </div>
                          );
                        })}
                      </fieldset>
                    ))}
                  </div>
                </fieldset>
              );
            }}
          />
          <DialogFooter>
            <SubmitButton pending={formState.isSubmitting} pendingLabel="Criando…">
              Criar tópico
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
