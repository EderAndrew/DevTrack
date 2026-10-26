"use client";

import {
  ALTERNATIVES_MAX,
  ALTERNATIVES_MIN,
  type CreateExerciseRequest,
  EXERCISE_SET_MAX,
  EXERCISE_SET_MIN,
  type ManualExerciseStatus,
} from "@repo/contracts";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ComponentProps, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type FieldErrors, useFieldArray, useForm, type UseFormReturn, useWatch } from "react-hook-form";
import { ErrorSummary, type FormError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField, fieldErrorId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Radio } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { messageForError } from "@/lib/messages/error-messages";
import {
  useCreateExercise,
  useCreateExerciseSet,
  useProgrammingLanguages,
  useTopicRevision,
  useTopicSubjects,
  useTopicSyllabi,
} from "../hooks/use-exercises";
import {
  COGNITIVE_OBJECTIVE_LABELS,
  DIFFICULTY_LABELS,
  EXERCISE_TYPE_LABELS,
  type ExerciseCardValues,
  type ExerciseFormValues,
  emptyAlternative,
  emptyCard,
  exerciseFormSchema,
  TEST_CASES_NOT_ALLOWED_MESSAGE,
  EXPECTED_OUTPUT_MESSAGE,
  toExerciseInput,
} from "../schemas/exercise-form";
import { codeExerciseExamples } from "../schemas/code-examples";
import { exerciseRuleViolations } from "../api/exercises";
import { CodeField } from "./code-field";
import { ExerciseTestCases, testCaseFieldId, testCasesSectionId } from "./exercise-test-cases";

type Form = UseFormReturn<ExerciseFormValues>;
type CardField = Exclude<keyof ExerciseCardValues, "alternatives" | "testCases">;

const FIELD_SLUGS: Record<CardField, string> = {
  type: "tipo",
  statement: "enunciado",
  difficulty: "dificuldade",
  cognitiveObjective: "objetivo",
  subjectId: "disciplina",
  revisionId: "ementa",
  syllabusItemId: "topico",
  expectedAnswer: "resposta",
  correctAlternative: "correta",
  isTrickQuestion: "pegadinha",
  instructions: "instrucoes",
  starterCode: "codigo-inicial",
  expectedSolution: "solucao",
  languageId: "linguagem",
  explanation: "explicacao",
};

/** Id of a card's field: the label's `for` and the target of the error summary's links. */
export const cardFieldId = (card: number, field: CardField) => `exercicio-${card + 1}-${FIELD_SLUGS[field]}`;
export const alternativeFieldId = (card: number, alternative: number) => `exercicio-${card + 1}-alternativa-${alternative + 1}`;
const correctRadioId = (card: number, alternative: number) => `${alternativeFieldId(card, alternative)}-correta`;
const alternativesErrorId = (card: number) => `exercicio-${card + 1}-alternativas-erro`;
const ADD_CARD_ID = "exercicio-adicionar";
/** Prefix of a card's ids (`exercicio-2`), shared with its "Casos de teste". */
const cardPrefix = (card: number) => `exercicio-${card + 1}`;

/** The order of a card's fields on screen, which the error summary follows. */
const FIELD_ORDER: CardField[] = [
  "type",
  "statement",
  "difficulty",
  "cognitiveObjective",
  "syllabusItemId",
  "expectedAnswer",
  "correctAlternative",
  "instructions",
  "starterCode",
  "expectedSolution",
  "languageId",
  "explanation",
];

interface FormErrors {
  summary: FormError[];
  /** Message shown next to each field, by field id. */
  fields: Record<string, string>;
}
const NO_ERRORS: FormErrors = { summary: [], fields: {} };

type MessageTree = { message?: unknown; root?: { message?: unknown } } | undefined;
const messageOf = (error: MessageTree) => {
  const message = error?.message ?? error?.root?.message;
  return typeof message === "string" ? message : undefined;
};

/** The errors of the cards in screen order, each with the card it belongs to. */
function collectErrors(fieldErrors: FieldErrors<ExerciseFormValues>, single: boolean): FormErrors {
  const result: FormErrors = { summary: [], fields: {} };
  const add = (fieldId: string, message: string, card: number) => {
    result.fields[fieldId] = message;
    result.summary.push({ fieldId, message: single ? message : `Exercício ${card + 1}: ${message}` });
  };
  const cards = fieldErrors.cards;
  const rootMessage = messageOf(cards as MessageTree);
  if (rootMessage) result.summary.push({ message: rootMessage });
  if (!Array.isArray(cards)) return result;
  cards.forEach((card: FieldErrors<ExerciseCardValues> | undefined, index) => {
    if (!card) return;
    for (const field of FIELD_ORDER) {
      if (field === "correctAlternative") {
        const alternatives = card.alternatives as unknown as MessageTree[] | MessageTree;
        if (Array.isArray(alternatives)) {
          alternatives.forEach((alternative, position) => {
            const message = messageOf((alternative as { text?: MessageTree } | undefined)?.text);
            if (message) add(alternativeFieldId(index, position), message, index);
          });
        }
        const duplicate = messageOf(alternatives as MessageTree);
        if (duplicate) {
          result.fields[alternativesErrorId(index)] = duplicate;
          result.summary.push({ fieldId: alternativeFieldId(index, 0), message: single ? duplicate : `Exercício ${index + 1}: ${duplicate}` });
        }
      }
      if (field === "languageId") {
        // 019: the test cases come right after the language.
        const testCases = card.testCases as unknown as ({ expectedOutput?: MessageTree } | undefined)[] | undefined;
        if (Array.isArray(testCases)) {
          testCases.forEach((testCase, position) => {
            const caseMessage = messageOf(testCase?.expectedOutput);
            if (caseMessage) add(testCaseFieldId(cardPrefix(index), position, "expectedOutput"), caseMessage, index);
          });
        }
      }
      const message = messageOf(card[field] as MessageTree);
      if (!message) continue;
      if (field === "correctAlternative") {
        result.fields[cardFieldId(index, field)] = message;
        result.summary.push({ fieldId: correctRadioId(index, 0), message: single ? message : `Exercício ${index + 1}: ${message}` });
      } else {
        add(cardFieldId(index, field), message, index);
      }
    }
  });
  return result;
}

/**
 * The server's `422 EXERCISE_RULES` (019) on the fields it names: a case's expected output, or the
 * whole list; null for any other error.
 */
function apiRuleErrors(error: unknown, single: boolean): FormErrors | null {
  const violations = exerciseRuleViolations(error);
  if (violations.length === 0) return null;
  const result: FormErrors = { summary: [], fields: {} };
  for (const { position, field, reason } of violations) {
    const caseMatch = /^testCases\.(\d+)\.expectedOutput$/.exec(field);
    const fieldId = caseMatch ? testCaseFieldId(cardPrefix(position), Number(caseMatch[1]), "expectedOutput") : testCasesSectionId(cardPrefix(position));
    const message = reason === "TEST_CASE_EXPECTED_OUTPUT" ? EXPECTED_OUTPUT_MESSAGE : TEST_CASES_NOT_ALLOWED_MESSAGE;
    result.fields[fieldId] = message;
    result.summary.push({ fieldId, message: single ? message : `Exercício ${position + 1}: ${message}` });
  }
  return result;
}

export interface ExerciseFormProps {
  /** `set`: 3–10 cards ("Criar manualmente"); `single`: one exercise ("Novo exercício", 010/US5-6). */
  mode: "set" | "single";
}

/**
 * Manual creation of exercises (010/US1): each card has the type, statement, difficulty, cognitive
 * objective, an optional topic (Disciplina → Ementa → Tópico) and the type's fields. The form
 * checks every card with the contract's rules before sending; "Salvar como rascunho" keeps them
 * as DRAFT, "Salvar no banco" as APPROVED (010/FR-011). No AI is involved.
 */
export function ExerciseForm({ mode }: ExerciseFormProps) {
  const single = mode === "single";
  const [min, max] = single ? [1, 1] : [EXERCISE_SET_MIN, EXERCISE_SET_MAX];
  const router = useRouter();
  const createSet = useCreateExerciseSet();
  const createOne = useCreateExercise();
  const schema = useMemo(() => exerciseFormSchema(min, max), [min, max]);
  const form = useForm<ExerciseFormValues>({
    // Focus goes to the ErrorSummary, which links to each field (FR-075).
    shouldFocusError: false,
    resolver: zodResolver(schema),
    defaultValues: { cards: Array.from({ length: min }, emptyCard) },
  });
  const cards = useFieldArray({ control: form.control, name: "cards" });
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });

  const onInvalid = (fieldErrors: FieldErrors<ExerciseFormValues>) => setErrors(collectErrors(fieldErrors, single));

  const save = (status: ManualExerciseStatus) =>
    form.handleSubmit(async ({ cards: values }) => {
      setErrors(NO_ERRORS);
      try {
        if (single) {
          await createOne.mutateAsync({ ...toExerciseInput(values[0]!), status } as CreateExerciseRequest);
          router.push("/exercicios?criados=1");
        } else {
          const created = await createSet.mutateAsync({ exercises: values.map(toExerciseInput), status });
          router.push(`/exercicios?criados=${created.items.length}`);
        }
      } catch (error) {
        setErrors(apiRuleErrors(error, single) ?? { summary: [{ message: messageForError(error) }], fields: {} });
      }
    }, onInvalid);

  const addCard = () => {
    cards.append(emptyCard(), { shouldFocus: false });
    pendingFocus.current = cardFieldId(cards.fields.length, "type");
    setAnnouncement(`Exercício ${cards.fields.length + 1} adicionado.`);
  };
  const removeCard = (index: number) => {
    cards.remove(index);
    pendingFocus.current = ADD_CARD_ID;
    setAnnouncement(`Exercício ${index + 1} removido.`);
  };

  const pending = form.formState.isSubmitting;
  const errorFor = (fieldId: string) => errors.fields[fieldId];

  return (
    <form
      noValidate
      aria-label={single ? "Novo exercício" : "Criar exercícios"}
      onSubmit={(event) => (pending ? event.preventDefault() : void save("APPROVED")(event))}
    >
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <ErrorSummary errors={errors.summary} title={single ? "Não foi possível salvar o exercício" : "Não foi possível salvar os exercícios"} />
      {single ? null : (
        <p className="mt-0 mb-4 text-text-secondary">
          De {EXERCISE_SET_MIN} a {EXERCISE_SET_MAX} exercícios; todos são salvos juntos.
        </p>
      )}
      {cards.fields.map((field, index) => (
        <ExerciseCard
          key={field.id}
          index={index}
          heading={single ? "Exercício" : `Exercício ${index + 1}`}
          form={form}
          errorFor={errorFor}
          onRemove={!single && cards.fields.length > min ? () => removeCard(index) : undefined}
        />
      ))}
      {single ? null : (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Button id={ADD_CARD_ID} type="button" variant="secondary" onClick={addCard} disabled={cards.fields.length >= max}>
            <Plus aria-hidden="true" />
            Adicionar exercício
          </Button>
          <span className="text-body-sm text-text-secondary">
            {cards.fields.length} de {max}
          </span>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel="Salvando…">
          Salvar no banco
        </SubmitButton>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => void save("DRAFT")()}>
          Salvar como rascunho
        </Button>
        <Button asChild variant="ghost">
          <Link href="/exercicios">Cancelar</Link>
        </Button>
      </div>
    </form>
  );
}

interface CardProps {
  index: number;
  heading: string;
  form: Form;
  errorFor: (fieldId: string) => string | undefined;
  onRemove?: () => void;
}

function ExerciseCard({ index, heading, form, errorFor, onRemove }: CardProps) {
  const { register, control } = form;
  const [type, languageId] = useWatch({ control, name: [`cards.${index}.type`, `cards.${index}.languageId`] });
  const languages = useProgrammingLanguages();
  // The chosen language's grammar colors the code fields and changes with it (014/US3-2).
  const language = languages.data?.find((item) => item.id === languageId);
  const highlight = language?.highlight ?? null;
  // A CODE card shows an example in each empty field; the other types keep their fields blank.
  const examples = type === "CODE" ? codeExerciseExamples(highlight) : null;
  const id = (field: CardField) => cardFieldId(index, field);
  const headingId = `exercicio-${index + 1}-titulo`;

  return (
    <Card aria-labelledby={headingId} role="group" className="mb-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={headingId} className="m-0 text-h3">
          {heading}
        </h2>
        {onRemove ? (
          <Button type="button" variant="secondary" size="sm" onClick={onRemove}>
            <Trash2 aria-hidden="true" />
            Remover{" "}<span className="sr-only">{heading}</span>
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        <SelectField id={id("type")} label="Tipo" required error={errorFor(id("type"))} {...register(`cards.${index}.type`)}>
          {Object.entries(EXERCISE_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </SelectField>
        <TextareaField
          id={id("statement")}
          label="Enunciado"
          required
          error={errorFor(id("statement"))}
          placeholder={examples?.statement}
          {...register(`cards.${index}.statement`)}
        />
        <div className="grid gap-x-4 md:grid-cols-2">
          <SelectField id={id("difficulty")} label="Dificuldade" required error={errorFor(id("difficulty"))} {...register(`cards.${index}.difficulty`)}>
            <option value="">Escolha a dificuldade</option>
            {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={id("cognitiveObjective")}
            label="Objetivo cognitivo"
            required
            error={errorFor(id("cognitiveObjective"))}
            {...register(`cards.${index}.cognitiveObjective`)}
          >
            <option value="">Escolha o objetivo</option>
            {Object.entries(COGNITIVE_OBJECTIVE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
        </div>
        <TopicPicker index={index} form={form} />

        {type === "OPEN_ANSWER" ? (
          <TextareaField
            id={id("expectedAnswer")}
            label="Resposta esperada"
            required
            error={errorFor(id("expectedAnswer"))}
            {...register(`cards.${index}.expectedAnswer`)}
          />
        ) : null}

        {type === "MULTIPLE_CHOICE" ? (
          <>
            <AlternativesFields index={index} form={form} errorFor={errorFor} />
            <div className="mb-4 flex items-center gap-2">
              <Checkbox id={id("isTrickQuestion")} {...register(`cards.${index}.isTrickQuestion`)} />
              <Label htmlFor={id("isTrickQuestion")}>Pegadinha</Label>
            </div>
          </>
        ) : null}

        {type === "CODE" ? (
          <>
            <TextareaField
              id={id("instructions")}
              label="Instruções"
              required
              error={errorFor(id("instructions"))}
              placeholder={examples?.instructions}
              {...register(`cards.${index}.instructions`)}
            />
            <CodeField
              id={id("starterCode")}
              label="Código inicial"
              hint="Opcional."
              control={control}
              name={`cards.${index}.starterCode`}
              highlight={highlight}
              placeholder={examples?.starterCode}
            />
            <CodeField
              id={id("expectedSolution")}
              label="Solução esperada"
              required
              error={errorFor(id("expectedSolution"))}
              control={control}
              name={`cards.${index}.expectedSolution`}
              highlight={highlight}
              placeholder={examples?.expectedSolution}
            />
            <SelectField
              id={id("languageId")}
              label="Linguagem"
              required
              hint={languages.isError ? "Não foi possível carregar as linguagens." : executionHint(language?.execution)}
              error={errorFor(id("languageId"))}
              {...register(`cards.${index}.languageId`)}
            >
              <option value="">Escolha a linguagem</option>
              {(languages.data ?? []).map((language) => (
                <option key={language.id} value={language.id}>
                  {language.name}
                </option>
              ))}
            </SelectField>
            <ExerciseTestCases
              control={control}
              register={register}
              name={`cards.${index}.testCases`}
              idPrefix={cardPrefix(index)}
              errorFor={errorFor}
              placeholders={examples?.testCases}
            />
          </>
        ) : null}

        <TextareaField
          id={id("explanation")}
          label="Explicação"
          hint="Por que a resposta é essa. Nunca aparece para o aluno."
          required
          error={errorFor(id("explanation"))}
          placeholder={examples?.explanation}
          {...register(`cards.${index}.explanation`)}
        />
      </CardContent>
    </Card>
  );
}

/**
 * Disciplina → Ementa (confirmed versions) → Tópico, all optional. Choosing a topic brings the
 * syllabus' language into the card's "Linguagem" (010/FR-040); the teacher can change it.
 */
function TopicPicker({ index, form }: { index: number; form: Form }) {
  const { register, control, setValue } = form;
  const [subjectId, revisionId] = useWatch({ control, name: [`cards.${index}.subjectId`, `cards.${index}.revisionId`] });
  const subjects = useTopicSubjects();
  const syllabi = useTopicSyllabi(subjectId);
  const revision = useTopicRevision(revisionId || null);
  const confirmed = (syllabi.data?.items ?? []).flatMap((document) =>
    document.confirmedRevision ? [{ id: document.confirmedRevision.id, version: document.version }] : [],
  );
  const id = (field: CardField) => cardFieldId(index, field);

  const clear = (...fields: ("revisionId" | "syllabusItemId")[]) => {
    for (const field of fields) setValue(`cards.${index}.${field}`, "");
  };

  return (
    <fieldset className="m-0 mb-2 border-0 p-0">
      <legend className="mb-2 text-label text-foreground">Tópico da ementa (opcional)</legend>
      <div className="grid gap-x-4 md:grid-cols-3">
        <SelectField id={id("subjectId")} label="Disciplina" {...register(`cards.${index}.subjectId`, { onChange: () => clear("revisionId", "syllabusItemId") })}>
          <option value="">Nenhuma</option>
          {(subjects.data?.items ?? []).map((subject) => (
            <option key={subject.id} value={subject.id}>
              {subject.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={id("revisionId")}
          label="Ementa"
          disabled={subjectId === ""}
          hint={subjectId !== "" && syllabi.isSuccess && confirmed.length === 0 ? "Esta disciplina não tem ementa confirmada." : undefined}
          {...register(`cards.${index}.revisionId`, { onChange: () => clear("syllabusItemId") })}
        >
          <option value="">Escolha a ementa</option>
          {confirmed.map((syllabus) => (
            <option key={syllabus.id} value={syllabus.id}>
              Versão {syllabus.version}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={id("syllabusItemId")}
          label="Tópico"
          disabled={revisionId === ""}
          {...register(`cards.${index}.syllabusItemId`, {
            onChange: (event: { target: { value: string } }) => {
              const language = revision.data?.language;
              if (event.target.value !== "" && language) setValue(`cards.${index}.languageId`, language.id);
            },
          })}
        >
          <option value="">Nenhum</option>
          {(revision.data?.groups ?? []).map((group) => (
            <optgroup key={group.id} label={group.title ?? `Grupo ${group.position}`}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.text}
                </option>
              ))}
            </optgroup>
          ))}
        </SelectField>
      </div>
    </fieldset>
  );
}

/** 3–5 alternatives in presentation order, exactly one marked "Correta" (010/FR-004). */
function AlternativesFields({ index, form, errorFor }: { index: number; form: Form; errorFor: CardProps["errorFor"] }) {
  const { register, control, getValues, setValue } = form;
  // `keyName`: the field array's own ids must not replace the alternatives' `key`.
  const alternatives = useFieldArray({ control, name: `cards.${index}.alternatives`, keyName: "fieldId" });
  const correctError = errorFor(cardFieldId(index, "correctAlternative"));
  const duplicateError = errorFor(alternativesErrorId(index));
  const correctErrorId = fieldErrorId(cardFieldId(index, "correctAlternative"));

  const remove = (position: number) => {
    // The mark is the alternative's key, so it follows its alternative; removing the correct one clears it.
    if (getValues(`cards.${index}.correctAlternative`) === alternatives.fields[position]!.key) setValue(`cards.${index}.correctAlternative`, "");
    alternatives.remove(position);
  };

  return (
    <fieldset className="m-0 mb-4 border-0 p-0" aria-describedby={`exercicio-${index + 1}-alternativas-dica`}>
      <legend className="mb-1 text-label text-foreground">Alternativas</legend>
      <FieldMessage id={`exercicio-${index + 1}-alternativas-dica`} className="mb-2">
        De {ALTERNATIVES_MIN} a {ALTERNATIVES_MAX}, na ordem em que o aluno vai vê-las. Marque a correta.
      </FieldMessage>
      {alternatives.fields.map((field, position) => {
        const textId = alternativeFieldId(index, position);
        const textError = errorFor(textId);
        return (
          <div key={field.fieldId} className="flex flex-wrap items-end gap-3">
            <FormField id={textId} label={`Alternativa ${position + 1}`} required error={textError} className="min-w-0 flex-1">
              {(controlProps) => (
                <Input
                  {...controlProps}
                  aria-describedby={[controlProps["aria-describedby"], duplicateError ? alternativesErrorId(index) : null].filter(Boolean).join(" ") || undefined}
                  {...register(`cards.${index}.alternatives.${position}.text`)}
                />
              )}
            </FormField>
            <div className="mb-4 flex min-h-11 items-center gap-2">
              <Radio
                id={correctRadioId(index, position)}
                value={field.key}
                aria-invalid={correctError ? true : undefined}
                aria-describedby={correctError ? correctErrorId : undefined}
                {...register(`cards.${index}.correctAlternative`)}
              />
              <Label htmlFor={correctRadioId(index, position)}>
                Correta{" "}<span className="sr-only">(alternativa {position + 1})</span>
              </Label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-4"
              aria-label={`Remover alternativa ${position + 1}`}
              disabled={alternatives.fields.length <= ALTERNATIVES_MIN}
              onClick={() => remove(position)}
            >
              <Trash2 aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      {correctError ? (
        <FieldMessage id={correctErrorId} tone="error" className="mb-2">
          {correctError}
        </FieldMessage>
      ) : null}
      {duplicateError ? (
        <FieldMessage id={alternativesErrorId(index)} tone="error" className="mb-2">
          {duplicateError}
        </FieldMessage>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={alternatives.fields.length >= ALTERNATIVES_MAX}
        onClick={() => alternatives.append(emptyAlternative(), { shouldFocus: true })}
      >
        <Plus aria-hidden="true" />
        Adicionar alternativa
      </Button>
    </fieldset>
  );
}

/**
 * Next to the language (019 contracts/web-ui.md): whether the catalog runs code in it. The catalog's
 * `execution` key, not whether a worker is up right now.
 */
export function executionHint(execution: string | null | undefined): string | undefined {
  if (execution === undefined) return undefined;
  return execution === null ? "Sem execução nesta linguagem." : "Os alunos poderão executar o código.";
}

interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
}

function SelectField({ id, label, hint, error, required, children, ...props }: FieldShellProps & Omit<ComponentProps<"select">, "id"> & { children: ReactNode }) {
  return (
    <FormField id={id} label={label} description={hint} error={error} required={required}>
      {(control) => (
        <NativeSelect {...control} {...props} className="w-full">
          {children}
        </NativeSelect>
      )}
    </FormField>
  );
}

function TextareaField({ id, label, hint, error, required, ...props }: FieldShellProps & Omit<ComponentProps<"textarea">, "id">) {
  return (
    <FormField id={id} label={label} description={hint} error={error} required={required}>
      {(control) => <Textarea rows={3} {...control} {...props} />}
    </FormField>
  );
}
