import { ClassListQuerySchema, ClassStatusSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import type { ClassFilters } from "../hooks/use-classes";

/** Value of the status filter meaning "no filter": the API then lists ACTIVE and INACTIVE (FR-007). */
export const DEFAULT_STATUS = "DEFAULT";

const { shape } = ClassListQuerySchema;

/** Search and filters of the classes list; blank fields are not sent. */
export const ClassFiltersFormSchema = z.strictObject({
  query: z.string().trim().pipe(shape.query.unwrap()),
  year: z
    .string()
    .trim()
    .refine((value) => value === "" || shape.year.safeParse(value).success),
  status: z.union([z.literal(DEFAULT_STATUS), ClassStatusSchema]),
});
export type ClassFiltersFormInput = z.input<typeof ClassFiltersFormSchema>;
export const classFiltersMessages = fieldMessages({});

export const toClassFilters = (values: z.output<typeof ClassFiltersFormSchema>): ClassFilters => ({
  ...(values.query ? { query: values.query } : {}),
  ...(values.year ? { year: Number(values.year) } : {}),
  ...(values.status !== DEFAULT_STATUS ? { status: values.status } : {}),
});
