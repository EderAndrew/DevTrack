import { CohortListQuerySchema, CohortStatusSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import type { CohortFilters } from "../hooks/use-cohorts";

/** Value of the status filter meaning "no filter": the API then lists ACTIVE and INACTIVE (027/FR-006). */
export const DEFAULT_STATUS = "DEFAULT";

const { shape } = CohortListQuerySchema;

/** Search and filters of the turmas list; blank fields are not sent. */
export const CohortFiltersFormSchema = z.strictObject({
  q: z.string().trim().pipe(shape.q.unwrap()),
  academicYear: z
    .string()
    .trim()
    .refine((value) => value === "" || shape.academicYear.safeParse(value).success, "Informe um ano entre 1900 e 2100."),
  status: z.union([z.literal(DEFAULT_STATUS), CohortStatusSchema]),
});
export type CohortFiltersFormInput = z.input<typeof CohortFiltersFormSchema>;
export const cohortFiltersMessages = fieldMessages({});

export const toCohortFilters = (values: z.output<typeof CohortFiltersFormSchema>): CohortFilters => ({
  ...(values.q ? { q: values.q } : {}),
  ...(values.academicYear ? { academicYear: Number(values.academicYear) } : {}),
  ...(values.status !== DEFAULT_STATUS ? { status: values.status } : {}),
});
