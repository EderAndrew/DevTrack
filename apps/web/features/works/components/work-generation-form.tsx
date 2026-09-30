"use client";

import {
  WORK_QUESTION_TOPICS_MAX,
  WORK_QUESTIONS_MAX,
  WORK_QUESTIONS_MIN,
  WORK_TOPICS_MAX,
  WORK_TRICK_QUESTIONS_MAX,
  WorkDifficultySchema,
  type WorkQuestionType,
  WorkQuestionTypeSchema,
} from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type FieldErrors, useForm, useWatch } from "react-hook-form";
import {
  ErrorSummary,
  type FormError,
  SubmitButton,
} from "@/components/shared";
import { Notice } from "@/components/shared/notice";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField, fieldErrorId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  messageForError,
  WORK_AI_UNAVAILABLE,
} from "@/lib/messages/error-messages";
import {
  useRequestWorkGeneration,
  useWorkGenerationAvailability,
  useWorkRevision,
  useWorkSubjects,
  useWorkSyllabi,
} from "../hooks/use-works";
import {
  WORK_DIFFICULTY_LABELS,
  WORK_QUESTION_TYPE_LABELS,
} from "../schemas/work-form";
import {
  emptyWorkGenerationForm,
  GENERATION_FIELDS,
  type GenerationField,
  previewWorkCounts,
  TOPICS_PER_QUESTION,
  toWorkGenerationRequest,
  WorkGenerationFormSchema,
  type WorkGenerationFormValues,
} from "../schemas/work-generation-form";
import { InputField, SelectField, TextareaField } from "./form-fields";

const typeId = (type: WorkQuestionType) => `gerar-trabalho-tipo-${type}`;
const countId = (type: WorkQuestionType) => `gerar-trabalho-quantidade-${type}`;
const topicId = (itemId: string) => `gerar-trabalho-topico-${itemId}`;

const IDS: Record<GenerationField, string> & { revisionId: string } = {
  subjectId: "gerar-trabalho-disciplina",
  revisionId: "gerar-trabalho-ementa",
  syllabusItemIds: "gerar-trabalho-topicos",
  title: "gerar-trabalho-titulo",
  description: "gerar-trabalho-descricao",
  difficulty: "gerar-trabalho-dificuldade",
  totalGrade: "gerar-trabalho-nota",
  total: "gerar-trabalho-total",
  types: typeId("OPEN_ANSWER"),
  counts: countId("OPEN_ANSWER"),
  trickQuestions: "gerar-trabalho-pegadinhas",
};

const NO_LANGUAGE_HINT =
  "Esta ementa não tem linguagem: defina-a numa nova revisão da ementa para gerar questões de código.";

/** A teacher who can't generate now keeps the manual creation (011/US3-8). */
const BLOCKED = new Set(["AGENT_DISABLED", "MODEL_UNAVAILABLE"]);

/**
 * "Criar trabalho com IA" (011/US3, contracts/web-ui.md): the subject, a confirmed syllabus and
 * 1–10 of its topics by group, the work's title, description, difficulty and total grade, the
 * total (1–10), the types and their distribution — the server's automatic one previewed, or one
 * per type — and trick questions only with multiple choice. The language is the syllabus'
 * (read-only); without one, code is not offered. The contract checks the request before it is
 * sent; the work is then generated in the background.
 */
export function WorkGenerationForm() {
  const router = useRouter();
  const availability = useWorkGenerationAvailability();
  const request = useRequestWorkGeneration();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FormError[]>([]);
  const [fieldMessages, setFieldMessages] = useState<
    Partial<Record<GenerationField, string>>
  >({});
  const form = useForm<WorkGenerationFormValues>({
    shouldFocusError: false,
    resolver: zodResolver(WorkGenerationFormSchema),
    defaultValues: emptyWorkGenerationForm(),
  });
  const { register, control, setValue, handleSubmit, formState } = form;
  const values = useWatch({ control }) as WorkGenerationFormValues;
  const subjects = useWorkSubjects();
  const syllabi = useWorkSyllabi(values.subjectId);
  const revision = useWorkRevision(values.revisionId || null);
  const language = revision.data?.language ?? null;
  const types = useMemo(
    () => (Array.isArray(values.types) ? values.types : []),
    [values.types],
  );
  const selected = useMemo(
    () => (Array.isArray(values.syllabusItemIds) ? values.syllabusItemIds : []),
    [values.syllabusItemIds],
  );
  const counts = previewWorkCounts(values);
  const total = Number(values.total) || 0;
  const multipleChoice = types.includes("MULTIPLE_CHOICE");
  const tooManyTopics = selected.length > WORK_QUESTION_TOPICS_MAX * total;
  const blocked =
    availability.data !== undefined &&
    BLOCKED.has(availability.data.availability);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision
      ? [{ id: document.confirmedRevision.id, version: document.version }]
      : [],
  );

  // A syllabus without a language can't have code (011/US3-9): the type leaves the request.
  useEffect(() => {
    if (revision.data && !language && types.includes("CODE")) {
      setValue(
        "types",
        types.filter((type) => type !== "CODE"),
      );
    }
  }, [revision.data, language, types, setValue]);

  const errorFor = (field: GenerationField) => fieldMessages[field];

  const onInvalid = (fieldErrors: FieldErrors<WorkGenerationFormValues>) => {
    const messages: Partial<Record<GenerationField, string>> = {};
    for (const field of GENERATION_FIELDS) {
      const error = fieldErrors[field] as
        | { message?: unknown; root?: { message?: unknown } }
        | undefined;
      const message = error?.message ?? error?.root?.message;
      if (typeof message === "string") messages[field] = message;
    }
    setFieldMessages(messages);
    // The summary links the topics to the first checkbox, or to the syllabus while none is shown.
    const firstTopic = revision.data?.groups[0]?.items[0]?.id;
    setErrors(
      GENERATION_FIELDS.flatMap((field) => {
        const message = messages[field];
        if (message === undefined) return [];
        const fieldId =
          field === "syllabusItemIds"
            ? firstTopic
              ? topicId(firstTopic)
              : IDS.revisionId
            : IDS[field];
        return [{ fieldId, message }];
      }),
    );
  };

  const onSubmit = handleSubmit(async (formValues) => {
    setErrors([]);
    setFieldMessages({});
    try {
      const created = await request.mutateAsync(
        toWorkGenerationRequest(formValues, idempotencyKey),
      );
      router.push(`/trabalhos/pedidos/${created.id}`);
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  const topicsError = errorFor("syllabusItemIds");
  const toggleTopic = (itemId: string, checked: boolean) =>
    setValue(
      "syllabusItemIds",
      checked ? [...selected, itemId] : selected.filter((id) => id !== itemId),
      { shouldDirty: true },
    );
  const pending = formState.isSubmitting;

  return (
    <form
      noValidate
      aria-label="Criar trabalho com IA"
      onSubmit={(event) =>
        pending ? event.preventDefault() : void onSubmit(event)
      }
      className="max-w-192"
    >
      {availability.data && availability.data.availability !== "AVAILABLE" ? (
        <Notice role="status">
          <p className="m-0">
            {WORK_AI_UNAVAILABLE}{" "}
            <Link href="/trabalhos/novo">Criar trabalho manualmente</Link>
          </p>
        </Notice>
      ) : null}
      <ErrorSummary errors={errors} title="Não foi possível pedir o trabalho" />

      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-2 text-h3">Tópicos</legend>
        <div className="grid gap-x-4 md:grid-cols-2">
          <SelectField
            id={IDS.subjectId}
            label="Disciplina"
            required
            error={errorFor("subjectId")}
            {...register("subjectId", {
              onChange: () => {
                setValue("revisionId", "");
                setValue("syllabusItemIds", []);
              },
            })}
          >
            <option value="">Escolha a disciplina</option>
            {(subjects.data?.items ?? []).map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={IDS.revisionId}
            label="Ementa"
            required
            disabled={values.subjectId === ""}
            hint={
              values.subjectId !== "" &&
              syllabi.isSuccess &&
              confirmed.length === 0
                ? "Esta disciplina não tem ementa confirmada."
                : undefined
            }
            error={revision.data ? undefined : topicsError}
            {...register("revisionId", {
              onChange: () => setValue("syllabusItemIds", []),
            })}
          >
            <option value="">Escolha a ementa</option>
            {confirmed.map((syllabus) => (
              <option key={syllabus.id} value={syllabus.id}>
                Versão {syllabus.version}
              </option>
            ))}
          </SelectField>
        </div>
        {revision.data ? (
          <div
            role="group"
            aria-label="Tópicos do trabalho"
            aria-describedby={[
              `${IDS.syllabusItemIds}-dica`,
              topicsError ? fieldErrorId(IDS.syllabusItemIds) : null,
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <FieldMessage id={`${IDS.syllabusItemIds}-dica`} className="mb-2">
              De 1 a {WORK_TOPICS_MAX} tópicos, até {WORK_QUESTION_TOPICS_MAX}{" "}
              por questão. {selected.length} de {WORK_TOPICS_MAX} escolhidos.
            </FieldMessage>
            {revision.data.groups.map((group) => (
              <fieldset key={group.id} className="m-0 mb-3 border-0 p-0">
                <legend className="mb-1 text-label text-foreground">
                  {group.title ?? `Grupo ${group.position}`}
                </legend>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => {
                    const checked = selected.includes(item.id);
                    return (
                      <div key={item.id} className="flex items-center gap-2">
                        <Checkbox
                          id={topicId(item.id)}
                          checked={checked}
                          disabled={
                            !checked && selected.length >= WORK_TOPICS_MAX
                          }
                          aria-invalid={topicsError ? true : undefined}
                          onChange={(event) =>
                            toggleTopic(item.id, event.target.checked)
                          }
                        />
                        <Label htmlFor={topicId(item.id)}>{item.text}</Label>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {tooManyTopics ? (
              <p className="mt-0 mb-2" role="status">
                {TOPICS_PER_QUESTION} Com {total}{" "}
                {total === 1 ? "questão" : "questões"}, escolha até{" "}
                {WORK_QUESTION_TOPICS_MAX * total} tópicos.
              </p>
            ) : null}
            {topicsError ? (
              <FieldMessage
                id={fieldErrorId(IDS.syllabusItemIds)}
                tone="error"
                className="mb-2"
              >
                {topicsError}
              </FieldMessage>
            ) : null}
            <p className="mt-0 mb-4">
              <span className="font-semibold">Linguagem da ementa:</span>{" "}
              {language?.name ?? "Nenhuma"}
            </p>
          </div>
        ) : null}
      </fieldset>

      <InputField
        id={IDS.title}
        label="Título"
        required
        error={errorFor("title")}
        {...register("title")}
      />
      <TextareaField
        id={IDS.description}
        label="Descrição"
        hint="Opcional."
        error={errorFor("description")}
        {...register("description")}
      />
      <div className="grid gap-x-4 md:grid-cols-3">
        <SelectField
          id={IDS.difficulty}
          label="Dificuldade"
          required
          error={errorFor("difficulty")}
          {...register("difficulty")}
        >
          <option value="">Escolha a dificuldade</option>
          {WorkDifficultySchema.options.map((option) => (
            <option key={option} value={option}>
              {WORK_DIFFICULTY_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <InputField
          id={IDS.totalGrade}
          label="Nota total"
          required
          inputMode="decimal"
          hint="Ex.: 10 ou 7,5."
          error={errorFor("totalGrade")}
          {...register("totalGrade")}
        />
        <SelectField
          id={IDS.total}
          label="Quantidade de questões"
          required
          error={errorFor("total")}
          {...register("total")}
        >
          {Array.from(
            { length: WORK_QUESTIONS_MAX - WORK_QUESTIONS_MIN + 1 },
            (_, index) => String(WORK_QUESTIONS_MIN + index),
          ).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset
        className="m-0 mb-4 border-0 p-0"
        aria-describedby={errorFor("types") ? fieldErrorId(IDS.types) : undefined}
      >
        <legend className="mb-2 text-label text-foreground">Tipos</legend>
        <div className="flex flex-col gap-2">
          {WorkQuestionTypeSchema.options.map((type) => {
            const disabled =
              type === "CODE" && revision.data !== undefined && !language;
            return (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={typeId(type)}
                  value={type}
                  disabled={disabled}
                  aria-invalid={errorFor("types") ? true : undefined}
                  aria-describedby={disabled ? `${typeId(type)}-dica` : undefined}
                  {...register("types")}
                />
                <Label htmlFor={typeId(type)}>
                  {WORK_QUESTION_TYPE_LABELS[type]}
                </Label>
                {disabled ? (
                  <FieldMessage id={`${typeId(type)}-dica`} className="ml-2">
                    {NO_LANGUAGE_HINT}
                  </FieldMessage>
                ) : null}
              </div>
            );
          })}
        </div>
        {errorFor("types") ? (
          <FieldMessage
            id={fieldErrorId(IDS.types)}
            tone="error"
            className="mt-2"
          >
            {errorFor("types")}
          </FieldMessage>
        ) : null}
      </fieldset>

      <RadioGroup legend="Distribuição" className="mb-4">
        <div className="flex items-center gap-2">
          <Radio
            id="gerar-trabalho-distribuicao-auto"
            value="AUTO"
            {...register("distributionMode")}
          />
          <Label htmlFor="gerar-trabalho-distribuicao-auto">
            Distribuir automaticamente
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Radio
            id="gerar-trabalho-distribuicao-manual"
            value="MANUAL"
            {...register("distributionMode")}
          />
          <Label htmlFor="gerar-trabalho-distribuicao-manual">
            Definir quantidade por tipo
          </Label>
        </div>
      </RadioGroup>
      {values.distributionMode === "AUTO" ? (
        <p className="mt-0 mb-4" aria-live="polite">
          {types.length === 0
            ? "Escolha os tipos para ver a distribuição."
            : `Serão geradas: ${WorkQuestionTypeSchema.options
                .filter((type) => types.includes(type))
                .map((type) => `${WORK_QUESTION_TYPE_LABELS[type]} ${counts[type]}`)
                .join(" · ")}.`}
        </p>
      ) : (
        <div className="mb-4 grid gap-x-4 md:grid-cols-3">
          {WorkQuestionTypeSchema.options
            .filter((type) => types.includes(type))
            .map((type) => (
              <FormField
                key={type}
                id={countId(type)}
                label={WORK_QUESTION_TYPE_LABELS[type]}
                error={type === types[0] ? errorFor("counts") : undefined}
              >
                {(controlProps) => (
                  <Input
                    type="number"
                    min={1}
                    max={WORK_QUESTIONS_MAX}
                    inputMode="numeric"
                    {...controlProps}
                    {...register(`counts.${type}`)}
                  />
                )}
              </FormField>
            ))}
        </div>
      )}

      <SelectField
        id={IDS.trickQuestions}
        label="Pegadinhas"
        hint={
          multipleChoice
            ? "Só em questões de múltipla escolha."
            : "Disponível com Múltipla escolha."
        }
        disabled={!multipleChoice}
        error={errorFor("trickQuestions")}
        {...register("trickQuestions")}
      >
        {Array.from({ length: WORK_TRICK_QUESTIONS_MAX + 1 }, (_, index) =>
          String(index),
        ).map((count) => (
          <option key={count} value={count}>
            {count}
          </option>
        ))}
      </SelectField>

      <div className="flex flex-wrap gap-2">
        {blocked ? (
          <Button type="submit" disabled>
            Gerar trabalho
          </Button>
        ) : (
          <SubmitButton pending={pending} pendingLabel="Enviando…">
            Gerar trabalho
          </SubmitButton>
        )}
        <Button asChild variant="ghost">
          <Link href="/trabalhos">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}
