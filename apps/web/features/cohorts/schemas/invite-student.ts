import { InviteStudentRequestSchema } from "@repo/contracts";
import type { z } from "zod";
import { fieldMessages } from "@/lib/forms/field-messages";

/** "Convidar aluno" form: the contract's request, e-mail only (FR-010). */
export const InviteStudentFormSchema = InviteStudentRequestSchema;
export type InviteStudentFormInput = z.input<typeof InviteStudentFormSchema>;
export const inviteStudentMessages = fieldMessages({ email: "Informe o e-mail do aluno." });

/** API answers about the invited e-mail, shown next to that field. */
export const EMAIL_ERROR_CODES: readonly string[] = ["INVITATION_ALREADY_PENDING", "ALREADY_ENROLLED"];
