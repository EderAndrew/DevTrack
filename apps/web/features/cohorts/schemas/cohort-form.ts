import { type CohortView, type CreateCohortRequest, CreateCohortRequestSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

const { shape } = CreateCohortRequestSchema;

/**
 * Turma form (027 contracts/ui.md), from the fields of `CreateCohortRequestSchema` (the 003 fields, 027/FR-001):
 * the year is typed as text and becomes the contract's integer; blank period and description are sent as null.
 * Used for creating and editing (the edit sends every field; the API records what changed).
 */
export const CohortFormSchema = z.strictObject({
  name: shape.name,
  code: shape.code,
  academicYear: z.string().trim().min(1).transform(Number).pipe(shape.academicYear),
  period: z.string().trim().max(60),
  description: z.string().trim().max(1000),
});
export type CohortFormInput = z.input<typeof CohortFormSchema>;
export type CohortFormOutput = z.output<typeof CohortFormSchema>;

export const cohortFormMessages = fieldMessages({
  name: "Informe o nome da turma.",
  code: "Informe o código da turma.",
  academicYear: "Informe o ano letivo.",
});

export const toCohortRequest = (values: CohortFormOutput): CreateCohortRequest => ({
  name: values.name,
  code: values.code,
  academicYear: values.academicYear,
  period: values.period || null,
  description: values.description || null,
});

export const cohortFormDefaults = (initial?: CohortView): CohortFormInput => ({
  name: initial?.name ?? "",
  code: initial?.code ?? "",
  academicYear: initial ? String(initial.academicYear) : String(new Date().getFullYear()),
  period: initial?.period ?? "",
  description: initial?.description ?? "",
});

/** API answers about the code, shown next to that field (027/FR-002). */
export const CODE_ERROR_CODES: readonly string[] = ["COHORT_CODE_TAKEN"];
