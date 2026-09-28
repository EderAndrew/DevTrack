"use client";

import {
  EXERCISE_SET_MAX,
  EXERCISE_SET_MIN,
  type ExerciseType,
  ExerciseTypeSchema,
  TRICK_QUESTIONS_MAX,
} from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
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
import { NativeSelect } from "@/components/ui/native-select";
import { Radio, RadioGroup } from "@/components/ui/radio";
import {
  EXERCISE_AI_UNAVAILABLE,
  messageForError,
} from "@/lib/messages/error-messages";
import {
  useGenerationAvailability,
  useRequestExerciseBatch,
  useTopicRevision,
  useTopicSubjects,
  useTopicSyllabi,
} from "../hooks/use-exercises";
import {
  DIFFICULTY_LABELS,
  EXERCISE_TYPE_LABELS,
} from "../schemas/exercise-form";
import {
  emptyGenerationForm,
  GenerationFormSchema,
  type GenerationFormValues,
  previewCounts,
  toBatchRequest,
} from "../schemas/generation-form";

const IDS = {
  subjectId: "gerar-disciplina",
  revisionId: "gerar-ementa",
  syllabusItemId: "gerar-topico",
  difficulty: "gerar-dificuldade",
  total: "gerar-total",
  types: "gerar-tipo-OPEN_ANSWER",
  counts: "gerar-quantidade-OPEN_ANSWER",
  trickQuestions: "gerar-pegadinhas",
} as const;
const typeId = (type: ExerciseType) => `gerar-tipo-${type}`;
const countId = (type: ExerciseType) => `gerar-quantidade-${type}`;
const ERROR_ORDER = [
  "syllabusItemId",
  "difficulty",
  "total",
  "types",
  "counts",
  "trickQuestions",
] as const;
const NO_LANGUAGE_HINT =
  "Esta ementa não tem linguagem: defina-a numa nova revisão da ementa para gerar exercícios de código.";

/** A user who can't generate now keeps the manual creation (010/US2-7). */
const BLOCKED = new Set(["AGENT_DISABLED", "MODEL_UNAVAILABLE"]);

/**
 * "Criar com IA" (010/US2, contracts/web-ui.md): the topic of a confirmed syllabus, the difficulty,
 * the total (3–10), the types and their distribution — the server's automatic one previewed, or
 * one per type — and trick questions only with multiple choice. The language is the syllabus'
 * (read-only); without one, code is not offered. The form checks the request with the contract
 * before sending; the batch is then generated in the background.
 */
export function GenerationForm() {
  const router = useRouter();
  const availability = useGenerationAvailability();
  const request = useRequestExerciseBatch();
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [errors, setErrors] = useState<FormError[]>([]);
  const form = useForm<GenerationFormValues>({
    shouldFocusError: false,
    resolver: zodResolver(GenerationFormSchema),
    defaultValues: emptyGenerationForm(),
  });
  const { register, control, setValue, handleSubmit, formState } = form;
  const values = useWatch({ control }) as GenerationFormValues;
  const subjects = useTopicSubjects();
  const syllabi = useTopicSyllabi(values.subjectId);
  const revision = useTopicRevision(values.revisionId || null);
  const language = revision.data?.language ?? null;
  const types = useMemo(() => (Array.isArray(values.types) ? values.types : []), [values.types]);
  const counts = previewCounts(values);
  const multipleChoice = types.includes("MULTIPLE_CHOICE");
  const blocked =
    availability.data !== undefined &&
    BLOCKED.has(availability.data.availability);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision
      ? [{ id: document.confirmedRevision.id, version: document.version }]
      : [],
  );

  // A syllabus without a language can't have code (010/US2-8): the type leaves the request.
  useEffect(() => {
    if (revision.data && !language && types.includes("CODE")) {
      setValue(
        "types",
        types.filter((type) => type !== "CODE"),
      );
    }
  }, [revision.data, language, types, setValue]);

  const errorFor = (field: string) =>
    errors.find((error) => error.fieldId === IDS[field as keyof typeof IDS])
      ?.message;

  const onInvalid = (fieldErrors: FieldErrors<GenerationFormValues>) =>
    setErrors(
      ERROR_ORDER.flatMap((field) => {
        const error = fieldErrors[field] as
          { message?: unknown; root?: { message?: unknown } } | undefined;
        const message = error?.message ?? error?.root?.message;
        return typeof message === "string"
          ? [{ fieldId: IDS[field], message }]
          : [];
      }),
    );

  const onSubmit = handleSubmit(async (formValues) => {
    setErrors([]);
    try {
      await request.mutateAsync(toBatchRequest(formValues, idempotencyKey));
      router.push("/exercicios/lotes?pedido=1");
    } catch (error) {
      setErrors([{ message: messageForError(error) }]);
    }
  }, onInvalid);

  const pending = formState.isSubmitting;

  return (
    <form
      noValidate
      aria-label="Criar exercícios com IA"
      onSubmit={(event) =>
        pending ? event.preventDefault() : void onSubmit(event)
      }
      className="max-w-192"
    >
      {availability.data && availability.data.availability !== "AVAILABLE" ? (
        <Notice role="status">
          <p className="m-0">
            {EXERCISE_AI_UNAVAILABLE}{" "}
            <Link href="/exercicios/novo">Criar manualmente</Link>
          </p>
        </Notice>
      ) : null}
      <ErrorSummary
        errors={errors}
        title="Não foi possível pedir os exercícios"
      />

      <fieldset className="m-0 mb-2 border-0 p-0">
        <legend className="mb-2 text-h3">Tópico</legend>
        <div className="grid gap-x-4 md:grid-cols-2">
          <SelectField
            id={IDS.subjectId}
            label="Disciplina"
            required
            {...register("subjectId", {
              onChange: () => {
                setValue("revisionId", "");
                setValue("syllabusItemId", "");
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
            {...register("revisionId", {
              onChange: () => setValue("syllabusItemId", ""),
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
        <SelectField
          id={IDS.syllabusItemId}
          label="Tópico"
          required
          disabled={values.revisionId === ""}
          error={errorFor("syllabusItemId")}
          {...register("syllabusItemId")}
        >
          <option value="">Escolha o tópico</option>
          {(revision.data?.groups ?? []).map((group) => (
            <optgroup
              key={group.id}
              label={group.title ?? `Grupo ${group.position}`}
            >
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
        {values.revisionId !== "" && revision.data ? (
          <p className="mt-0 mb-4">
            <span className="font-semibold">Linguagem da ementa:</span>{" "}
            {language?.name ?? "Nenhuma"}
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-x-4 md:grid-cols-2">
        <SelectField
          id={IDS.difficulty}
          label="Dificuldade"
          required
          error={errorFor("difficulty")}
          {...register("difficulty")}
        >
          <option value="">Escolha a dificuldade</option>
          {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={IDS.total}
          label="Quantidade de exercícios"
          required
          error={errorFor("total")}
          {...register("total")}
        >
          {Array.from(
            { length: EXERCISE_SET_MAX - EXERCISE_SET_MIN + 1 },
            (_, index) => String(EXERCISE_SET_MIN + index),
          ).map((total) => (
            <option key={total} value={total}>
              {total}
            </option>
          ))}
        </SelectField>
      </div>

      <fieldset
        className="m-0 mb-4 border-0 p-0"
        aria-describedby={
          errorFor("types") ? fieldErrorId(IDS.types) : undefined
        }
      >
        <legend className="mb-2 text-label text-foreground">Tipos</legend>
        <div className="flex flex-col gap-2">
          {ExerciseTypeSchema.options.map((type) => {
            const disabled =
              type === "CODE" && revision.data !== undefined && !language;
            return (
              <div key={type} className="flex items-center gap-2">
                <Checkbox
                  id={typeId(type)}
                  value={type}
                  disabled={disabled}
                  aria-invalid={errorFor("types") ? true : undefined}
                  aria-describedby={
                    disabled ? `${typeId(type)}-dica` : undefined
                  }
                  {...register("types")}
                />
                <Label htmlFor={typeId(type)}>
                  {EXERCISE_TYPE_LABELS[type]}
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
            id="gerar-distribuicao-auto"
            value="AUTO"
            {...register("distributionMode")}
          />
          <Label htmlFor="gerar-distribuicao-auto">
            Distribuir automaticamente
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Radio
            id="gerar-distribuicao-manual"
            value="MANUAL"
            {...register("distributionMode")}
          />
          <Label htmlFor="gerar-distribuicao-manual">
            Definir quantidade por tipo
          </Label>
        </div>
      </RadioGroup>
      {values.distributionMode === "AUTO" ? (
        <p className="mt-0 mb-4" aria-live="polite">
          {types.length === 0
            ? "Escolha os tipos para ver a distribuição."
            : `Serão gerados: ${ExerciseTypeSchema.options
                .filter((type) => types.includes(type))
                .map((type) => `${EXERCISE_TYPE_LABELS[type]} ${counts[type]}`)
                .join(" · ")}.`}
        </p>
      ) : (
        <div className="mb-4 grid gap-x-4 md:grid-cols-3">
          {ExerciseTypeSchema.options
            .filter((type) => types.includes(type))
            .map((type) => (
              <FormField
                key={type}
                id={countId(type)}
                label={EXERCISE_TYPE_LABELS[type]}
                error={type === types[0] ? errorFor("counts") : undefined}
              >
                {(controlProps) => (
                  <Input
                    type="number"
                    min={1}
                    max={EXERCISE_SET_MAX}
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
        {Array.from({ length: TRICK_QUESTIONS_MAX + 1 }, (_, index) =>
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
            Gerar exercícios
          </Button>
        ) : (
          <SubmitButton pending={pending} pendingLabel="Enviando…">
            Gerar exercícios
          </SubmitButton>
        )}
        <Button asChild variant="ghost">
          <Link href="/exercicios">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

interface SelectFieldProps extends Omit<ComponentProps<"select">, "id"> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}

function SelectField({
  id,
  label,
  hint,
  error,
  required,
  children,
  ...props
}: SelectFieldProps) {
  return (
    <FormField
      id={id}
      label={label}
      description={hint}
      error={error}
      required={required}
    >
      {(control) => (
        <NativeSelect {...control} {...props} className="w-full">
          {children}
        </NativeSelect>
      )}
    </FormField>
  );
}
