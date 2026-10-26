"use client";

import type { CodeHighlight } from "@repo/contracts";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { CodeEditor } from "@/components/ui/code/code-editor";
import { FormField, fieldLabelId } from "@/components/ui/form-field";

interface CodeFieldProps<T extends FieldValues> {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  control: Control<T>;
  name: FieldPath<T>;
  /** Grammar key of the chosen language (`language.highlight`); null → no colors. */
  highlight: CodeHighlight;
  /** Example shown while the field is empty; never saved. */
  placeholder?: string;
}

/**
 * A code field of the exercise forms (014/US3): the label, the `CodeEditor` colored by the chosen
 * language and the messages of `FormField`. The editor's content has no `<label for>`, so the label
 * names it through `aria-labelledby`; the form's focus reaches it by its id or the field's ref. The
 * text goes to the form exactly as typed.
 */
export function CodeField<T extends FieldValues>({ id, label, hint, error, required, control, name, highlight, placeholder }: CodeFieldProps<T>) {
  return (
    <FormField id={id} label={label} description={hint} error={error} required={required}>
      {(controlProps) => (
        <Controller
          control={control}
          name={name}
          render={({ field }) => (
            <CodeEditor
              id={id}
              ref={field.ref}
              value={(field.value as string | undefined) ?? ""}
              onChange={field.onChange}
              highlight={highlight}
              placeholder={placeholder}
              aria-labelledby={fieldLabelId(id)}
              aria-describedby={controlProps["aria-describedby"]}
              aria-invalid={controlProps["aria-invalid"]}
            />
          )}
        />
      )}
    </FormField>
  );
}
