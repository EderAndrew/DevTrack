import { ClassFieldsSchema, type CreateClassRequest, IsoDateSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

const { shape } = ClassFieldsSchema;

/** Value of the Disciplina select meaning "no subject" (a Select item cannot have an empty value). */
export const NO_SUBJECT = "NONE";

/** A date field: empty, or a calendar date of the contract. */
const optionalDate = z
  .string()
  .trim()
  .refine((value) => value === "" || IsoDateSchema.safeParse(value).success);

/**
 * Class form (003 and 004 contracts/web-ui.md), derived from the fields of `CreateClassRequestSchema`: the year is
 * typed as text and becomes the contract's integer; blank period, description and dates are sent as
 * null, and so is "Sem disciplina". Both dates or neither, the end not before the start
 * (004/US1-5), with the error on the field to fix. Used for creating and editing (the edit sends
 * every field; the API records what changed).
 */
export const ClassFormSchema = ClassFieldsSchema.extend({
  academicYear: z.string().trim().min(1).transform(Number).pipe(shape.academicYear),
  period: z.string().trim().max(60),
  description: z.string().trim().max(1000),
  subjectId: z.string(),
  startsOn: optionalDate,
  endsOn: optionalDate,
}).superRefine(({ startsOn, endsOn }, ctx) => {
  if (Boolean(startsOn) !== Boolean(endsOn)) {
    ctx.addIssue({
      code: "custom",
      path: [startsOn ? "endsOn" : "startsOn"],
      message: "Informe as datas de início e de término, ou deixe as duas em branco.",
    });
  } else if (startsOn && endsOn && endsOn < startsOn) {
    ctx.addIssue({ code: "custom", path: ["endsOn"], message: "A data de término não pode ser anterior à de início." });
  }
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
  subjectId: values.subjectId === NO_SUBJECT ? null : values.subjectId,
  startsOn: values.startsOn || null,
  endsOn: values.endsOn || null,
});

/** API answers about the code, shown next to that field. */
export const CODE_ERROR_CODES: readonly string[] = ["CLASS_CODE_TAKEN"];

/** API answers about the subject, shown next to the Disciplina select. */
export const SUBJECT_ERROR_CODES: readonly string[] = ["SUBJECT_INACTIVE", "CLASS_SUBJECT_LOCKED"];
