import { ClassInvitationListQuerySchema, ClassInvitationStatusSchema } from "@repo/contracts";
import { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";
import type { ClassInvitationFilters } from "../hooks/use-class-invitations";

const { shape } = ClassInvitationListQuerySchema;

/** Search and status filter of a class's invitations (FR-023); the status is always sent. */
export const InvitationFiltersFormSchema = z.strictObject({
  query: z.string().trim().pipe(shape.query.unwrap()),
  status: ClassInvitationStatusSchema,
});
export type InvitationFiltersFormInput = z.input<typeof InvitationFiltersFormSchema>;
export const invitationFiltersMessages = fieldMessages({});

/** The list shows pending invitations until another status is chosen (FR-023). */
export const DEFAULT_INVITATION_FILTERS: ClassInvitationFilters = { status: "PENDING" };

export const toInvitationFilters = (values: z.output<typeof InvitationFiltersFormSchema>): ClassInvitationFilters => ({
  ...(values.query ? { query: values.query } : {}),
  status: values.status,
});
