"use client";

import { TEST_CASES_MAX, TestCaseVisibilitySchema } from "@repo/contracts";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { type ArrayPath, type Control, type FieldValues, type Path, useFieldArray, type UseFormRegister } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { FieldMessage } from "@/components/ui/field-message";
import { FormField } from "@/components/ui/form-field";
import { Label } from "@/components/ui/label";
import { Radio, RadioGroup } from "@/components/ui/radio";
import { Textarea } from "@/components/ui/textarea";
import { emptyTestCase, TEST_CASE_VISIBILITY_LABELS, type TestCaseFormValue } from "../schemas/exercise-form";

type CaseField = "input" | "expectedOutput" | "visibility";
const CASE_SLUGS: Record<CaseField, string> = { input: "entrada", expectedOutput: "saida", visibility: "visibilidade" };

/** Id of a case's field: `exercicio-1-caso-2-saida`. `prefix` names the exercise on the page. */
export const testCaseFieldId = (prefix: string, position: number, field: CaseField) => `${prefix}-caso-${position + 1}-${CASE_SLUGS[field]}`;
/** Id of the section, the target of an error about the whole list. */
export const testCasesSectionId = (prefix: string) => `${prefix}-casos`;
const addButtonId = (prefix: string) => `${prefix}-casos-adicionar`;

export interface ExerciseTestCasesProps<T extends FieldValues> {
  control: Control<T>;
  register: UseFormRegister<T>;
  /** The form's path of the list (`cards.0.testCases`, or `testCases` in the editor). */
  name: ArrayPath<T>;
  /** Prefix of the field ids, unique on the page. */
  idPrefix: string;
  errorFor: (fieldId: string) => string | undefined;
  /** Examples shown in each case's empty "Entrada" and "Saída esperada"; never saved. */
  placeholders?: { input: string; expectedOutput: string };
}

/**
 * "Casos de teste" of a CODE exercise (019 contracts/web-ui.md, research B16): up to 20 cases, each
 * with "Entrada", "Saída esperada" and "Visibilidade" (Público / Privado); add, remove and move with
 * buttons. Texts are kept as typed (an empty input is a case without stdin). The rules are the API's;
 * an error it names lands on the case's field.
 */
export function ExerciseTestCases<T extends FieldValues>({ control, register, name, idPrefix, errorFor, placeholders }: ExerciseTestCasesProps<T>) {
  const cases = useFieldArray({ control, name, keyName: "fieldId" });
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<string | null>(null);
  const hintId = `${idPrefix}-casos-dica`;
  const full = cases.fields.length >= TEST_CASES_MAX;
  const sectionError = errorFor(testCasesSectionId(idPrefix));
  const sectionErrorId = `${testCasesSectionId(idPrefix)}-erro`;
  const path = (position: number, field: CaseField) => `${name}.${position}.${field}` as Path<T>;

  // Focus moves after the list re-renders: to the new case, the moved one, or "Adicionar caso".
  useEffect(() => {
    const id = pendingFocus.current;
    if (!id) return;
    pendingFocus.current = null;
    document.getElementById(id)?.focus();
  });
  const focusLater = (id: string) => {
    pendingFocus.current = id;
  };

  const add = () => {
    const position = cases.fields.length;
    cases.append(emptyTestCase() as never, { shouldFocus: false });
    setAnnouncement(`Caso ${position + 1} adicionado.`);
    focusLater(testCaseFieldId(idPrefix, position, "input"));
  };
  const remove = (position: number) => {
    cases.remove(position);
    setAnnouncement(`Caso ${position + 1} removido.`);
    focusLater(addButtonId(idPrefix));
  };
  const move = (from: number, to: number) => {
    cases.move(from, to);
    setAnnouncement(`Caso ${from + 1} movido para a posição ${to + 1}.`);
    // The same button of the moved case when it can still be used, else the case's input.
    const button = `${idPrefix}-caso-${to + 1}-${to < from ? "subir" : "descer"}`;
    const edge = to < from ? to === 0 : to === cases.fields.length - 1;
    focusLater(edge ? testCaseFieldId(idPrefix, to, "input") : button);
  };

  return (
    <fieldset id={testCasesSectionId(idPrefix)} tabIndex={-1} className="m-0 mb-4 border-0 p-0" aria-describedby={sectionError ? `${hintId} ${sectionErrorId}` : hintId}>
      <legend className="mb-1 text-label text-foreground">Casos de teste</legend>
      <FieldMessage id={hintId} className="mb-2">
        Até {TEST_CASES_MAX}. Os públicos aparecem para o aluno, que pode executar o código com eles; os privados ficam só no servidor.
      </FieldMessage>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {sectionError ? (
        <FieldMessage id={sectionErrorId} tone="error" className="mb-2">
          {sectionError}
        </FieldMessage>
      ) : null}
      <div className="flex flex-col gap-4">
        {cases.fields.map((field, position) => {
          const n = position + 1;
          const visibilityId = testCaseFieldId(idPrefix, position, "visibility");
          return (
            <div key={field.fieldId} role="group" aria-label={`Caso de teste ${n}`} className="rounded-md border border-border p-3">
              <div className="grid gap-x-4 md:grid-cols-2">
                <FormField id={testCaseFieldId(idPrefix, position, "input")} label={`Entrada do caso ${n}`} error={errorFor(testCaseFieldId(idPrefix, position, "input"))}>
                  {(controlProps) => (
                    <Textarea rows={2} spellCheck={false} placeholder={placeholders?.input} {...controlProps} {...register(path(position, "input"))} />
                  )}
                </FormField>
                <FormField
                  id={testCaseFieldId(idPrefix, position, "expectedOutput")}
                  label={`Saída esperada do caso ${n}`}
                  required
                  error={errorFor(testCaseFieldId(idPrefix, position, "expectedOutput"))}
                >
                  {(controlProps) => (
                    <Textarea rows={2} spellCheck={false} placeholder={placeholders?.expectedOutput} {...controlProps} {...register(path(position, "expectedOutput"))} />
                  )}
                </FormField>
              </div>
              <RadioGroup legend={`Visibilidade do caso ${n}`} className="mb-3">
                {TestCaseVisibilitySchema.options.map((option, index) => {
                  const id = index === 0 ? visibilityId : `${visibilityId}-${option.toLowerCase()}`;
                  return (
                    <div key={option} className="flex items-center gap-2">
                      <Radio id={id} value={option} {...register(path(position, "visibility"))} />
                      <Label htmlFor={id}>{TEST_CASE_VISIBILITY_LABELS[option]}</Label>
                    </div>
                  );
                })}
              </RadioGroup>
              <div className="flex flex-wrap gap-2">
                <Button
                  id={`${idPrefix}-caso-${n}-subir`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={position === 0}
                  onClick={() => move(position, position - 1)}
                >
                  <ArrowUp aria-hidden="true" />
                  Mover para cima <span className="sr-only">(caso {n})</span>
                </Button>
                <Button
                  id={`${idPrefix}-caso-${n}-descer`}
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={position === cases.fields.length - 1}
                  onClick={() => move(position, position + 1)}
                >
                  <ArrowDown aria-hidden="true" />
                  Mover para baixo <span className="sr-only">(caso {n})</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(position)}>
                  <Trash2 aria-hidden="true" />
                  Remover <span className="sr-only">caso {n}</span>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button id={addButtonId(idPrefix)} type="button" variant="secondary" size="sm" disabled={full} onClick={add}>
          <Plus aria-hidden="true" />
          Adicionar caso
        </Button>
        {full ? <span className="text-body-sm text-text-secondary">Máximo de {TEST_CASES_MAX} casos</span> : null}
      </div>
    </fieldset>
  );
}

/** The cases a teacher sees on the exercise page (019 contracts/web-ui.md): texts and visibility. */
export function TestCaseList({ cases }: { cases: readonly Pick<TestCaseFormValue, "input" | "expectedOutput" | "visibility">[] }) {
  if (cases.length === 0) return <p className="m-0">Nenhum caso de teste.</p>;
  return (
    <ol className="m-0 flex flex-col gap-2 pl-6">
      {cases.map((testCase, index) => (
        <li key={index}>
          <p className="m-0 text-label">
            Caso {index + 1} — {testCase.visibility === "PUBLIC" ? "Público" : "Privado"}
          </p>
          <p className="m-0">Entrada: {testCase.input === "" ? "(vazia)" : testCase.input}</p>
          <p className="m-0">Saída esperada: {testCase.expectedOutput}</p>
        </li>
      ))}
    </ol>
  );
}
