import { ClassFieldsSchema, type CreateClassRequest } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

const { shape } = ClassFieldsSchema;

/**
 * Class form (003 contracts/web-ui.md), derived from the fields of `CreateClassRequestSchema`: the year is
 * typed as text and becomes the contract's integer; blank period and description are sent as
 * null. Used for creating and editing (the edit sends every field; the API records what changed).
 */
export const ClassFormSchema = ClassFieldsSchema.extend({
  academicYear: z.string().trim().min(1).transform(Number).pipe(shape.academicYear),
  period: z.string().trim().max(60),
  description: z.string().trim().max(1000),
});
export type ClassFormInput = z.input<typeof ClassFormSchema>;
export type ClassFormOutput = z.output<typeof ClassFormSchema>;

export const classFormMessages = fieldMessages({
  name: "Informe o nome da turma.",
  code: "Informe o código da turma.",
  academicYear: "Informe o ano letivo.",
});

/** The request body of the contract for the form's values. */
export const toClassRequest = (values: ClassFormOutput): CreateClassRequest => ({
  name: values.name,
  code: values.code,
  academicYear: values.academicYear,
  period: values.period || null,
  description: values.description || null,
});

/** API answers about the code, shown next to that field. */
export const CODE_ERROR_CODES: readonly string[] = ["CLASS_CODE_TAKEN"];
