"use client";

import type { ExerciseTeacherView, UpdateExerciseRequest } from "@repo/contracts";
import { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { ErrorSummary, type FormError, SubmitButton } from "@/components/shared";
import { Button } from "@/components/ui/button";
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
  COGNITIVE_OBJECTIVE_LABELS,
  cardFromView,
  DIFFICULTY_LABELS,
  type ExerciseCardValues,
  exerciseFormSchema,
  toExerciseInput,
} from "../schemas/exercise-form";

type TextField = "statement" | "explanation" | "expectedAnswer" | "instructions" | "starterCode" | "expectedSolution";
type EditorField = TextField | "difficulty" | "cognitiveObjective" | "correctAlternative";

const SLUGS: Record<EditorField, string> = {
  statement: "enunciado",
  explanation: "explicacao",
  difficulty: "dificuldade",
  cognitiveObjective: "objetivo",
  expectedAnswer: "resposta",
  instructions: "instrucoes",
  starterCode: "codigo-inicial",
  expectedSolution: "solucao",
  correctAlternative: "correta",
};

/** Field ids of the editor of the draft at `n` (1-based), unique on the page. */
export const draftFieldId = (n: number, field: EditorField) => `rascunho-${n}-${SLUGS[field]}`;
const alternativeId = (n: number, position: number) => `rascunho-${n}-alternativa-${position + 1}`;
const correctId = (n: number, position: number) => `${alternativeId(n, position)}-correta`;

const ORDER: EditorField[] = [
  "statement",
  "difficulty",
  "cognitiveObjective",
  "expectedAnswer",
  "correctAlternative",
  "instructions",
  "starterCode",
  "expectedSolution",
  "explanation",
];

export interface DraftEditorProps {
  exercise: ExerciseTeacherView;
  /** 1-based position of the draft in the batch (ids and headings). */
  n: number;
  onSave: (body: UpdateExerciseRequest) => Promise<unknown>;
  onCancel: () => void;
}

/**
 * The inline editor of one draft of a batch (010 US4-2): the texts, difficulty, objective and
 * alternatives; the type, topic and language stay as generated. The contract's rules run before
 * sending (the same ones the API applies); a refusal keeps the exercise as it was (US4-4).
 */
export function DraftEditor({ exercise, n, onSave, onCancel }: DraftEditorProps) {
  const form = useForm<ExerciseCardValues>({ defaultValues: cardFromView(exercise) });
  const { register, control, handleSubmit } = form;
  const alternatives = useFieldArray({ control, name: "alternatives", keyName: "fieldId" });
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [summary, setSummary] = useState<FormError[]>([]);
  const id = (field: EditorField) => draftFieldId(n, field);

  const submit = handleSubmit(async (card) => {
    const checked = exerciseFormSchema(1, 1).safeParse({ cards: [card] });
    if (!checked.success) {
      const fields: Record<string, string> = {};
      for (const issue of checked.error.issues) {
        const [, , field, position] = issue.path;
        const fieldId =
          field === "alternatives" && typeof position === "number"
            ? alternativeId(n, position)
            : field === "alternatives" || field === "correctAlternative"
              ? id("correctAlternative")
              : ORDER.includes(field as EditorField)
                ? id(field as EditorField)
                : id("statement");
        fields[fieldId] ??= issue.message;
      }
      setErrors(fields);
      setSummary(Object.entries(fields).map(([fieldId, message]) => ({ fieldId: fieldId === id("correctAlternative") ? correctId(n, 0) : fieldId, message: message! })));
      return;
    }
    setErrors({});
    setSummary([]);
    try {
      await onSave({ ...toExerciseInput(card), version: exercise.version } as UpdateExerciseRequest);
    } catch (error) {
      setSummary([{ message: messageForError(error) }]);
    }
  });

  const text = (field: TextField, label: string, required = true) => (
    <FormField id={id(field)} label={label} required={required} error={errors[id(field)]}>
      {(controlProps) => <Textarea rows={3} {...controlProps} {...register(field)} />}
    </FormField>
  );
  const correctError = errors[id("correctAlternative")];

  return (
    <form noValidate onSubmit={(event) => void submit(event)} aria-label={`Editar exercício ${n}`} className="mt-4">
      <ErrorSummary errors={summary} />
      {text("statement", "Enunciado")}
      <div className="grid gap-x-4 sm:grid-cols-2">
        <FormField id={id("difficulty")} label="Dificuldade" required error={errors[id("difficulty")]}>
          {(controlProps) => (
            <NativeSelect {...controlProps} className="w-full" {...register("difficulty")}>
              {Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField id={id("cognitiveObjective")} label="Objetivo cognitivo" required error={errors[id("cognitiveObjective")]}>
          {(controlProps) => (
            <NativeSelect {...controlProps} className="w-full" {...register("cognitiveObjective")}>
              {Object.entries(COGNITIVE_OBJECTIVE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      {exercise.type === "OPEN_ANSWER" ? text("expectedAnswer", "Resposta esperada") : null}
      {exercise.type === "MULTIPLE_CHOICE" ? (
        <fieldset className="m-0 mb-4 border-0 p-0">
          <legend className="mb-2 text-label text-foreground">Alternativas</legend>
          {alternatives.fields.map((field, position) => (
            <div key={field.fieldId} className="flex flex-wrap items-end gap-3">
              <FormField id={alternativeId(n, position)} label={`Alternativa ${position + 1}`} required error={errors[alternativeId(n, position)]} className="min-w-0 flex-1">
                {(controlProps) => <Input {...controlProps} {...register(`alternatives.${position}.text`)} />}
              </FormField>
              <div className="mb-4 flex min-h-11 items-center gap-2">
                <Radio
                  id={correctId(n, position)}
                  value={field.key}
                  aria-invalid={correctError ? true : undefined}
                  aria-describedby={correctError ? fieldErrorId(id("correctAlternative")) : undefined}
                  {...register("correctAlternative")}
                />
                <Label htmlFor={correctId(n, position)}>
                  Correta <span className="sr-only">(alternativa {position + 1})</span>
                </Label>
              </div>
            </div>
          ))}
          {correctError ? (
            <FieldMessage id={fieldErrorId(id("correctAlternative"))} tone="error">
              {correctError}
            </FieldMessage>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <Checkbox id={`rascunho-${n}-pegadinha`} {...register("isTrickQuestion")} />
            <Label htmlFor={`rascunho-${n}-pegadinha`}>Pegadinha</Label>
          </div>
        </fieldset>
      ) : null}
      {exercise.type === "CODE" ? (
        <>
          {text("instructions", "Instruções")}
          {text("starterCode", "Código inicial", false)}
          {text("expectedSolution", "Solução esperada")}
          <p className="m-0 mb-4 text-text-secondary">Linguagem: {exercise.language?.name ?? "—"}</p>
        </>
      ) : null}
      {text("explanation", "Explicação")}
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={form.formState.isSubmitting}>Salvar alterações</SubmitButton>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
