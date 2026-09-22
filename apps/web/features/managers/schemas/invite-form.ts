import { InviteRequestSchema } from "@repo/contracts";
import type { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

export const InviteManagerFormSchema = InviteRequestSchema;
export type InviteManagerFormInput = z.input<typeof InviteManagerFormSchema>;
export const inviteManagerMessages = fieldMessages({ displayName: "Informe o nome.", email: "Informe o e-mail." });

/** API answers about the invited e-mail, shown next to that field. */
export const EMAIL_ERROR_CODES: readonly string[] = ["SELF_INVITE_FORBIDDEN", "ALREADY_MANAGER", "INVITATION_ALREADY_PENDING"];
