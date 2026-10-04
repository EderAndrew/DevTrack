import type { CodeHighlight } from "@repo/contracts";
import type { ComponentProps, ReactNode } from "react";
import { type Control, Controller, type FieldPath, type FieldValues } from "react-hook-form";
import { CodeEditor } from "@/components/ui/code/code-editor";
import { FormField, fieldLabelId } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/** Label, control and messages of one field of the work form (FormField of the design system). */
interface FieldShellProps {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export function InputField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...props
}: FieldShellProps & Omit<ComponentProps<"input">, "id">) {
  return (
    <FormField
      id={id}
      label={label}
      description={hint}
      error={error}
      required={required}
      className={className}
    >
      {(control) => <Input {...control} {...props} />}
    </FormField>
  );
}

export function SelectField({
  id,
  label,
  hint,
  error,
  required,
  className,
  children,
  ...props
}: FieldShellProps &
  Omit<ComponentProps<"select">, "id"> & { children: ReactNode }) {
  return (
    <FormField
      id={id}
      label={label}
      description={hint}
      error={error}
      required={required}
      className={className}
    >
      {(control) => (
        <NativeSelect {...control} {...props} className="w-full">
          {children}
        </NativeSelect>
      )}
    </FormField>
  );
}

export function TextareaField({
  id,
  label,
  hint,
  error,
  required,
  className,
  ...props
}: FieldShellProps & Omit<ComponentProps<"textarea">, "id">) {
  return (
    <FormField
      id={id}
      label={label}
      description={hint}
      error={error}
      required={required}
      className={className}
    >
      {(control) => <Textarea rows={3} {...control} {...props} />}
    </FormField>
  );
}

/**
 * A code field of the work form (014/US3): the `CodeEditor` colored by the chosen language, named
 * by the label through `aria-labelledby` (its content has no `<label for>`); the text goes to the
 * form exactly as typed. `disabled` (a read-only work) is also picked up from the disabled fieldset.
 */
export function CodeField<T extends FieldValues>({
  id,
  label,
  hint,
  error,
  required,
  className,
  control,
  name,
  highlight,
  disabled,
}: FieldShellProps & {
  control: Control<T>;
  name: FieldPath<T>;
  /** Grammar key of the chosen language (`language.highlight`); null → no colors. */
  highlight: CodeHighlight;
  disabled?: boolean;
}) {
  return (
    <FormField
      id={id}
      label={label}
      description={hint}
      error={error}
      required={required}
      className={className}
    >
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
              disabled={disabled}
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
