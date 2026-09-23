import { EnrollmentListQuerySchema, EnrollmentStatusSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import type { EnrollmentFilters } from "../hooks/use-enrollments";

const { shape } = EnrollmentListQuerySchema;

/** Search by name or RA and status filter of a class's students (FR-045); the status is always sent. */
export const EnrollmentFiltersFormSchema = z.strictObject({
  query: z.string().trim().pipe(shape.query.unwrap()),
  status: EnrollmentStatusSchema,
});
export type EnrollmentFiltersFormInput = z.input<typeof EnrollmentFiltersFormSchema>;
export const enrollmentFiltersMessages = fieldMessages({});

/** The list shows active enrollments until another status is chosen (FR-045). */
export const DEFAULT_ENROLLMENT_FILTERS: EnrollmentFilters = { status: "ACTIVE" };

export const toEnrollmentFilters = (values: z.output<typeof EnrollmentFiltersFormSchema>): EnrollmentFilters => ({
  ...(values.query ? { query: values.query } : {}),
  status: values.status,
});
