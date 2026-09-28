"use client";

import type { SyllabusRevisionView } from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { type ComponentProps, useEffect, useRef, useState } from "react";
import {
  type Control,
  type FieldErrors,
  useFieldArray,
  type UseFormGetValues,
  type UseFormRegister,
  type UseFormSetValue,
  useForm,
  useWatch,
} from "react-hook-form";
import { ErrorSummary, fieldErrorId, type FormError, SubmitButton } from "@/components/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useProgrammingLanguages } from "@/features/exercises/hooks/use-exercises";
import { ERROR_MESSAGES, messageForError } from "@/lib/messages/error-messages";
import { useConfirmSyllabusRevision, useSaveSyllabusRevision } from "../hooks/use-syllabus-revisions";
import {
  itemCount,
  type RevisionFormInput,
  type RevisionFormOutput,
  RevisionFormSchema,
  revisionFormMessages,
  toRevisionForm,
  toSaveRevisionRequest,
} from "../schemas/revision-form";

const FIELD_IDS = {
  title: "revisao-titulo",
  syllabusText: "revisao-ementa",
  competencyText: "revisao-competencia",
  languageId: "revisao-linguagem",
} as const;
const ADD_GROUP_ID = "revisao-adicionar-grupo";
const groupTitleId = (group: number) => `grupo-${group + 1}-titulo`;
const itemFieldId = (group: number, item: number) => `grupo-${group + 1}-item-${item + 1}`;
const addItemId = (group: number) => `grupo-${group + 1}-adicionar-item`;

type ItemAction = (message: string, focusId: string) => void;

export interface SyllabusRevisionEditorProps {
  subjectId: string;
  /** A DRAFT revision; the editor starts from its content (mount it again, by `key`, for another one). */
  revision: SyllabusRevisionView;
  /** After "Confirmar conteúdo": the page shows the confirmed content and announces it. */
  onConfirmed?: (revision: SyllabusRevisionView) => void;
}

/**
 * Review of a syllabus version's content (004/US3, FR-021 – FR-023): Título, Ementa, Competência
 * and the learning objects in groups and items, which can be edited, added, moved (Subir, Descer,
 * "Mover para o grupo…") and removed, keeping the focus on the item the action is about. "Salvar"
 * keeps the draft; "Confirmar conteúdo" saves it and confirms it after an `alert-dialog`, since a
 * confirmed content can no longer change. An `AI_ASSISTED` draft (007) says so, with a link to its proposal.
 */
export function SyllabusRevisionEditor({ subjectId, revision, onConfirmed }: SyllabusRevisionEditorProps) {
  const save = useSaveSyllabusRevision(revision.id);
  const languages = useProgrammingLanguages();
  const confirm = useConfirmSyllabusRevision(subjectId, revision.id);
  const { control, register, handleSubmit, reset, getValues, setValue, formState } = useForm<
    RevisionFormInput,
    unknown,
    RevisionFormOutput
  >({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(RevisionFormSchema, { error: revisionFormMessages }),
    defaultValues: toRevisionForm(revision),
  });
  const groups = useFieldArray({ control, name: "groups" });
  const groupTitles = useWatch({ control, name: "groups" }).map((group) => group.title);
  const [errors, setErrors] = useState<FormError[]>([]);
  const [announcement, setAnnouncement] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const pendingFocus = useRef<string | null>(null);

  // After a move, an addition or a removal, focus lands on the element the action is about.
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const act: ItemAction = (message, focusId) => {
    pendingFocus.current = focusId;
    setAnnouncement(message);
  };

  const onInvalid = (fieldErrors: FieldErrors<RevisionFormInput>) => {
    const list: FormError[] = [];
    for (const key of ["title", "syllabusText", "competencyText", "languageId"] as const) {
      const message = fieldErrors[key]?.message;
      if (message) list.push({ fieldId: FIELD_IDS[key], message });
    }
    const groupErrors = fieldErrors.groups;
    if (groupErrors?.message) list.push({ message: groupErrors.message });
    if (Array.isArray(groupErrors)) {
      groupErrors.forEach((group, groupIndex) => {
        if (group?.title?.message) {
          list.push({ fieldId: groupTitleId(groupIndex), message: `Grupo ${groupIndex + 1}: ${group.title.message}` });
        }
        if (Array.isArray(group?.items)) {
          (group.items as ({ text?: { message?: string } } | undefined)[]).forEach((item, index) => {
            if (item?.text?.message) {
              list.push({
                fieldId: itemFieldId(groupIndex, index),
                message: `Grupo ${groupIndex + 1}, item ${index + 1}: ${item.text.message}`,
              });
            }
          });
        }
      });
    }
    setErrors(list);
  };

  /** Saves the form and starts again from what the API kept (new item ids, E16). */
  const persist = async (values: RevisionFormOutput) => {
    const saved = await save.mutateAsync(toSaveRevisionRequest(values));
    reset(toRevisionForm(saved));
    return saved;
  };

  const onSave = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await persist(values);
      setAnnouncement("Revisão salva.");
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  const askConfirmation = () => {
    setErrors([]);
    if (itemCount(getValues()) === 0) {
      setErrors([{ message: ERROR_MESSAGES.REVISION_EMPTY }]);
      return;
    }
    void handleSubmit(() => setConfirmOpen(true), onInvalid)();
  };

  const onConfirm = handleSubmit(async (values) => {
    setErrors([]);
    try {
      await persist(values);
      const confirmed = await confirm.mutateAsync();
      onConfirmed?.(confirmed);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  // The catalog's active languages, plus the draft's own when it was deactivated since (010, spec edge cases).
  const catalog = languages.data ?? [];
  const languageOptions =
    revision.language && !catalog.some((language) => language.id === revision.language!.id) ? [...catalog, revision.language] : catalog;

  const pending = formState.isSubmitting;
  const fieldError = (id: string) => errors.find((error) => error.fieldId === id)?.message;

  return (
    <form
      noValidate
      aria-label={`Revisão ${revision.number} do conteúdo`}
      onSubmit={(event) => (pending ? event.preventDefault() : void onSave(event))}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors} title="Não foi possível salvar a revisão" />
      {revision.source === "AI_ASSISTED" && revision.aiProposalId ? (
        <Notice className="mb-4">
          <p className="m-0">
            Preenchido com IA — revise o conteúdo antes de confirmar.{" "}
            <Link href={`/disciplinas/${subjectId}/ementa/${revision.documentId}/proposta/${revision.aiProposalId}`}>Ver proposta</Link>
          </p>
        </Notice>
      ) : null}

      <TextField id={FIELD_IDS.title} label="Título" error={fieldError(FIELD_IDS.title)} {...register("title")} />
      <TextField
        id={FIELD_IDS.syllabusText}
        label="Ementa"
        multiline
        error={fieldError(FIELD_IDS.syllabusText)}
        {...register("syllabusText")}
      />
      <TextField
        id={FIELD_IDS.competencyText}
        label="Competência"
        multiline
        error={fieldError(FIELD_IDS.competencyText)}
        {...register("competencyText")}
      />
      <FormField
        id={FIELD_IDS.languageId}
        label="Linguagem"
        description="A linguagem dos exercícios de código gerados a partir desta ementa."
        error={fieldError(FIELD_IDS.languageId)}
      >
        {(control) => (
          <NativeSelect {...control} {...register("languageId")}>
            <option value="">Nenhuma</option>
            {languageOptions.map((language) => (
              <option key={language.id} value={language.id}>
                {language.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>

      <h3>Objetos de aprendizagem</h3>
      {groups.fields.length === 0 ? <p>Nenhum grupo. Use &quot;Adicionar grupo&quot; para começar.</p> : null}
      {groups.fields.map((field, index) => (
        <GroupFields
          key={field.id}
          index={index}
          count={groups.fields.length}
          titles={groupTitles}
          control={control}
          register={register}
          getValues={getValues}
          setValue={setValue}
          fieldError={fieldError}
          act={act}
          onMove={(to) => {
            groups.move(index, to);
            act(`Grupo movido para a posição ${to + 1}.`, groupTitleId(to));
          }}
          onRemove={() => {
            groups.remove(index);
            const left = groups.fields.length - 1;
            act(
              "Grupo removido.",
              left === 0 ? ADD_GROUP_ID : groupTitleId(Math.min(index, left - 1)),
            );
          }}
        />
      ))}
      <div className="mb-6">
        <Button
          id={ADD_GROUP_ID}
          type="button"
          variant="secondary"
          onClick={() => {
            groups.append({ title: "", items: [] }, { shouldFocus: false });
            act("Grupo adicionado.", groupTitleId(groups.fields.length));
          }}
        >
          <Plus aria-hidden="true" />
          Adicionar grupo
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending && !confirmOpen} pendingLabel="Salvando…">
          Salvar
        </SubmitButton>
        <Button type="button" aria-busy={confirm.isPending || undefined} onClick={askConfirmation}>
          Confirmar conteúdo
        </Button>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar o conteúdo da ementa?</AlertDialogTitle>
            <AlertDialogDescription>
              O conteúdo confirmado não pode mais ser alterado. Correções depois disso criam uma nova revisão a partir dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onConfirm()}>Confirmar conteúdo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}

interface TextFieldProps extends Omit<ComponentProps<"input">, "id"> {
  id: string;
  label: string;
  error?: string;
  multiline?: boolean;
}

/** A labelled input or textarea with its error linked (FR-075). */
function TextField({ id, label, error, multiline, ...props }: TextFieldProps) {
  const describedBy = error ? fieldErrorId(id) : undefined;
  return (
    <div className="mb-4 flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <Textarea
          id={id}
          rows={4}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...(props as ComponentProps<"textarea">)}
        />
      ) : (
        <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props} />
      )}
      {error ? (
        <p id={fieldErrorId(id)} className="m-0 font-semibold text-danger-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

interface GroupFieldsProps {
  index: number;
  count: number;
  /** Current titles of every group, for "Mover para o grupo…". */
  titles: string[];
  control: Control<RevisionFormInput, unknown, RevisionFormOutput>;
  register: UseFormRegister<RevisionFormInput>;
  getValues: UseFormGetValues<RevisionFormInput>;
  setValue: UseFormSetValue<RevisionFormInput>;
  fieldError: (id: string) => string | undefined;
  act: ItemAction;
  onMove: (to: number) => void;
  onRemove: () => void;
}

const groupName = (index: number, title: string | undefined) => `Grupo ${index + 1}${title?.trim() ? ` — ${title.trim()}` : ""}`;

/** One group: its title and its items, each with Subir, Descer, "Mover para o grupo…" and Remover. */
function GroupFields({
  index,
  count,
  titles,
  control,
  register,
  getValues,
  setValue,
  fieldError,
  act,
  onMove,
  onRemove,
}: GroupFieldsProps) {
  const items = useFieldArray({ control, name: `groups.${index}.items` });
  const number = index + 1;
  const titleId = groupTitleId(index);

  const moveToGroup = (item: number, target: number) => {
    const moved = getValues(`groups.${index}.items.${item}`);
    const targetItems = getValues(`groups.${target}.items`);
    items.remove(item);
    setValue(`groups.${target}.items`, [...targetItems, moved]);
    act(
      `Item movido para o grupo ${target + 1}, posição ${targetItems.length + 1}.`,
      itemFieldId(target, targetItems.length),
    );
  };

  return (
    <fieldset className="mb-6 rounded-md border p-4">
      <legend className="px-1 font-semibold">Grupo {number}</legend>
      <TextField id={titleId} label="Título do grupo" error={fieldError(titleId)} {...register(`groups.${index}.title`)} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label={`Subir grupo ${number}`}
          disabled={index === 0}
          onClick={() => onMove(index - 1)}
        >
          <ArrowUp aria-hidden="true" />
          Subir
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          aria-label={`Descer grupo ${number}`}
          disabled={index === count - 1}
          onClick={() => onMove(index + 1)}
        >
          <ArrowDown aria-hidden="true" />
          Descer
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={onRemove} aria-label={`Remover grupo ${number}`}>
          <Trash2 aria-hidden="true" />
          Remover
        </Button>
      </div>

      {items.fields.length === 0 ? <p className="text-muted-foreground">Nenhum item neste grupo.</p> : null}
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {items.fields.map((field, item) => {
          const id = itemFieldId(index, item);
          const error = fieldError(id);
          const label = `item ${item + 1} do grupo ${number}`;
          return (
            <li key={field.id} className="flex flex-col gap-1">
              <Label htmlFor={id}>Item {item + 1}</Label>
              <Input
                id={id}
                aria-label={`Item ${item + 1} do grupo ${number}`}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? fieldErrorId(id) : undefined}
                {...register(`groups.${index}.items.${item}.text`)}
              />
              {error ? (
                <p id={fieldErrorId(id)} className="m-0 font-semibold text-danger-text">
                  {error}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Subir ${label}`}
                  disabled={item === 0}
                  onClick={() => {
                    items.move(item, item - 1);
                    act(`Item movido para a posição ${item}.`, itemFieldId(index, item - 1));
                  }}
                >
                  <ArrowUp aria-hidden="true" />
                  Subir
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Descer ${label}`}
                  disabled={item === items.fields.length - 1}
                  onClick={() => {
                    items.move(item, item + 1);
                    act(`Item movido para a posição ${item + 2}.`, itemFieldId(index, item + 1));
                  }}
                >
                  <ArrowDown aria-hidden="true" />
                  Descer
                </Button>
                {count > 1 ? (
                  <Select value="" onValueChange={(value) => moveToGroup(item, Number(value))}>
                    <SelectTrigger size="sm" aria-label={`Mover ${label} para o grupo…`} className="w-auto">
                      <SelectValue placeholder="Mover para o grupo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {titles.map((title, target) =>
                        target === index ? null : (
                          <SelectItem key={target} value={String(target)}>
                            {groupName(target, title)}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover ${label}`}
                  onClick={() => {
                    items.remove(item);
                    const left = items.fields.length - 1;
                    act("Item removido.", left === 0 ? addItemId(index) : itemFieldId(index, Math.min(item, left - 1)));
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Remover
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="mt-3">
        <Button
          id={addItemId(index)}
          aria-label={`Adicionar item ao grupo ${number}`}
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            items.append({ text: "" }, { shouldFocus: false });
            act("Item adicionado.", itemFieldId(index, items.fields.length));
          }}
        >
          <Plus aria-hidden="true" />
          Adicionar item
        </Button>
      </div>
    </fieldset>
  );
}
