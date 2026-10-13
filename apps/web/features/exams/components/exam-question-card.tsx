"use client";

import {
  type CodeHighlight,
  TestCaseVisibilitySchema,
  WORK_ALTERNATIVES_MAX,
  WORK_ALTERNATIVES_MIN,
  EXAM_QUESTION_TOPICS_MAX,
  WORK_TEST_CASES_MAX,
  WorkDifficultySchema,
  WorkQuestionTypeSchema,
  type WorkTopicView,
} from "@repo/contracts";
import { AlertTriangle, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useFieldArray, type UseFormReturn, useWatch } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField, fieldErrorId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Radio } from "@/components/ui/radio";
import { useExamLanguages } from "../hooks/use-exams";
import {
  DIFFICULTY_LABELS,
  emptyAlternative,
  emptyTestCase,
  type ExamFormValues,
  formatGrade,
  QUESTION_TYPE_LABELS,
  TEST_CASE_VISIBILITY_LABELS,
} from "../schemas/exam-form";
import { CodeField, SelectField, TextareaField } from "./form-fields";
import {
  alternativeFieldId,
  alternativesErrorId,
  correctRadioId,
  type QuestionField,
  questionCardId,
  questionFieldId,
  testCaseFieldId,
  topicCheckboxId,
} from "./exam-form-ids";

type Form = UseFormReturn<ExamFormValues>;
export type ErrorFor = (fieldId: string) => string | undefined;

export interface ExamQuestionCardProps {
  index: number;
  count: number;
  form: Form;
  /** What the question is worth ("3.34"), or null while the total isn't valid. */
  value: string | null;
  /** The exam's topics, in selection order: the question points at 1–3 of them (018/FR-002). */
  examTopics: WorkTopicView[];
  errorFor: ErrorFor;
  onRemove?: () => void;
  onMove: (to: number) => void;
  /** A saved question (US5): its type can't change, so it is shown, not chosen. */
  typeLocked?: boolean;
  /** The saved question's language when it was deactivated since: still offered, for it only (FR-007). */
  inactiveLanguage?: { id: string; name: string; highlight: CodeHighlight };
  /** ARCHIVED or without `provas.editar`: the code editors show the code without editing (014). */
  readOnly?: boolean;
}

/**
 * One question of an exam (018/FR-001, FR-002): type, statement, difficulty, the 011 answer key of
 * its type, explanation and 1–3 of the exam's topics, with what it is worth from the total grade
 * (read-only, the server computes it).
 */
export function ExamQuestionCard({
  index,
  count,
  form,
  value,
  examTopics,
  errorFor,
  onRemove,
  onMove,
  typeLocked = false,
  inactiveLanguage,
  readOnly = false,
}: ExamQuestionCardProps) {
  const { register, control } = form;
  const [type, isTrickQuestion, languageId] = useWatch({
    control,
    name: [
      `questions.${index}.type`,
      `questions.${index}.isTrickQuestion`,
      `questions.${index}.languageId`,
    ],
  });
  const languages = useExamLanguages();
  // The chosen language's grammar colors the code fields and changes with it (014/US3-2).
  const highlight =
    [...(languages.data ?? []), ...(inactiveLanguage ? [inactiveLanguage] : [])].find(
      (language) => language.id === languageId,
    )?.highlight ?? null;
  const id = (field: QuestionField) => questionFieldId(index, field);
  const heading = `Questão ${index + 1}`;
  const headingId = `questao-${index + 1}-titulo`;

  return (
    <Card id={questionCardId(index)} tabIndex={-1} aria-labelledby={headingId} role="group" className="mb-6">
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
          {type === "MULTIPLE_CHOICE" && isTrickQuestion ? (
            <Badge variant="warning" className="mt-1">
              <AlertTriangle aria-hidden="true" />
              Pegadinha
            </Badge>
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
        {typeLocked ? (
          <p id={id("type")} className="mt-0 mb-4">
            Tipo: {QUESTION_TYPE_LABELS[type]}
          </p>
        ) : (
          <SelectField
            id={id("type")}
            label="Tipo"
            required
            error={errorFor(id("type"))}
            {...register(`questions.${index}.type`)}
          >
            {WorkQuestionTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {QUESTION_TYPE_LABELS[option]}
              </option>
            ))}
          </SelectField>
        )}
        <TextareaField
          id={id("statement")}
          label="Enunciado"
          required
          error={errorFor(id("statement"))}
          {...register(`questions.${index}.statement`)}
        />
        <SelectField
          id={id("difficulty")}
          label="Dificuldade"
          hint="Obrigatória para aprovar a prova."
          error={errorFor(id("difficulty"))}
          {...register(`questions.${index}.difficulty`)}
        >
          <option value="">Escolha a dificuldade</option>
          {WorkDifficultySchema.options.map((option) => (
            <option key={option} value={option}>
              {DIFFICULTY_LABELS[option]}
            </option>
          ))}
        </SelectField>

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
            <CodeField
              id={id("starterCode")}
              label="Código inicial"
              hint="Opcional."
              control={control}
              name={`questions.${index}.starterCode`}
              highlight={highlight}
              disabled={readOnly}
            />
            <CodeField
              id={id("expectedSolution")}
              label="Solução esperada"
              required
              error={errorFor(id("expectedSolution"))}
              control={control}
              name={`questions.${index}.expectedSolution`}
              highlight={highlight}
              disabled={readOnly}
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
              {inactiveLanguage &&
              !(languages.data ?? []).some(
                (language) => language.id === inactiveLanguage.id,
              ) ? (
                <option value={inactiveLanguage.id}>
                  {inactiveLanguage.name} (desativada)
                </option>
              ) : null}
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
        <QuestionTopics index={index} form={form} examTopics={examTopics} error={errorFor(id("topicIds"))} />
      </CardContent>
    </Card>
  );
}

/** 1–3 of the exam's topics (018/FR-002); the others are disabled once three are checked. */
function QuestionTopics({
  index,
  form,
  examTopics,
  error,
}: {
  index: number;
  form: Form;
  examTopics: WorkTopicView[];
  error?: string;
}) {
  const selected = useWatch({
    control: form.control,
    name: `questions.${index}.topicIds`,
  });
  const scope = questionFieldId(index, "topicIds");
  const toggle = (itemId: string, checked: boolean) =>
    form.setValue(
      `questions.${index}.topicIds`,
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
        Tópicos da questão <span aria-hidden="true">*</span>
      </legend>
      <FieldMessage id={`${scope}-dica`} className="mb-2">
        {examTopics.length === 0
          ? "Escolha primeiro os tópicos da prova."
          : `De 1 a ${EXAM_QUESTION_TOPICS_MAX} dos tópicos da prova.`}
      </FieldMessage>
      <div className="flex flex-col gap-2">
        {examTopics.map((topic) => {
          const checkboxId = topicCheckboxId(scope, topic.syllabusItemId);
          const checked = selected.includes(topic.syllabusItemId);
          return (
            <div key={topic.syllabusItemId} className="flex items-center gap-2">
              <Checkbox
                id={checkboxId}
                checked={checked}
                disabled={
                  !checked && selected.length >= EXAM_QUESTION_TOPICS_MAX
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

/** 3–5 alternatives in presentation order, exactly one marked "Correta" (as 011/FR-006). */
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
          alternatives.append(emptyAlternative(), { shouldFocus: true })
        }
      >
        <Plus aria-hidden="true" />
        Adicionar alternativa
      </Button>
    </fieldset>
  );
}

/** 0–20 test cases, each Pública or Privada; empty input and output are valid (as 011/FR-007). */
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
