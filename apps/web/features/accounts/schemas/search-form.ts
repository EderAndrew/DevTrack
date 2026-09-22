import { UserListQuerySchema } from "@repo/contracts";
import type { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

/** Search box of the accounts list; an empty search lists everything. */
export const AccountSearchFormSchema = UserListQuerySchema.pick({ query: true });
export type AccountSearchFormInput = z.input<typeof AccountSearchFormSchema>;
export const accountSearchMessages = fieldMessages({});
