import { SubjectListQuerySchema, SubjectStatusSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import type { SubjectFilters } from "../hooks/use-subjects";

/** Value of the status filter meaning "no filter": the API then lists active and inactive subjects. */
export const ALL_STATUSES = "ALL";

const { shape } = SubjectListQuerySchema;

/** Search and status filter of the subjects list; blank fields are not sent. */
export const SubjectFiltersFormSchema = z.strictObject({
  query: z.string().trim().pipe(shape.query.unwrap()),
  status: z.union([z.literal(ALL_STATUSES), SubjectStatusSchema]),
});
export type SubjectFiltersFormInput = z.input<typeof SubjectFiltersFormSchema>;
export const subjectFiltersMessages = fieldMessages({});

export const toSubjectFilters = (values: z.output<typeof SubjectFiltersFormSchema>): SubjectFilters => ({
  ...(values.query ? { query: values.query } : {}),
  ...(values.status !== ALL_STATUSES ? { status: values.status } : {}),
});
