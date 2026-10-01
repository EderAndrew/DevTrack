import type { ComponentProps, ReactNode } from "react";
import { FormField } from "@/components/ui/form-field";
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
