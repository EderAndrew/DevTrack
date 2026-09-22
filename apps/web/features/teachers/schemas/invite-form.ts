import { InviteRequestSchema } from "@repo/contracts";
import type { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

export const InviteTeacherFormSchema = InviteRequestSchema;
export type InviteTeacherFormInput = z.input<typeof InviteTeacherFormSchema>;
export const inviteTeacherMessages = fieldMessages({ displayName: "Informe o nome.", email: "Informe o e-mail." });

/** API answers about the invited e-mail, shown next to that field. */
export const EMAIL_ERROR_CODES: readonly string[] = [
  "ALREADY_TEACHER",
  "TEACHER_REACTIVATION_REQUIRED",
  "SELF_INVITE_FORBIDDEN",
  "INVITATION_ALREADY_PENDING",
];
