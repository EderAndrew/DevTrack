import { type CreateSubjectRequest, CreateSubjectRequestSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

/**
 * Subject form (004 contracts/web-ui.md), derived from `CreateSubjectRequestSchema`: a blank
 * description is sent as null. Used for creating and editing.
 */
export const SubjectFormSchema = CreateSubjectRequestSchema.extend({
  description: z.string().trim().max(1000),
});
export type SubjectFormInput = z.input<typeof SubjectFormSchema>;
export type SubjectFormOutput = z.output<typeof SubjectFormSchema>;

export const subjectFormMessages = fieldMessages({ name: "Informe o nome da disciplina." });

/** The request body of the contract for the form's values. */
export const toSubjectRequest = (values: SubjectFormOutput): CreateSubjectRequest => ({
  name: values.name,
  description: values.description || null,
});

/** API answers about the name, shown next to that field. */
export const NAME_ERROR_CODES: readonly string[] = ["SUBJECT_NAME_TAKEN"];
