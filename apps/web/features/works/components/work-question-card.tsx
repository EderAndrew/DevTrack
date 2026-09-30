"use client";

import {
  TestCaseVisibilitySchema,
  WORK_ALTERNATIVES_MAX,
  WORK_ALTERNATIVES_MIN,
  WORK_QUESTION_TOPICS_MAX,
  WORK_TEST_CASES_MAX,
  WorkQuestionTypeSchema,
  type WorkTopicView,
} from "@repo/contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField, fieldErrorId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/radio";
import { useWorkLanguages } from "../hooks/use-works";
import {
  emptyTestCase,
  emptyWorkAlternative,
  formatGrade,
  TEST_CASE_VISIBILITY_LABELS,
  WORK_QUESTION_TYPE_LABELS,
  type WorkFormValues,
} from "../schemas/work-form";
import { SelectField, TextareaField } from "./form-fields";
import {
  alternativeFieldId,
  alternativesErrorId,
  correctRadioId,
  type QuestionField,
  questionFieldId,
  testCaseFieldId,
  topicCheckboxId,
} from "./work-form-ids";

type Form = UseFormReturn<WorkFormValues>;
export type ErrorFor = (fieldId: string) => string | undefined;

export interface WorkQuestionCardProps {
  index: number;
  count: number;
  form: Form;
  /** What the question is worth ("3.34"), or null while the total isn't valid. */
  value: string | null;
  /** The work's topics, in selection order: the question may point at 0–3 of them. */
  workTopics: WorkTopicView[];
  errorFor: ErrorFor;
  onRemove?: () => void;
  onMove: (to: number) => void;
}

/**
 * One question of a work (011/FR-004–FR-007): type, statement, explanation, the question's topics
 * and the type's answer key, with what it is worth from the total grade.
 */
export function WorkQuestionCard({
  index,
  count,
  form,
  value,
  workTopics,
  errorFor,
  onRemove,
  onMove,
}: WorkQuestionCardProps) {
  const { register, control } = form;
  const type = useWatch({ control, name: `questions.${index}.type` });
  const languages = useWorkLanguages();
  const id = (field: QuestionField) => questionFieldId(index, field);
  const heading = `Questão ${index + 1}`;
  const headingId = `questao-${index + 1}-titulo`;

  return (
    <Card aria-labelledby={headingId} role="group" className="mb-6">
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id={headingId} className="m-0 text-h3">
            {heading}
          </h2>
          {value ? (
            <p className="m-0 text-body-sm text-text-secondary">
              Vale {formatGrade(value)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            id={`questao-${index + 1}-subir`}
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUp aria-hidden="true" />
            Mover para cima <span className="sr-only">{heading}</span>
          </Button>
          <Button
            id={`questao-${index + 1}-descer`}
            type="button"
            variant="ghost"
            size="sm"
            disabled={index === count - 1}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDown aria-hidden="true" />
            Mover para baixo <span className="sr-only">{heading}</span>
          </Button>
          {onRemove ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onRemove}
            >
              <Trash2 aria-hidden="true" />
              Remover <span className="sr-only">{heading}</span>
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <SelectField
          id={id("type")}
          label="Tipo"
          required
          error={errorFor(id("type"))}
          {...register(`questions.${index}.type`)}
        >
          {WorkQuestionTypeSchema.options.map((option) => (
            <option key={option} value={option}>
              {WORK_QUESTION_TYPE_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <TextareaField
          id={id("statement")}
          label="Enunciado"
          required
          error={errorFor(id("statement"))}
          {...register(`questions.${index}.statement`)}
        />

        {type === "OPEN_ANSWER" ? (
          <>
            <TextareaField
              id={id("expectedAnswer")}
              label="Resposta esperada"
              required
              error={errorFor(id("expectedAnswer"))}
              {...register(`questions.${index}.expectedAnswer`)}
            />
            <TextareaField
              id={id("rubric")}
              label="Rubrica"
              hint="Opcional. Como avaliar a resposta."
              error={errorFor(id("rubric"))}
              {...register(`questions.${index}.rubric`)}
            />
          </>
        ) : null}

        {type === "MULTIPLE_CHOICE" ? (
          <>
            <AlternativesFields index={index} form={form} errorFor={errorFor} />
            <div className="mb-4 flex items-center gap-2">
              <Checkbox
                id={id("isTrickQuestion")}
                {...register(`questions.${index}.isTrickQuestion`)}
              />
              <Label htmlFor={id("isTrickQuestion")}>Pegadinha</Label>
            </div>
          </>
        ) : null}

        {type === "CODE" ? (
          <>
            <TextareaField
              id={id("instructions")}
              label="Instruções"
              hint="Opcional."
              error={errorFor(id("instructions"))}
              {...register(`questions.${index}.instructions`)}
            />
            <TextareaField
              id={id("starterCode")}
              label="Código inicial"
              hint="Opcional."
              spellCheck={false}
              {...register(`questions.${index}.starterCode`)}
            />
            <TextareaField
              id={id("expectedSolution")}
              label="Solução esperada"
              required
              spellCheck={false}
              error={errorFor(id("expectedSolution"))}
              {...register(`questions.${index}.expectedSolution`)}
            />
            <SelectField
              id={id("languageId")}
              label="Linguagem"
              required
              hint={
                languages.isError
                  ? "Não foi possível carregar as linguagens."
                  : undefined
              }
              error={errorFor(id("languageId"))}
              {...register(`questions.${index}.languageId`)}
            >
              <option value="">Escolha a linguagem</option>
              {(languages.data ?? []).map((language) => (
                <option key={language.id} value={language.id}>
                  {language.name}
                </option>
              ))}
            </SelectField>
            <TestCasesFields index={index} form={form} errorFor={errorFor} />
          </>
        ) : null}

        <TextareaField
          id={id("explanation")}
          label="Explicação"
          hint="Opcional. Nunca aparece para o aluno."
          error={errorFor(id("explanation"))}
          {...register(`questions.${index}.explanation`)}
        />
        {workTopics.length > 0 ? (
          <QuestionTopics
            index={index}
            form={form}
            workTopics={workTopics}
            error={errorFor(id("topicItemIds"))}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

/** 0–3 of the work's topics (011/FR-003); the others are disabled once three are checked. */
function QuestionTopics({
  index,
  form,
  workTopics,
  error,
}: {
  index: number;
  form: Form;
  workTopics: WorkTopicView[];
  error?: string;
}) {
  const selected = useWatch({
    control: form.control,
    name: `questions.${index}.topicItemIds`,
  });
  const scope = questionFieldId(index, "topicItemIds");
  const toggle = (itemId: string, checked: boolean) =>
    form.setValue(
      `questions.${index}.topicItemIds`,
      checked ? [...selected, itemId] : selected.filter((id) => id !== itemId),
      { shouldDirty: true },
    );

  return (
    <fieldset
      className="m-0 mb-4 border-0 p-0"
      aria-describedby={[`${scope}-dica`, error ? fieldErrorId(scope) : null]
        .filter(Boolean)
        .join(" ")}
    >
      <legend className="mb-1 text-label text-foreground">
        Tópicos da questão
      </legend>
      <FieldMessage id={`${scope}-dica`} className="mb-2">
        Opcional. Até {WORK_QUESTION_TOPICS_MAX} dos tópicos do trabalho.
      </FieldMessage>
      <div className="flex flex-col gap-2">
        {workTopics.map((topic) => {
          const checkboxId = topicCheckboxId(scope, topic.syllabusItemId);
          const checked = selected.includes(topic.syllabusItemId);
          return (
            <div key={topic.syllabusItemId} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={checked}
                disabled={
                  !checked && selected.length >= WORK_QUESTION_TOPICS_MAX
                }
                aria-invalid={error ? true : undefined}
                onChange={(event) =>
                  toggle(topic.syllabusItemId, event.target.checked)
                }
              />
              <Label htmlFor={checkboxId}>{topic.itemText}</Label>
            </div>
          );
        })}
      </div>
      {error ? (
        <FieldMessage id={fieldErrorId(scope)} tone="error" className="mt-2">
          {error}
        </FieldMessage>
      ) : null}
    </fieldset>
  );
}

/** 3–5 alternatives in presentation order, exactly one marked "Correta" (011/FR-006). */
function AlternativesFields({
  index,
  form,
  errorFor,
}: {
  index: number;
  form: Form;
  errorFor: ErrorFor;
}) {
  const { register, control, getValues, setValue } = form;
  // `keyName`: the field array's own ids must not replace the alternatives' `key`.
  const alternatives = useFieldArray({
    control,
    name: `questions.${index}.alternatives`,
    keyName: "fieldId",
  });
  const correctError = errorFor(questionFieldId(index, "correctAlternative"));
  const duplicateError = errorFor(alternativesErrorId(index));
  const correctErrorId = fieldErrorId(
    questionFieldId(index, "correctAlternative"),
  );
  const hintId = `questao-${index + 1}-alternativas-dica`;

  const remove = (position: number) => {
    // The mark is the alternative's key, so it follows its alternative; removing the correct one clears it.
    if (
      getValues(`questions.${index}.correctAlternative`) ===
      alternatives.fields[position]!.key
    )
      setValue(`questions.${index}.correctAlternative`, "");
    alternatives.remove(position);
  };

  return (
    <fieldset className="m-0 mb-4 border-0 p-0" aria-describedby={hintId}>
      <legend className="mb-1 text-label text-foreground">Alternativas</legend>
      <FieldMessage id={hintId} className="mb-2">
        De {WORK_ALTERNATIVES_MIN} a {WORK_ALTERNATIVES_MAX}, na ordem em que o
        aluno vai vê-las. Marque a correta.
      </FieldMessage>
      {alternatives.fields.map((field, position) => {
        const textId = alternativeFieldId(index, position);
        return (
          <div key={field.fieldId} className="flex flex-wrap items-end gap-3">
            <FormField
              id={textId}
              label={`Alternativa ${position + 1}`}
              required
              error={errorFor(textId)}
              className="min-w-0 flex-1"
            >
              {(controlProps) => (
                <Input
                  {...controlProps}
                  aria-describedby={
                    [
                      controlProps["aria-describedby"],
                      duplicateError ? alternativesErrorId(index) : null,
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  {...register(
                    `questions.${index}.alternatives.${position}.text`,
                  )}
                />
              )}
            </FormField>
            <div className="mb-4 flex min-h-11 items-center gap-2">
              <Radio
                id={correctRadioId(index, position)}
                value={field.key}
                aria-invalid={correctError ? true : undefined}
                aria-describedby={correctError ? correctErrorId : undefined}
                {...register(`questions.${index}.correctAlternative`)}
              />
              <Label htmlFor={correctRadioId(index, position)}>
                Correta{" "}
                <span className="sr-only">(alternativa {position + 1})</span>
              </Label>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-4"
              aria-label={`Remover alternativa ${position + 1}`}
              disabled={alternatives.fields.length <= WORK_ALTERNATIVES_MIN}
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
        <FieldMessage
          id={alternativesErrorId(index)}
          tone="error"
          className="mb-2"
        >
          {duplicateError}
        </FieldMessage>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={alternatives.fields.length >= WORK_ALTERNATIVES_MAX}
        onClick={() =>
          alternatives.append(emptyWorkAlternative(), { shouldFocus: true })
        }
      >
        <Plus aria-hidden="true" />
        Adicionar alternativa
      </Button>
    </fieldset>
  );
}

/** 0–20 test cases, each Pública or Privada; empty input and output are valid (011/FR-007). */
function TestCasesFields({
  index,
  form,
  errorFor,
}: {
  index: number;
  form: Form;
  errorFor: ErrorFor;
}) {
  const { register, control } = form;
  const testCases = useFieldArray({
    control,
    name: `questions.${index}.testCases`,
  });
  const hintId = `questao-${index + 1}-casos-dica`;

  return (
    <fieldset className="m-0 mb-4 border-0 p-0" aria-describedby={hintId}>
      <legend className="mb-1 text-label text-foreground">
        Casos de teste
      </legend>
      <FieldMessage id={hintId} className="mb-2">
        Até {WORK_TEST_CASES_MAX}. Sem casos de teste, a questão não pode ser
        corrigida automaticamente. Os casos privados nunca aparecem para o
        aluno.
      </FieldMessage>
      {testCases.fields.map((field, position) => {
        const label = `caso ${position + 1}`;
        return (
          <div
            key={field.id}
            role="group"
            aria-label={`Caso de teste ${position + 1}`}
            className="mb-2"
          >
            <div className="grid gap-x-4 md:grid-cols-2">
              <TextareaField
                id={testCaseFieldId(index, position, "input")}
                label={`Entrada do ${label}`}
                rows={2}
                spellCheck={false}
                error={errorFor(testCaseFieldId(index, position, "input"))}
                {...register(`questions.${index}.testCases.${position}.input`)}
              />
              <TextareaField
                id={testCaseFieldId(index, position, "expectedOutput")}
                label={`Saída esperada do ${label}`}
                rows={2}
                spellCheck={false}
                error={errorFor(
                  testCaseFieldId(index, position, "expectedOutput"),
                )}
                {...register(
                  `questions.${index}.testCases.${position}.expectedOutput`,
                )}
              />
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <SelectField
                id={testCaseFieldId(index, position, "visibility")}
                label={`Visibilidade do ${label}`}
                {...register(
                  `questions.${index}.testCases.${position}.visibility`,
                )}
              >
                {TestCaseVisibilitySchema.options.map((option) => (
                  <option key={option} value={option}>
                    {TEST_CASE_VISIBILITY_LABELS[option]}
                  </option>
                ))}
              </SelectField>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mb-4"
                aria-label={`Remover caso de teste ${position + 1}`}
                onClick={() => testCases.remove(position)}
              >
                <Trash2 aria-hidden="true" />
              </Button>
            </div>
          </div>
        );
      })}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={testCases.fields.length >= WORK_TEST_CASES_MAX}
        onClick={() => testCases.append(emptyTestCase(), { shouldFocus: true })}
      >
        <Plus aria-hidden="true" />
        Adicionar caso de teste
      </Button>
    </fieldset>
  );
}
